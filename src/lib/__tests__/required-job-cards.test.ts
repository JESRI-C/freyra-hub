import { describe, expect, it } from "vitest";
import { WorkOrderPlanSchema } from "../work-order-plan";
import { SubmissionSnapshotSchema } from "../work-order-submission";
import { id, submission } from "@/services/__tests__/work-order-submission-fixture";

const card = () => ({
  templateVersionId: id(901),
  templateId: id(902),
  version: 1,
  definition: submission().snapshot.evidence[0].observation_snapshot.template,
});
describe("explicit versioned documentation requirements", () => {
  it("preserves legacy plans and submissions without inventing requirements", () => {
    expect(
      WorkOrderPlanSchema.parse(submission().snapshot.plan.plan).requiredJobCards,
    ).toBeUndefined();
    expect(SubmissionSnapshotSchema.parse(submission().snapshot).ruleSet).toBe(
      "freyra.submission-core/v1",
    );
  });
  it("requires the selected template identity and definition, including zero and false answers", () => {
    const snapshot = submission().snapshot;
    snapshot.ruleSet = "freyra.submission-requirements/v1";
    snapshot.plan.plan.requiredJobCards = [card()];
    expect(SubmissionSnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.evidence[0].observation_snapshot.templateVersionId = id(901);
    const frozen = SubmissionSnapshotSchema.parse(snapshot);
    expect(frozen.evidence[0].observation_snapshot.values).toMatchObject({
      count: 0,
      checked: false,
    });
    snapshot.plan.plan.requiredJobCards[0].definition.title = "Changed requirement";
    expect(SubmissionSnapshotSchema.safeParse(snapshot).success).toBe(false);
    expect(frozen.plan.plan.requiredJobCards![0].definition.title).not.toBe("Changed requirement");
  });
  it("rejects duplicate stable templates and a requirements contract marked as legacy", () => {
    const snapshot = submission().snapshot;
    snapshot.plan.plan.requiredJobCards = [
      card(),
      { ...card(), templateVersionId: id(903), version: 2 },
    ];
    expect(WorkOrderPlanSchema.safeParse(snapshot.plan.plan).success).toBe(false);
    snapshot.plan.plan.requiredJobCards = [card()];
    snapshot.evidence[0].observation_snapshot.templateVersionId = id(901);
    expect(SubmissionSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
