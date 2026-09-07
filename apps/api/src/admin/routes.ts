import { zValidator } from "@hono/zod-validator";
import { schema } from "@parking/db";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/session";
import type { AppEnv, Deps } from "../deps";
import { HttpError, isUniqueViolation } from "../errors";
import { createCycle, getCycleDetail, listCycles } from "./cycles";
import { runDraw } from "./draw";

const { parkingSpots } = schema;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const idParam = z.object({ id: z.uuid() });

export function adminRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .use(requireAuth(deps))
    .use(requireRole("admin"))
    .get("/cycles", async (c) => {
      const cycles = await listCycles(deps.db, c.get("user").buildingId);
      return c.json({ cycles });
    })
    .post(
      "/cycles",
      zValidator("json", z.object({ startsOn: isoDate, endsOn: isoDate })),
      async (c) => {
        const user = c.get("user");
        const cycle = await createCycle(deps.db, user.buildingId, c.req.valid("json"));
        await deps.cache.bump(user.buildingId);
        return c.json({ cycle }, 201);
      },
    )
    .get("/cycles/:id", zValidator("param", idParam), async (c) => {
      const detail = await getCycleDetail(
        deps.db,
        c.get("user").buildingId,
        c.req.valid("param").id,
      );
      return c.json(detail);
    })
    .post("/cycles/:id/draw", zValidator("param", idParam), async (c) => {
      const user = c.get("user");
      const outcome = await runDraw(deps.db, {
        cycleId: c.req.valid("param").id,
        buildingId: user.buildingId,
        executedByUserId: user.id,
      });
      // After commit, never inside the transaction: no network I/O while holding a connection.
      await deps.cache.bump(user.buildingId);
      return c.json(outcome, 201);
    })
    .get("/spots", async (c) => {
      const spots = await deps.db
        .select({ id: parkingSpots.id, label: parkingSpots.label, isActive: parkingSpots.isActive })
        .from(parkingSpots)
        .where(eq(parkingSpots.buildingId, c.get("user").buildingId))
        .orderBy(asc(parkingSpots.label));
      return c.json({ spots });
    })
    .post(
      "/spots",
      zValidator("json", z.object({ label: z.string().trim().min(1).max(20) })),
      async (c) => {
        const user = c.get("user");
        try {
          const [spot] = await deps.db
            .insert(parkingSpots)
            .values({ buildingId: user.buildingId, label: c.req.valid("json").label })
            .returning({
              id: parkingSpots.id,
              label: parkingSpots.label,
              isActive: parkingSpots.isActive,
            });
          await deps.cache.bump(user.buildingId);
          return c.json({ spot }, 201);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new HttpError(409, "spot_label_exists", "A spot with that label already exists");
          }
          throw error;
        }
      },
    )
    .patch(
      "/spots/:id",
      zValidator("param", idParam),
      zValidator("json", z.object({ isActive: z.boolean() })),
      async (c) => {
        const user = c.get("user");
        const [spot] = await deps.db
          .update(parkingSpots)
          .set({ isActive: c.req.valid("json").isActive })
          .where(
            and(
              eq(parkingSpots.id, c.req.valid("param").id),
              eq(parkingSpots.buildingId, user.buildingId),
            ),
          )
          .returning({
            id: parkingSpots.id,
            label: parkingSpots.label,
            isActive: parkingSpots.isActive,
          });
        if (!spot) throw new HttpError(404, "spot_not_found", "Spot not found");
        await deps.cache.bump(user.buildingId);
        return c.json({ spot });
      },
    );
}
