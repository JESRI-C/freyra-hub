import { describe, expect, it } from "vitest";
import {
  calendarDay,
  currentPlanningDay,
  hasPlanningPeriod,
  plannedOnDay,
  planningWeek,
  shiftPlanningDay,
} from "../manager-work-order-planning";

describe("manager work-order planning dates", () => {
  it("keeps a Monday week across a year boundary", () => {
    expect(planningWeek("2027-01-03")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
  it("moves by calendar days across daylight-saving changes", () => {
    expect(shiftPlanningDay("2026-03-28", 2)).toBe("2026-03-30");
    expect(planningWeek("2026-10-25")?.[6]).toBe("2026-10-25");
  });
  it("rejects impossible dates and incomplete input without normalizing it", () => {
    expect(calendarDay("2026-02-30")).toBe(false);
    expect(calendarDay("2028-02-29")).toBe(true);
    expect(planningWeek("")).toBeNull();
    expect(shiftPlanningDay("2026-02-30", 7)).toBeNull();
    expect(shiftPlanningDay("2026-11-23", 0.5)).toBeNull();
  });
  it("uses the Danish date for the initial week near midnight", () => {
    expect(currentPlanningDay(new Date("2026-11-22T23:30:00Z"))).toBe("2026-11-23");
    expect(currentPlanningDay(new Date("2026-06-01T22:30:00Z"))).toBe("2026-06-02");
  });
  it("includes both boundaries of a multi-day job, including jobs starting before the week", () => {
    const job = { planned_start: "2026-11-20", planned_end: "2026-11-24" };
    expect(plannedOnDay(job, "2026-11-23")).toBe(true);
    expect(plannedOnDay(job, "2026-11-24")).toBe(true);
    expect(plannedOnDay(job, "2026-11-25")).toBe(false);
  });
  it("never turns a missing or invalid period into scheduled work", () => {
    for (const job of [
      { planned_start: null, planned_end: null },
      { planned_start: "2026-11-23", planned_end: null },
      { planned_start: null, planned_end: "2026-11-23" },
      { planned_start: "2026-11-25", planned_end: "2026-11-23" },
    ]) {
      expect(hasPlanningPeriod(job)).toBe(false);
      expect(plannedOnDay(job, "2026-11-23")).toBe(false);
    }
  });
});
