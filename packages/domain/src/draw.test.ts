import { describe, expect, it } from "vitest";
import { DrawInputError, executeDraw, rankEntrants } from "./draw";
import type { Entrant, Spot } from "./types";

interface History {
  wait?: number | null;
  wins?: number;
  losses?: number;
}

function entrant(id: string, { wait = null, wins = 0, losses = 0 }: History = {}): Entrant {
  return {
    registrationId: `reg-${id}`,
    residentId: `res-${id}`,
    cyclesSinceLastAllocation: wait,
    lifetimeAllocations: wins,
    lifetimeUnsuccessfulRegistrations: losses,
  };
}

function spots(count: number): Spot[] {
  return Array.from({ length: count }, (_, i) => ({ id: `spot-${i + 1}`, label: `P${i + 1}` }));
}

const SEED = "0123456789abcdef";

function ids(entrants: Entrant[]): string[] {
  return entrants.map((e) => e.registrationId);
}

describe("ranking rule", () => {
  it("puts a never-allocated resident ahead of last quarter's winner", () => {
    const newcomer = entrant("new");
    const lastWinner = entrant("won", { wait: 1, wins: 1 });

    const result = executeDraw({
      cycleId: "c",
      entrants: [lastWinner, newcomer],
      spots: spots(1),
      seed: SEED,
    });

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.registrationId).toBe(newcomer.registrationId);
    expect(ids(result.ranked)).toEqual([newcomer.registrationId, lastWinner.registrationId]);
  });

  it("puts a never-allocated resident ahead of anyone who has ever won, regardless of wait", () => {
    const newcomer = entrant("new");
    const longAgoWinner = entrant("old", { wait: 40, wins: 1 });

    expect(ids(rankEntrants([longAgoWinner, newcomer], SEED))).toEqual([
      newcomer.registrationId,
      longAgoWinner.registrationId,
    ]);
  });

  it("ranks the longer wait first among past winners", () => {
    const waitedThree = entrant("three", { wait: 3, wins: 1 });
    const waitedOne = entrant("one", { wait: 1, wins: 1 });

    expect(ids(rankEntrants([waitedOne, waitedThree], SEED))).toEqual([
      waitedThree.registrationId,
      waitedOne.registrationId,
    ]);
  });

  it("ranks fewer lifetime wins first when the wait is equal", () => {
    const wonOnce = entrant("once", { wait: 2, wins: 1 });
    const wonFour = entrant("four", { wait: 2, wins: 4 });

    expect(ids(rankEntrants([wonFour, wonOnce], SEED))).toEqual([
      wonOnce.registrationId,
      wonFour.registrationId,
    ]);
  });

  it("ranks the persistent entrant ahead of a brand-new one when neither has ever won", () => {
    const newcomer = entrant("new");
    const persistent = entrant("persistent", { losses: 5 });

    expect(ids(rankEntrants([newcomer, persistent], SEED))).toEqual([
      persistent.registrationId,
      newcomer.registrationId,
    ]);
  });

  it("does not depend on the order entrants are supplied in", () => {
    const pool = [
      entrant("a", { wait: 1, wins: 2 }),
      entrant("b"),
      entrant("c", { losses: 3 }),
      entrant("d", { wait: 5, wins: 1 }),
      entrant("e", { losses: 3 }),
      entrant("f", { wait: 5, wins: 1 }),
    ];
    const forward = rankEntrants(pool, SEED);
    const backward = rankEntrants([...pool].reverse(), SEED);
    const shuffled = rankEntrants(
      [pool[3], pool[0], pool[5], pool[2], pool[4], pool[1]].filter(
        (e): e is Entrant => e !== undefined,
      ),
      SEED,
    );

    expect(ids(backward)).toEqual(ids(forward));
    expect(ids(shuffled)).toEqual(ids(forward));
  });

  it("breaks exact ties with the seed, so different seeds can produce different orders", () => {
    const twins = [entrant("x", { losses: 2 }), entrant("y", { losses: 2 })];
    const orders = new Set<string>();
    for (let i = 0; i < 64; i++) {
      orders.add(ids(rankEntrants(twins, `seed-${i}`)).join(","));
    }
    expect(orders.size).toBe(2);
  });

  it("is deterministic for the same seed", () => {
    const twins = [entrant("x", { losses: 2 }), entrant("y", { losses: 2 })];
    expect(ids(rankEntrants(twins, SEED))).toEqual(ids(rankEntrants(twins, SEED)));
  });
});

describe("executeDraw", () => {
  it("gives everyone a spot when spots are not scarce, including last quarter's winner", () => {
    const pool = [entrant("won", { wait: 1, wins: 1 }), entrant("a"), entrant("b")];

    const result = executeDraw({ cycleId: "c", entrants: pool, spots: spots(3), seed: SEED });

    expect(result.allocations).toHaveLength(3);
    expect(new Set(result.allocations.map((a) => a.registrationId))).toEqual(new Set(ids(pool)));
  });

  it("allocates each spot and each registration at most once, with ranks 1..N", () => {
    const pool = Array.from({ length: 10 }, (_, i) => entrant(`e${i}`, { losses: i % 3 }));

    const result = executeDraw({ cycleId: "c", entrants: pool, spots: spots(4), seed: SEED });

    expect(result.allocations).toHaveLength(4);
    expect(new Set(result.allocations.map((a) => a.spotId)).size).toBe(4);
    expect(new Set(result.allocations.map((a) => a.registrationId)).size).toBe(4);
    expect(result.allocations.map((a) => a.rank)).toEqual([1, 2, 3, 4]);
    expect(result.allocations.map((a) => a.registrationId)).toEqual(ids(result.ranked).slice(0, 4));
  });

  it("returns no allocations and an empty ranking when nobody registered", () => {
    const result = executeDraw({ cycleId: "c", entrants: [], spots: spots(3), seed: SEED });

    expect(result.allocations).toEqual([]);
    expect(result.ranked).toEqual([]);
  });

  it("returns the full ranking but no allocations when there are no spots", () => {
    const pool = [entrant("a"), entrant("b")];

    const result = executeDraw({ cycleId: "c", entrants: pool, spots: [], seed: SEED });

    expect(result.allocations).toEqual([]);
    expect(result.ranked).toHaveLength(2);
  });

  it("returns the same allocations for the same input and seed", () => {
    const pool = Array.from({ length: 12 }, (_, i) => entrant(`e${i}`));
    const input = { cycleId: "c", entrants: pool, spots: spots(5), seed: SEED };

    expect(executeDraw(input).allocations).toEqual(executeDraw(input).allocations);
  });

  it("rejects an empty seed", () => {
    expect(() =>
      executeDraw({ cycleId: "c", entrants: [entrant("a")], spots: spots(1), seed: "" }),
    ).toThrow(DrawInputError);
  });

  it("rejects duplicate registrations and duplicate spots", () => {
    const dup = entrant("a");
    expect(() =>
      executeDraw({ cycleId: "c", entrants: [dup, { ...dup }], spots: spots(1), seed: SEED }),
    ).toThrow(/duplicate registrationId/);

    const spot = spots(1)[0];
    expect(() =>
      executeDraw({
        cycleId: "c",
        entrants: [entrant("a")],
        spots: spot ? [spot, { ...spot }] : [],
        seed: SEED,
      }),
    ).toThrow(/duplicate spot id/);
  });

  it("rejects a non-positive wait, since the cycle being drawn cannot already be won", () => {
    expect(() =>
      executeDraw({
        cycleId: "c",
        entrants: [entrant("a", { wait: 0, wins: 1 })],
        spots: spots(1),
        seed: SEED,
      }),
    ).toThrow(/cyclesSinceLastAllocation/);
  });
});
