import { randomBytes } from "node:crypto";
import type { Db } from "@parking/db";
import { schema } from "@parking/db";
import { type DrawInput, type DrawResult, type Entrant, executeDraw } from "@parking/domain";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "../errors";
import { drawDuration } from "../observability";

const { raffleCycles, parkingSpots, spotAllocations, raffleDraws } = schema;

const entrantRow = z.object({
  registration_id: z.string(),
  resident_id: z.string(),
  cycles_since_last_allocation: z.number().int().nullable(),
  lifetime_allocations: z.number().int(),
  lifetime_unsuccessful_registrations: z.number().int(),
});

export interface RunDrawParams {
  cycleId: string;
  buildingId: string;
  executedByUserId: string | null;
  /** Fixtures and tests may pin the seed for reproducible results. Production callers leave it unset. */
  seed?: string;
}

export interface RunDrawOutcome {
  cycleId: string;
  entrants: number;
  spots: number;
  allocations: number;
  seed: string;
}

/**
 * Runs the draw for one cycle inside a single transaction (ADR-0004):
 *  1. claim the cycle by flipping open -> drawn; zero rows means someone else did
 *  2. read entrants with their history, and the active spots
 *  3. call the pure domain function
 *  4. write allocations
 *  5. write the verification record
 * Any failure rolls the whole draw back, including the status flip.
 * The caller bumps the cache version after this returns, never inside.
 */
export async function runDraw(db: Db, params: RunDrawParams): Promise<RunDrawOutcome> {
  const [cycle] = await db
    .select({ id: raffleCycles.id, sequence: raffleCycles.sequence, status: raffleCycles.status })
    .from(raffleCycles)
    .where(and(eq(raffleCycles.id, params.cycleId), eq(raffleCycles.buildingId, params.buildingId)))
    .limit(1);
  if (!cycle) throw new HttpError(404, "cycle_not_found", "Cycle not found");

  const stopTimer = drawDuration.startTimer();
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx
        .update(raffleCycles)
        .set({ status: "drawn" })
        .where(and(eq(raffleCycles.id, cycle.id), eq(raffleCycles.status, "open")))
        .returning({ id: raffleCycles.id });
      if (claimed.length === 0) {
        throw new HttpError(409, "cycle_already_drawn", "This cycle has already been drawn");
      }

      const entrants = await loadEntrants(tx, cycle.id, params.buildingId, cycle.sequence);
      const spots = await tx
        .select({ id: parkingSpots.id, label: parkingSpots.label })
        .from(parkingSpots)
        .where(
          and(eq(parkingSpots.buildingId, params.buildingId), eq(parkingSpots.isActive, true)),
        );

      const input: DrawInput = {
        cycleId: cycle.id,
        entrants,
        spots,
        seed: params.seed ?? randomBytes(16).toString("hex"),
      };
      const result: DrawResult = executeDraw(input);

      if (result.allocations.length > 0) {
        await tx.insert(spotAllocations).values(
          result.allocations.map((a) => ({
            cycleId: cycle.id,
            spotId: a.spotId,
            registrationId: a.registrationId,
            rank: a.rank,
          })),
        );
      }

      await tx.insert(raffleDraws).values({
        cycleId: cycle.id,
        seed: input.seed,
        inputSnapshot: { entrants: input.entrants, spots: input.spots },
        executedByUserId: params.executedByUserId,
      });

      return {
        cycleId: cycle.id,
        entrants: entrants.length,
        spots: spots.length,
        allocations: result.allocations.length,
        seed: input.seed,
      };
    });
  } finally {
    stopTimer();
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * One query for the ranking inputs. History is scoped to the building and to cycles drawn
 * before this one. Residents who moved out are not entrants even if they registered.
 */
async function loadEntrants(
  tx: Tx,
  cycleId: string,
  buildingId: string,
  sequence: number,
): Promise<Entrant[]> {
  const result = await tx.execute(sql`
    WITH entrants AS (
      SELECT r.id AS registration_id, r.resident_id
      FROM raffle_registrations r
      JOIN residents res ON res.id = r.resident_id
      WHERE r.cycle_id = ${cycleId} AND res.moved_out_at IS NULL
    ),
    past AS (
      SELECT reg.resident_id, c.sequence, (a.id IS NOT NULL) AS won
      FROM raffle_registrations reg
      JOIN raffle_cycles c ON c.id = reg.cycle_id
      LEFT JOIN spot_allocations a ON a.registration_id = reg.id
      WHERE c.building_id = ${buildingId} AND c.status = 'drawn' AND c.sequence < ${sequence}
    ),
    stats AS (
      SELECT resident_id,
             MAX(sequence) FILTER (WHERE won) AS last_won_sequence,
             COUNT(*) FILTER (WHERE won)::int AS lifetime_allocations,
             COUNT(*) FILTER (WHERE NOT won)::int AS lifetime_unsuccessful_registrations
      FROM past
      GROUP BY resident_id
    )
    SELECT e.registration_id,
           e.resident_id,
           CASE WHEN s.last_won_sequence IS NULL THEN NULL
                ELSE ${sequence} - s.last_won_sequence END AS cycles_since_last_allocation,
           COALESCE(s.lifetime_allocations, 0) AS lifetime_allocations,
           COALESCE(s.lifetime_unsuccessful_registrations, 0) AS lifetime_unsuccessful_registrations
    FROM entrants e
    LEFT JOIN stats s ON s.resident_id = e.resident_id
  `);

  return z
    .array(entrantRow)
    .parse(result.rows)
    .map((row) => ({
      registrationId: row.registration_id,
      residentId: row.resident_id,
      cyclesSinceLastAllocation: row.cycles_since_last_allocation,
      lifetimeAllocations: row.lifetime_allocations,
      lifetimeUnsuccessfulRegistrations: row.lifetime_unsuccessful_registrations,
    }));
}
