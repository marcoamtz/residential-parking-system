import type { Db } from "@parking/db";
import { schema } from "@parking/db";
import { type CycleRef, planRotation, type RotationAction } from "@parking/domain";
import { and, desc, eq } from "drizzle-orm";
import { createCycle } from "../admin/cycles";
import { runDraw } from "../admin/draw";
import type { Cache } from "../cache";
import { logger } from "../observability";

const { buildings, raffleCycles } = schema;

export interface RotationResult {
  buildingId: string;
  actions: RotationAction[];
}

async function cycleWhere(db: Db, buildingId: string, status: "open" | "drawn") {
  const [row] = await db
    .select({
      id: raffleCycles.id,
      sequence: raffleCycles.sequence,
      status: raffleCycles.status,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
    })
    .from(raffleCycles)
    .where(and(eq(raffleCycles.buildingId, buildingId), eq(raffleCycles.status, status)))
    .orderBy(desc(raffleCycles.sequence))
    .limit(1);
  return (row as CycleRef | undefined) ?? null;
}

/**
 * Apply the rotation policy to one building: draw the open cycle when it is due and keep a
 * cycle open for registration. Each action reuses the same code path the administrator uses
 * (runDraw, createCycle), so a scheduled draw and a manual one are indistinguishable. The cache
 * version is bumped once after the database work, never inside a transaction (ADR-0005).
 */
export async function rotateBuilding(
  db: Db,
  cache: Cache,
  buildingId: string,
  today: string,
  drawLeadDays: number,
): Promise<RotationResult> {
  const [openCycle, latestDrawnCycle] = await Promise.all([
    cycleWhere(db, buildingId, "open"),
    cycleWhere(db, buildingId, "drawn"),
  ]);
  const actions = planRotation({ today, openCycle, latestDrawnCycle, drawLeadDays });

  for (const action of actions) {
    if (action.type === "draw") {
      await runDraw(db, { cycleId: action.cycleId, buildingId, executedByUserId: null });
    } else {
      await createCycle(db, buildingId, action.period);
    }
  }
  if (actions.length > 0) await cache.bump(buildingId);

  return { buildingId, actions };
}

export async function rotateAllBuildings(
  db: Db,
  cache: Cache,
  today: string,
  drawLeadDays: number,
): Promise<RotationResult[]> {
  const rows = await db.select({ id: buildings.id }).from(buildings);
  const results: RotationResult[] = [];
  for (const { id } of rows) {
    // One building's failure must not stop the others; the job reports it and retries next run.
    try {
      results.push(await rotateBuilding(db, cache, id, today, drawLeadDays));
    } catch (error) {
      logger.error({ buildingId: id, err: error }, "rotation failed for building");
    }
  }
  return results;
}
