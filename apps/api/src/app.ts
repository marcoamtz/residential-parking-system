import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { adminRoutes } from "./admin/routes";
import { authRoutes } from "./auth/routes";
import { requireCustomHeader } from "./csrf";
import type { AppEnv, Deps } from "./deps";
import { errorHandler } from "./errors";
import { healthRoutes } from "./health";
import { requestLogging } from "./observability";
import { residentRoutes } from "./resident/routes";

/**
 * Route definitions live here so the web app can import `AppType` for a typed client
 * without importing the server entrypoint. See docs/adr/0006-hono-api-with-shared-types.md.
 */
export function createApp(deps: Deps) {
  return (
    new Hono<AppEnv>()
      // Honors an incoming X-Request-Id (from the load balancer or nginx) or generates one.
      .use(requestId())
      // JSON API: no framing, no sniffing, no referrer leakage. HSTS is left to the TLS edge:
      // this process never terminates TLS, so it must not claim the origin is HTTPS-only.
      .use(
        secureHeaders({
          contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
          strictTransportSecurity: false,
          xFrameOptions: "DENY",
        }),
      )
      .use(requestLogging)
      .use(requireCustomHeader)
      .onError(errorHandler)
      // Unmatched routes follow the same { code, message } contract as every other error.
      .notFound((c) => c.json({ code: "not_found", message: "Route not found" }, 404))
      .route("/api", healthRoutes(deps))
      .route("/api/auth", authRoutes(deps))
      .route("/api/resident", residentRoutes(deps))
      .route("/api/admin", adminRoutes(deps))
  );
}

export type AppType = ReturnType<typeof createApp>;
