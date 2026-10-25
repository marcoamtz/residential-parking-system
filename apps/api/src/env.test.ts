import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDotenv, loadEnv } from "./env";

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

describe("NODE_ENV precedence: shell, then .env, then the script fallback, then production", () => {
  // process.loadEnvFile writes to the real environment, so process.env is mutated in place.
  const keys = ["NODE_ENV", "NODE_ENV_DEFAULT", ...Object.keys(configured)];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  /** What a development script does: set the fallback, load a `.env`, then read configuration. */
  function launch(dotenv: string | null, shell: Record<string, string> = {}) {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, shell, { NODE_ENV_DEFAULT: "development" });
    if (dotenv !== null) {
      const path = join(mkdtempSync(join(tmpdir(), "env-test-")), ".env");
      writeFileSync(path, dotenv);
      loadDotenv(path);
    }
    return loadEnv(process.env);
  }

  it("uses the development fallback when neither the shell nor .env sets NODE_ENV", () => {
    const env = launch(null);
    expect(env.NODE_ENV).toBe("development");
    expect(env.mockAuth).toBe(true);
  });

  it("honors NODE_ENV=production from .env over the script fallback", () => {
    const dotenv = Object.entries({ NODE_ENV: "production", ...configured })
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const env = launch(dotenv);
    expect(env.NODE_ENV).toBe("production");
    expect(env.mockAuth).toBe(false);
    expect(env.cookieSecure).toBe(true);
    expect(env.DATABASE_URL).toBe(configured.DATABASE_URL);
  });

  it("lets an explicit shell NODE_ENV beat both .env and the fallback", () => {
    const env = launch("NODE_ENV=development\n", { NODE_ENV: "production", ...configured });
    expect(env.NODE_ENV).toBe("production");
    expect(env.mockAuth).toBe(false);
  });
});
