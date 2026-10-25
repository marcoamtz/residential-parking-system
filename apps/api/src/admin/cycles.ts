import type { Db } from "@parking/db";
import { schema } from "@parking/db";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { HttpError, isExclusionViolation, isUniqueViolation } from "../errors";

const { raffleCycles, raffleRegistrations, spotAllocations, parkingSpots, residents, raffleDraws } =
  schema;

export async function listCycles(db: Db, buildingId: string) {
  return db
    .select({
      id: raffleCycles.id,
      sequence: raffleCycles.sequence,
      status: raffleCycles.status,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
      registrations: count(raffleRegistrations.id),
    })
    .from(raffleCycles)
    .leftJoin(raffleRegistrations, eq(raffleRegistrations.cycleId, raffleCycles.id))
    .where(eq(raffleCycles.buildingId, buildingId))
    .groupBy(raffleCycles.id)
    .orderBy(desc(raffleCycles.sequence));
}

export async function createCycle(
  db: Db,
  buildingId: string,
  period: { startsOn: string; endsOn: string },
) {
  if (period.endsOn <= period.startsOn) {
    throw new HttpError(400, "invalid_period", "endsOn must be after startsOn");
  }
  // Sequence order must be chronological: the rotation takes the highest sequence as the latest
  // cycle, and the ranking measures waits as sequence differences. So a new cycle starts after the
  // building's latest one ends. The exclusion constraint still guards any other writer.
  const [last] = await db
    .select({
      max: sql<number>`coalesce(max(${raffleCycles.sequence}), 0)::int`,
      latestEndsOn: sql<string | null>`max(${raffleCycles.endsOn})::text`,
    })
    .from(raffleCycles)
    .where(eq(raffleCycles.buildingId, buildingId));
  if (last?.latestEndsOn && period.startsOn <= last.latestEndsOn) {
    throw new HttpError(
      400,
      "cycle_not_after_latest",
      `startsOn must be after the building's latest cycle, which ends on ${last.latestEndsOn}`,
    );
  }
  const sequence = (last?.max ?? 0) + 1;

  try {
    const [row] = await db
      .insert(raffleCycles)
      .values({ buildingId, sequence, startsOn: period.startsOn, endsOn: period.endsOn })
      .returning({
        id: raffleCycles.id,
        sequence: raffleCycles.sequence,
        status: raffleCycles.status,
        startsOn: raffleCycles.startsOn,
        endsOn: raffleCycles.endsOn,
      });
    if (!row) throw new Error("insert returned no row");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "open_cycle_exists", "A cycle is already open for this building");
    }
    if (isExclusionViolation(error)) {
      throw new HttpError(
        409,
        "cycle_overlap",
        "The period overlaps another cycle of this building",
      );
    }
    throw error;
  }
}

export async function getCycleDetail(db: Db, buildingId: string, cycleId: string) {
  const [cycle] = await db
    .select({
      id: raffleCycles.id,
      sequence: raffleCycles.sequence,
      status: raffleCycles.status,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
    })
    .from(raffleCycles)
    .where(and(eq(raffleCycles.id, cycleId), eq(raffleCycles.buildingId, buildingId)))
    .limit(1);
  if (!cycle) throw new HttpError(404, "cycle_not_found", "Cycle not found");

  const registrations = await db
    .select({
      registrationId: raffleRegistrations.id,
      unit: residents.unit,
      fullName: residents.fullName,
      rank: spotAllocations.rank,
      spotLabel: parkingSpots.label,
    })
    .from(raffleRegistrations)
    .innerJoin(residents, eq(residents.id, raffleRegistrations.residentId))
    .leftJoin(spotAllocations, eq(spotAllocations.registrationId, raffleRegistrations.id))
    .leftJoin(parkingSpots, eq(parkingSpots.id, spotAllocations.spotId))
    .where(eq(raffleRegistrations.cycleId, cycleId))
    .orderBy(sql`${spotAllocations.rank} NULLS LAST`, asc(residents.unit));

  const [draw] = await db
    .select({ seed: raffleDraws.seed, executedAt: raffleDraws.executedAt })
    .from(raffleDraws)
    .where(eq(raffleDraws.cycleId, cycleId))
    .limit(1);

  return { cycle, registrations, draw: draw ?? null };
}
