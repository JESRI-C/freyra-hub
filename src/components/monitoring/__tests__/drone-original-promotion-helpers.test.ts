import { describe, expect, it, vi } from "vitest";
import type { DroneOriginalValidation } from "@/services/monitoring/drone-original-validation.server";
import type { DroneOriginalPromotion } from "@/services/monitoring/drone-original-promotion-types";
import {
  listDroneOriginalPromotionOrigins,
  parseDroneOriginalPromotionOrigins,
} from "@/services/monitoring/drone-original-promotion-service";
import {
  droneOriginalPromotionRequestId,
  droneOriginalPromotionStatusLabel,
  isDroneOriginalPromotable,
  processDroneOriginalsSequentially,
  promotionStateFromOrigin,
  type DroneOriginalPromotionState,
} from "../drone-original-promotion-helpers";
import type { OriginalCheckState, OriginalCheckUpload } from "../drone-original-check-helpers";

const originQueryMocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return { query, from: vi.fn().mockReturnValue(query) };
});
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { from: originQueryMocks.from },
}));

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const ACTOR_ID = "20000000-0000-4000-8000-000000000001";
const MEDIA_ID = "60000000-0000-4000-8000-000000000001";
function upload(index = 1): OriginalCheckUpload {
  const id = `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    id,
    project_id: PROJECT_ID,
    uploaded_by: ACTOR_ID,
    file_name: "photo.JPG",
    original_file_name: "photo.JPG",
    file_size: 128,
    mime_type: "image/jpeg",
    upload_type: "drone_photo",
    storage_path: `${ACTOR_ID}/intents/${id}/photo.JPG`,
    intent_request_id: "40000000-0000-4000-8000-000000000001",
    received_at: "2026-10-13T12:00:00.000Z",
    status: "awaiting_validation",
  };
}
function validation(
  original: OriginalCheckUpload,
  status: DroneOriginalValidation["status"] = "review_required",
): DroneOriginalValidation {
  return {
    schema: "gofreyra.drone-original-validation/v1",
    validatorVersion: "jpeg-structure-exifr/v1",
    uploadId: original.id,
    projectId: PROJECT_ID,
    validatedAt: "2026-10-13T12:01:00.000Z",
    validatedBy: ACTOR_ID,
    original: {
      sha256: "a".repeat(64),
      sizeBytes: original.file_size,
      mimeType: "image/jpeg",
      storagePath: original.storage_path,
      receivedAt: original.received_at!,
      object: {
        id: "50000000-0000-4000-8000-000000000001",
        version: "test-version",
        updated_at: "2026-10-13T12:00:00.000Z",
        owner_id: ACTOR_ID,
        size: original.file_size,
        mimetype: "image/jpeg",
      },
    },
    status,
    jpegStructure:
      status === "rejected"
        ? null
        : { widthPx: 64, heightPx: 64, components: 3, encoding: "baseline", scans: 1 },
    metadata: null,
    cameraPositionEligible: false,
    pixelDecoded: false,
    georeferenced: false,
    reportEligible: false,
    errors: [],
    warnings: [],
  };
}
function promotion(original: OriginalCheckUpload, deduplicated = false): DroneOriginalPromotion {
  return {
    schema: "gofreyra.drone-original-promotion/v1",
    projectId: PROJECT_ID,
    mediaId: MEDIA_ID,
    uploadId: original.id,
    originId: "70000000-0000-4000-8000-000000000001",
    requestId: original.id,
    receiptId: "80000000-0000-4000-8000-000000000001",
    originalRole: "drone_original",
    originalSha256: "a".repeat(64),
    originalValidationSha256: "b".repeat(64),
    originalValidationStatus: "review_required",
    deduplicated,
    promotedAt: "2026-10-13T12:02:00.000Z",
    storage: {
      bucket: "monitoring-uploads",
      path: original.storage_path,
      objectId: "50000000-0000-4000-8000-000000000001",
      objectVersion: "test-version",
      objectUpdatedAt: "2026-10-13T12:00:00.000Z",
    },
    pixelDecoded: false,
    georeferenced: false,
    reportEligible: false,
  };
}

describe("received drone original promotion flow", () => {
  it("retains the same request identity across retries and reloads without browser credentials", () => {
    const original = upload();
    expect(droneOriginalPromotionRequestId(PROJECT_ID, original.id)).toBe(original.id);
    expect(
      droneOriginalPromotionRequestId(PROJECT_ID.toUpperCase(), original.id.toUpperCase()),
    ).toBe(original.id);
    expect(droneOriginalPromotionRequestId(PROJECT_ID, upload(2).id)).not.toBe(original.id);
    expect(() => droneOriginalPromotionRequestId("missing-project", original.id)).toThrow();
  });

  it("does not inspect or promote a transfer that has not been finalized", async () => {
    const validate = vi.fn();
    const promote = vi.fn();
    const update = vi.fn();
    await processDroneOriginalsSequentially(
      [{ key: "pending", upload: { ...upload(), received_at: null, status: "draft" } }],
      PROJECT_ID,
      { validate, promote },
      { onOriginalCheck: update, onPromotion: update },
    );
    expect(validate).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      "pending",
      expect.objectContaining({ status: "unprocessed" }),
    );
  });

  it("validates then promotes each received file in order and keeps raw review limitations", async () => {
    const originals = [upload(1), upload(2)];
    const order: string[] = [];
    const states: DroneOriginalPromotionState[] = [];
    await processDroneOriginalsSequentially(
      originals.map((original) => ({ key: original.id, upload: original })),
      PROJECT_ID,
      {
        validate: async ({ uploadId }) => {
          order.push(`validate:${uploadId}`);
          return validation(originals.find((item) => item.id === uploadId)!);
        },
        promote: async (input) => {
          expect(Object.keys(input).sort()).toEqual(["projectId", "requestId", "uploadId"]);
          order.push(`promote:${input.uploadId}`);
          return promotion(originals.find((item) => item.id === input.uploadId)!);
        },
      },
      { onOriginalCheck: () => undefined, onPromotion: (_key, state) => states.push(state) },
    );
    expect(order).toEqual([
      `validate:${originals[0].id}`,
      `promote:${originals[0].id}`,
      `validate:${originals[1].id}`,
      `promote:${originals[1].id}`,
    ]);
    expect(states.filter((state) => state.status === "canonical")).toHaveLength(2);
    expect(promotion(originals[0])).toMatchObject({
      pixelDecoded: false,
      georeferenced: false,
      reportEligible: false,
    });
  });

  it("settles a failed promotion and continues later originals in the batch", async () => {
    const originals = [upload(1), upload(2)];
    const final = new Map<string, DroneOriginalPromotionState>();
    const promote = vi.fn(async ({ uploadId }: { uploadId: string }) => {
      if (uploadId === originals[0].id) throw new Error("denied private-token-not-for-ui");
      return promotion(originals[1]);
    });
    await processDroneOriginalsSequentially(
      originals.map((original) => ({ key: original.id, upload: original })),
      PROJECT_ID,
      {
        validate: async ({ uploadId }) =>
          validation(originals.find((item) => item.id === uploadId)!),
        promote,
      },
      { onOriginalCheck: () => undefined, onPromotion: (key, state) => final.set(key, state) },
    );
    expect(final.get(originals[0].id)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("uden ny upload"),
    });
    expect(final.get(originals[1].id)).toMatchObject({ status: "canonical" });
    expect(JSON.stringify([...final.values()])).not.toContain("private-token");
  });

  it("does not promote a failed H08 check and still processes the next received original", async () => {
    const originals = [upload(1), upload(2)];
    const promote = vi.fn(async () => promotion(originals[1]));
    await processDroneOriginalsSequentially(
      originals.map((original) => ({ key: original.id, upload: original })),
      PROJECT_ID,
      {
        validate: async ({ uploadId }) => {
          if (uploadId === originals[0].id) throw new Error("validator unavailable");
          return validation(originals[1]);
        },
        promote,
      },
      { onOriginalCheck: () => undefined, onPromotion: () => undefined },
    );
    expect(promote).toHaveBeenCalledTimes(1);
    expect(promote).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      uploadId: originals[1].id,
      requestId: originals[1].id,
    });
  });

  it("retries only promotion after success of H08, preserving the original received upload", async () => {
    const original = upload();
    const unchanged = structuredClone(original);
    const validate = vi.fn(async () => validation(original));
    const promote = vi
      .fn()
      .mockRejectedValueOnce(new Error("access denied"))
      .mockResolvedValueOnce(promotion(original));
    let originalCheck: OriginalCheckState | undefined;
    let linked: DroneOriginalPromotionState | undefined;
    const updates = {
      onOriginalCheck: (_key: string, state: OriginalCheckState) => {
        originalCheck = state;
      },
      onPromotion: (_key: string, state: DroneOriginalPromotionState) => {
        linked = state;
      },
    };
    await processDroneOriginalsSequentially(
      [{ key: original.id, upload: original }],
      PROJECT_ID,
      { validate, promote },
      updates,
    );
    expect(originalCheck).toMatchObject({ status: "review_required" });
    expect(linked).toMatchObject({ status: "failed" });
    await processDroneOriginalsSequentially(
      [{ key: original.id, upload: original, originalCheck, promotion: linked }],
      PROJECT_ID,
      { validate, promote },
      updates,
    );
    expect(validate).toHaveBeenCalledTimes(1);
    expect(promote).toHaveBeenCalledTimes(2);
    expect(promote.mock.calls[0][0]).toEqual(promote.mock.calls[1][0]);
    expect(original).toEqual(unchanged);
    expect(linked).toMatchObject({ status: "canonical" });
  });

  it("uses saved H08 metadata after reload without another validation or upload", async () => {
    const original = upload();
    const reloaded = {
      ...original,
      original_sha256: "a".repeat(64),
      original_validation: validation(original),
    };
    const validate = vi.fn();
    const promote = vi.fn(async () => promotion(original));
    await processDroneOriginalsSequentially(
      [{ key: original.id, upload: reloaded }],
      PROJECT_ID,
      { validate, promote },
      { onOriginalCheck: () => undefined, onPromotion: () => undefined },
    );
    expect(validate).not.toHaveBeenCalled();
    expect(promote).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      uploadId: original.id,
      requestId: original.id,
    });
  });

  it("never promotes rejected originals or another project's upload", async () => {
    const original = upload();
    const promote = vi.fn();
    const validate = vi.fn(async () => validation(original, "rejected"));
    await processDroneOriginalsSequentially(
      [{ key: original.id, upload: original }],
      PROJECT_ID,
      { validate, promote },
      { onOriginalCheck: () => undefined, onPromotion: () => undefined },
    );
    await processDroneOriginalsSequentially(
      [{ key: original.id, upload: original }],
      "10000000-0000-4000-8000-000000000099",
      { validate, promote },
      { onOriginalCheck: () => undefined, onPromotion: () => undefined },
    );
    expect(validate).toHaveBeenCalledTimes(1);
    expect(promote).not.toHaveBeenCalled();
    expect(isDroneOriginalPromotable({ status: "rejected" })).toBe(false);
  });

  it("treats a forged report-ready or wrong-upload promotion response as failure", async () => {
    const original = upload();
    for (const changed of [
      { reportEligible: true },
      { uploadId: upload(99).id },
      { originalSha256: "c".repeat(64) },
    ]) {
      const updates = vi.fn();
      await processDroneOriginalsSequentially(
        [
          {
            key: original.id,
            upload: original,
            originalCheck: { status: "review_required", sha256: "a".repeat(64) },
          },
        ],
        PROJECT_ID,
        {
          validate: vi.fn(),
          promote: async () => ({ ...promotion(original), ...changed }) as DroneOriginalPromotion,
        },
        { onOriginalCheck: () => undefined, onPromotion: updates },
      );
      expect(updates).toHaveBeenLastCalledWith(
        original.id,
        expect.objectContaining({ status: "failed" }),
      );
    }
  });

  it("serializes whole validation and promotion operations across separate drawer/reload calls", async () => {
    const first = upload(1);
    const second = upload(2);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const operations = {
      validate: async ({ uploadId }: { uploadId: string }) => {
        order.push(`validate:${uploadId}`);
        return validation(uploadId === first.id ? first : second);
      },
      promote: async ({ uploadId }: { uploadId: string }) => {
        order.push(`promote:${uploadId}`);
        if (uploadId === first.id) await blocker;
        return promotion(uploadId === first.id ? first : second);
      },
    };
    const updates = { onOriginalCheck: () => undefined, onPromotion: () => undefined };
    const one = processDroneOriginalsSequentially(
      [{ key: first.id, upload: first }],
      PROJECT_ID,
      operations,
      updates,
    );
    const two = processDroneOriginalsSequentially(
      [{ key: second.id, upload: second }],
      PROJECT_ID,
      operations,
      updates,
    );
    await vi.waitFor(() => expect(order).toEqual([`validate:${first.id}`, `promote:${first.id}`]));
    release();
    await Promise.all([one, two]);
    expect(order).toEqual([
      `validate:${first.id}`,
      `promote:${first.id}`,
      `validate:${second.id}`,
      `promote:${second.id}`,
    ]);
  });

  it("labels a deduplicated raw asset separately from the pending professional review", () => {
    expect(
      droneOriginalPromotionStatusLabel({ status: "canonical", deduplicated: true }),
    ).toContain("Dublet tilknyttet");
    expect(
      droneOriginalPromotionStatusLabel({ status: "canonical", deduplicated: false }),
    ).toContain("afventer faglig gennemgang");
    expect(droneOriginalPromotionStatusLabel({ status: "failed" })).toContain(
      "Original kontrolleret",
    );
  });
});

describe("saved canonical origin summary", () => {
  const row = () => ({
    id: "70000000-0000-4000-8000-000000000001",
    project_id: PROJECT_ID,
    upload_id: upload(2).id,
    media_id: MEDIA_ID,
    original_sha256: "a".repeat(64),
    media: {
      id: MEDIA_ID,
      project_id: PROJECT_ID,
      source_upload_id: upload(1).id,
      original_sha256: "a".repeat(64),
      original_role: "drone_original",
      original_validation_status: "review_required",
      is_report_ready: false,
    },
  });
  it("restores a canonical duplicate badge from its typed media relation", () => {
    const summary = parseDroneOriginalPromotionOrigins([row()], PROJECT_ID)[0];
    expect(summary).toMatchObject({
      uploadId: upload(2).id,
      mediaId: MEDIA_ID,
      deduplicated: true,
    });
    expect(promotionStateFromOrigin(summary)).toMatchObject({
      status: "canonical",
      deduplicated: true,
    });
  });
  it("refuses missing joins, changed hashes, foreign projects, duplicates or report-ready assertions", () => {
    for (const changed of [
      { ...row(), media: null },
      { ...row(), project_id: "10000000-0000-4000-8000-000000000099" },
      { ...row(), original_sha256: "b".repeat(64) },
      { ...row(), media: { ...row().media, is_report_ready: true } },
      { ...row(), media: { ...row().media, project_id: "10000000-0000-4000-8000-000000000099" } },
    ])
      expect(() => parseDroneOriginalPromotionOrigins([changed], PROJECT_ID)).toThrow();
    expect(() => parseDroneOriginalPromotionOrigins([row(), row()], PROJECT_ID)).toThrow();
    expect(() => parseDroneOriginalPromotionOrigins(null, PROJECT_ID)).toThrow();
    expect(parseDroneOriginalPromotionOrigins([], PROJECT_ID)).toEqual([]);
  });

  it("reads only the selected project and visible upload references through the caller client", async () => {
    vi.clearAllMocks();
    originQueryMocks.query.limit.mockResolvedValue({ data: [row()], error: null });
    const summary = await listDroneOriginalPromotionOrigins(PROJECT_ID, [upload(2).id]);
    expect(originQueryMocks.from).toHaveBeenCalledWith("project_media_upload_origins");
    expect(originQueryMocks.query.eq).toHaveBeenCalledWith("project_id", PROJECT_ID);
    expect(originQueryMocks.query.in).toHaveBeenCalledWith("upload_id", [upload(2).id]);
    expect(originQueryMocks.query.limit).toHaveBeenCalledWith(200);
    expect(summary[0]).toMatchObject({ uploadId: upload(2).id, deduplicated: true });
  });

  it("does not turn a read failure into an empty or stale canonical list", async () => {
    originQueryMocks.query.limit.mockResolvedValue({
      data: [row()],
      error: { message: "access denied private-value" },
    });
    await expect(listDroneOriginalPromotionOrigins(PROJECT_ID, [upload(2).id])).rejects.toThrow(
      "kunne ikke hentes",
    );
    await expect(listDroneOriginalPromotionOrigins(PROJECT_ID, [upload(2).id])).rejects.not.toThrow(
      "private-value",
    );
  });
});
