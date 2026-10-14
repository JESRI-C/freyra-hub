import { describe, expect, it } from "vitest";
import { makeMediaUiFixture, REQUEST_ID } from "./survey-round-media-ui.fixtures";
import {
  createSurveyRoundMediaReceipt,
  readSurveyRoundMediaReceipt,
  surveyRoundMediaReceiptKey,
  assertSurveyRoundMediaSaved,
  surveyRoundMediaMatchesRound,
} from "../survey-round-media-request";

describe("exact saved-round/original-photo request receipts", () => {
  it.each(["folder/photo.jpg", "folder\\photo.jpg", "bad\u0000.jpg", "bad\u0080.jpg"])(
    "rejects a path or control character in the local filename label %j",
    async (fileName) => {
      const f = await makeMediaUiFixture();
      expect(() =>
        createSurveyRoundMediaReceipt(
          { actorId: f.row.created_by, round: f.round },
          { ...f.candidate, fileName },
          f.input.questionIds,
          REQUEST_ID,
        ),
      ).toThrow();
    },
  );
  it("round-trips a caller-scoped immutable request and proves its saved pure-builder result", async () => {
    const fixture = await makeMediaUiFixture();
    const scope = { actorId: fixture.row.created_by, round: fixture.round };
    const receipt = createSurveyRoundMediaReceipt(
      scope,
      fixture.candidate,
      fixture.input.questionIds,
      REQUEST_ID,
    );
    expect(readSurveyRoundMediaReceipt(JSON.stringify(receipt), scope)).toEqual(receipt);
    expect(surveyRoundMediaReceiptKey(scope)).toContain(fixture.round.id);
    expect(() =>
      assertSurveyRoundMediaSaved(fixture.version, receipt, fixture.round),
    ).not.toThrow();
    expect(JSON.stringify(receipt)).not.toContain("signedUrl");
    expect(JSON.stringify(receipt)).not.toContain("storagePath");
  });
  it.each(["caller", "round", "baselineHash", "planHash", "roundHash", "question"])(
    "rejects a stored receipt after %s selection changes",
    async (change) => {
      const f = await makeMediaUiFixture();
      const scope = { actorId: f.row.created_by, round: structuredClone(f.round) };
      const receipt = createSurveyRoundMediaReceipt(
        scope,
        f.candidate,
        f.input.questionIds,
        REQUEST_ID,
      );
      if (change === "caller") scope.actorId = "a9000000-0000-4000-8000-000000000001";
      if (change === "round") scope.round.id = "a9000000-0000-4000-8000-000000000001";
      if (change === "baselineHash") scope.round.baselineSha256 = "a".repeat(64);
      if (change === "planHash") scope.round.planSha256 = "a".repeat(64);
      if (change === "roundHash") scope.round.manifestSha256 = "a".repeat(64);
      if (change === "question") scope.round.manifest.questionIds = [];
      expect(() => readSurveyRoundMediaReceipt(JSON.stringify(receipt), scope)).toThrow();
    },
  );
  it("rejects invalid, oversized or extra-field local receipts visibly", async () => {
    const f = await makeMediaUiFixture(),
      scope = { actorId: f.row.created_by, round: f.round };
    const receipt = createSurveyRoundMediaReceipt(
      scope,
      f.candidate,
      f.input.questionIds,
      REQUEST_ID,
    );
    expect(() => readSurveyRoundMediaReceipt("invalid", scope)).toThrow();
    expect(() => readSurveyRoundMediaReceipt(" ".repeat(32769), scope)).toThrow();
    expect(() =>
      readSurveyRoundMediaReceipt(JSON.stringify({ ...receipt, signedUrl: "synthetic" }), scope),
    ).toThrow();
    expect(() => createSurveyRoundMediaReceipt(scope, f.candidate, [], REQUEST_ID)).toThrow();
    expect(() =>
      createSurveyRoundMediaReceipt(scope, f.candidate, ["not-a-round-question"], REQUEST_ID),
    ).toThrow();
  });
  it.each(["request", "actor", "original", "validation", "question", "acceptance", "pins"])(
    "rejects mismatching saved %s",
    async (change) => {
      const f = await makeMediaUiFixture(),
        scope = { actorId: f.row.created_by, round: f.round };
      const receipt = createSurveyRoundMediaReceipt(
        scope,
        f.candidate,
        f.input.questionIds,
        REQUEST_ID,
      );
      const version = structuredClone(f.version);
      if (change === "request") version.requestId = "a9000000-0000-4000-8000-000000000001";
      if (change === "actor") version.createdBy = "a9000000-0000-4000-8000-000000000001";
      if (change === "original") version.manifest.originalSha256 = "a".repeat(64);
      if (change === "validation") version.manifest.originalValidationSha256 = "a".repeat(64);
      if (change === "question") version.manifest.questionIds = [];
      if (change === "acceptance")
        Object.assign(version.manifest.acceptance, { professionalApproved: true });
      if (change === "pins") version.manifest.roundSha256 = "a".repeat(64);
      expect(() => assertSurveyRoundMediaSaved(version, receipt, f.round)).toThrow();
    },
  );
  it("does not count an unrecognized saved binding as belonging to the round", async () => {
    const f = await makeMediaUiFixture();
    expect(surveyRoundMediaMatchesRound(f.version, f.round)).toBe(true);
    const other = structuredClone(f.round);
    other.manifestSha256 = "a".repeat(64);
    expect(surveyRoundMediaMatchesRound(f.version, other)).toBe(false);
  });
});
