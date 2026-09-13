import { createDb, schema } from "@parking/db";
import { afterAll, describe, expect, it } from "vitest";
import { runDraw } from "../admin/draw";
import { getResidentStatus } from "./status";

/** Resident status against the real PostgreSQL, around the week between a draw and its start. */
const url = process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking";
const { db, pool } = createDb(url);
const { buildings, residents, parkingSpots, raffleCycles, raffleRegistrations } = schema;

afterAll(() => pool.end());

async function fixture() {
  const [b] = await db
    .insert(buildings)
    .values({ name: `status-${Date.now()}` })
    .returning();
  if (!b) throw new Error("no building");
  await db.insert(parkingSpots).values([{ buildingId: b.id, label: "S1" }]);
  const ids: Record<string, string> = {};
  for (const unit of ["a", "b", "c"]) {
    const [r] = await db
      .insert(residents)
      .values({ buildingId: b.id, unit, fullName: `Resident ${unit}`, email: `${unit}@st.local` })
      .returning({ id: residents.id });
    if (!r) throw new Error("no resident");
    ids[unit] = r.id;
  }
  return { buildingId: b.id, ids };
}

describe("getResidentStatus", () => {
  it("reports the next quarter's drawn result before it starts, per resident", async () => {
    const { buildingId, ids } = await fixture();
    const today = "2026-09-24";
    // Cycle 1 starts in a week and has been drawn (one spot, two entrants); resident c did not enter.
    const [c1] = await db
      .insert(raffleCycles)
      .values({ buildingId, sequence: 1, startsOn: "2026-10-01", endsOn: "2026-12-31" })
      .returning({ id: raffleCycles.id });
    if (!c1) throw new Error("no cycle");
    for (const unit of ["a", "b"]) {
      await db.insert(raffleRegistrations).values({ cycleId: c1.id, residentId: ids[unit] ?? "" });
    }
    await runDraw(db, { cycleId: c1.id, buildingId, executedByUserId: null, seed: "status-test" });
    // Cycle 2 is open for registration.
    await db
      .insert(raffleCycles)
      .values({ buildingId, sequence: 2, startsOn: "2027-01-01", endsOn: "2027-03-31" });

    const [a, b, c] = await Promise.all(
      ["a", "b", "c"].map((u) => getResidentStatus(db, ids[u] ?? "", buildingId, today)),
    );
    if (!a || !b || !c) throw new Error("missing status");

    // Nothing covers today yet.
    expect(a.current).toBeNull();

    // Exactly one of a and b won the single spot; the other was ranked but not allocated.
    const outcomes = [a.next?.outcome, b.next?.outcome].sort();
    expect(outcomes).toEqual(["allocated", "not_allocated"]);
    const winner = a.next?.outcome === "allocated" ? a : b;
    expect(winner.next).toMatchObject({
      cycleSequence: 1,
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
      spotLabel: "S1",
    });

    // c never registered for cycle 1.
    expect(c.next).toMatchObject({ cycleSequence: 1, outcome: "not_entered", spotLabel: null });

    // The open cycle is visible to everyone as the upcoming draw; nobody has registered yet.
    for (const s of [a, b, c]) {
      expect(s.upcoming).toMatchObject({ cycleSequence: 2, registered: false });
    }

    // History lists the drawn cycle for entrants only.
    expect(a.history).toHaveLength(1);
    expect(c.history).toHaveLength(0);
  });

  it("has no next result once the drawn cycle has started, and shows it as current instead", async () => {
    const { buildingId, ids } = await fixture();
    const [c1] = await db
      .insert(raffleCycles)
      .values({ buildingId, sequence: 1, startsOn: "2026-10-01", endsOn: "2026-12-31" })
      .returning({ id: raffleCycles.id });
    if (!c1) throw new Error("no cycle");
    await db.insert(raffleRegistrations).values({ cycleId: c1.id, residentId: ids.a ?? "" });
    await runDraw(db, { cycleId: c1.id, buildingId, executedByUserId: null, seed: "status-test" });

    const status = await getResidentStatus(db, ids.a ?? "", buildingId, "2026-10-15");

    expect(status.next).toBeNull();
    expect(status.current).toMatchObject({ cycleSequence: 1, spotLabel: "S1" });
    expect(status.upcoming).toBeNull();
  });
});
