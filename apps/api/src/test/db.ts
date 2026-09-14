import { createDb } from "@parking/db";

/**
 * Integration tests run against their own database, `parking_test` by default, so `pnpm test`
 * never touches the development data. The global setup creates and migrates it.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = new URL(
    process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking",
  );
  base.pathname = "/parking_test";
  return base.toString();
}

/** The maintenance connection used to create the test database when it does not exist yet. */
export function adminDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking";
}

export function createTestDb() {
  return createDb(testDatabaseUrl());
}
