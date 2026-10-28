import { describe, expect, it } from "vitest";
import {
  ActionExecutionSchema,
  emptyExecution,
  executionGaps,
  executionRevisions,
  executionSource,
} from "../action-execution";
const id = "00000000-0000-4000-8000-000000000001";
const performed = () => ({
  ...emptyExecution(id),
  stage: "performed" as const,
  actualDate: "2026-08-30",
  reach: "SYNTHETIC reach",
  sourceReference: "SYNTHETIC log",
  dataBasis: "synthetic" as const,
});
describe("versioned action execution contract", () => {
  it("keeps planned work separate from actual dates", () => {
    expect(ActionExecutionSchema.parse(emptyExecution(id)).actualDate).toBeNull();
    expect(() =>
      ActionExecutionSchema.parse({ ...emptyExecution(id), actualDate: "2026-08-30" }),
    ).toThrow();
  });
  it("requires actual date, reach and source for performed work", () => {
    for (const [key, value] of [
      ["actualDate", null],
      ["reach", ""],
      ["sourceReference", ""],
    ])
      expect(() =>
        ActionExecutionSchema.parse({ ...performed(), [key as string]: value }),
      ).toThrow();
  });
  it("retains unknown method rather than inventing machine cutting", () => {
    const value = ActionExecutionSchema.parse(performed());
    expect(value.method).toBeNull();
    expect(executionGaps(value)).toContain("Skæremetode er uafklaret.");
  });
  it("rejects impossible dates, reversed periods and undocumented coverage", () => {
    expect(() =>
      ActionExecutionSchema.parse({ ...performed(), actualDate: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      ActionExecutionSchema.parse({ ...performed(), actualEndDate: "2026-08-29" }),
    ).toThrow();
    expect(() => ActionExecutionSchema.parse({ ...performed(), coverage: "documented" })).toThrow();
  });
  it("does not read a forged action identity as valid execution", () => {
    expect(() =>
      executionRevisions([
        {
          kind: "decision_note",
          payload: {
            source: executionSource("another-action"),
            decision: JSON.stringify(performed()),
          },
        } as never,
      ]),
    ).toThrow("stemmer ikke");
  });
});
