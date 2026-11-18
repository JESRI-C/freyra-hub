import { describe, expect, it, vi } from "vitest";
import { makeRoundMediaFixture } from "@/services/baseline/__tests__/survey-round-media.fixtures";
import { ACTOR_ID, PROJECT_ID } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { surveyRoundMediaVersionFromRow } from "@/services/baseline/survey-round-media-persistence";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  buildPhotoPointReview,
  type PhotoPointReviewInput,
} from "@/services/monitoring/photo-point-review";
import {
  executeSavePhotoPointReview,
  executeListPhotoPointReviews,
  type PhotoPointReviewDependencies,
} from "../photo-point-review.functions";

const REQUEST = "fa100000-0000-4000-8000-000000000001";
const REVIEW = "fa200000-0000-4000-8000-000000000001";
async function setup() {
  const f = await makeRoundMediaFixture(true);
  const binding = await surveyRoundMediaVersionFromRow(
    f.bindingRow,
    f.round,
    f.media,
    f.validation,
  );
  const input: PhotoPointReviewInput = {
    projectId: PROJECT_ID,
    bindingId: binding.id,
    bindingSha256: binding.manifestSha256,
    requestId: REQUEST,
    expectedCallerUserId: ACTOR_ID,
    decision: "rejected",
    note: "Syntetisk test: ortofotopixels mangler, så et visuelt match kan ikke bekræftes.",
    reviewerName: "Syntetisk fagperson",
    inspectionId: null,
    inspectionSha256: null,
  };
  const review = buildPhotoPointReview(input, binding, null);
  const row = {
    id: REVIEW,
    project_id: PROJECT_ID,
    binding_id: binding.id,
    reviewed_by: ACTOR_ID,
    request_id: REQUEST,
    review,
    review_text: canonicalBaselineJson(review),
    review_sha256: await baselineSha256(review),
    created_at: "2026-10-22T12:00:00.000Z",
  };
  const deps = {
    authorize: vi
      .fn<PhotoPointReviewDependencies["authorize"]>()
      .mockResolvedValue({ canPersist: true, role: "editor", centroid: null }),
    loadBinding: vi.fn<PhotoPointReviewDependencies["loadBinding"]>().mockResolvedValue(binding),
    loadInspection: vi.fn<PhotoPointReviewDependencies["loadInspection"]>(),
    getWriter: vi.fn<PhotoPointReviewDependencies["getWriter"]>().mockResolvedValue({} as never),
    save: vi.fn<PhotoPointReviewDependencies["save"]>().mockResolvedValue(row),
    list: vi.fn<PhotoPointReviewDependencies["list"]>().mockResolvedValue([row]),
  };
  return { f, binding, input, row, deps };
}

describe("professional photo-point review authorization and evidence pins", () => {
  it("persists a human rejection without requiring or inventing AI, preserving exact original/source pins", async () => {
    const { input, binding, row, deps } = await setup();
    const saved = await executeSavePhotoPointReview(input, ACTOR_ID, {} as never, deps);
    expect(saved.review).toMatchObject({
      decision: "rejected",
      inspectionId: null,
      originalSha256: binding.manifest.originalSha256,
      baselineSha256: binding.manifest.baselineSha256,
    });
    expect(saved.reviewSha256).toBe(row.review_sha256);
    expect(deps.loadInspection).not.toHaveBeenCalled();
    expect(deps.authorize).toHaveBeenCalledTimes(3);
    expect(deps.save).toHaveBeenCalledWith(expect.anything(), input, ACTOR_ID, row.review_text);
  });
  it.each(["viewer", "field", "external"] as const)(
    "denies professional decisions from role %s before privileged access",
    async (role) => {
      const { input, deps } = await setup();
      deps.authorize.mockResolvedValue({ role, canPersist: false, centroid: null });
      await expect(executeSavePhotoPointReview(input, ACTOR_ID, {} as never, deps)).rejects.toThrow(
        "redigeringsadgang",
      );
      expect(deps.getWriter).not.toHaveBeenCalled();
      expect(deps.loadBinding).not.toHaveBeenCalled();
    },
  );
  it("denies a caller swap before any data read", async () => {
    const { input, deps } = await setup();
    await expect(executeSavePhotoPointReview(input, REQUEST, {} as never, deps)).rejects.toThrow(
      "Brugeren er ændret",
    );
    expect(deps.authorize).not.toHaveBeenCalled();
  });
  it("denies a foreign project and current revocation before persistence", async () => {
    const { input, deps } = await setup();
    deps.authorize.mockRejectedValue(new Error("denied"));
    await expect(executeSavePhotoPointReview(input, ACTOR_ID, {} as never, deps)).rejects.toThrow();
    expect(deps.getWriter).not.toHaveBeenCalled();
    deps.authorize.mockResolvedValueOnce({ canPersist: true, role: "editor", centroid: null });
    await expect(executeSavePhotoPointReview(input, ACTOR_ID, {} as never, deps)).rejects.toThrow();
    expect(deps.save).not.toHaveBeenCalled();
  });
  it("rejects a changed binding hash and missing evidence before writing", async () => {
    const { input, deps } = await setup();
    await expect(
      executeSavePhotoPointReview(
        { ...input, bindingSha256: "f".repeat(64) },
        ACTOR_ID,
        {} as never,
        deps,
      ),
    ).rejects.toThrow("version er ændret");
    deps.loadBinding.mockResolvedValue(null);
    await expect(executeSavePhotoPointReview(input, ACTOR_ID, {} as never, deps)).rejects.toThrow(
      "version findes ikke",
    );
    expect(deps.getWriter).not.toHaveBeenCalled();
  });
  it("rejects asymmetric AI pins and unexpected browser claims", async () => {
    const { input, deps } = await setup();
    for (const value of [
      { ...input, inspectionId: REQUEST },
      { ...input, approvedReport: true },
      { ...input, note: " " },
    ])
      await expect(
        executeSavePhotoPointReview(value as PhotoPointReviewInput, ACTOR_ID, {} as never, deps),
      ).rejects.toThrow();
    expect(deps.authorize).not.toHaveBeenCalled();
  });
  it.each([
    "sourceSnapshotHash",
    "originalSha256",
    "originalValidationSha256",
    "storageObjectId",
    "storageObjectVersion",
    "storageObjectUpdatedAt",
    "mediaId",
  ])("cannot associate a professional review with AI evidence whose %s differs", async (field) => {
    const { input, binding } = await setup();
    const withAi = { ...input, inspectionId: REQUEST, inspectionSha256: "c".repeat(64) };
    const inspection = {
      id: REQUEST,
      resultSha256: withAi.inspectionSha256,
      status: "completed",
      projectId: input.projectId,
      mediaId: binding.mediaId,
      originalSha256: binding.manifest.originalSha256,
      originalValidationSha256: binding.manifest.originalValidationSha256,
      storageObjectId: binding.manifest.storage.objectId,
      storageObjectVersion: binding.manifest.storage.objectVersion,
      storageObjectUpdatedAt: binding.manifest.storage.objectUpdatedAt,
      sourceSnapshotId: binding.manifest.baselineId,
      sourceSnapshotHash: binding.manifest.baselineSha256,
    };
    expect(buildPhotoPointReview(withAi, binding, inspection as never).inspectionId).toBe(REQUEST);
    expect(() =>
      buildPhotoPointReview(withAi, binding, { ...inspection, [field]: "different" } as never),
    ).toThrow("matcher ikke");
  });
  it.each(["reviewed_by", "request_id", "review_sha256"])(
    "rejects a mismatched saved %s",
    async (field) => {
      const { input, row, deps } = await setup();
      deps.save.mockResolvedValue({
        ...row,
        [field]: field === "review_sha256" ? "f".repeat(64) : REVIEW,
      });
      await expect(
        executeSavePhotoPointReview(input, ACTOR_ID, {} as never, deps),
      ).rejects.toThrow();
    },
  );
  it("allows project readers to reopen valid decisions without loading a writer", async () => {
    const { input, deps } = await setup();
    deps.authorize.mockResolvedValue({ canPersist: false, role: "viewer", centroid: null });
    const result = await executeListPhotoPointReviews(
      { projectId: PROJECT_ID, bindingId: input.bindingId },
      ACTOR_ID,
      {} as never,
      deps,
    );
    expect(result.items).toHaveLength(1);
    expect(deps.getWriter).not.toHaveBeenCalled();
    expect(deps.authorize).toHaveBeenCalledTimes(2);
  });
  it("rejects cross-photo and corrupted history rows", async () => {
    const { input, row, deps } = await setup();
    for (const corrupt of [
      { ...row, binding_id: REVIEW },
      { ...row, review_text: "{}" },
      { ...row, project_id: REVIEW },
    ]) {
      deps.list.mockResolvedValue([corrupt]);
      await expect(
        executeListPhotoPointReviews(
          { projectId: PROJECT_ID, bindingId: input.bindingId },
          ACTOR_ID,
          {} as never,
          deps,
        ),
      ).rejects.toThrow();
    }
  });
});
