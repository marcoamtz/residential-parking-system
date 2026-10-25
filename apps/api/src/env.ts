import { z } from "zod";

const schema = z.object({
  /** Resolved by loadEnv: the process or `.env` value, else NODE_ENV_DEFAULT, else production. */
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().optional(),
  REDIS_URL: z.url().optional(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters").optional(),
  /** Enables the password-less development login. Defaults to on outside production. */
  MOCK_AUTH: z.enum(["true", "false"]).optional(),
  /** Cron pattern (UTC) for the rotation worker's repeatable job. Daily at 06:00 by default. */
  ROTATION_CRON: z.string().min(9).default("0 6 * * *"),
  /** Draw an open cycle this many days before it starts. */
  DRAW_LEAD_DAYS: z.coerce.number().int().min(0).max(90).default(7),
});

/** Match docker-compose.yml so a fresh checkout runs with no .env file. Never used in production. */
const developmentDefaults = {
  DATABASE_URL: "postgres://parking:parking@localhost:5432/parking",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "development-only-secret-not-for-production",
};

export type Env = ReturnType<typeof loadEnv>;

/**
 * Reads configuration after loadDotenv has run. NODE_ENV comes from the shell or the root `.env`
 * (loadDotenv never overwrites a shell variable), then from NODE_ENV_DEFAULT, which only the local
 * development scripts set, and is production otherwise: a bare `node dist/index.js` requires real
 * secrets and has no mock login, and a `.env` saying production is never downgraded by a script.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const raw = schema.parse({
    ...source,
    NODE_ENV: source.NODE_ENV ?? source.NODE_ENV_DEFAULT ?? "production",
  });
  const missing = (["DATABASE_URL", "REDIS_URL", "JWT_SECRET"] as const).filter((k) => !raw[k]);
  if (raw.NODE_ENV === "production" && missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(", ")}`);
  }
  const parsed = {
    ...raw,
    DATABASE_URL: raw.DATABASE_URL ?? developmentDefaults.DATABASE_URL,
    REDIS_URL: raw.REDIS_URL ?? developmentDefaults.REDIS_URL,
    JWT_SECRET: raw.JWT_SECRET ?? developmentDefaults.JWT_SECRET,
  };
  return {
    ...parsed,
    mockAuth: parsed.MOCK_AUTH ? parsed.MOCK_AUTH === "true" : parsed.NODE_ENV !== "production",
    cookieSecure: parsed.NODE_ENV === "production",
  };
}

/** Loads the repository root `.env` (or `path`) if present. Existing process variables win. */
export function loadDotenv(path = new URL("../../../.env", import.meta.url).pathname): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // No .env file: rely on the process environment (CI, containers).
  }
}
