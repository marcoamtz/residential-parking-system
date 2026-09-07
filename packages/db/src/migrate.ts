import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./index";

/**
 * Applies pending migrations from ./drizzle. Run as a release step, never at API startup,
 * so a bad migration fails the deploy instead of the service.
 */
const connectionString =
  process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking";

const { db, pool } = createDb(connectionString);

try {
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("migrations applied");
} finally {
  await pool.end();
}
