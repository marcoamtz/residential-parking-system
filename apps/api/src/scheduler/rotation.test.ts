import { schema } from "@parking/db";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { NullCache } from "../cache";
import { createTestDb } from "../test/db";
import { assertRotationSucceeded, rotateAllBuildings, rotateBuilding } from "./rotation";

const { db, pool } = createTestDb();
const { buildings, residents, parkingSpots, raffleCycles, raffleRegistrations, spotAllocations } =
  schema;

afterAll(() => pool.end());

async function building() {
  const [row] = await db
    .insert(buildings)
    .values({ name: `rotation-${Date.now()}` })
    .returning();
  if (!row) throw new Error("no building");
  return row.id;
}

async function cycleWithEntrants(
  buildingId: string,
  sequence: number,
  startsOn: string,
  endsOn: string,
  units: string[],
) {
  const [cycle] = await db
    .insert(raffleCycles)
    .values({ buildingId, sequence, startsOn, endsOn })
    .returning({ id: raffleCycles.id });
  if (!cycle) throw new Error("no cycle");
  for (const unit of units) {
    const [r] = await db
      .insert(residents)
      .values({ buildingId, unit, fullName: `Resident ${unit}`, email: `${unit}@rot.local` })
      .returning({ id: residents.id });
    if (!r) throw new Error("no resident");
    await db.insert(raffleRegistrations).values({ cycleId: cycle.id, residentId: r.id });
  }
  return cycle.id;
}

async function cycles(buildingId: string) {
  return db
    .select({
      sequence: raffleCycles.sequence,
      status: raffleCycles.status,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
    })
    .from(raffleCycles)
    .where(eq(raffleCycles.buildingId, buildingId))
    .orderBy(raffleCycles.sequence);
}

describe("rotateBuilding", () => {
  it("draws the due cycle and opens the next quarter, then is idempotent", async () => {
    const b = await building();
    await db.insert(parkingSpots).values([{ buildingId: b, label: "S1" }]);
    const open = await cycleWithEntrants(b, 1, "2026-10-01", "2026-12-31", ["a", "b"]);

    const first = await rotateBuilding(db, new NullCache(), b, "2026-09-26", 7);
    expect(first.actions.map((a) => a.type)).toEqual(["draw", "open"]);

    const allocations = await db
      .select()
      .from(spotAllocations)
      .where(eq(spotAllocations.cycleId, open));
    expect(allocations).toHaveLength(1);
    expect(await cycles(b)).toEqual([
      { sequence: 1, status: "drawn", startsOn: "2026-10-01", endsOn: "2026-12-31" },
      { sequence: 2, status: "open", startsOn: "2027-01-01", endsOn: "2027-03-31" },
    ]);

    const second = await rotateBuilding(db, new NullCache(), b, "2026-09-26", 7);
    expect(second.actions).toEqual([]);
    expect(await cycles(b)).toHaveLength(2);
  });

  it("leaves a cycle alone while its start is outside the lead window", async () => {
    const b = await building();
    await cycleWithEntrants(b, 1, "2026-10-01", "2026-12-31", ["a"]);

    const result = await rotateBuilding(db, new NullCache(), b, "2026-09-13", 7);

    expect(result.actions).toEqual([]);
    expect((await cycles(b))[0]?.status).toBe("open");
  });

  it("reopens registration after a drawn cycle when nothing is open", async () => {
    const b = await building();
    await db.insert(parkingSpots).values([{ buildingId: b, label: "S1" }]);
    const c = await cycleWithEntrants(b, 1, "2026-07-01", "2026-09-30", ["a"]);
    await rotateBuilding(db, new NullCache(), b, "2026-06-30", 7); // draws c1, opens c2
    // Simulate an operator deleting the open cycle: nothing open, latest drawn is c1.
    await db
      .delete(raffleCycles)
      .where(and(eq(raffleCycles.buildingId, b), eq(raffleCycles.status, "open")));
    expect(c).toBeTruthy();

    const result = await rotateBuilding(db, new NullCache(), b, "2026-08-15", 7);

    expect(result.actions).toEqual([
      { type: "open", period: { startsOn: "2026-10-01", endsOn: "2026-12-31" } },
    ]);
  });

  it("recovers from downtime in one run and is idempotent the same day", async () => {
    const b = await building();
    await db.insert(parkingSpots).values([{ buildingId: b, label: "S1" }]);
    // Worker was down for over a year: the open cycle's quarter ended long ago.
    await cycleWithEntrants(b, 1, "2025-01-01", "2025-03-31", ["a", "b"]);

    const first = await rotateBuilding(db, new NullCache(), b, "2026-09-13", 7);
    expect(first.actions).toEqual([
      { type: "draw", cycleId: expect.any(String) },
      { type: "open", period: { startsOn: "2026-10-01", endsOn: "2026-12-31" } },
    ]);

    const second = await rotateBuilding(db, new NullCache(), b, "2026-09-13", 7);
    expect(second.actions).toEqual([]);
    expect(await cycles(b)).toEqual([
      { sequence: 1, status: "drawn", startsOn: "2025-01-01", endsOn: "2025-03-31" },
      { sequence: 2, status: "open", startsOn: "2026-10-01", endsOn: "2026-12-31" },
    ]);
  });

  it("does nothing for a building with no cycles", async () => {
    const b = await building();
    const result = await rotateBuilding(db, new NullCache(), b, "2026-09-13", 7);
    expect(result.actions).toEqual([]);
  });
});

describe("rotateAllBuildings", () => {
  it("isolates one building's failure, reports it, and fails the run after the others ran", async () => {
    const failing = await building();
    const healthy = await building();
    await db.insert(parkingSpots).values([{ buildingId: healthy, label: "S1" }]);
    await cycleWithEntrants(healthy, 1, "2026-10-01", "2026-12-31", ["a"]);

    const rotateOne: typeof rotateBuilding = async (d, c, id, today, lead) => {
      if (id === failing) throw new Error('boom for "secret@example.com"');
      return rotateBuilding(d, c, id, today, lead);
    };
    const results = await rotateAllBuildings(db, new NullCache(), "2026-09-25", 7, rotateOne);

    const forHealthy = results.find((r) => r.buildingId === healthy);
    expect(forHealthy?.error).toBeUndefined();
    expect(forHealthy?.actions.map((a) => a.type)).toEqual(["draw", "open"]);
    const forFailing = results.find((r) => r.buildingId === failing);
    expect(forFailing).toMatchObject({ actions: [], error: { name: "Error" } });

    expect(() => assertRotationSucceeded(results)).toThrow(/failed for 1 of \d+ building/);
    expect(() => assertRotationSucceeded(results.filter((r) => !r.error))).not.toThrow();
  });
});
