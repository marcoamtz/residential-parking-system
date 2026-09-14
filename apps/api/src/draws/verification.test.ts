import { schema } from "@parking/db";
import { executeDraw } from "@parking/domain";
import { afterAll, describe, expect, it } from "vitest";
import { runDraw } from "../admin/draw";
import { createTestDb } from "../test/db";
import { getDrawVerification } from "./verification";

/** The published verification record must be enough to replay the draw, and nothing more. */
const { db, pool } = createTestDb();
const { buildings, residents, parkingSpots, raffleCycles, raffleRegistrations } = schema;

afterAll(() => pool.end());

async function drawnFixture() {
  const [b] = await db
    .insert(buildings)
    .values({ name: `verify-${Date.now()}` })
    .returning();
  if (!b) throw new Error("no building");
  await db.insert(parkingSpots).values([
    { buildingId: b.id, label: "S1" },
    { buildingId: b.id, label: "S2" },
  ]);
  const [cycle] = await db
    .insert(raffleCycles)
    .values({ buildingId: b.id, sequence: 1, startsOn: "2030-01-01", endsOn: "2030-03-31" })
    .returning({ id: raffleCycles.id });
  if (!cycle) throw new Error("no cycle");
  const residentIds: string[] = [];
  const registrationIds: string[] = [];
  for (const unit of ["a", "b", "c"]) {
    const [r] = await db
      .insert(residents)
      .values({
        buildingId: b.id,
        unit,
        fullName: `Resident ${unit}`,
        email: `${unit}-${b.id}@v.local`,
      })
      .returning({ id: residents.id });
    if (!r) throw new Error("no resident");
    residentIds.push(r.id);
    const [reg] = await db
      .insert(raffleRegistrations)
      .values({ cycleId: cycle.id, residentId: r.id })
      .returning({ id: raffleRegistrations.id });
    if (reg) registrationIds.push(reg.id);
  }
  await runDraw(db, {
    cycleId: cycle.id,
    buildingId: b.id,
    executedByUserId: null,
    seed: "verify-seed",
  });
  return { buildingId: b.id, cycleId: cycle.id, residentIds, registrationIds };
}

describe("getDrawVerification", () => {
  it("publishes a record that replays to the stored allocations and hides resident identities", async () => {
    const { buildingId, cycleId, residentIds, registrationIds } = await drawnFixture();

    const record = await getDrawVerification(db, buildingId, cycleId, {
      forResidentId: residentIds[0],
    });

    expect(record.seed).toBe("verify-seed");
    expect(record.input.entrants).toHaveLength(3);
    expect(record.input.spots).toHaveLength(2);
    expect(record.allocations).toHaveLength(2);
    expect(record.yourRegistrationId).toBe(registrationIds[0]);

    const replay = executeDraw(record.input);
    expect(new Set(replay.allocations.map((a) => JSON.stringify(a)))).toEqual(
      new Set(record.allocations.map((a) => JSON.stringify(a))),
    );

    const serialized = JSON.stringify(record);
    for (const residentId of residentIds) expect(serialized).not.toContain(residentId);
    expect(serialized).not.toContain("Resident a");
    expect(serialized).not.toContain("@v.local");
  });

  it("reports no registration of the caller when they did not enter", async () => {
    const { buildingId, cycleId } = await drawnFixture();
    const record = await getDrawVerification(db, buildingId, cycleId, {
      forResidentId: "00000000-0000-4000-8000-000000000000",
    });
    expect(record.yourRegistrationId).toBeNull();
  });

  it("refuses an open cycle and a cycle from another building", async () => {
    const { buildingId } = await drawnFixture();
    const [open] = await db
      .insert(raffleCycles)
      .values({ buildingId, sequence: 2, startsOn: "2030-04-01", endsOn: "2030-06-30" })
      .returning({ id: raffleCycles.id });
    if (!open) throw new Error("no cycle");
    await expect(getDrawVerification(db, buildingId, open.id)).rejects.toMatchObject({
      status: 409,
      code: "cycle_not_drawn",
    });

    const other = await drawnFixture();
    await expect(getDrawVerification(db, buildingId, other.cycleId)).rejects.toMatchObject({
      status: 404,
    });
  });
});
