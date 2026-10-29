import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  makeFieldPhotoPreview,
  runFieldPhotoBackground,
  verifyStoredFieldPhotoPreview,
  withFieldPhotoDeadline,
} from "./processor";
import {
  received,
  verified,
  actorId,
  leaseId,
  projectId,
  uploadId,
} from "../../src/services/__tests__/field-photo-fixture";
import { fieldPhotoPreviewPath } from "../../src/lib/field-photo-preview";
import worker from "./index";
// Structural JPEG fixture. Image decoding is mocked here; runtime smoke test
// uses a real PNG and the local Images binding separately.
const jpeg = new Uint8Array([
  255, 216, 255, 225, 0, 8, 69, 88, 73, 70, 0, 0, 255, 192, 0, 11, 8, 0, 2, 0, 3, 1, 1, 17, 0, 255,
  218, 0, 2, 0, 255, 217,
]);
const sha = createHash("sha256").update("original").digest("hex");
const upload = { ...received, payload: { ...received.payload, sha256: sha } };
const receipt = { ...verified, sha256: sha };
const job = {
  upload_id: uploadId,
  project_id: projectId,
  stage: "preview",
  state: "running",
  attempts: 1,
  lease_id: leaseId,
  lease_until: "2026-10-29T15:00:00Z",
  next_attempt_at: "2026-10-29T14:00:00Z",
  updated_at: "2026-10-29T14:00:00Z",
  last_error: null,
};
function fixture() {
  const rpc = vi.fn(),
    stored = vi.fn().mockResolvedValue({ error: null }),
    download = vi.fn();
  const input = vi.fn().mockReturnValue({
    transform: vi.fn().mockReturnValue({
      output: vi.fn().mockResolvedValue({ response: () => new Response(jpeg.slice().buffer) }),
    }),
  });
  const client = {
    rpc,
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: {
            signedUrl: `https://synthetic.supabase.co/storage/v1/object/sign/project-media/${upload.storage_path}?token=synthetic`,
          },
          error: null,
        }),
        upload: stored,
        download,
      }),
    },
  };
  const fetcher = vi.fn().mockResolvedValue(new Response("original"));
  return { rpc, stored, download, client, images: { input }, fetcher };
}
describe("field photo derivative", () => {
  it("stops waiting when the image provider does not answer before the deadline", async () => {
    const controller = new AbortController();
    const pending = withFieldPhotoDeadline(() => new Promise(() => {}), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "processing_failed" });
  });
  it("rehashes the stored preview against a captured object version before commit", async () => {
    const f = fixture(),
      result = await makeFieldPhotoPreview(
        f.client,
        f.images,
        upload,
        "https://synthetic.supabase.co",
        f.fetcher,
      );
    const path = fieldPhotoPreviewPath(projectId, uploadId, result.sha256);
    const binding = {
      object_id: received.object_id,
      object_version: "preview-v1",
      object_updated_at: received.object_updated_at,
      storage_path: path,
    };
    f.rpc.mockResolvedValue({ data: binding, error: null });
    f.client.storage.from = vi.fn().mockReturnValue({
      createSignedUrl: async () => ({
        data: {
          signedUrl: `https://synthetic.supabase.co/storage/v1/object/sign/field-photo-previews/${path}?token=synthetic`,
        },
        error: null,
      }),
    });
    f.fetcher.mockResolvedValue(new Response(f.stored.mock.calls[0][1]));
    expect(
      await verifyStoredFieldPhotoPreview(
        f.client,
        upload,
        leaseId,
        result,
        "https://synthetic.supabase.co",
        f.fetcher,
      ),
    ).toEqual(binding);
    f.fetcher.mockResolvedValue(new Response(new Uint8Array(result.sizeBytes)));
    await expect(
      verifyStoredFieldPhotoPreview(
        f.client,
        upload,
        leaseId,
        result,
        "https://synthetic.supabase.co",
        f.fetcher,
      ),
    ).rejects.toMatchObject({ code: "source_changed" });
  });
  it("keeps the original untouched and stores a hashed, metadata-stripped preview separately", async () => {
    const f = fixture(),
      result = await makeFieldPhotoPreview(
        f.client,
        f.images,
        upload,
        "https://synthetic.supabase.co",
        f.fetcher,
      );
    expect(result).toMatchObject({ width: 3, height: 2, sizeBytes: jpeg.length - 10 });
    expect(f.stored.mock.calls[0][0]).toBe(
      fieldPhotoPreviewPath(projectId, uploadId, result.sha256),
    );
    expect(f.stored.mock.calls[0][1]).not.toEqual(jpeg);
    expect(f.stored.mock.calls[0][2]).toEqual({ contentType: "image/jpeg", upsert: false });
    expect(f.fetcher.mock.calls[0][1]).toMatchObject({ redirect: "manual", cache: "no-store" });
  });
  it("refuses changed source bytes before decoding or writing a preview", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValue(new Response("tampered"));
    await expect(
      makeFieldPhotoPreview(f.client, f.images, upload, "https://synthetic.supabase.co", f.fetcher),
    ).rejects.toMatchObject({ code: "source_changed" });
    expect(f.images.input).not.toHaveBeenCalled();
    expect(f.stored).not.toHaveBeenCalled();
  });
  it.each([
    ["image/tiff", 8, "unsupported_format"],
    ["image/jpeg", 20_000_001, "source_too_large"],
  ])("preserves unsupported originals: %s", async (mime, size, code) => {
    const f = fixture();
    await expect(
      makeFieldPhotoPreview(
        f.client,
        f.images,
        {
          ...upload,
          payload: { ...upload.payload, mimeType: String(mime), sizeBytes: Number(size) },
        },
        "https://synthetic.supabase.co",
        f.fetcher,
      ),
    ).rejects.toMatchObject({ code });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.stored).not.toHaveBeenCalled();
  });
  it("does not register malformed output as an image", async () => {
    const f = fixture();
    f.images.input.mockReturnValue({
      transform: () => ({ output: async () => ({ response: () => new Response("not a jpeg") }) }),
    });
    await expect(
      makeFieldPhotoPreview(f.client, f.images, upload, "https://synthetic.supabase.co", f.fetcher),
    ).rejects.toThrow();
    expect(f.stored).not.toHaveBeenCalled();
  });
  it("recovers an already-written derivative only after comparing its actual bytes", async () => {
    const f = fixture();
    const first = await makeFieldPhotoPreview(
      f.client,
      f.images,
      upload,
      "https://synthetic.supabase.co",
      f.fetcher,
    );
    const bytes = f.stored.mock.calls[0][1];
    f.stored.mockResolvedValue({ error: { statusCode: "409" } });
    f.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    f.fetcher.mockResolvedValue(new Response("original"));
    expect(
      await makeFieldPhotoPreview(
        f.client,
        f.images,
        upload,
        "https://synthetic.supabase.co",
        f.fetcher,
      ),
    ).toEqual(first);
    f.download.mockResolvedValue({ data: new Blob(["different"]), error: null });
    f.fetcher.mockResolvedValue(new Response("original"));
    await expect(
      makeFieldPhotoPreview(f.client, f.images, upload, "https://synthetic.supabase.co", f.fetcher),
    ).rejects.toMatchObject({ code: "source_changed" });
  });
});
describe("bounded background processing", () => {
  function queue(stage = "preview") {
    const f = fixture(),
      claims = [{ upload, job: { ...job, stage }, receipt: stage === "preview" ? receipt : null }];
    f.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
      if (name === "claim_field_photo_background")
        return { data: claims.shift() ?? null, error: null };
      if (name === "prepare_field_photo_verification")
        return { data: { upload, receipt: null, leaseId }, error: null };
      if (name === "complete_field_photo_verification") return { data: [receipt], error: null };
      if (name === "complete_field_photo_preview")
        return {
          data: [
            {
              upload_id: uploadId,
              project_id: projectId,
              recipe: "preview-jpeg1536-v1",
              source_sha256: sha,
              sha256: args.p_sha256,
              size_bytes: 24,
              width: 3,
              height: 2,
              storage_path: fieldPhotoPreviewPath(projectId, uploadId, String(args.p_sha256)),
              object_id: received.object_id,
              object_version: "v1",
              object_updated_at: received.object_updated_at,
              created_at: received.created_at,
              created_by: actorId,
            },
          ],
          error: null,
        };
      return { data: null, error: null };
    });
    return { ...f, claims };
  }
  it("persists a successful byte receipt before advancing to the preview phase", async () => {
    const f = queue("verify"),
      hash = vi.fn().mockResolvedValue({ sha256: sha, sizeBytes: 8 });
    expect(
      await runFieldPhotoBackground(f.client, f.images, "https://synthetic.supabase.co", { hash }),
    ).toMatchObject({ verified: 1, previews: 0, failed: 0 });
    expect(f.rpc).toHaveBeenCalledWith("advance_field_photo_background", {
      p_upload_id: uploadId,
      p_lease_id: leaseId,
    });
  });
  it("records preview completion only after its actual source and derivative hashes are bound", async () => {
    const f = queue(),
      preview = vi
        .fn()
        .mockResolvedValue({ sha256: "b".repeat(64), sizeBytes: 24, width: 3, height: 2 });
    expect(
      await runFieldPhotoBackground(f.client, f.images, "https://synthetic.supabase.co", {
        preview,
        verifyPreview: async () => ({
          object_id: received.object_id!,
          object_version: "v1",
          object_updated_at: received.object_updated_at!,
          storage_path: "unused",
        }),
      }),
    ).toMatchObject({ previews: 1, failed: 0 });
  });
  it("records a failure and continues to the next unrelated job", async () => {
    const f = queue();
    f.claims.push(f.claims[0]);
    const preview = vi
      .fn()
      .mockRejectedValueOnce(new Error("decoder unavailable"))
      .mockResolvedValue({ sha256: "b".repeat(64), sizeBytes: 24, width: 3, height: 2 });
    expect(
      await runFieldPhotoBackground(f.client, f.images, "https://synthetic.supabase.co", {
        preview,
        verifyPreview: async () => ({
          object_id: received.object_id!,
          object_version: "v1",
          object_updated_at: received.object_updated_at!,
          storage_path: "unused",
        }),
      }),
    ).toMatchObject({ claimed: 2, previews: 1, failed: 1 });
    expect(f.rpc).toHaveBeenCalledWith(
      "fail_field_photo_background",
      expect.objectContaining({ p_error: "processing_failed", p_lease_id: leaseId }),
    );
  });
  it("bounds every tick to four claims", async () => {
    const f = queue();
    while (f.claims.length < 5) f.claims.push(f.claims[0]);
    const preview = vi
      .fn()
      .mockResolvedValue({ sha256: "b".repeat(64), sizeBytes: 24, width: 3, height: 2 });
    expect(
      (
        await runFieldPhotoBackground(f.client, f.images, "https://synthetic.supabase.co", {
          preview,
          verifyPreview: async () => ({
            object_id: received.object_id!,
            object_version: "v1",
            object_updated_at: received.object_updated_at!,
            storage_path: "unused",
          }),
        })
      ).claimed,
    ).toBe(4);
    expect(f.claims).toHaveLength(1);
  });
  it("has no public processing route and does no work while disabled", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.scheduled(
      {} as ScheduledController,
      { FIELD_PHOTO_PROCESSING_ENABLED: "false" } as FieldPhotoWorkerEnv,
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"enabled":false'));
    log.mockRestore();
    expect(worker.fetch().status).toBe(404);
  });
});
