import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tenant root. Every table that holds resident-visible data carries a `building_id`.
 * Remaining tables (residents, spots, cycles, registrations, allocations) land with the
 * first domain migration; see docs/02-domain-and-fairness.md.
 */
export const buildings = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
