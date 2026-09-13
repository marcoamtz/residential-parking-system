import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./index";

/**
 * Applies pending migrations from ./drizzle. Run as a release step, never at API startup,
 * so a bad migration fails the deploy instead of the service.
 */
const connectionString =
  process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking";

/** Defaults to packages/db/drizzle from source, or /app/drizzle next to dist/ in the container image. */
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? new URL("../drizzle", import.meta.url).pathname;

const { db, pool } = createDb(connectionString);

try {
  await migrate(db, { migrationsFolder });
  console.log("migrations applied");
} finally {
  await pool.end();
}
