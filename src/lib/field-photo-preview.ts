import { z } from "zod";
import { FieldPhotoUuid } from "./field-photo-upload";
export const FIELD_PREVIEW_RECIPE = "preview-jpeg1536-v1";
export const FieldPhotoPreviewSchema = z.object({
  upload_id: FieldPhotoUuid,
  project_id: FieldPhotoUuid,
  recipe: z.literal(FIELD_PREVIEW_RECIPE),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size_bytes: z.number().int().positive().max(2097152),
  width: z.number().int().positive().max(1536),
  height: z.number().int().positive().max(1536),
  storage_path: z.string(),
  object_id: FieldPhotoUuid,
  object_version: z.string().nullable(),
  object_updated_at: z.string(),
  created_at: z.string(),
  created_by: FieldPhotoUuid,
});
export const FieldPhotoBackgroundJobSchema = z.object({
  upload_id: FieldPhotoUuid,
  project_id: FieldPhotoUuid,
  stage: z.enum(["verify", "preview", "done"]),
  state: z.enum(["pending", "running", "retry_wait", "ready", "unsupported", "failed", "blocked"]),
  attempts: z.number().int().nonnegative(),
  lease_id: FieldPhotoUuid.nullable(),
  lease_until: z.string().nullable(),
  next_attempt_at: z.string(),
  updated_at: z.string(),
  last_error: z.string().nullable(),
});
export function fieldPhotoPreviewPath(projectId: string, uploadId: string, sha256: string) {
  return `${projectId}/field-previews/${uploadId}/${FIELD_PREVIEW_RECIPE}/${sha256}.jpg`;
}
export function parseFieldPhotoPreview(raw: unknown, projectId: string, uploadId: string) {
  const row = FieldPhotoPreviewSchema.parse(raw);
  if (
    row.project_id !== projectId ||
    row.upload_id !== uploadId ||
    row.storage_path !== fieldPhotoPreviewPath(projectId, uploadId, row.sha256)
  )
    throw new Error("Visningsbilledet matcher ikke projekt og original.");
  return row;
}
