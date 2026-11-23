import { describe, expect, it, vi } from "vitest";
import type { DroneOriginalValidation } from "@/services/monitoring/drone-original-validation.server";
import {
  checkOriginalsSequentially,
  isOriginalCheckComplete,
  MAX_ORIGINAL_CHECK_BYTES,
  originalCheckAvailability,
  originalCheckStatusLabel,
  storedOriginalCheckState,
  type OriginalCheckState,
  type OriginalCheckUpload,
} from "../drone-original-check-helpers";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const UPLOADER_ID = "20000000-0000-4000-8000-000000000001";
function upload(index = 1): OriginalCheckUpload {
  const id = `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    id,
    project_id: PROJECT_ID,
    uploaded_by: UPLOADER_ID,
    file_name: "photo.JPG",
    original_file_name: "photo.JPG",
    file_size: 128,
    mime_type: "image/jpeg",
    upload_type: "drone_photo",
    storage_path: `${UPLOADER_ID}/intents/${id}/photo.JPG`,
    intent_request_id: "40000000-0000-4000-8000-000000000001",
    received_at: "2026-10-13T12:00:00.000Z",
    status: "awaiting_validation",
  };
}
function result(
  original: OriginalCheckUpload,
  status: DroneOriginalValidation["status"] = "review_required",
): DroneOriginalValidation {
  return {
    schema: "gofreyra.drone-original-validation/v1",
    validatorVersion: "jpeg-structure-exifr/v1",
    uploadId: original.id,
    projectId: PROJECT_ID,
    validatedAt: "2026-10-13T12:01:00.000Z",
    validatedBy: UPLOADER_ID,
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
        owner_id: UPLOADER_ID,
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

describe("original-check admission and received-file retry", () => {
  it("admits only a finalized canonical project-owned JPEG within the server byte limit", () => {
    const original = upload();
    expect(originalCheckAvailability(original, PROJECT_ID).eligible).toBe(true);
    for (const change of [
      { status: "draft" },
      { received_at: null },
      { intent_request_id: null },
      { project_id: "10000000-0000-4000-8000-000000000002" },
      { storage_path: "legacy/photo.JPG" },
      { file_size: MAX_ORIGINAL_CHECK_BYTES + 1 },
      { mime_type: "image/tiff", file_name: "photo.tif" },
      { upload_type: "image" },
    ])
      expect(originalCheckAvailability({ ...original, ...change }, PROJECT_ID).eligible).toBe(
        false,
      );
  });

  it("processes originals one at a time and sends only project/upload IDs", async () => {
    const originals = [upload(1), upload(2), upload(3)];
    let inFlight = 0;
    let maximum = 0;
    const calls: number[] = [];
    const validate = vi.fn(async (input: { projectId: string; uploadId: string }) => {
      maximum = Math.max(maximum, ++inFlight);
      expect(Object.keys(input).sort()).toEqual(["projectId", "uploadId"]);
      const current = originals.find((candidate) => candidate.id === input.uploadId)!;
      calls.push(originals.indexOf(current));
      await Promise.resolve();
      inFlight--;
      return result(current);
    });
    const updates = vi.fn();
    await checkOriginalsSequentially(
      originals.map((original) => ({ key: original.id, upload: original })),
      PROJECT_ID,
      validate,
      updates,
    );
    expect(maximum).toBe(1);
    expect(calls).toEqual([0, 1, 2]);
    expect(updates).toHaveBeenCalledWith(
      originals[0].id,
      expect.objectContaining({ status: "review_required" }),
    );
  });

  it("serializes separate drawer/reload queues within the same browser module", async () => {
    const first = upload(4);
    const second = upload(5);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const validate = vi.fn(async (input: { projectId: string; uploadId: string }) => {
      order.push(input.uploadId);
      if (input.uploadId === first.id) await blocker;
      return result(input.uploadId === first.id ? first : second);
    });
    const one = checkOriginalsSequentially(
      [{ key: first.id, upload: first }],
      PROJECT_ID,
      validate,
      () => undefined,
    );
    const two = checkOriginalsSequentially(
      [{ key: second.id, upload: second }],
      PROJECT_ID,
      validate,
      () => undefined,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(validate).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([one, two]);
    expect(order).toEqual([first.id, second.id]);
  });

  it("retains received identity on failure and retries validation without receiving or uploading again", async () => {
    const original = upload();
    const initial = structuredClone(original);
    const validate = vi
      .fn<(input: { projectId: string; uploadId: string }) => Promise<DroneOriginalValidation>>()
      .mockRejectedValueOnce(new Error("RPC unavailable secret-token-do-not-show"))
      .mockResolvedValueOnce(result(original));
    let state: OriginalCheckState | null = null;
    const update = (_key: string, next: OriginalCheckState) => {
      state = next;
    };
    await checkOriginalsSequentially(
      [{ key: original.id, upload: original }],
      PROJECT_ID,
      validate,
      update,
    );
    expect(state).toMatchObject({
      status: "failed",
      error: expect.stringContaining("stadig modtaget"),
    });
    expect(JSON.stringify(state)).not.toContain("secret-token");
    expect(original).toEqual(initial);
    await checkOriginalsSequentially(
      [{ key: original.id, upload: original }],
      PROJECT_ID,
      validate,
      update,
    );
    expect(state).toMatchObject({ status: "review_required" });
    expect(validate).toHaveBeenNthCalledWith(2, { projectId: PROJECT_ID, uploadId: original.id });
    expect(original.received_at).toBe(initial.received_at);
  });

  it("continues the queue after one original validation fails", async () => {
    const first = upload(6),
      second = upload(7);
    const validate = vi
      .fn<(input: { projectId: string; uploadId: string }) => Promise<DroneOriginalValidation>>()
      .mockRejectedValueOnce(new Error("Access revoked"))
      .mockResolvedValueOnce(result(second));
    const updates = vi.fn();
    await checkOriginalsSequentially(
      [
        { key: first.id, upload: first },
        { key: second.id, upload: second },
      ],
      PROJECT_ID,
      validate,
      updates,
    );
    expect(updates).toHaveBeenCalledWith(first.id, expect.objectContaining({ status: "failed" }));
    expect(updates).toHaveBeenCalledWith(
      second.id,
      expect.objectContaining({ status: "review_required" }),
    );
  });

  it("shows unsupported and historical files as unprocessed without calling the server", async () => {
    const oversized = { ...upload(), file_size: MAX_ORIGINAL_CHECK_BYTES + 1 };
    const legacy = { ...upload(8), intent_request_id: null };
    const validate = vi.fn();
    const updates = vi.fn();
    await checkOriginalsSequentially(
      [
        { key: oversized.id, upload: oversized },
        { key: legacy.id, upload: legacy },
      ],
      PROJECT_ID,
      validate,
      updates,
    );
    expect(validate).not.toHaveBeenCalled();
    expect(updates).toHaveBeenCalledWith(oversized.id, {
      status: "unprocessed",
      error: expect.stringContaining("32 MiB"),
    });
    expect(updates).toHaveBeenCalledWith(legacy.id, {
      status: "unprocessed",
      error: expect.stringContaining("færdigmodtaget"),
    });
  });

  it("reads a saved raw check after reload without rerunning validation or claiming report readiness", async () => {
    const original = upload();
    const saved = {
      ...original,
      original_sha256: "a".repeat(64),
      original_validation: result(original),
    };
    expect(storedOriginalCheckState(saved)).toMatchObject({
      status: "review_required",
      cameraPositionEligible: false,
    });
    const validate = vi.fn();
    const update = vi.fn();
    await checkOriginalsSequentially(
      [{ key: saved.id, upload: saved }],
      PROJECT_ID,
      validate,
      update,
    );
    expect(validate).not.toHaveBeenCalled();
    expect(isOriginalCheckComplete(storedOriginalCheckState(saved))).toBe(true);
    expect(originalCheckStatusLabel({ status: "raw_original_validated" })).toContain(
      "afventer faglig",
    );
  });

  it("refuses mismatched server results and attempted report/footprint promotion", async () => {
    const original = upload();
    for (const changed of [
      { ...result(original), uploadId: upload(9).id },
      { ...result(original), reportEligible: true },
      { ...result(original), georeferenced: true },
      {
        ...result(original),
        original: { ...result(original).original, storagePath: "foreign/photo.JPG" },
      },
    ]) {
      expect(storedOriginalCheckState({ ...original, original_validation: changed })?.status).toBe(
        "failed",
      );
    }
    const updates = vi.fn();
    await checkOriginalsSequentially(
      [{ key: original.id, upload: original }],
      PROJECT_ID,
      vi.fn().mockResolvedValue({ ...result(original), uploadId: upload(9).id }),
      updates,
    );
    expect(updates).toHaveBeenLastCalledWith(
      original.id,
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("keeps rejected originals rejected after reload and never relabels them as received-ready", () => {
    const original = upload();
    const rejected = storedOriginalCheckState({
      ...original,
      status: "rejected",
      original_validation: result(original, "rejected"),
    });
    expect(rejected?.status).toBe("rejected");
    expect(originalCheckStatusLabel(rejected!)).toBe("Original afvist");
    expect(rejected?.cameraPositionEligible).toBe(false);
  });
});
