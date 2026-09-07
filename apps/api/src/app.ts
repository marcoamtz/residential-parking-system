import { Hono } from "hono";
import { logger } from "hono/logger";

/**
 * Route definitions live here so the web app can import `AppType` for a typed client
 * without importing the server entrypoint. See docs/adr/0006-hono-api-with-shared-types.md.
 */
export const app = new Hono()
  .use(logger())
  .get("/api/health", (c) => c.json({ status: "ok" as const }));

export type AppType = typeof app;
