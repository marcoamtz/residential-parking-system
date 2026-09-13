import { schema } from "@parking/db";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps, SessionUser } from "../deps";
import { HttpError } from "../errors";
import { validate } from "../validation";
import { clearSession, issueSession, requireAuth } from "./session";

const { users, residents } = schema;

function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    buildingId: row.buildingId,
    residentId: row.residentId,
  };
}

export function authRoutes(deps: Deps) {
  return (
    new Hono<AppEnv>()
      .get("/me", requireAuth(deps), (c) => c.json({ user: c.get("user") }))
      .post("/logout", (c) => {
        clearSession(c);
        return c.body(null, 204);
      })
      /** Development only: lists sign-in choices for the mock login. */
      .get("/dev-users", async (c) => {
        if (!deps.mockAuth) throw new HttpError(404, "not_found", "Not available");
        const rows = await deps.db
          .select({
            email: users.email,
            role: users.role,
            unit: residents.unit,
            fullName: residents.fullName,
          })
          .from(users)
          .leftJoin(residents, eq(residents.id, users.residentId))
          .orderBy(asc(users.role), asc(residents.unit));
        return c.json({ users: rows });
      })
      /** Development only: password-less login. Replaced by an OIDC callback in production (ADR-0008). */
      .post("/login", validate("json", z.object({ email: z.email() })), async (c) => {
        if (!deps.mockAuth) throw new HttpError(404, "not_found", "Not available");
        const { email } = c.req.valid("json");
        const [row] = await deps.db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!row) throw new HttpError(401, "unknown_user", "No user with that email");
        const user = toSessionUser(row);
        await issueSession(c, deps, user);
        return c.json({ user });
      })
  );
}
