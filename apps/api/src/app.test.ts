import type { Db } from "@parking/db";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { NullCache } from "./cache";
import { REQUEST_HEADER, REQUEST_HEADER_VALUE } from "./csrf";

/** Routes that fail before touching the database, exercised in-process with app.request(). */
const app = createApp({
  db: {} as Db,
  cache: new NullCache(),
  jwtSecret: "test-secret-at-least-16-chars",
  cookieSecure: false,
  mockAuth: true,
  now: () => new Date("2026-09-13T12:00:00Z"),
});

const headers = { "content-type": "application/json", [REQUEST_HEADER]: REQUEST_HEADER_VALUE };

describe("error contract", () => {
  it("returns { code, message, issues } for invalid input", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string; issues: unknown };
    expect(body).toMatchObject({ code: "validation_error", message: "Invalid json" });
    expect(body.issues).toEqual([{ path: "email", message: expect.any(String) }]);
  });

  it("rejects mutating requests without the custom header", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "unit101@parking.local" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "missing_request_header" });
  });

  it("rejects unauthenticated access with { code, message }", async () => {
    const res = await app.request("/api/resident/status");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "unauthenticated", message: "Sign in required" });
  });

  it("reports health without auth", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
