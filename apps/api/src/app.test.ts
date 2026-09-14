import type { Db } from "@parking/db";
import { sign } from "hono/jwt";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { NullCache } from "./cache";
import { REQUEST_HEADER, REQUEST_HEADER_VALUE } from "./csrf";
import type { Role } from "./deps";

/** Routes that fail before touching the database, exercised in-process with app.request(). */
const SECRET = "test-secret-at-least-16-chars";
const deps = {
  db: {} as Db,
  cache: new NullCache(),
  jwtSecret: SECRET,
  cookieSecure: false,
  mockAuth: true,
  now: () => new Date("2026-09-13T12:00:00Z"),
};
const app = createApp(deps);

/** A signed session cookie for a user of the given role, without touching the database. */
async function sessionCookie(role: Role): Promise<string> {
  const token = await sign(
    {
      sub: `user-${role}`,
      email: `${role}@parking.local`,
      role,
      buildingId: "b1",
      residentId: role === "resident" ? "r1" : null,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    SECRET,
  );
  return `session=${token}`;
}

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

  it("returns { code, message } for a malformed JSON body", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "bad_request",
      message: "Malformed JSON in request body",
    });
  });

  it("reports health without auth", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("reports not ready with 503 when PostgreSQL cannot be reached", async () => {
    const res = await app.request("/api/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: "unavailable",
      checks: { postgres: "unavailable", redis: "unavailable" },
    });
  });

  it("echoes a supplied request id and generates one otherwise", async () => {
    const supplied = await app.request("/api/health", { headers: { "x-request-id": "abc-123" } });
    expect(supplied.headers.get("x-request-id")).toBe("abc-123");
    const generated = await app.request("/api/health");
    expect(generated.headers.get("x-request-id")).toMatch(/[0-9a-f-]{20,}/);
  });
});

describe("authorization matrix", () => {
  it("rejects unauthenticated access to admin routes", async () => {
    const res = await app.request("/api/admin/cycles");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("forbids a resident on admin routes", async () => {
    const res = await app.request("/api/admin/cycles", {
      headers: { cookie: await sessionCookie("resident") },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "forbidden", message: "Requires admin role" });
  });

  it("forbids an administrator on resident routes", async () => {
    const res = await app.request("/api/resident/status", {
      headers: { cookie: await sessionCookie("admin") },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "forbidden", message: "Requires resident role" });
  });

  it("rejects a tampered session", async () => {
    const cookie = `${await sessionCookie("admin")}x`;
    const res = await app.request("/api/admin/cycles", { headers: { cookie } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "invalid_session" });
  });
});

describe("with the development login disabled", () => {
  const locked = createApp({ ...deps, mockAuth: false });

  it("hides dev-users and login behind 404", async () => {
    const users = await locked.request("/api/auth/dev-users");
    expect(users.status).toBe(404);
    const login = await locked.request("/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "unit101@parking.local" }),
    });
    expect(login.status).toBe(404);
    expect(await login.json()).toEqual({ code: "not_found", message: "Not available" });
  });

  it("still serves health and the session endpoint", async () => {
    expect((await locked.request("/api/health")).status).toBe(200);
    expect((await locked.request("/api/auth/me")).status).toBe(401);
  });
});
