import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "./deps";
import { registry } from "./observability";

type CheckResult = "ok" | "unavailable";

/**
 * Liveness, readiness, and metrics.
 *
 * - /health: the process is up. Used by container health checks. Never touches a dependency.
 * - /ready: the process can serve. PostgreSQL must answer; Redis is reported but never fatal,
 *   because the cache is not required for correctness (ADR-0005). Load balancers route on this.
 * - /metrics: Prometheus text format. Scraped inside the network; not routed by the load balancer.
 */
export function healthRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .get("/health", (c) => c.json({ status: "ok" as const }))
    .get("/ready", async (c) => {
      const [postgres, redis] = await Promise.all([checkPostgres(deps), deps.cache.ping()]);
      const ready = postgres === "ok";
      return c.json(
        {
          status: ready ? ("ready" as const) : ("unavailable" as const),
          checks: { postgres, redis },
        },
        ready ? 200 : 503,
      );
    })
    .get("/metrics", async (c) => {
      c.header("Content-Type", registry.contentType);
      return c.body(await registry.metrics());
    });
}

async function checkPostgres(deps: Deps): Promise<CheckResult> {
  try {
    await deps.db.execute(sql`select 1`);
    return "ok";
  } catch {
    return "unavailable";
  }
}
