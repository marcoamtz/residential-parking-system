import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole, residentIdOf } from "../auth/session";
import { withCache } from "../cache";
import { type AppEnv, type Deps, toIsoDate } from "../deps";
import { getDrawVerification } from "../draws/verification";
import { validate } from "../validation";
import { getResidentStatus, registerForOpenCycle } from "./status";

const STATUS_TTL_SECONDS = 300;

export function residentRoutes(deps: Deps) {
  return (
    new Hono<AppEnv>()
      .use(requireAuth(deps))
      .use(requireRole("resident"))
      .get("/status", async (c) => {
        const user = c.get("user");
        const residentId = residentIdOf(user);
        const status = await withCache(
          deps.cache,
          user.buildingId,
          `resident:${residentId}:status`,
          STATUS_TTL_SECONDS,
          () => getResidentStatus(deps.db, residentId, user.buildingId, toIsoDate(deps.now())),
        );
        return c.json(status);
      })
      /** Everything needed to replay a drawn cycle, with entrants identified by registration id only. */
      .get("/draws/:cycleId", validate("param", z.object({ cycleId: z.uuid() })), async (c) => {
        const user = c.get("user");
        const residentId = residentIdOf(user);
        const record = await getDrawVerification(
          deps.db,
          user.buildingId,
          c.req.valid("param").cycleId,
          {
            forResidentId: residentId,
          },
        );
        return c.json(record);
      })
      .post("/register", async (c) => {
        const user = c.get("user");
        const residentId = residentIdOf(user);
        const registration = await registerForOpenCycle(deps.db, residentId, user.buildingId);
        await deps.cache.bump(user.buildingId);
        return c.json(registration, 201);
      })
  );
}
