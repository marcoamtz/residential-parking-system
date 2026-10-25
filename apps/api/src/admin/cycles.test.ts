import { schema } from "@parking/db";
import { eq } from "drizzle-orm";
import { sign } from "hono/jwt";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { NullCache } from "../cache";
import { REQUEST_HEADER, REQUEST_HEADER_VALUE } from "../csrf";
import { createTestDb } from "../test/db";

/** POST /api/admin/cycles through the real app against PostgreSQL, one building per test. */
const { db, pool } = createTestDb();
const { buildings, raffleCycles } = schema;
const SECRET = "test-secret-at-least-16-chars";
const app = createApp({
  db,
  cache: new NullCache(),
  jwtSecret: SECRET,
  cookieSecure: false,
  mockAuth: false,
  now: () => new Date(),
});

afterAll(() => pool.end());

async function building() {
  const [row] = await db
    .insert(buildings)
    .values({ name: `cycles-${Date.now()}` })
    .returning({ id: buildings.id });
  if (!row) throw new Error("no building");
  return row.id;
}

async function createCycle(buildingId: string, startsOn: string, endsOn: string) {
  const token = await sign(
    {
      sub: "admin",
      email: "admin@test.local",
      role: "admin",
      buildingId,
      residentId: null,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    SECRET,
  );
  return app.request("/api/admin/cycles", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `session=${token}`,
      [REQUEST_HEADER]: REQUEST_HEADER_VALUE,
    },
    body: JSON.stringify({ startsOn, endsOn }),
  });
}

/** Closes registration on the building's open cycle, as a draw would, so another can be created. */
async function closeOpenCycle(buildingId: string) {
  await db
    .update(raffleCycles)
    .set({ status: "drawn" })
    .where(eq(raffleCycles.buildingId, buildingId));
}

describe("POST /api/admin/cycles", () => {
  it("rejects a period that does not start after the building's latest cycle", async () => {
    const b = await building();
    expect((await createCycle(b, "2030-10-01", "2030-12-31")).status).toBe(201);
    await closeOpenCycle(b);

    // A back-dated cycle would take the highest sequence and break the rotation and the ranking.
    const past = await createCycle(b, "2020-01-01", "2020-03-31");
    expect(past.status).toBe(400);
    expect(await past.json()).toEqual({
      code: "cycle_not_after_latest",
      message: "startsOn must be after the building's latest cycle, which ends on 2030-12-31",
    });
    // Overlapping, including a single shared day, is not after the latest cycle either.
    expect((await createCycle(b, "2030-11-01", "2030-11-03")).status).toBe(400);
    expect((await createCycle(b, "2030-12-31", "2031-03-31")).status).toBe(400);
  });

  it("keeps the exclusion constraint as the database guard for any other writer", async () => {
    const b = await building();
    expect((await createCycle(b, "2030-10-01", "2030-12-31")).status).toBe(201);
    await closeOpenCycle(b);

    const direct = db
      .insert(raffleCycles)
      .values({ buildingId: b, sequence: 2, startsOn: "2030-11-01", endsOn: "2030-11-03" });
    await expect(direct).rejects.toMatchObject({ cause: { code: "23P01" } });
  });

  it("rejects impossible calendar dates with 400 before they reach PostgreSQL", async () => {
    const b = await building();
    for (const startsOn of ["2026-02-30", "2026-02-31"]) {
      const res = await createCycle(b, startsOn, "2026-03-31");
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "validation_error",
        issues: [{ path: "startsOn", message: "Expected a calendar date, YYYY-MM-DD" }],
      });
    }
    // A leap day is a real date.
    expect((await createCycle(b, "2028-02-29", "2028-03-31")).status).toBe(201);
  });

  it("accepts the adjacent quarter and the same period in another building", async () => {
    const b = await building();
    expect((await createCycle(b, "2030-10-01", "2030-12-31")).status).toBe(201);
    await closeOpenCycle(b);
    expect((await createCycle(b, "2031-01-01", "2031-03-31")).status).toBe(201);

    const other = await building();
    expect((await createCycle(other, "2030-10-01", "2030-12-31")).status).toBe(201);
  });
});
