import { createDb, runMigrations } from "@parking/db";
import { sql } from "drizzle-orm";
import { adminDatabaseUrl, testDatabaseUrl } from "./db";

/**
 * Vitest global setup: make sure the test database exists and is migrated before any suite runs.
 * Idempotent, so it is safe on a fresh docker compose volume and on a developer's existing one.
 */
export default async function setup() {
  const target = new URL(testDatabaseUrl());
  const name = target.pathname.replace(/^\//, "");
  // Identifier, not a value: CREATE DATABASE takes no parameters, so the name is validated and quoted.
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unsafe test database name: ${name}`);

  const admin = createDb(adminDatabaseUrl());
  try {
    const exists = await admin.db.execute(sql`select 1 from pg_database where datname = ${name}`);
    if (exists.rows.length === 0) {
      await admin.db.execute(sql.raw(`create database "${name}"`));
    }
  } finally {
    await admin.pool.end();
  }

  await runMigrations(target.toString());
}
