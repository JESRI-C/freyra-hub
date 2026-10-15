import { describe, expect, it } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { buildDroneImageInspectionDraft } from "../drone-image-inspection";
import {
  DRONE_IMAGE_INSPECTION_SELECT,
  droneImageInspectionCanonicalText,
  droneImageInspectionClaimFromRow,
  droneImageInspectionFromRow,
  droneImageInspectionAnswersCanonicalText,
  droneImageInspectionAnswersFromRow,
  SaveDroneImageInspectionAnswersInputSchema,
} from "../drone-image-inspection-persistence";

const project = "b8200000-0000-4000-8000-000000000001";
const media = "b8300000-0000-4000-8000-000000000001";
const actor = "b8100000-0000-4000-8000-000000000001";
const request = "b8400000-0000-4000-8000-000000000001";
const at = "2026-10-15T08:00:00Z";
function pendingRow() {
  return {
    id: "b8500000-0000-4000-8000-000000000001",
    project_id: project,
    media_id: media,
    created_by: actor,
    request_id: request,
    provider: "cloudflare-workers-ai",
    model_id: "@cf/qwen/qwen3.8-27b",
    prompt_version: "danish-stream-visual-draft/v1",
    method_version: "visual-photo-followups/v1",
    original_sha256: "a".repeat(64),
    original_validation_sha256: "b".repeat(64),
    storage_object_id: "b8600000-0000-4000-8000-000000000001",
    storage_object_version: null,
    storage_object_updated_at: at,
    source_snapshot_id: null,
    source_snapshot_sha256: null,
    status: "pending",
    attempt_count: 1,
    lease_expires_at: "2026-10-15T08:03:00Z",
    result: null,
    result_text: null,
    result_sha256: null,
    failure_code: null,
    created_at: at,
    updated_at: at,
    completed_at: null,
  };
}
async function completedRow(modelId = "@cf/qwen/qwen3.8-27b") {
  const row = pendingRow();
  row.model_id = modelId;
  const result = buildDroneImageInspectionDraft({
    visual: {
      quality: {
        assessment: "limited",
        issues: ["shadow"],
        limitation: "Skygge skjuler dele af billedet.",
      },
      watercourseVisibility: "uncertain",
      features: [],
      overallUncertainty: "Sted og synlighed kræver kontrol.",
    },
    provenance: {
      projectId: project,
      mediaId: media,
      requestId: request,
      originalSha256: row.original_sha256,
      originalValidationSha256: row.original_validation_sha256,
      derivative: {
        sha256: "c".repeat(64),
        mimeType: "image/jpeg",
        widthPx: 1280,
        heightPx: 720,
        transformVersion: "test/v1",
      },
      provider: row.provider,
      model: row.model_id,
      promptVersion: "danish-stream-visual-draft/v1",
      generatedAt: at,
    },
  });
  return {
    ...row,
    status: "completed",
    result,
    result_text: droneImageInspectionCanonicalText(result),
    result_sha256: await baselineSha256(result),
    lease_expires_at: null,
    completed_at: at,
  };
}

describe("image inspection immutable replay", () => {
  it.each(["@cf/qwen/qwen3.8-27b", "@cf/google/gemma-4-26b-a4b-it"])(
    "replays the exact saved supported model without relabeling provenance: %s",
    async (modelId) => {
      const raw = await completedRow(modelId);
      await expect(droneImageInspectionFromRow(raw, project, media)).resolves.toMatchObject({
        modelId,
        result: { provenance: { model: modelId } },
      });
      const other =
        modelId === "@cf/qwen/qwen3.8-27b"
          ? "@cf/google/gemma-4-26b-a4b-it"
          : "@cf/qwen/qwen3.8-27b";
      await expect(
        droneImageInspectionFromRow({ ...raw, model_id: other }, project),
      ).rejects.toThrow();
    },
  );
  it("rejects an unsupported model before treating a pending row as an allowed reservation", async () => {
    await expect(
      droneImageInspectionFromRow({ ...pendingRow(), model_id: "@cf/unapproved/model" }, project),
    ).rejects.toThrow();
  });
  it("returns a bounded public record without claim ownership or duplicate result text", async () => {
    const raw = await completedRow();
    const record = await droneImageInspectionFromRow(raw, project, media);
    expect(record.status).toBe("completed");
    expect(record.result?.reportEligible).toBe(false);
    expect(record.requestId).toBe(request);
    expect(record).not.toHaveProperty("result_text");
    expect(DRONE_IMAGE_INSPECTION_SELECT.split(",")).not.toContain("lease_token");
    expect(DRONE_IMAGE_INSPECTION_SELECT.split(",")).not.toContain("lease_actor_id");
  });
  it("rejects a same-valid draft whose exact text or hash was replaced", async () => {
    const raw = await completedRow();
    await expect(
      droneImageInspectionFromRow({ ...raw, result_text: JSON.stringify(raw.result) }, project),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionFromRow({ ...raw, result_sha256: "d".repeat(64) }, project),
    ).rejects.toThrow();
  });
  it("rejects cross-project, cross-media and mismatched historical request pins", async () => {
    const raw = await completedRow();
    await expect(
      droneImageInspectionFromRow(raw, "b8200000-0000-4000-8000-000000000002"),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionFromRow(raw, project, "b8300000-0000-4000-8000-000000000002"),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionFromRow(
        { ...raw, request_id: "b8400000-0000-4000-8000-000000000002" },
        project,
      ),
    ).rejects.toThrow();
  });
  it("rejects an otherwise valid draft carrying a source snapshot not pinned by claim", async () => {
    const raw = await completedRow();
    await expect(
      droneImageInspectionFromRow(
        {
          ...raw,
          source_snapshot_id: "b8700000-0000-4000-8000-000000000001",
          source_snapshot_sha256: "e".repeat(64),
        },
        project,
      ),
    ).rejects.toThrow();
  });
  it("does not expose results on pending or failed state", async () => {
    const raw = await completedRow();
    await expect(
      droneImageInspectionFromRow({ ...raw, status: "pending" }, project),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionFromRow(
        {
          ...pendingRow(),
          status: "failed",
          lease_expires_at: null,
          failure_code: "provider_error",
        },
        project,
      ),
    ).resolves.toMatchObject({ status: "failed", result: null });
    await expect(
      droneImageInspectionFromRow({ ...pendingRow(), attempt_count: 4 }, project),
    ).rejects.toThrow();
  });
  it("requires a token only for a claimed pending record", async () => {
    const pending = pendingRow(),
      token = "b8800000-0000-4000-8000-000000000001";
    await expect(
      droneImageInspectionClaimFromRow(
        { state: "claimed", inspection: pending, claimToken: token },
        project,
        media,
      ),
    ).resolves.toMatchObject({ state: "claimed", claimToken: token });
    await expect(
      droneImageInspectionClaimFromRow(
        { state: "claimed", inspection: pending, claimToken: null },
        project,
        media,
      ),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionClaimFromRow(
        { state: "busy", inspection: pending, claimToken: token },
        project,
        media,
      ),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionClaimFromRow(
        { state: "completed", inspection: pending, claimToken: null },
        project,
        media,
      ),
    ).rejects.toThrow();
  });
  it("rejects unknown columns including accidentally leaked ownership tokens", async () => {
    await expect(
      droneImageInspectionFromRow(
        { ...pendingRow(), lease_token: "b8800000-0000-4000-8000-000000000001" },
        project,
      ),
    ).rejects.toThrow();
  });
  it("keeps manual answers durable as an exact unreviewed version", async () => {
    const inspection = await droneImageInspectionFromRow(await completedRow(), project);
    const answers = [
      {
        questionId: "photo-followup:v1:geographic_link",
        assessment: "uncertain",
        note: "Stedet kræver afklaring.\nDer mangler genkendelige punkter.",
        followup: "Supplér med feltdata.",
      },
    ];
    const raw = {
      id: "b8900000-0000-4000-8000-000000000001",
      project_id: project,
      inspection_id: inspection.id,
      inspection_result_sha256: inspection.resultSha256,
      created_by: actor,
      request_id: request,
      answers,
      answers_text: droneImageInspectionAnswersCanonicalText(answers),
      answers_sha256: await baselineSha256(answers),
      status: "draft_unreviewed",
      professionally_reviewed: false,
      report_eligible: false,
      created_at: at,
    };
    await expect(
      droneImageInspectionAnswersFromRow(raw, project, inspection),
    ).resolves.toMatchObject({ answers, reportEligible: false, professionallyReviewed: false });
    await expect(
      droneImageInspectionAnswersFromRow(
        { ...raw, inspection_result_sha256: "d".repeat(64) },
        project,
        inspection,
      ),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionAnswersFromRow(
        { ...raw, answers_sha256: "e".repeat(64) },
        project,
        inspection,
      ),
    ).rejects.toThrow();
    await expect(
      droneImageInspectionAnswersFromRow(
        { ...raw, professionally_reviewed: true },
        project,
        inspection,
      ),
    ).rejects.toThrow();
    const invented = [{ ...answers[0], questionId: "photo-followup:v1:invented" }];
    await expect(
      droneImageInspectionAnswersFromRow(
        {
          ...raw,
          answers: invented,
          answers_text: droneImageInspectionAnswersCanonicalText(invented),
          answers_sha256: await baselineSha256(invented),
        },
        project,
        inspection,
      ),
    ).rejects.toThrow();
  });
  it("normalizes optional followup but rejects duplicate questions, empty notes and approval choices", () => {
    const value = {
      projectId: project,
      inspectionId: "b8500000-0000-4000-8000-000000000001",
      inspectionResultSha256: "a".repeat(64),
      requestId: request,
      answers: [
        {
          questionId: "photo-followup:v1:geographic_link",
          assessment: "uncertain",
          note: "Afklares senere.",
        },
      ],
    };
    expect(SaveDroneImageInspectionAnswersInputSchema.parse(value).answers[0].followup).toBe("");
    expect(
      SaveDroneImageInspectionAnswersInputSchema.safeParse({
        ...value,
        answers: [...value.answers, ...value.answers],
      }).success,
    ).toBe(false);
    expect(
      SaveDroneImageInspectionAnswersInputSchema.safeParse({
        ...value,
        answers: [{ ...value.answers[0], note: " " }],
      }).success,
    ).toBe(false);
    expect(
      SaveDroneImageInspectionAnswersInputSchema.safeParse({
        ...value,
        answers: [{ ...value.answers[0], assessment: "approved" }],
      }).success,
    ).toBe(false);
  });
});
