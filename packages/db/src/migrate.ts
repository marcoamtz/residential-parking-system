import { runMigrations } from "./index";

/**
 * Applies pending migrations from ./drizzle. Run as a release step, never at API startup,
 * so a bad migration fails the deploy instead of the service.
 */
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // No .env file: rely on the process environment (CI, containers).
}

const connectionString =
  process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking";

await runMigrations(connectionString);
console.log("migrations applied");
