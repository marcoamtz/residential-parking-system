import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const configured = {
  DATABASE_URL: "postgres://u:p@db:5432/parking",
  REDIS_URL: "redis://cache:6379",
  JWT_SECRET: "a-real-secret-of-32-characters!!",
};

describe("loadEnv", () => {
  it("treats an unset NODE_ENV as production and refuses to start unconfigured", () => {
    expect(() => loadEnv({})).toThrow(
      "Missing required environment variables in production: DATABASE_URL, REDIS_URL, JWT_SECRET",
    );
  });

  it("keeps the mock login off and the cookie Secure when NODE_ENV is unset", () => {
    const env = loadEnv(configured);
    expect(env.NODE_ENV).toBe("production");
    expect(env.mockAuth).toBe(false);
    expect(env.cookieSecure).toBe(true);
  });

  it("uses the local defaults only when development is explicit", () => {
    const env = loadEnv({ NODE_ENV: "development" });
    expect(env.mockAuth).toBe(true);
    expect(env.cookieSecure).toBe(false);
    expect(env.DATABASE_URL).toBe("postgres://parking:parking@localhost:5432/parking");
  });
});
