import { describe, expect, it } from "vitest";
import { emptyExecution } from "../action-execution";
import {
  executionFollowupCandidates,
  followupEntryId,
  WorkflowFollowupSchema,
} from "../workflow-followup";
const id = "00000000-0000-4000-8000-000000000001";
describe("internal followup events", () => {
  it("uses a stable scoped identity, and changes identity when the underlying event changes", async () => {
    expect(await followupEntryId("org", "a", "event1")).toBe(
      await followupEntryId("org", "a", "event1"),
    );
    expect(await followupEntryId("org", "a", "event1")).not.toBe(
      await followupEntryId("org", "b", "event1"),
    );
    expect(await followupEntryId("org", "a", "event1")).not.toBe(
      await followupEntryId("org", "a", "event2"),
    );
  });
  it("does not claim an after-series is due from planned work", () => {
    const planned = [{ entry: { id }, execution: emptyExecution(id) }] as never;
    expect(
      executionFollowupCandidates(planned, new Set()).some((c) =>
        c.eventKey.startsWith("after-series"),
      ),
    ).toBe(false);
  });
  it("creates a concrete missing-after-series task after recorded execution", () => {
    const performed = [
      { entry: { id }, execution: { ...emptyExecution(id), stage: "performed" } },
    ] as never;
    expect(
      executionFollowupCandidates(performed, new Set()).some((c) =>
        c.eventKey.startsWith("after-series"),
      ),
    ).toBe(true);
    expect(
      executionFollowupCandidates(performed, new Set([id])).some((c) =>
        c.eventKey.startsWith("after-series"),
      ),
    ).toBe(false);
  });
  it("requires responsibility for assignment and a reason for dismissal or completion", () => {
    const base = {
      schema: "freyra.workflow-followup/v1",
      eventKey: "test",
      title: "SYNTHETIC",
      reason: "SYNTHETIC source",
      sourceIds: [id],
      status: "proposed",
      assignee: null,
      dueDate: null,
      notes: "",
      resolutionReason: "",
    };
    expect(() => WorkflowFollowupSchema.parse(base)).not.toThrow();
    for (const status of ["assigned", "dismissed", "completed"])
      expect(() => WorkflowFollowupSchema.parse({ ...base, status })).toThrow();
  });
});
