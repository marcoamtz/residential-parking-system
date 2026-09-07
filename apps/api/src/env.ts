import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  /** Enables the password-less development login. Defaults to on outside production. */
  MOCK_AUTH: z.enum(["true", "false"]).optional(),
});

export type Env = ReturnType<typeof loadEnv>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(source);
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
