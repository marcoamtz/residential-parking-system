import { createHash } from "node:crypto";
import { createDb, schema } from "@parking/db";
import { sql } from "drizzle-orm";
import { createCycle } from "./admin/cycles";
import { runDraw } from "./admin/draw";
import { toIsoDate } from "./deps";
import { loadDotenv, loadEnv } from "./env";

/**
 * Development fixture: one building, four spots, twelve residents, two drawn quarters and one
 * open quarter. Past draws run through the real service with pinned seeds, so history is consistent with
 * the rule and identical on every machine.
 * Destructive: truncates every table. Refuses to run in production.
 */
loadDotenv();
const env = loadEnv();
if (env.NODE_ENV === "production") {
  console.error("refusing to seed a production database");
  process.exit(1);
}

const { db, pool } = createDb(env.DATABASE_URL);
const { buildings, residents, users, parkingSpots, raffleRegistrations } = schema;

const RESIDENTS = [
  ["101", "Ana Torres"],
  ["102", "Luis Herrera"],
  ["103", "Carmen Ruiz"],
  ["104", "Diego Salas"],
  ["201", "Elena Márquez"],
  ["202", "Jorge Cabrera"],
  ["203", "Marta Ibáñez"],
  ["204", "Pablo Núñez"],
  ["301", "Sofía Delgado"],
  ["302", "Andrés Pineda"],
  ["303", "Lucía Romero"],
  ["304", "Tomás Aguilar"],
] as const;

/**
 * Stable UUID from a name. Tie-breaks hash the draw seed with registration and spot ids, so
 * fixture ids must be identical on every machine for the seeded history to be reproducible.
 */
function fixedUuid(name: string): string {
  const hex = createHash("sha256").update(`parking-fixture:${name}`).digest("hex").slice(0, 32);
  const v = `${hex.slice(0, 12)}4${hex.slice(13, 16)}`;
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  const tail = `${variant}${hex.slice(17, 20)}${hex.slice(20, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${tail.slice(0, 4)}-${tail.slice(4)}`;
}

function quarterStart(offset: number, now = new Date()): Date {
  const q = Math.floor(now.getUTCMonth() / 3) + offset;
  return new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
}
function quarterEnd(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
}
function period(offset: number) {
  const start = quarterStart(offset);
  return { startsOn: toIsoDate(start), endsOn: toIsoDate(quarterEnd(start)) };
}

try {
  await db.execute(sql`
    TRUNCATE raffle_draws, spot_allocations, raffle_registrations, raffle_cycles,
             parking_spots, users, residents, buildings CASCADE
  `);

  const [building] = await db.insert(buildings).values({ name: "Edificio Alameda 12" }).returning();
  if (!building) throw new Error("building insert failed");

  await db.insert(parkingSpots).values(
    ["P1", "P2", "P3", "P4"].map((label) => ({
      id: fixedUuid(`spot:${label}`),
      buildingId: building.id,
      label,
    })),
  );

  const residentRows = await db
    .insert(residents)
    .values(
      RESIDENTS.map(([unit, fullName]) => ({
        id: fixedUuid(`resident:${unit}`),
        buildingId: building.id,
        unit,
        fullName,
        email: `unit${unit}@parking.local`,
      })),
    )
    .returning({ id: residents.id, unit: residents.unit, email: residents.email });

  const [admin] = await db
    .insert(users)
    .values({ buildingId: building.id, email: "admin@parking.local", role: "admin" })
    .returning({ id: users.id });
  if (!admin) throw new Error("admin insert failed");
  await db.insert(users).values(
    residentRows.map((r) => ({
      buildingId: building.id,
      email: r.email,
      role: "resident" as const,
      residentId: r.id,
    })),
  );

  /** Direct insert with a stable id; the service path is exercised by the API and its tests. */
  const register = async (
    cycleId: string,
    cycleSequence: number,
    r: { id: string; unit: string },
  ) => {
    await db.insert(raffleRegistrations).values({
      id: fixedUuid(`registration:${cycleSequence}:${r.unit}`),
      cycleId,
      residentId: r.id,
    });
  };

  const byIndex = (indexes: number[]) =>
    indexes.map((i) => {
      const r = residentRows[i];
      if (!r) throw new Error(`no resident at index ${i}`);
      return r;
    });

  // Quarter before last: 9 entrants for 4 spots.
  const c1 = await createCycle(db, building.id, period(-1));
  for (const r of byIndex([0, 1, 2, 3, 4, 5, 6, 7, 8])) {
    await register(c1.id, c1.sequence, r);
  }
  const d1 = await runDraw(db, {
    cycleId: c1.id,
    buildingId: building.id,
    executedByUserId: admin.id,
    seed: "fixture-cycle-1",
  });

  // Current quarter: 10 entrants; last quarter's winners rank last.
  const c2 = await createCycle(db, building.id, period(0));
  for (const r of byIndex([0, 1, 2, 3, 4, 5, 8, 9, 10, 11])) {
    await register(c2.id, c2.sequence, r);
  }
  const d2 = await runDraw(db, {
    cycleId: c2.id,
    buildingId: building.id,
    executedByUserId: admin.id,
    seed: "fixture-cycle-2",
  });

  // Next quarter: open for registration, 6 already registered.
  const c3 = await createCycle(db, building.id, period(1));
  for (const r of byIndex([0, 1, 2, 5, 6, 9])) {
    await register(c3.id, c3.sequence, r);
  }

  console.log(`seeded building "${building.name}" (${building.id})`);
  console.log(
    `  cycle ${c1.sequence} ${c1.startsOn}..${c1.endsOn}: ${d1.entrants} entrants, ${d1.allocations} allocated`,
  );
  console.log(
    `  cycle ${c2.sequence} ${c2.startsOn}..${c2.endsOn}: ${d2.entrants} entrants, ${d2.allocations} allocated`,
  );
  console.log(`  cycle ${c3.sequence} ${c3.startsOn}..${c3.endsOn}: open, 6 registered`);
  console.log(
    "  sign in as admin@parking.local or unit<NNN>@parking.local (e.g. unit101@parking.local)",
  );
} finally {
  await pool.end();
}
