import type { Db } from "@parking/db";
import { schema } from "@parking/db";
import type { Entrant, Spot } from "@parking/domain";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "../errors";

const { raffleCycles, raffleDraws, spotAllocations, raffleRegistrations } = schema;

const snapshotSchema = z.object({
  entrants: z.array(
    z.object({
      registrationId: z.string(),
      residentId: z.string().optional(),
      cyclesSinceLastAllocation: z.number().int().nullable(),
      lifetimeAllocations: z.number().int(),
      lifetimeUnsuccessfulRegistrations: z.number().int(),
    }),
  ),
  spots: z.array(z.object({ id: z.string(), label: z.string() })),
});

export interface DrawVerification {
  cycle: { id: string; sequence: number; startsOn: string; endsOn: string };
  seed: string;
  executedAt: string;
  /** Exactly what executeDraw received, minus resident identities. Entrants are registration ids. */
  input: { cycleId: string; entrants: Entrant[]; spots: Spot[]; seed: string };
  /** What the draw produced. Replaying `input` must reproduce this set. */
  allocations: Array<{ registrationId: string; spotId: string; rank: number }>;
  /** The caller's own registration in this cycle, so they can find themselves in the list. */
  yourRegistrationId: string | null;
  howToVerify: string;
}

/**
 * The verification record for a drawn cycle (ADR-0003): seed, the exact ranking inputs, and the
 * allocations, scoped to the caller's building. Residents are identified by registration id only,
 * so a resident can check the draw without learning who else lives in the building.
 */
export async function getDrawVerification(
  db: Db,
  buildingId: string,
  cycleId: string,
  options: { forResidentId?: string } = {},
): Promise<DrawVerification> {
  const [row] = await db
    .select({
      id: raffleCycles.id,
      sequence: raffleCycles.sequence,
      startsOn: raffleCycles.startsOn,
      endsOn: raffleCycles.endsOn,
      status: raffleCycles.status,
      seed: raffleDraws.seed,
      executedAt: raffleDraws.executedAt,
      inputSnapshot: raffleDraws.inputSnapshot,
    })
    .from(raffleCycles)
    .leftJoin(raffleDraws, eq(raffleDraws.cycleId, raffleCycles.id))
    .where(and(eq(raffleCycles.id, cycleId), eq(raffleCycles.buildingId, buildingId)))
    .limit(1);
  if (!row) throw new HttpError(404, "cycle_not_found", "Cycle not found");
  if (row.status !== "drawn" || row.seed === null || row.executedAt === null) {
    throw new HttpError(409, "cycle_not_drawn", "This cycle has not been drawn yet");
  }

  const snapshot = snapshotSchema.parse(row.inputSnapshot);
  const allocations = await db
    .select({
      registrationId: spotAllocations.registrationId,
      spotId: spotAllocations.spotId,
      rank: spotAllocations.rank,
    })
    .from(spotAllocations)
    .where(eq(spotAllocations.cycleId, cycleId))
    .orderBy(asc(spotAllocations.rank));

  let yourRegistrationId: string | null = null;
  if (options.forResidentId) {
    const [mine] = await db
      .select({ id: raffleRegistrations.id })
      .from(raffleRegistrations)
      .where(
        and(
          eq(raffleRegistrations.cycleId, cycleId),
          eq(raffleRegistrations.residentId, options.forResidentId),
        ),
      )
      .limit(1);
    yourRegistrationId = mine?.id ?? null;
  }

  return {
    cycle: { id: row.id, sequence: row.sequence, startsOn: row.startsOn, endsOn: row.endsOn },
    seed: row.seed,
    executedAt: row.executedAt.toISOString(),
    input: {
      cycleId: row.id,
      entrants: snapshot.entrants.map(({ residentId: _omitted, ...entrant }) => entrant),
      spots: snapshot.spots,
      seed: row.seed,
    },
    allocations,
    yourRegistrationId,
    howToVerify:
      "Run executeDraw(input) from @parking/domain (packages/domain/src/draw.ts). Its allocations must equal the allocations listed here; the rule is in docs/02-domain-and-fairness.md.",
  };
}
