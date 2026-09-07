CREATE TYPE "public"."cycle_status" AS ENUM('open', 'drawn');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('resident', 'admin');--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parking_spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parking_spots_building_label_unique" UNIQUE("building_id","label")
);
--> statement-breakpoint
CREATE TABLE "raffle_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"status" "cycle_status" DEFAULT 'open' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raffle_cycles_building_sequence_unique" UNIQUE("building_id","sequence"),
	CONSTRAINT "raffle_cycles_sequence_positive_check" CHECK ("raffle_cycles"."sequence" > 0),
	CONSTRAINT "raffle_cycles_period_check" CHECK ("raffle_cycles"."ends_on" > "raffle_cycles"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "raffle_draws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"seed" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"executed_by_user_id" uuid,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raffle_draws_cycle_id_unique" UNIQUE("cycle_id")
);
--> statement-breakpoint
CREATE TABLE "raffle_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raffle_registrations_cycle_resident_unique" UNIQUE("cycle_id","resident_id"),
	CONSTRAINT "raffle_registrations_id_cycle_unique" UNIQUE("id","cycle_id")
);
--> statement-breakpoint
CREATE TABLE "residents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"moved_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "residents_building_email_unique" UNIQUE("building_id","email")
);
--> statement-breakpoint
CREATE TABLE "spot_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"spot_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spot_allocations_registration_id_unique" UNIQUE("registration_id"),
	CONSTRAINT "spot_allocations_cycle_spot_unique" UNIQUE("cycle_id","spot_id"),
	CONSTRAINT "spot_allocations_cycle_rank_unique" UNIQUE("cycle_id","rank"),
	CONSTRAINT "spot_allocations_rank_positive_check" CHECK ("spot_allocations"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"resident_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_resident_id_unique" UNIQUE("resident_id"),
	CONSTRAINT "users_resident_has_link_check" CHECK ("users"."role" = 'admin' OR "users"."resident_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_cycles" ADD CONSTRAINT "raffle_cycles_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_cycle_id_raffle_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."raffle_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_draws" ADD CONSTRAINT "raffle_draws_executed_by_user_id_users_id_fk" FOREIGN KEY ("executed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_registrations" ADD CONSTRAINT "raffle_registrations_cycle_id_raffle_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."raffle_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_registrations" ADD CONSTRAINT "raffle_registrations_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_allocations" ADD CONSTRAINT "spot_allocations_cycle_id_raffle_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."raffle_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_allocations" ADD CONSTRAINT "spot_allocations_spot_id_parking_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."parking_spots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_allocations" ADD CONSTRAINT "spot_allocations_registration_cycle_fk" FOREIGN KEY ("registration_id","cycle_id") REFERENCES "public"."raffle_registrations"("id","cycle_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raffle_cycles_one_open_per_building_idx" ON "raffle_cycles" USING btree ("building_id") WHERE "raffle_cycles"."status" = 'open';--> statement-breakpoint
CREATE INDEX "raffle_registrations_resident_idx" ON "raffle_registrations" USING btree ("resident_id");