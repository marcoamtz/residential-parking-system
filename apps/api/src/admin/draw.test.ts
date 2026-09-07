import { createDb, schema } from "@parking/db";
import { type Entrant, executeDraw, type Spot } from "@parking/domain";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { HttpError } from "../errors";
import { runDraw } from "./draw";

/**
 * Integration tests against a real PostgreSQL (docker compose or CI service). Each test creates
 * its own building, so runs are isolated without truncating anything.
 */
const url = process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking";
const { db, pool } = createDb(url);
const {
  buildings,
  residents,
  parkingSpots,
  raffleCycles,
  raffleRegistrations,
  spotAllocations,
  raffleDraws,
} = schema;

afterAll(() => pool.end());

async function building() {
  const [row] = await db
    .insert(buildings)
    .values({ name: `test-${Date.now()}` })
    .returning();
  if (!row) throw new Error("no building");
  return row.id;
}

async function spots(buildingId: string, count: number) {
  return db
    .insert(parkingSpots)
    .values(Array.from({ length: count }, (_, i) => ({ buildingId, label: `S${i + 1}` })))
    .returning({ id: parkingSpots.id });
}

async function resident(buildingId: string, unit: string) {
  const [row] = await db
    .insert(residents)
    .values({ buildingId, unit, fullName: `Resident ${unit}`, email: `${unit}@test.local` })
    .returning({ id: residents.id });
  if (!row) throw new Error("no resident");
  return row.id;
}

async function openCycle(buildingId: string, sequence: number) {
  const [row] = await db
    .insert(raffleCycles)
    .values({
      buildingId,
      sequence,
      startsOn: `2030-0${sequence}-01`,
      endsOn: `2030-0${sequence}-28`,
    })
    .returning({ id: raffleCycles.id });
  if (!row) throw new Error("no cycle");
  return row.id;
}

async function register(cycleId: string, residentId: string) {
  const [row] = await db
    .insert(raffleRegistrations)
    .values({ cycleId, residentId })
    .returning({ id: raffleRegistrations.id });
  if (!row) throw new Error("no registration");
  return row.id;
}

describe("runDraw", () => {
  it("allocates min(spots, entrants) and stores a replayable verification record", async () => {
    const b = await building();
    await spots(b, 2);
    const cycle = await openCycle(b, 1);
    for (const unit of ["a", "b", "c"]) await register(cycle, await resident(b, unit));

    const outcome = await runDraw(db, { cycleId: cycle, buildingId: b, executedByUserId: null });
    expect(outcome).toMatchObject({ entrants: 3, spots: 2, allocations: 2 });

    const stored = await db
      .select({
        registrationId: spotAllocations.registrationId,
        spotId: spotAllocations.spotId,
        rank: spotAllocations.rank,
      })
      .from(spotAllocations)
      .where(eq(spotAllocations.cycleId, cycle));
    const [draw] = await db.select().from(raffleDraws).where(eq(raffleDraws.cycleId, cycle));
    if (!draw) throw new Error("no draw record");

    const snapshot = draw.inputSnapshot as { entrants: Entrant[]; spots: Spot[] };
    const replay = executeDraw({ cycleId: cycle, seed: draw.seed, ...snapshot });
    expect(new Set(replay.allocations.map((a) => JSON.stringify(a)))).toEqual(
      new Set(stored.map((a) => JSON.stringify(a))),
    );

    const [status] = await db
      .select({ status: raffleCycles.status })
      .from(raffleCycles)
      .where(eq(raffleCycles.id, cycle));
    expect(status?.status).toBe("drawn");
  });

  it("rejects a second draw of the same cycle with 409", async () => {
    const b = await building();
    await spots(b, 1);
    const cycle = await openCycle(b, 1);
    await register(cycle, await resident(b, "a"));

    await runDraw(db, { cycleId: cycle, buildingId: b, executedByUserId: null });
    await expect(
      runDraw(db, { cycleId: cycle, buildingId: b, executedByUserId: null }),
    ).rejects.toMatchObject({
      status: 409,
      code: "cycle_already_drawn",
    });
  });

  it("lets exactly one of two concurrent draws through", async () => {
    const b = await building();
    await spots(b, 2);
    const cycle = await openCycle(b, 1);
    for (const unit of ["a", "b", "c", "d"]) await register(cycle, await resident(b, unit));

    const results = await Promise.allSettled([
      runDraw(db, { cycleId: cycle, buildingId: b, executedByUserId: null }),
      runDraw(db, { cycleId: cycle, buildingId: b, executedByUserId: null }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(HttpError);

    const allocations = await db
      .select()
      .from(spotAllocations)
      .where(eq(spotAllocations.cycleId, cycle));
    expect(allocations).toHaveLength(2);
  });

  it("does not let a building draw another building's cycle", async () => {
    const b1 = await building();
    const b2 = await building();
    const cycle = await openCycle(b1, 1);

    await expect(
      runDraw(db, { cycleId: cycle, buildingId: b2, executedByUserId: null }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it("ranks a never-allocated resident above last cycle's winner in the next cycle", async () => {
    const b = await building();
    await spots(b, 1);
    const a = await resident(b, "a");
    const bRes = await resident(b, "b");

    const first = await openCycle(b, 1);
    await register(first, a);
    await register(first, bRes);
    await runDraw(db, { cycleId: first, buildingId: b, executedByUserId: null });
    const [winner] = await db
      .select({ residentId: raffleRegistrations.residentId })
      .from(spotAllocations)
      .innerJoin(raffleRegistrations, eq(raffleRegistrations.id, spotAllocations.registrationId))
      .where(eq(spotAllocations.cycleId, first));
    if (!winner) throw new Error("no winner");

    const newcomer = await resident(b, "n");
    const second = await openCycle(b, 2);
    await register(second, winner.residentId);
    const newcomerRegistration = await register(second, newcomer);
    await runDraw(db, { cycleId: second, buildingId: b, executedByUserId: null });

    const secondWinners = await db
      .select({ registrationId: spotAllocations.registrationId })
      .from(spotAllocations)
      .where(eq(spotAllocations.cycleId, second));
    expect(secondWinners.map((w) => w.registrationId)).toEqual([newcomerRegistration]);
  });
});
