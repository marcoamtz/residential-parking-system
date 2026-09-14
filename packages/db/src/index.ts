import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];

export { schema };

/** Location of the generated SQL: packages/db/drizzle from source, /app/drizzle next to dist/ in the image. */
export function defaultMigrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? new URL("../drizzle", import.meta.url).pathname;
}

/** Applies pending migrations and closes its own pool. Used by the release step and by the test setup. */
export async function runMigrations(
  connectionString: string,
  migrationsFolder = defaultMigrationsFolder(),
): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
