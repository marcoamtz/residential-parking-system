import { cyrb53 } from "./hash";
import type { Allocation, DrawInput, DrawResult, Entrant, Spot } from "./types";

export class DrawInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawInputError";
  }
}

/** Never allocated sorts as an infinite wait, ahead of every past winner. */
function waitOf(entrant: Entrant): number {
  return entrant.cyclesSinceLastAllocation ?? Number.POSITIVE_INFINITY;
}

function descending(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/**
 * Stable pseudo-random value for one id under one seed. Derived per id rather than drawn from a
 * stateful generator so the result does not depend on the order entrants arrive in.
 */
export function tieBreakValue(seed: string, id: string): number {
  return cyrb53(`${seed}:${id}`);
}

/**
 * The fairness rule (ADR-0003), as a comparator. Earlier is better.
 *
 * 1. Longest wait since last allocation first; never allocated ranks first of all.
 * 2. Fewest lifetime allocations first.
 * 3. Most unsuccessful registrations first.
 * 4. Seeded tie-break.
 * 5. Registration id, so the order is total and replayable even on a hash collision.
 */
export function createEntrantComparator(seed: string): (a: Entrant, b: Entrant) => number {
  return (a, b) =>
    descending(waitOf(a), waitOf(b)) ||
    a.lifetimeAllocations - b.lifetimeAllocations ||
    descending(a.lifetimeUnsuccessfulRegistrations, b.lifetimeUnsuccessfulRegistrations) ||
    tieBreakValue(seed, a.registrationId) - tieBreakValue(seed, b.registrationId) ||
    a.registrationId.localeCompare(b.registrationId);
}

export function rankEntrants(entrants: readonly Entrant[], seed: string): Entrant[] {
  return [...entrants].sort(createEntrantComparator(seed));
}

/** Spots are handed out in a seeded order so no spot is systematically given to the top rank. */
function orderSpots(spots: readonly Spot[], seed: string): Spot[] {
  return [...spots].sort(
    (a, b) => tieBreakValue(seed, a.id) - tieBreakValue(seed, b.id) || a.id.localeCompare(b.id),
  );
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new DrawInputError(`duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function assertCount(value: number, label: string, registrationId: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DrawInputError(`entrant ${registrationId}: ${label} must be a non-negative integer`);
  }
}

function assertValid(input: DrawInput): void {
  if (input.seed.length === 0) {
    throw new DrawInputError("seed must not be empty");
  }
  assertUnique(
    input.entrants.map((e) => e.registrationId),
    "registrationId",
  );
  assertUnique(
    input.spots.map((s) => s.id),
    "spot id",
  );
  for (const entrant of input.entrants) {
    const wait = entrant.cyclesSinceLastAllocation;
    if (wait !== null && (!Number.isInteger(wait) || wait < 1)) {
      throw new DrawInputError(
        `entrant ${entrant.registrationId}: cyclesSinceLastAllocation must be null or a positive integer`,
      );
    }
    assertCount(entrant.lifetimeAllocations, "lifetimeAllocations", entrant.registrationId);
    assertCount(
      entrant.lifetimeUnsuccessfulRegistrations,
      "lifetimeUnsuccessfulRegistrations",
      entrant.registrationId,
    );
  }
}

/**
 * Run the draw for one cycle. Pure: same input, same output. Input order does not matter.
 * The caller persists `seed` alongside the input so the draw can be replayed and verified.
 */
export function executeDraw(input: DrawInput): DrawResult {
  assertValid(input);

  const ranked = rankEntrants(input.entrants, input.seed);
  const spots = orderSpots(input.spots, input.seed);

  const allocations: Allocation[] = [];
  const count = Math.min(ranked.length, spots.length);
  for (let i = 0; i < count; i++) {
    const entrant = ranked[i];
    const spot = spots[i];
    if (entrant === undefined || spot === undefined) break;
    allocations.push({ registrationId: entrant.registrationId, spotId: spot.id, rank: i + 1 });
  }

  return { cycleId: input.cycleId, seed: input.seed, ranked, allocations };
}
