/// <reference path="../../types/field-photo-worker.d.ts" />
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  parseFieldPhotoUpload,
  parseFieldPhotoReceipt,
  FieldPhotoUuid,
  type FieldPhotoUpload,
} from "@/lib/field-photo-upload";
import {
  FieldPhotoBackgroundJobSchema,
  parseFieldPhotoPreview,
  fieldPhotoPreviewPath,
} from "@/lib/field-photo-preview";
import {
  downloadAndHashFieldPhoto,
  type FieldPhotoStorageClient,
} from "../../src/services/field-photo-stream.server";
import { sanitizePreviewJpeg } from "@/lib/sanitized-jpeg";

export interface FieldPhotoWorkerClient extends FieldPhotoStorageClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  storage: {
    from(bucket: string): ReturnType<FieldPhotoStorageClient["storage"]["from"]> & {
      upload(
        path: string,
        bytes: Uint8Array,
        options: { contentType: string; upsert: false },
      ): Promise<{ error: { message?: string; statusCode?: string } | null }>;
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
}
type WorkErrorCode =
  | "processing_failed"
  | "unsupported_format"
  | "source_too_large"
  | "hash_mismatch"
  | "source_changed"
  | "access_revoked";
class WorkError extends Error {
  constructor(readonly code: WorkErrorCode) {
    super(code);
  }
}
export async function withFieldPhotoDeadline<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw new WorkError("processing_failed");
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new WorkError("processing_failed"));
    signal.addEventListener("abort", aborted, { once: true });
    void Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}
export async function readBoundedFieldPhoto(
  response: Response,
  limit: number,
  signal?: AbortSignal,
) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new WorkError("processing_failed");
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new WorkError("processing_failed");
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new WorkError("processing_failed");
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new WorkError("processing_failed");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
async function previewSource(
  client: FieldPhotoStorageClient,
  upload: FieldPhotoUpload,
  supabaseUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const signed = await client.storage
    .from("project-media")
    .createSignedUrl(upload.storage_path, 60);
  if (signed.error || !signed.data) throw new WorkError("processing_failed");
  const url = new URL(signed.data.signedUrl);
  if (
    url.origin !== new URL(supabaseUrl).origin ||
    url.pathname !==
      `/storage/v1/object/sign/project-media/${upload.storage_path.split("/").map(encodeURIComponent).join("/")}` ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("token")
  )
    throw new WorkError("source_changed");
  const bytes = await readBoundedFieldPhoto(
    await fetcher(url.toString(), { signal, redirect: "manual", cache: "no-store" }),
    20_000_000,
    signal,
  );
  if (
    bytes.length !== upload.payload.sizeBytes ||
    createHash("sha256").update(bytes).digest("hex") !== upload.payload.sha256
  )
    throw new WorkError("source_changed");
  return bytes;
}
export async function makeFieldPhotoPreview(
  client: FieldPhotoWorkerClient,
  images: Pick<ImagesBinding, "input">,
  upload: FieldPhotoUpload,
  supabaseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  if (upload.payload.sizeBytes > 20_000_000) throw new WorkError("source_too_large");
  if (
    !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"].includes(
      upload.payload.mimeType,
    )
  )
    throw new WorkError("unsupported_format");
  const signal = AbortSignal.timeout(60_000);
  const bytes = await previewSource(client, upload, supabaseUrl, signal, fetcher);
  let transformed: Response;
  try {
    transformed = (
      await withFieldPhotoDeadline(
        () =>
          images
            .input(new Blob([bytes.buffer as ArrayBuffer]).stream())
            .transform({ width: 1536, height: 1536, fit: "scale-down" })
            .output({ format: "image/jpeg", quality: 80, anim: false }),
        signal,
      )
    ).response();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      [9412, 9520].includes(Number(error.code))
    )
      throw new WorkError("unsupported_format");
    throw error;
  }
  const clean = sanitizePreviewJpeg(await readBoundedFieldPhoto(transformed, 2097152, signal));
  const sha256 = createHash("sha256").update(clean.bytes).digest("hex"),
    path = fieldPhotoPreviewPath(upload.project_id, upload.id, sha256);
  const stored = await client.storage
    .from("field-photo-previews")
    .upload(path, clean.bytes, { contentType: "image/jpeg", upsert: false });
  if (stored.error) {
    if (
      !["409", "400"].includes(String(stored.error.statusCode)) &&
      !/already exists|duplicate/i.test(stored.error.message ?? "")
    )
      throw new WorkError("processing_failed");
    const existing = await client.storage.from("field-photo-previews").download(path);
    if (
      existing.error ||
      !existing.data ||
      existing.data.size !== clean.bytes.length ||
      existing.data.size > 2097152 ||
      createHash("sha256")
        .update(new Uint8Array(await existing.data.arrayBuffer()))
        .digest("hex") !== sha256
    )
      throw new WorkError("source_changed");
  }
  return { sha256, sizeBytes: clean.bytes.length, width: clean.widthPx, height: clean.heightPx };
}

export async function verifyStoredFieldPhotoPreview(
  client: FieldPhotoWorkerClient,
  upload: FieldPhotoUpload,
  leaseId: string,
  preview: { sha256: string; sizeBytes: number },
  supabaseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  const prepared = await client.rpc("prepare_field_photo_preview_commit", {
    p_upload_id: upload.id,
    p_lease_id: leaseId,
    p_sha256: preview.sha256,
  });
  if (prepared.error)
    throw new WorkError(prepared.error.code === "42501" ? "access_revoked" : "source_changed");
  const binding = z
    .object({
      object_id: FieldPhotoUuid,
      object_version: z.string().nullable(),
      object_updated_at: z.string(),
      storage_path: z.string(),
    })
    .parse(prepared.data);
  if (binding.storage_path !== fieldPhotoPreviewPath(upload.project_id, upload.id, preview.sha256))
    throw new WorkError("source_changed");
  const signed = await client.storage
    .from("field-photo-previews")
    .createSignedUrl(binding.storage_path, 60);
  if (signed.error || !signed.data) throw new WorkError("processing_failed");
  const url = new URL(signed.data.signedUrl),
    expected = `/storage/v1/object/sign/field-photo-previews/${binding.storage_path.split("/").map(encodeURIComponent).join("/")}`;
  if (
    url.origin !== new URL(supabaseUrl).origin ||
    url.pathname !== expected ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("token")
  )
    throw new WorkError("source_changed");
  const signal = AbortSignal.timeout(20_000);
  const bytes = await readBoundedFieldPhoto(
    await fetcher(url.toString(), { signal, redirect: "manual", cache: "no-store" }),
    2097152,
    signal,
  );
  if (
    bytes.length !== preview.sizeBytes ||
    createHash("sha256").update(bytes).digest("hex") !== preview.sha256
  )
    throw new WorkError("source_changed");
  return binding;
}

/** At most four serial jobs per tick. No public HTTP processing endpoint. */
export async function runFieldPhotoBackground(
  client: FieldPhotoWorkerClient,
  images: Pick<ImagesBinding, "input">,
  supabaseUrl: string,
  overrides: {
    fetch?: typeof fetch;
    hash?: typeof downloadAndHashFieldPhoto;
    preview?: typeof makeFieldPhotoPreview;
    verifyPreview?: typeof verifyStoredFieldPhotoPreview;
  } = {},
) {
  const counts = { claimed: 0, verified: 0, previews: 0, failed: 0 };
  for (let i = 0; i < 4; i++) {
    const claimed = await client.rpc("claim_field_photo_background");
    if (claimed.error) throw new Error("Field photo job claim failed");
    if (!claimed.data) break;
    const raw = z
      .object({
        upload: z.unknown(),
        job: FieldPhotoBackgroundJobSchema,
        receipt: z.unknown().nullable(),
      })
      .parse(claimed.data);
    const job = raw.job,
      upload = parseFieldPhotoUpload(raw.upload, job.project_id, job.upload_id);
    if (!job.lease_id || job.state !== "running") throw new Error("Invalid background lease");
    counts.claimed++;
    try {
      if (job.stage === "verify") {
        const args = {
          p_project_id: upload.project_id,
          p_upload_id: upload.id,
          p_actor_id: upload.created_by,
        };
        const prepared = await client.rpc("prepare_field_photo_verification", args);
        if (prepared.error)
          throw new WorkError(
            prepared.error.code === "42501" ? "access_revoked" : "processing_failed",
          );
        const p = z
          .object({
            upload: z.unknown(),
            receipt: z.unknown().nullable(),
            leaseId: z.string().uuid().nullable(),
          })
          .parse(prepared.data);
        const preparedUpload = parseFieldPhotoUpload(p.upload, upload.project_id, upload.id);
        if (p.receipt) {
          if (parseFieldPhotoReceipt(p.receipt, preparedUpload).status !== "verified")
            throw new WorkError("hash_mismatch");
        } else {
          if (!p.leaseId) throw new WorkError("processing_failed");
          try {
            const hash = await (overrides.hash ?? downloadAndHashFieldPhoto)(
              client,
              preparedUpload,
              { supabaseUrl, fetch: overrides.fetch },
            );
            const result = await client.rpc("complete_field_photo_verification", {
              ...args,
              p_lease_id: p.leaseId,
              p_sha256: hash.sha256,
              p_size_bytes: hash.sizeBytes,
            });
            if (result.error || !Array.isArray(result.data) || result.data.length !== 1)
              throw new WorkError(
                result.error?.code === "42501" ? "access_revoked" : "source_changed",
              );
            if (parseFieldPhotoReceipt(result.data[0], preparedUpload).status !== "verified")
              throw new WorkError("hash_mismatch");
          } catch (error) {
            await client.rpc("release_field_photo_verification", {
              p_upload_id: upload.id,
              p_lease_id: p.leaseId,
              p_error: "verification_failed",
            });
            throw error;
          }
        }
        const advanced = await client.rpc("advance_field_photo_background", {
          p_upload_id: upload.id,
          p_lease_id: job.lease_id,
        });
        if (advanced.error)
          throw new WorkError(
            advanced.error.code === "42501" ? "access_revoked" : "processing_failed",
          );
        counts.verified++;
      } else if (job.stage === "preview") {
        if (parseFieldPhotoReceipt(raw.receipt, upload).status !== "verified")
          throw new WorkError("hash_mismatch");
        const preview = await (overrides.preview ?? makeFieldPhotoPreview)(
          client,
          images,
          upload,
          supabaseUrl,
          overrides.fetch,
        );
        const binding = await (overrides.verifyPreview ?? verifyStoredFieldPhotoPreview)(
          client,
          upload,
          job.lease_id,
          preview,
          supabaseUrl,
          overrides.fetch,
        );
        const completed = await client.rpc("complete_field_photo_preview", {
          p_upload_id: upload.id,
          p_lease_id: job.lease_id,
          p_sha256: preview.sha256,
          p_size_bytes: preview.sizeBytes,
          p_width: preview.width,
          p_height: preview.height,
          p_object_id: binding.object_id,
          p_object_version: binding.object_version,
          p_object_updated_at: binding.object_updated_at,
        });
        if (completed.error || !Array.isArray(completed.data) || completed.data.length !== 1)
          throw new WorkError(
            completed.error?.code === "42501" ? "access_revoked" : "processing_failed",
          );
        const record = parseFieldPhotoPreview(completed.data[0], upload.project_id, upload.id);
        if (record.sha256 !== preview.sha256 || record.source_sha256 !== upload.payload.sha256)
          throw new WorkError("source_changed");
        counts.previews++;
      } else throw new WorkError("processing_failed");
    } catch (error) {
      counts.failed++;
      const failed = await client.rpc("fail_field_photo_background", {
        p_upload_id: upload.id,
        p_lease_id: job.lease_id,
        p_error: error instanceof WorkError ? error.code : "processing_failed",
      });
      if (failed.error) throw new Error("Field photo failure could not be recorded");
    }
  }
  return counts;
}
