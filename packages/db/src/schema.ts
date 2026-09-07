import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Invariants live here as constraints, not in application code (ADR-0002).
 * Every table that holds resident-visible data carries a `building_id`.
 */

export const cycleStatus = pgEnum("cycle_status", ["open", "drawn"]);
export const userRole = pgEnum("user_role", ["resident", "admin"]);

const primaryId = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Tenant root. */
export const buildings = pgTable("buildings", {
  id: primaryId(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const residents = pgTable(
  "residents",
  {
    id: primaryId(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id),
    unit: text("unit").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    /** Set when a resident leaves. History stays; they can no longer register. */
    movedOutAt: timestamp("moved_out_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("residents_building_email_unique").on(t.buildingId, t.email)],
);

/** Login identities. A resident user links to a resident row; an admin manages a building. */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id),
    email: text("email").notNull().unique(),
    role: userRole("role").notNull(),
    residentId: uuid("resident_id")
      .references(() => residents.id)
      .unique(),
    createdAt: createdAt(),
  },
  (t) => [
    check("users_resident_has_link_check", sql`${t.role} = 'admin' OR ${t.residentId} IS NOT NULL`),
  ],
);

export const parkingSpots = pgTable(
  "parking_spots",
  {
    id: primaryId(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id),
    label: text("label").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("parking_spots_building_label_unique").on(t.buildingId, t.label)],
);

/**
 * One quarter. `sequence` is a per-building counter so the ranking rule can measure distance
 * between cycles as an integer. `status` is the draw mutex (ADR-0004).
 */
export const raffleCycles = pgTable(
  "raffle_cycles",
  {
    id: primaryId(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => buildings.id),
    sequence: integer("sequence").notNull(),
    status: cycleStatus("status").notNull().default("open"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("raffle_cycles_building_sequence_unique").on(t.buildingId, t.sequence),
    /** At most one cycle accepts registrations per building at any time. */
    uniqueIndex("raffle_cycles_one_open_per_building_idx")
      .on(t.buildingId)
      .where(sql`${t.status} = 'open'`),
    check("raffle_cycles_sequence_positive_check", sql`${t.sequence} > 0`),
    check("raffle_cycles_period_check", sql`${t.endsOn} > ${t.startsOn}`),
  ],
);

export const raffleRegistrations = pgTable(
  "raffle_registrations",
  {
    id: primaryId(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => raffleCycles.id),
    residentId: uuid("resident_id")
      .notNull()
      .references(() => residents.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique("raffle_registrations_cycle_resident_unique").on(t.cycleId, t.residentId),
    /** Target for the composite foreign key from allocations. A constraint, not an index, so it exists before the FK is added. */
    unique("raffle_registrations_id_cycle_unique").on(t.id, t.cycleId),
    index("raffle_registrations_resident_idx").on(t.residentId),
  ],
);

/**
 * Allocation history. A spot is allocated once per cycle, a registration wins at most once, and
 * the composite foreign key guarantees the registration belongs to the same cycle.
 */
export const spotAllocations = pgTable(
  "spot_allocations",
  {
    id: primaryId(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => raffleCycles.id),
    spotId: uuid("spot_id")
      .notNull()
      .references(() => parkingSpots.id),
    registrationId: uuid("registration_id").notNull().unique(),
    rank: integer("rank").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("spot_allocations_cycle_spot_unique").on(t.cycleId, t.spotId),
    unique("spot_allocations_cycle_rank_unique").on(t.cycleId, t.rank),
    foreignKey({
      name: "spot_allocations_registration_cycle_fk",
      columns: [t.registrationId, t.cycleId],
      foreignColumns: [raffleRegistrations.id, raffleRegistrations.cycleId],
    }),
    check("spot_allocations_rank_positive_check", sql`${t.rank} > 0`),
  ],
);

/**
 * Verification record for a draw: the seed and the exact input handed to the domain function.
 * Replaying `executeDraw(inputSnapshot, seed)` must reproduce the allocations.
 */
export const raffleDraws = pgTable("raffle_draws", {
  id: primaryId(),
  cycleId: uuid("cycle_id")
    .notNull()
    .unique()
    .references(() => raffleCycles.id),
  seed: text("seed").notNull(),
  inputSnapshot: jsonb("input_snapshot").notNull(),
  /** Null when a scheduler, not a person, ran the draw. */
  executedByUserId: uuid("executed_by_user_id").references(() => users.id),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
});
