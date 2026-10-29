import { describe, expect, it } from "vitest";
import {
  emptyWorkOrderPlan,
  emptyWorkOrderWatercourse,
  WorkOrderPlanSchema,
  SaveWorkOrderPlanSchema,
  parseWorkOrderMetres,
  workOrderPlanGaps,
} from "../work-order-plan";
describe("versioned work-order plan", () => {
  it("preserves unknown dates, method and responsibility instead of assigning today or a performer", () => {
    const plan = WorkOrderPlanSchema.parse(emptyWorkOrderPlan("Synthetic task"));
    expect(plan).toMatchObject({
      plannedStart: null,
      plannedEnd: null,
      plannedMethod: null,
      responsibleId: null,
      profile: null,
      watercourse: null,
    });
    expect(workOrderPlanGaps(plan)).toHaveLength(6);
  });
  it.each([
    ["", null],
    ["0", 0],
    ["0,8", 0.8],
    ["130.25", 130.25],
    [" 12,5 ", 12.5],
  ])("parses explicit metre input %s", (raw, expected) =>
    expect(parseWorkOrderMetres(String(raw))).toBe(expected),
  );
  it.each(["12m", "-1", "1,2.3", "Infinity", "1 000", "1000000001"])(
    "rejects ambiguous or unsupported metre input %s",
    (raw) => expect(() => parseWorkOrderMetres(raw)).toThrow(),
  );
  it("keeps measured zero but requires its source", () => {
    const plan = {
      ...emptyWorkOrderPlan("Synthetic zero"),
      profile: "watercourse",
      watercourse: { ...emptyWorkOrderWatercourse(), bottomWidthM: 0 },
    };
    expect(WorkOrderPlanSchema.safeParse(plan).success).toBe(false);
    expect(
      WorkOrderPlanSchema.parse({
        ...plan,
        watercourse: { ...plan.watercourse, measurementSource: "Synthetic field measurement" },
      }).watercourse?.bottomWidthM,
    ).toBe(0);
  });
  it("requires explicit direction for reversed stationing without deriving a length", () => {
    const watercourse = {
      ...emptyWorkOrderWatercourse(),
      stationFromM: 130,
      stationToM: 0,
      measurementSource: "Synthetic regulation",
    };
    const plan = {
      ...emptyWorkOrderPlan("Synthetic stationing"),
      profile: "watercourse",
      watercourse,
    };
    expect(WorkOrderPlanSchema.safeParse(plan).success).toBe(false);
    expect(
      WorkOrderPlanSchema.parse({
        ...plan,
        watercourse: { ...watercourse, stationDirection: "upstream" },
      }).watercourse?.lengthM,
    ).toBeNull();
  });
  it("rejects invalid calendar days, reversed windows and actual fields in the plan", () => {
    const plan = emptyWorkOrderPlan("Synthetic dates");
    for (const change of [
      { plannedStart: "2026-02-30" },
      { plannedEnd: "2026-10-10" },
      { plannedStart: "2026-10-11", plannedEnd: "2026-10-10" },
      { actualDate: "2026-10-15" },
    ])
      expect(WorkOrderPlanSchema.safeParse({ ...plan, ...change }).success).toBe(false);
  });
  it("does not silently retain another profile's watercourse details", () => {
    expect(
      WorkOrderPlanSchema.safeParse({
        ...emptyWorkOrderPlan("Other profile"),
        profile: "nature",
        watercourse: emptyWorkOrderWatercourse(),
      }).success,
    ).toBe(false);
  });
  it("requires a correction reason and immutable retry identifiers for revisions", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const input = {
      actionId: id,
      organizationId: id,
      projectId: id,
      expectedActorId: id,
      expectedVersion: 1,
      requestId: id,
      plan: emptyWorkOrderPlan("Synthetic revision"),
      correctionReason: "",
    };
    expect(SaveWorkOrderPlanSchema.safeParse(input).success).toBe(false);
    expect(
      SaveWorkOrderPlanSchema.safeParse({ ...input, correctionReason: "Updated instructions" })
        .success,
    ).toBe(true);
  });
});
