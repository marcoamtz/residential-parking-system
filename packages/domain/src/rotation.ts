/**
 * Quarterly rotation policy (ADR-0012). Pure: decides what should happen for one building on a
 * given day; the caller executes the actions. All dates are ISO `YYYY-MM-DD` in UTC.
 */

export interface Period {
  startsOn: string;
  endsOn: string;
}

export interface CycleRef extends Period {
  id: string;
  sequence: number;
  status: "open" | "drawn";
}

export type RotationAction = { type: "draw"; cycleId: string } | { type: "open"; period: Period };

export interface RotationInput {
  today: string;
  /** The building's cycle currently accepting registrations, if any. */
  openCycle: CycleRef | null;
  /** The most recent drawn cycle, used to derive the next period when nothing is open. */
  latestDrawnCycle: CycleRef | null;
  /** Draw this many days before the cycle starts, so residents know their spot in advance. */
  drawLeadDays: number;
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Calendar-month arithmetic that clamps to the last day of the target month. */
export function addMonths(iso: string, months: number): string {
  const d = toDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toIso(d);
}

/** The quarter that starts the day after `period` ends: three calendar months, inclusive end. */
export function periodAfter(period: Period): Period {
  const startsOn = addDays(period.endsOn, 1);
  return { startsOn, endsOn: addDays(addMonths(startsOn, 3), -1) };
}

/**
 * Decide the day's actions for one building.
 *
 * - An open cycle is drawn once `today` is within `drawLeadDays` of its start, and the following
 *   quarter is opened in the same run so registration never has a gap.
 * - With no open cycle, the quarter after the latest drawn cycle is opened, skipping any quarters
 *   that have already ended so the system catches up after downtime instead of replaying history.
 * - With no cycles at all, nothing happens: the first cycle is an administrator's decision.
 *
 * Running this twice on the same day is safe: the second run sees a drawn cycle and an open one
 * whose start is still far away, and returns no actions.
 */
export function planRotation(input: RotationInput): RotationAction[] {
  const { today, openCycle, latestDrawnCycle, drawLeadDays } = input;

  if (openCycle) {
    const drawOn = addDays(openCycle.startsOn, -drawLeadDays);
    if (today < drawOn) return [];
    return [
      { type: "draw", cycleId: openCycle.id },
      { type: "open", period: periodAfter(openCycle) },
    ];
  }

  if (latestDrawnCycle) {
    let period = periodAfter(latestDrawnCycle);
    while (period.endsOn < today) {
      period = periodAfter(period);
    }
    return [{ type: "open", period }];
  }

  return [];
}
