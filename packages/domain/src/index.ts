/**
 * Pure allocation domain. No I/O, no framework imports.
 * See docs/adr/0003-fairness-ranking-rule.md for the rule and its rationale.
 */
export {
  createEntrantComparator,
  DrawInputError,
  executeDraw,
  rankEntrants,
  tieBreakValue,
} from "./draw";
export type { Allocation, CycleStatus, DrawInput, DrawResult, Entrant, Spot } from "./types";
