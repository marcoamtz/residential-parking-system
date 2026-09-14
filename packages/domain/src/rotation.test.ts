import { describe, expect, it } from "vitest";
import {
  addMonths,
  type CycleRef,
  nextOpenablePeriod,
  periodAfter,
  planRotation,
} from "./rotation";

const cycle = (partial: Partial<CycleRef> & Pick<CycleRef, "startsOn" | "endsOn">): CycleRef => ({
  id: "c",
  sequence: 1,
  status: "open",
  ...partial,
});

describe("periodAfter", () => {
  it("follows a calendar quarter with the next calendar quarter", () => {
    expect(periodAfter({ startsOn: "2026-10-01", endsOn: "2026-12-31" })).toEqual({
      startsOn: "2027-01-01",
      endsOn: "2027-03-31",
    });
    expect(periodAfter({ startsOn: "2026-01-01", endsOn: "2026-03-31" })).toEqual({
      startsOn: "2026-04-01",
      endsOn: "2026-06-30",
    });
  });

  it("starts the day after the previous period ends, whatever its alignment", () => {
    expect(periodAfter({ startsOn: "2026-02-15", endsOn: "2026-05-14" })).toEqual({
      startsOn: "2026-05-15",
      endsOn: "2026-08-14",
    });
  });

  it("clamps month arithmetic to the last day of the month", () => {
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2024-11-30", 3)).toBe("2025-02-28");
    expect(addMonths("2023-11-29", 3)).toBe("2024-02-29");
  });
});

describe("planRotation", () => {
  const open = cycle({ id: "open", sequence: 3, startsOn: "2026-10-01", endsOn: "2026-12-31" });

  it("does nothing while the open cycle's start is further away than the lead time", () => {
    expect(
      planRotation({
        today: "2026-09-13",
        openCycle: open,
        latestDrawnCycle: null,
        drawLeadDays: 7,
      }),
    ).toEqual([]);
  });

  it("draws the open cycle and opens the next quarter once inside the lead window", () => {
    const actions = planRotation({
      today: "2026-09-24",
      openCycle: open,
      latestDrawnCycle: null,
      drawLeadDays: 7,
    });
    expect(actions).toEqual([
      { type: "draw", cycleId: "open" },
      { type: "open", period: { startsOn: "2027-01-01", endsOn: "2027-03-31" } },
    ]);
  });

  it("treats the lead-day boundary as inclusive", () => {
    const onBoundary = planRotation({
      today: "2026-09-24",
      openCycle: open,
      latestDrawnCycle: null,
      drawLeadDays: 7,
    });
    const dayBefore = planRotation({
      today: "2026-09-23",
      openCycle: open,
      latestDrawnCycle: null,
      drawLeadDays: 7,
    });
    expect(onBoundary).toHaveLength(2);
    expect(dayBefore).toHaveLength(0);
  });

  it("opens the quarter after the latest drawn cycle when nothing is open", () => {
    const drawn = cycle({
      id: "d",
      sequence: 3,
      status: "drawn",
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
    });
    expect(
      planRotation({
        today: "2026-11-02",
        openCycle: null,
        latestDrawnCycle: drawn,
        drawLeadDays: 7,
      }),
    ).toEqual([{ type: "open", period: { startsOn: "2027-01-01", endsOn: "2027-03-31" } }]);
  });

  it("catches up after downtime by opening the first quarter that still has a registration window", () => {
    const stale = cycle({
      id: "d",
      sequence: 1,
      status: "drawn",
      startsOn: "2025-10-01",
      endsOn: "2025-12-31",
    });
    // 2026-09-13: Q3 2026 is in progress and Q4's draw day (2026-09-24) is still ahead.
    expect(
      planRotation({
        today: "2026-09-13",
        openCycle: null,
        latestDrawnCycle: stale,
        drawLeadDays: 7,
      }),
    ).toEqual([{ type: "open", period: { startsOn: "2026-10-01", endsOn: "2026-12-31" } }]);
    // 2026-09-25: Q4's draw day has passed, so Q1 2027 is the first openable quarter.
    expect(
      planRotation({
        today: "2026-09-25",
        openCycle: null,
        latestDrawnCycle: stale,
        drawLeadDays: 7,
      }),
    ).toEqual([{ type: "open", period: { startsOn: "2027-01-01", endsOn: "2027-03-31" } }]);
  });

  it("draws an overdue open cycle once and is a no-op on the same day afterwards", () => {
    const overdue = cycle({ id: "o", sequence: 2, startsOn: "2025-01-01", endsOn: "2025-03-31" });
    const first = planRotation({
      today: "2026-09-13",
      openCycle: overdue,
      latestDrawnCycle: null,
      drawLeadDays: 7,
    });
    expect(first).toEqual([
      { type: "draw", cycleId: "o" },
      { type: "open", period: { startsOn: "2026-10-01", endsOn: "2026-12-31" } },
    ]);

    // The cycle the first run opened is now the open cycle; its draw day is still ahead.
    const opened = cycle({ id: "n", sequence: 3, startsOn: "2026-10-01", endsOn: "2026-12-31" });
    expect(
      planRotation({
        today: "2026-09-13",
        openCycle: opened,
        latestDrawnCycle: { ...overdue, status: "drawn" },
        drawLeadDays: 7,
      }),
    ).toEqual([]);
  });

  it("never opens a quarter whose draw day is today or earlier", () => {
    const previous = { startsOn: "2026-07-01", endsOn: "2026-09-30" };
    expect(nextOpenablePeriod(previous, "2026-09-23", 7)).toEqual({
      startsOn: "2026-10-01",
      endsOn: "2026-12-31",
    });
    expect(nextOpenablePeriod(previous, "2026-09-24", 7)).toEqual({
      startsOn: "2027-01-01",
      endsOn: "2027-03-31",
    });
  });

  it("does nothing for a building with no cycles", () => {
    expect(
      planRotation({
        today: "2026-09-13",
        openCycle: null,
        latestDrawnCycle: null,
        drawLeadDays: 7,
      }),
    ).toEqual([]);
  });
});
