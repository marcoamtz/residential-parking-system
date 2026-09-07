/**
 * Pure allocation domain. No I/O, no framework imports.
 *
 * The draw ranks entrants for a cycle and assigns spots to the top N.
 * See docs/adr/0003-fairness-ranking-rule.md for the rule and its rationale.
 */

export type CycleStatus = "open" | "drawn";

export interface Spot {
  id: string;
  label: string;
}

/** One registered resident with the history the ranking rule needs. */
export interface Entrant {
  registrationId: string;
  residentId: string;
  /** Distance in cycles from the entrant's most recent allocation. `null` when never allocated. */
  cyclesSinceLastAllocation: number | null;
  lifetimeAllocations: number;
  /** Past registrations in drawn cycles that did not result in an allocation. */
  lifetimeUnsuccessfulRegistrations: number;
}

export interface Allocation {
  registrationId: string;
  spotId: string;
  /** 1-based position in the ranked entrant list. Recorded for transparency. */
  rank: number;
}

export interface DrawInput {
  cycleId: string;
  entrants: Entrant[];
  spots: Spot[];
  /** Hex-encoded cryptographically random seed generated at draw time and stored with the cycle. */
  seed: string;
}

export interface DrawResult {
  cycleId: string;
  seed: string;
  ranked: Entrant[];
  allocations: Allocation[];
}
