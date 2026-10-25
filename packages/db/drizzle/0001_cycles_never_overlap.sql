-- Custom migration: Drizzle cannot express EXCLUDE constraints (see raffle_cycles in src/schema.ts).
-- Cycles of one building never overlap in time, so a spot allocated in one cycle can never be held
-- by another resident through an overlapping cycle on the same day. Inclusive bounds match the
-- inclusive starts_on/ends_on columns: Q4 ending 12-31 and Q1 starting 01-01 do not overlap.
-- btree_gist provides the equality operator class for building_id; it is a trusted extension.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "raffle_cycles" ADD CONSTRAINT "raffle_cycles_no_overlap_excl" EXCLUDE USING gist ("building_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&);
