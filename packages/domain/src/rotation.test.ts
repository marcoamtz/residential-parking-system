import { describe, expect, it } from "vitest";
import { addMonths, type CycleRef, periodAfter, planRotation } from "./rotation";

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

  it("skips quarters that already ended so it catches up instead of replaying history", () => {
    const stale = cycle({
      id: "d",
      sequence: 1,
      status: "drawn",
      startsOn: "2025-10-01",
      endsOn: "2025-12-31",
    });
    expect(
      planRotation({
        today: "2026-09-13",
        openCycle: null,
        latestDrawnCycle: stale,
        drawLeadDays: 7,
      }),
    ).toEqual([{ type: "open", period: { startsOn: "2026-07-01", endsOn: "2026-09-30" } }]);
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
