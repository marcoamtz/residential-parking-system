import type { Db } from "@parking/db";
import { schema } from "@parking/db";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { HttpError, isUniqueViolation } from "../errors";

const { raffleCycles, raffleRegistrations, spotAllocations, parkingSpots, residents } = schema;

export interface ResidentStatus {
  resident: { id: string; unit: string; fullName: string };
  /** Allocation whose cycle covers today. */
  current: { cycleSequence: number; startsOn: string; endsOn: string; spotLabel: string } | null;
  /** Cycle accepting registrations, if any. */
  upcoming: {
    cycleId: string;
    cycleSequence: number;
    startsOn: string;
    endsOn: string;
    registered: boolean;
  } | null;
  /** Every drawn cycle the resident entered, newest first. */
  history: Array<{
    cycleSequence: number;
    startsOn: string;
    endsOn: string;
    outcome: "allocated" | "not_allocated";
    spotLabel: string | null;
  }>;
}

export async function getResidentStatus(
  db: Db,
  residentId: string,
  buildingId: string,
  today: string,
): Promise<ResidentStatus> {
  const [resident] = await db
    .select({ id: residents.id, unit: residents.unit, fullName: residents.fullName })
    .from(residents)
    .where(and(eq(residents.id, residentId), eq(residents.buildingId, buildingId)))
    .limit(1);
  if (!resident) throw new HttpError(404, "resident_not_found", "Resident not found");

  const [current] = await db
    .select({
      cycleSequence: raffleCycles.sequence,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
      spotLabel: parkingSpots.label,
    })
    .from(spotAllocations)
    .innerJoin(raffleRegistrations, eq(raffleRegistrations.id, spotAllocations.registrationId))
    .innerJoin(raffleCycles, eq(raffleCycles.id, spotAllocations.cycleId))
    .innerJoin(parkingSpots, eq(parkingSpots.id, spotAllocations.spotId))
    .where(
      and(
        eq(raffleRegistrations.residentId, residentId),
        eq(raffleCycles.status, "drawn"),
        lte(raffleCycles.startsOn, today),
        gte(raffleCycles.endsOn, today),
      ),
    )
    .limit(1);

  const [open] = await db
    .select({
      cycleId: raffleCycles.id,
      cycleSequence: raffleCycles.sequence,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
      registrationId: raffleRegistrations.id,
    })
    .from(raffleCycles)
    .leftJoin(
      raffleRegistrations,
      and(
        eq(raffleRegistrations.cycleId, raffleCycles.id),
        eq(raffleRegistrations.residentId, residentId),
      ),
    )
    .where(and(eq(raffleCycles.buildingId, buildingId), eq(raffleCycles.status, "open")))
    .limit(1);

  const history = await db
    .select({
      cycleSequence: raffleCycles.sequence,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
      spotLabel: parkingSpots.label,
    })
    .from(raffleRegistrations)
    .innerJoin(raffleCycles, eq(raffleCycles.id, raffleRegistrations.cycleId))
    .leftJoin(spotAllocations, eq(spotAllocations.registrationId, raffleRegistrations.id))
    .leftJoin(parkingSpots, eq(parkingSpots.id, spotAllocations.spotId))
    .where(and(eq(raffleRegistrations.residentId, residentId), eq(raffleCycles.status, "drawn")))
    .orderBy(desc(raffleCycles.sequence));

  return {
    resident,
    current: current ?? null,
    upcoming: open
      ? {
          cycleId: open.cycleId,
          cycleSequence: open.cycleSequence,
          startsOn: open.startsOn,
          endsOn: open.endsOn,
          registered: open.registrationId !== null,
        }
      : null,
    history: history.map((row) => ({
      cycleSequence: row.cycleSequence,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      outcome: row.spotLabel === null ? "not_allocated" : "allocated",
      spotLabel: row.spotLabel,
    })),
  };
}

export async function registerForOpenCycle(
  db: Db,
  residentId: string,
  buildingId: string,
): Promise<{ registrationId: string; cycleId: string; cycleSequence: number }> {
  const [resident] = await db
    .select({ id: residents.id })
    .from(residents)
    .where(
      and(
        eq(residents.id, residentId),
        eq(residents.buildingId, buildingId),
        isNull(residents.movedOutAt),
      ),
    )
    .limit(1);
  if (!resident) throw new HttpError(403, "resident_inactive", "Resident cannot register");

  const [open] = await db
    .select({ id: raffleCycles.id, sequence: raffleCycles.sequence })
    .from(raffleCycles)
    .where(and(eq(raffleCycles.buildingId, buildingId), eq(raffleCycles.status, "open")))
    .limit(1);
  if (!open) throw new HttpError(409, "no_open_cycle", "No cycle is accepting registrations");

  try {
    const [row] = await db
      .insert(raffleRegistrations)
      .values({ cycleId: open.id, residentId })
      .returning({ id: raffleRegistrations.id });
    if (!row) throw new Error("insert returned no row");
    return { registrationId: row.id, cycleId: open.id, cycleSequence: open.sequence };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "already_registered", "Already registered for this cycle");
    }
    throw error;
  }
}
