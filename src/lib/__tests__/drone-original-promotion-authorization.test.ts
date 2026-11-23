import { describe, expect, it, vi } from "vitest";
import {
  executePromoteDroneOriginal,
  type DroneOriginalPromotionDependencies,
} from "../drone-original-promotion.functions";
import { ProjectAccessDeniedError } from "../project-nature-access.server";
import {
  droneOriginalPromotionFromRow,
  requirePromotableDroneOriginal,
} from "@/services/monitoring/drone-original-promotion.server";
import {
  originalValidationSha256,
  validateDroneOriginalBytes,
  type PreparedDroneOriginal,
} from "@/services/monitoring/drone-original-validation.server";
import {
  ACTOR_ID,
  PROJECT_ID,
  UPLOAD_ID,
  canonicalUpload,
  originalJpeg,
  storageObject,
} from "@/services/monitoring/__tests__/drone-original-validation.fixtures";

const CLIENT = {} as never;
const INPUT = {
  projectId: PROJECT_ID,
  uploadId: UPLOAD_ID,
  requestId: "40000000-0000-4000-8000-000000000005",
};
const MEDIA_ID = "50000000-0000-4000-8000-000000000005";
const ORIGIN_ID = "60000000-0000-4000-8000-000000000005";
const RECEIPT_ID = "70000000-0000-4000-8000-000000000005";
const AT = "2026-10-13T10:00:00.000Z";

async function preparedOriginal(): Promise<PreparedDroneOriginal> {
  const bytes = originalJpeg();
  const upload = canonicalUpload(bytes);
  const object = storageObject(bytes);
  const existing = await validateDroneOriginalBytes(upload, object, bytes, ACTOR_ID, {
    now: () => AT,
  });
  return { upload, object, existing, existingSha256: await originalValidationSha256(existing) };
}
function persisted(prepared: PreparedDroneOriginal) {
  return {
    media: {
      id: MEDIA_ID,
      project_id: PROJECT_ID,
      source_upload_id: UPLOAD_ID,
      original_role: "drone_original",
      original_sha256: prepared.existing!.original.sha256,
      original_validation_sha256: prepared.existingSha256,
      original_validation_status: "review_required",
      storage_bucket: "monitoring-uploads",
      file_path: prepared.upload.storage_path,
      storage_object_id: prepared.object.id,
      storage_object_version: prepared.object.version,
      storage_object_updated_at: prepared.object.updated_at,
      promoted_at: AT,
      promoted_by: ACTOR_ID,
      is_report_ready: false,
      status: "uploaded",
      category: "drone_image",
      source: "drone",
      mime_type: "image/jpeg",
      file_size_bytes: prepared.upload.file_size,
      url: "",
      thumbnail_url: null,
    },
    origin: {
      id: ORIGIN_ID,
      project_id: PROJECT_ID,
      media_id: MEDIA_ID,
      upload_id: UPLOAD_ID,
      original_role: "drone_original",
      original_sha256: prepared.existing!.original.sha256,
      original_validation_sha256: prepared.existingSha256,
      storage_bucket: "monitoring-uploads",
      storage_path: prepared.upload.storage_path,
      object_id: prepared.object.id,
      object_version: prepared.object.version,
      object_updated_at: prepared.object.updated_at,
      created_at: AT,
      created_by: ACTOR_ID,
    },
    request: {
      id: RECEIPT_ID,
      project_id: PROJECT_ID,
      created_by: ACTOR_ID,
      request_id: INPUT.requestId,
      upload_id: UPLOAD_ID,
      media_id: MEDIA_ID,
      origin_id: ORIGIN_ID,
      created_at: AT,
    },
    deduplicated: false,
  };
}
async function dependencies() {
  const prepared = await preparedOriginal();
  const authorize = vi
    .fn<DroneOriginalPromotionDependencies["authorize"]>()
    .mockResolvedValue({ role: "editor", canPersist: true, centroid: null });
  const getWriter = vi
    .fn<DroneOriginalPromotionDependencies["getWriter"]>()
    .mockResolvedValue(CLIENT);
  const prepare = vi
    .fn<DroneOriginalPromotionDependencies["prepare"]>()
    .mockResolvedValue(prepared);
  const persist = vi
    .fn<DroneOriginalPromotionDependencies["persist"]>()
    .mockImplementation(async (_writer, input, actor, record) =>
      droneOriginalPromotionFromRow(persisted(record), input, actor, record),
    );
  return { authorize, getWriter, prepare, persist, prepared };
}

describe("caller-bound canonical original promotion", () => {
  it("rejects browser file identity, metadata, roles and approval before authorization", async () => {
    for (const extra of [
      { bucket: "project-media" },
      { storagePath: "other/file.jpg" },
      { originalRole: "approved" },
      { sha256: "a".repeat(64) },
      { metadata: { latitude: 55 } },
      { approved: true },
      { reportEligible: true },
    ]) {
      const calls = await dependencies();
      await expect(
        executePromoteDroneOriginal({ ...INPUT, ...extra } as never, ACTOR_ID, CLIENT, calls),
      ).rejects.toThrow();
      expect(calls.authorize).not.toHaveBeenCalled();
      expect(calls.getWriter).not.toHaveBeenCalled();
    }
  });

  it("denies foreign tenants and viewers before privileged prepare/persist", async () => {
    const foreign = await dependencies();
    foreign.authorize.mockRejectedValue(new ProjectAccessDeniedError());
    await expect(executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, foreign)).rejects.toThrow(
      "Project access denied",
    );
    expect(foreign.getWriter).not.toHaveBeenCalled();
    const viewer = await dependencies();
    viewer.authorize.mockResolvedValue({ role: "viewer", canPersist: false, centroid: null });
    await expect(executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, viewer)).rejects.toThrow(
      "ikke rettighed",
    );
    expect(viewer.prepare).not.toHaveBeenCalled();
  });

  it("allows field collection while retaining raw, geographic and report limitations", async () => {
    const calls = await dependencies();
    calls.authorize.mockResolvedValue({ role: "field", canPersist: false, centroid: null });
    const result = await executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls);
    expect(calls.authorize).toHaveBeenCalledWith(CLIENT, ACTOR_ID, PROJECT_ID);
    expect(calls.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      calls.getWriter.mock.invocationCallOrder[0],
    );
    expect(calls.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      calls.persist.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      mediaId: MEDIA_ID,
      originId: ORIGIN_ID,
      originalValidationStatus: "review_required",
      pixelDecoded: false,
      georeferenced: false,
      reportEligible: false,
    });
  });

  it("rejects an unvalidated intake without persisting", async () => {
    const calls = await dependencies();
    calls.prepare.mockResolvedValue({ ...calls.prepared, existing: null, existingSha256: null });
    await expect(executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls)).rejects.toThrow(
      "serverkontrolleres",
    );
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it("rejects a server-rejected JPEG despite its valid receipt/hash", async () => {
    const calls = await dependencies();
    const bytes = new Uint8Array(originalJpeg().byteLength);
    const rejected = await validateDroneOriginalBytes(
      calls.prepared.upload,
      calls.prepared.object,
      bytes,
      ACTOR_ID,
      { now: () => AT },
    );
    calls.prepare.mockResolvedValue({
      ...calls.prepared,
      existing: rejected,
      existingSha256: await originalValidationSha256(rejected),
    });
    await expect(executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls)).rejects.toThrow(
      "afvist",
    );
    expect(calls.persist).not.toHaveBeenCalled();
  });

  it("rejects a stale object, corrupt stored checksum and mismatched project/upload", async () => {
    for (const mutation of [
      (prepared: PreparedDroneOriginal) => ({
        ...prepared,
        object: { ...prepared.object, version: "replacement" },
      }),
      (prepared: PreparedDroneOriginal) => ({ ...prepared, existingSha256: "c".repeat(64) }),
      (prepared: PreparedDroneOriginal) => ({
        ...prepared,
        upload: { ...prepared.upload, project_id: "90000000-0000-4000-8000-000000000001" },
      }),
      (prepared: PreparedDroneOriginal) => ({
        ...prepared,
        upload: { ...prepared.upload, id: "90000000-0000-4000-8000-000000000002" },
      }),
    ]) {
      const calls = await dependencies();
      calls.prepare.mockResolvedValue(mutation(calls.prepared));
      await expect(executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls)).rejects.toThrow();
      expect(calls.persist).not.toHaveBeenCalled();
    }
  });

  it("rechecks authority on retry and propagates revocation at final commit", async () => {
    const calls = await dependencies();
    const first = await executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls);
    const retry = await executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls);
    expect(retry).toEqual(first);
    expect(calls.authorize).toHaveBeenCalledTimes(2);
    expect(calls.prepare).toHaveBeenCalledTimes(2);
    expect(calls.persist).toHaveBeenCalledTimes(2);
    calls.persist.mockRejectedValueOnce(new Error("Current contribution revoked"));
    await expect(executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, calls)).rejects.toThrow(
      "revoked",
    );
  });

  it("uses only the verified actor and H08 object/hash in the real writer RPC contract", async () => {
    const prepared = await preparedOriginal();
    const rpc = vi.fn().mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === "prepare_drone_original_validation"
          ? {
              upload: prepared.upload,
              object: prepared.object,
              existing: prepared.existing,
              existing_sha256: prepared.existingSha256,
            }
          : persisted(prepared),
    }));
    const authorize = vi
      .fn()
      .mockResolvedValue({ role: "editor", canPersist: true, centroid: null });
    const result = await executePromoteDroneOriginal(INPUT, ACTOR_ID, CLIENT, {
      authorize,
      getWriter: async () => ({ rpc }),
    });
    expect(rpc.mock.calls).toEqual([
      [
        "prepare_drone_original_validation",
        { p_project_id: PROJECT_ID, p_upload_id: UPLOAD_ID, p_actor_id: ACTOR_ID },
      ],
      [
        "persist_drone_original_promotion",
        {
          p_project_id: PROJECT_ID,
          p_upload_id: UPLOAD_ID,
          p_actor_id: ACTOR_ID,
          p_request_id: INPUT.requestId,
          p_original_sha256: prepared.existing!.original.sha256,
          p_validation_sha256: prepared.existingSha256,
          p_object_id: prepared.object.id,
          p_object_version: prepared.object.version,
          p_object_updated_at: prepared.object.updated_at,
        },
      ],
    ]);
    expect(result.originalSha256).toBe(prepared.existing!.original.sha256);
  });
});

describe("persisted canonical identity and duplicate provenance", () => {
  it("keeps the duplicate's separate physical origin while returning the existing media identity", async () => {
    const prepared = await preparedOriginal();
    const row = persisted(prepared);
    row.media.source_upload_id = "20000000-0000-4000-8000-000000000099";
    row.media.file_path = `${ACTOR_ID}/intents/${row.media.source_upload_id}/first.JPG`;
    row.media.storage_object_id = "50000000-0000-4000-8000-000000000099";
    row.media.original_validation_sha256 = "b".repeat(64);
    row.deduplicated = true;
    const result = droneOriginalPromotionFromRow(row, INPUT, ACTOR_ID, prepared);
    expect(result).toMatchObject({
      mediaId: MEDIA_ID,
      uploadId: UPLOAD_ID,
      originId: ORIGIN_ID,
      deduplicated: true,
      originalValidationSha256: prepared.existingSha256,
      storage: { objectId: prepared.object.id, path: prepared.upload.storage_path },
    });
  });

  it("refuses foreign receipt/media, swapped origin/object, spoofed actor and report promotion", async () => {
    const prepared = await preparedOriginal();
    for (const mutate of [
      (row: ReturnType<typeof persisted>) => {
        row.media.project_id = "90000000-0000-4000-8000-000000000001";
      },
      (row: ReturnType<typeof persisted>) => {
        row.origin.upload_id = "90000000-0000-4000-8000-000000000002";
      },
      (row: ReturnType<typeof persisted>) => {
        row.origin.object_version = "replacement";
      },
      (row: ReturnType<typeof persisted>) => {
        row.request.created_by = "90000000-0000-4000-8000-000000000003";
      },
      (row: ReturnType<typeof persisted>) => {
        row.request.request_id = "90000000-0000-4000-8000-000000000004";
      },
      (row: ReturnType<typeof persisted>) => {
        row.media.is_report_ready = true;
      },
      (row: ReturnType<typeof persisted>) => {
        row.deduplicated = true;
      },
      (row: ReturnType<typeof persisted>) => {
        row.media.original_validation_sha256 = "c".repeat(64);
      },
    ]) {
      const row = persisted(prepared);
      mutate(row);
      expect(() => droneOriginalPromotionFromRow(row, INPUT, ACTOR_ID, prepared)).toThrow();
    }
  });

  it("revalidates the stored original rather than trusting a review-required label", async () => {
    const prepared = await preparedOriginal();
    prepared.existing!.reportEligible = true as never;
    prepared.existingSha256 = await originalValidationSha256(prepared.existing);
    await expect(requirePromotableDroneOriginal(prepared)).rejects.toThrow();
  });
});
