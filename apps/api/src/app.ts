import { Hono } from "hono";
import { logger } from "hono/logger";
import { adminRoutes } from "./admin/routes";
import { authRoutes } from "./auth/routes";
import { requireCustomHeader } from "./csrf";
import type { AppEnv, Deps } from "./deps";
import { errorHandler } from "./errors";
import { residentRoutes } from "./resident/routes";

/**
 * Route definitions live here so the web app can import `AppType` for a typed client
 * without importing the server entrypoint. See docs/adr/0006-hono-api-with-shared-types.md.
 */
export function createApp(deps: Deps) {
  return new Hono<AppEnv>()
    .use(logger())
    .use(requireCustomHeader)
    .onError(errorHandler)
    .get("/api/health", (c) => c.json({ status: "ok" as const }))
    .route("/api/auth", authRoutes(deps))
    .route("/api/resident", residentRoutes(deps))
    .route("/api/admin", adminRoutes(deps));
}

export type AppType = ReturnType<typeof createApp>;
