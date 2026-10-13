import { beforeEach, describe, expect, it } from "vitest";
import {
  assertSurveyRoundSaveResult,
  createSurveyRoundReceipt,
  readSurveyRoundReceipt,
  surveyRoundMatchesSelection,
  surveyRoundReceiptKey,
  type SurveyRoundRequestScope,
} from "../survey-round-request";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";
import { surveyRoundVersionFromRow } from "@/services/baseline/survey-round-persistence";

let fixture: Awaited<ReturnType<typeof makeRoundFixture>>;
let scope: SurveyRoundRequestScope;
beforeEach(async () => {
  fixture = await makeRoundFixture();
  scope = {
    actorId: fixture.row.created_by,
    projectId: fixture.baseline.projectId,
    baselineId: fixture.baseline.id,
    baselineSha256: fixture.baseline.manifestSha256,
    planId: fixture.plan.id,
    planSha256: fixture.plan.manifestSha256,
    availableQuestionIds: fixture.plan.manifest.questions.map((question) => question.id),
  };
});

describe("exact survey round retry receipt", () => {
  it("restores the exact request ID and input after reload without changing the source draft", () => {
    const draft = structuredClone(fixture.input);
    const receipt = createSurveyRoundReceipt(scope, draft, fixture.input.requestId);
    const frozen = JSON.stringify(receipt);
    draft.title = "Another title";
    draft.recordingWindow.dateTo = "2026-12-01";
    draft.questionIds.length = 0;
    expect(readSurveyRoundReceipt(frozen, scope)).toEqual(receipt);
    expect(receipt.input.title).toBe(fixture.input.title);
    expect(receipt.input.recordingWindow).toEqual(fixture.input.recordingWindow);
    expect(receipt.input.questionIds).toEqual(fixture.input.questionIds);
    expect(receipt.input.requestId).toBe(fixture.input.requestId);
    expect(receipt.input).not.toHaveProperty("actorId");
    expect(receipt.input).not.toHaveProperty("status");
    expect(receipt.input).not.toHaveProperty("photos");
  });
  it.each(["actorId", "projectId", "baselineId", "planId"] as const)(
    "uses a different durable key for a different %s",
    (field) => {
      const other = { ...scope, [field]: "94000000-0000-4000-8000-000000000001" };
      expect(surveyRoundReceiptKey(other)).not.toBe(surveyRoundReceiptKey(scope));
    },
  );
  it.each([
    "actorId",
    "projectId",
    "baselineId",
    "baselineSha256",
    "planId",
    "planSha256",
  ] as const)("fails visibly when the saved receipt has a different %s scope", (field) => {
    const receipt = createSurveyRoundReceipt(scope, fixture.input, fixture.input.requestId);
    const other = {
      ...scope,
      [field]: field.endsWith("Sha256") ? "f".repeat(64) : "94000000-0000-4000-8000-000000000001",
    };
    expect(() => readSurveyRoundReceipt(JSON.stringify(receipt), other)).toThrow();
  });
  it("does not silently discard a corrupt or oversized receipt", () => {
    expect(readSurveyRoundReceipt(null, scope)).toBeNull();
    expect(() => readSurveyRoundReceipt("not JSON", scope)).toThrow();
    expect(() => readSurveyRoundReceipt("x".repeat(65_537), scope)).toThrow();
    const receipt = createSurveyRoundReceipt(scope, fixture.input, fixture.input.requestId);
    Object.assign(receipt.input, { professionalApproved: true });
    expect(() => readSurveyRoundReceipt(JSON.stringify(receipt), scope)).toThrow();
  });
  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026-10-15", "2026-10-14"],
    ["2026-10-13T12:00:00Z", "2026-10-14"],
  ])("rejects invalid or reversed calendar window %s–%s", (dateFrom, dateTo) => {
    expect(() =>
      createSurveyRoundReceipt(
        scope,
        { ...fixture.input, recordingWindow: { dateFrom, dateTo } },
        fixture.input.requestId,
      ),
    ).toThrow();
  });
  it("retains valid calendar dates across the Copenhagen daylight-saving change without UTC conversion", () => {
    const receipt = createSurveyRoundReceipt(
      scope,
      { ...fixture.input, recordingWindow: { dateFrom: "2026-10-24", dateTo: "2026-10-26" } },
      fixture.input.requestId,
    );
    expect(receipt.input.recordingWindow).toEqual({ dateFrom: "2026-10-24", dateTo: "2026-10-26" });
  });
  it.each(
    [[], ["not-a-real-plan-question"], [...Array(2)].map(() => "same-question")].map(
      (questionIds) => ({ questionIds }),
    ),
  )("rejects an empty, unavailable or repeated question selection", ({ questionIds }) => {
    expect(() =>
      createSurveyRoundReceipt(scope, { ...fixture.input, questionIds }, fixture.input.requestId),
    ).toThrow();
  });
  it("checks the actual saved response against the exact input and caller", async () => {
    const receipt = createSurveyRoundReceipt(scope, fixture.input, fixture.input.requestId);
    const version = await surveyRoundVersionFromRow(fixture.row, fixture.baseline, fixture.planRow);
    expect(() => assertSurveyRoundSaveResult(version, receipt)).not.toThrow();
    expect(surveyRoundMatchesSelection(version, scope)).toBe(true);
    for (const change of [
      { requestId: "94000000-0000-4000-8000-000000000001" },
      { createdBy: "94000000-0000-4000-8000-000000000001" },
      { baselineSha256: "f".repeat(64) },
      { planSha256: "f".repeat(64) },
    ])
      expect(() => assertSurveyRoundSaveResult({ ...version, ...change }, receipt)).toThrow();
    const accepted = structuredClone(version);
    Object.assign(accepted.manifest.acceptance, { reportAccepted: true });
    expect(() => assertSurveyRoundSaveResult(accepted, receipt)).toThrow();
  });
});
