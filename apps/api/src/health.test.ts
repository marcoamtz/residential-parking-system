import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { NullCache } from "./cache";
import { createTestDb } from "./test/db";

/** Readiness against the real PostgreSQL from docker compose or the CI service. */
const { db, pool } = createTestDb();
afterAll(() => pool.end());

const app = createApp({
  db,
  cache: new NullCache(),
  jwtSecret: "test-secret-at-least-16-chars",
  cookieSecure: false,
  mockAuth: true,
  now: () => new Date(),
});

describe("readiness", () => {
  it("is ready when PostgreSQL answers, and reports the cache as disabled without failing", async () => {
    const res = await app.request("/api/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ready",
      checks: { postgres: "ok", redis: "unavailable" },
    });
  });

  it("counts the request in the metrics it exposes", async () => {
    await app.request("/api/health");
    const res = await app.request("/api/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toMatch(
      /^http_requests_total\{method="GET",route="\/api\/health",status="200"\} \d+/m,
    );
    expect(body).toContain("cache_requests_total");
    expect(body).toContain("draw_duration_seconds");
  });
});
