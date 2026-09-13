import type { MiddlewareHandler } from "hono";
import pino from "pino";
import { Counter, collectDefaultMetrics, Histogram, Registry } from "prom-client";
import type { AppEnv } from "./deps";

/**
 * Structured logs and Prometheus metrics. One JSON line per request with the request id, method,
 * matched route, status, and duration. Never the body, never the query string, never a cookie:
 * resident data stays out of logs by construction (ADR-0008).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "parking-api" },
  redact: { paths: ["req.headers.cookie", "req.headers.authorization"], remove: true },
});

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: "http_requests_total",
  help: "HTTP requests by method, matched route, and status.",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration by method and matched route.",
  labelNames: ["method", "route"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const cacheRequests = new Counter({
  name: "cache_requests_total",
  help: "Cache-aside reads by result.",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const drawDuration = new Histogram({
  name: "draw_duration_seconds",
  help: "Wall time of the draw transaction, from claim to commit.",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/** The matched route pattern (e.g. /api/admin/cycles/:id) keeps metric cardinality bounded. */
function routeLabel(routePath: string, status: number): string {
  return status === 404 && routePath === "/*" ? "unmatched" : routePath;
}

export const requestLogging: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = performance.now();
  await next();
  const durationMs = performance.now() - started;
  const route = routeLabel(c.req.routePath, c.res.status);
  const status = c.res.status;

  httpRequests.inc({ method: c.req.method, route, status: String(status) });
  httpDuration.observe({ method: c.req.method, route }, durationMs / 1000);

  const entry = {
    requestId: c.get("requestId"),
    method: c.req.method,
    route,
    path: c.req.path,
    status,
    durationMs: Math.round(durationMs * 10) / 10,
  };
  if (status >= 500) logger.error(entry, "request failed");
  else if (status >= 400) logger.warn(entry, "request rejected");
  else logger.info(entry, "request");
};
