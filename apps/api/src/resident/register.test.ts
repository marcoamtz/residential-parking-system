import { createDb, schema } from "@parking/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { runDraw } from "../admin/draw";
import { registerForOpenCycle } from "./status";

/**
 * Registration against the real PostgreSQL: the three rejections, and the two interleavings
 * with a draw that the FOR SHARE lock has to get right.
 */
const url = process.env.DATABASE_URL ?? "postgres://parking:parking@localhost:5432/parking";
const { db, pool } = createDb(url);
const { buildings, residents, parkingSpots, raffleCycles, raffleRegistrations } = schema;

afterAll(() => pool.end());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fixture(opts: { openCycle?: boolean } = { openCycle: true }) {
  const [b] = await db
    .insert(buildings)
    .values({ name: `register-${Date.now()}` })
    .returning();
  if (!b) throw new Error("no building");
  await db.insert(parkingSpots).values([{ buildingId: b.id, label: "S1" }]);
  const [a] = await db
    .insert(residents)
    .values({ buildingId: b.id, unit: "a", fullName: "Resident a", email: `a-${b.id}@reg.local` })
    .returning({ id: residents.id });
  if (!a) throw new Error("no resident");
  let cycleId: string | null = null;
  if (opts.openCycle) {
    const [c] = await db
      .insert(raffleCycles)
      .values({ buildingId: b.id, sequence: 1, startsOn: "2030-01-01", endsOn: "2030-03-31" })
      .returning({ id: raffleCycles.id });
    cycleId = c?.id ?? null;
  }
  return { buildingId: b.id, residentId: a.id, cycleId };
}

describe("registerForOpenCycle", () => {
  it("registers once and rejects the second attempt with 409 already_registered", async () => {
    const { buildingId, residentId, cycleId } = await fixture();

    const first = await registerForOpenCycle(db, residentId, buildingId);
    expect(first).toMatchObject({ cycleId, cycleSequence: 1 });

    await expect(registerForOpenCycle(db, residentId, buildingId)).rejects.toMatchObject({
      status: 409,
      code: "already_registered",
    });
  });

  it("rejects with 409 no_open_cycle when nothing is open", async () => {
    const { buildingId, residentId } = await fixture({ openCycle: false });

    await expect(registerForOpenCycle(db, residentId, buildingId)).rejects.toMatchObject({
      status: 409,
      code: "no_open_cycle",
    });
  });

  it("rejects a moved-out resident with 403 resident_inactive", async () => {
    const { buildingId, residentId } = await fixture();
    await db.update(residents).set({ movedOutAt: new Date() }).where(eq(residents.id, residentId));

    await expect(registerForOpenCycle(db, residentId, buildingId)).rejects.toMatchObject({
      status: 403,
      code: "resident_inactive",
    });
  });

  it("rejects a resident from another building", async () => {
    const { residentId } = await fixture();
    const other = await fixture();

    await expect(registerForOpenCycle(db, residentId, other.buildingId)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("blocks behind an uncommitted draw and then rejects, never landing in a drawn cycle", async () => {
    const { buildingId, residentId, cycleId } = await fixture();
    if (!cycleId) throw new Error("no cycle");

    // A draw in flight: the cycle row is claimed (UPDATE) but the transaction has not committed.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const draw = db.transaction(async (tx) => {
      await tx.execute(
        sql`update raffle_cycles set status = 'drawn' where id = ${cycleId} and status = 'open'`,
      );
      await gate;
    });
    await sleep(50);

    const registration = registerForOpenCycle(db, residentId, buildingId);
    const outcome = await Promise.race([
      registration.then(
        () => "settled",
        () => "settled",
      ),
      sleep(300).then(() => "blocked"),
    ]);
    expect(outcome).toBe("blocked");

    release();
    await draw;

    await expect(registration).rejects.toMatchObject({ status: 409, code: "no_open_cycle" });
    const rows = await db
      .select()
      .from(raffleRegistrations)
      .where(eq(raffleRegistrations.cycleId, cycleId));
    expect(rows).toHaveLength(0);
  });

  it("makes a draw wait for an in-flight registration and then include it", async () => {
    const { buildingId, residentId, cycleId } = await fixture();
    if (!cycleId) throw new Error("no cycle");

    // A registration in flight: holds the cycle row FOR SHARE, insert done, commit delayed.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const registration = db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from raffle_cycles where id = ${cycleId} and status = 'open' for share`,
      );
      await tx.insert(raffleRegistrations).values({ cycleId, residentId });
      await gate;
    });
    await sleep(50);

    const draw = runDraw(db, { cycleId, buildingId, executedByUserId: null });
    const outcome = await Promise.race([
      draw.then(
        () => "settled",
        () => "settled",
      ),
      sleep(300).then(() => "blocked"),
    ]);
    expect(outcome).toBe("blocked");

    release();
    await registration;

    const result = await draw;
    expect(result).toMatchObject({ entrants: 1, allocations: 1 });
  });
});
