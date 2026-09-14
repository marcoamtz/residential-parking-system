import type { Db } from "@parking/db";
import { schema } from "@parking/db";
import { type CycleRef, planRotation, type RotationAction } from "@parking/domain";
import { and, desc, eq } from "drizzle-orm";
import { createCycle } from "../admin/cycles";
import { runDraw } from "../admin/draw";
import type { Cache } from "../cache";
import { describeError, type ErrorDescription } from "../errors";
import { logger } from "../observability";

const { buildings, raffleCycles } = schema;

export interface RotationResult {
  buildingId: string;
  actions: RotationAction[];
  /** Set when this building's rotation threw; the other buildings were still processed. */
  error?: ErrorDescription;
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
      if (openCycle && openCycle.startsOn <= today) {
        logger.warn(
          { buildingId, cycleId: action.cycleId, startsOn: openCycle.startsOn, today },
          "late draw: the cycle's start has already passed (worker downtime?)",
        );
      }
      await runDraw(db, { cycleId: action.cycleId, buildingId, executedByUserId: null });
    } else {
      await createCycle(db, buildingId, action.period);
    }
  }
  if (actions.length > 0) await cache.bump(buildingId);

  return { buildingId, actions };
}

/**
 * Failure policy (ADR-0012, amendment): one building's failure never stops the others. It is
 * logged with the building id and returned in its result so the caller can fail the run as a whole
 * (non-zero exit for `--once`, failed job for the worker). The next run retries it, because the
 * policy is idempotent.
 */
export async function rotateAllBuildings(
  db: Db,
  cache: Cache,
  today: string,
  drawLeadDays: number,
  rotateOne: typeof rotateBuilding = rotateBuilding,
): Promise<RotationResult[]> {
  const rows = await db.select({ id: buildings.id }).from(buildings);
  const results: RotationResult[] = [];
  for (const { id } of rows) {
    try {
      results.push(await rotateOne(db, cache, id, today, drawLeadDays));
    } catch (error) {
      const described = describeError(error);
      logger.error({ buildingId: id, err: described }, "rotation failed for building");
      results.push({ buildingId: id, actions: [], error: described });
    }
  }
  return results;
}

/** Throws when any building failed, after all of them ran, so a job or a one-shot run reports failure. */
export function assertRotationSucceeded(results: RotationResult[]): void {
  const failed = results.filter((r) => r.error).map((r) => r.buildingId);
  if (failed.length > 0) {
    throw new Error(`rotation failed for ${failed.length} of ${results.length} building(s)`);
  }
}
