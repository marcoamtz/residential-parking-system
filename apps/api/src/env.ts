import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().optional(),
  REDIS_URL: z.url().optional(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters").optional(),
  /** Enables the password-less development login. Defaults to on outside production. */
  MOCK_AUTH: z.enum(["true", "false"]).optional(),
});

/** Match docker-compose.yml so a fresh checkout runs with no .env file. Never used in production. */
const developmentDefaults = {
  DATABASE_URL: "postgres://parking:parking@localhost:5432/parking",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "development-only-secret-not-for-production",
};

export type Env = ReturnType<typeof loadEnv>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const raw = schema.parse(source);
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

/** Loads the repository root `.env` if present. Existing process variables win. */
export function loadDotenv(): void {
  try {
    process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
  } catch {
    // No .env file: rely on the process environment (CI, containers).
  }
}
