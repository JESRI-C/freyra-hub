import { z } from "zod";
import { PhotoCaptureSchema } from "./field-photo-position";

export const FieldPhotoUuid = z
  .string()
  .uuid()
  .transform((s) => s.toLowerCase());
export const MAX_FIELD_PHOTO_BYTES = 50 * 1024 * 1024;
export const FieldPhotoUploadPayload = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(4000).nullable(),
    category: z.enum([
      "field_photo",
      "before_after",
      "document_scan",
      "biodiversity_observation",
      "water_observation",
      "soil_observation",
      "satellite_snapshot",
    ]),
    tags: z.array(z.string().max(80)).max(30),
    originalName: z.string().min(1).max(255),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive().max(MAX_FIELD_PHOTO_BYTES),
    mimeType: z.string().regex(/^image\/[a-zA-Z0-9.+-]+$/),
    capturedAt: z.string().datetime({ offset: true }).nullable(),
    capture: PhotoCaptureSchema,
  })
  .strict();
export const FieldPhotoUploadSchema = z.object({
  id: FieldPhotoUuid,
  project_id: FieldPhotoUuid,
  created_by: FieldPhotoUuid,
  created_at: z.string(),
  storage_path: z.string(),
  payload: FieldPhotoUploadPayload,
  received_at: z.string().nullable(),
  object_id: FieldPhotoUuid.nullable(),
  object_version: z.string().nullable(),
  object_updated_at: z.string().nullable(),
});
export type FieldPhotoUpload = z.infer<typeof FieldPhotoUploadSchema>;
export const FieldPhotoReceiptSchema = z.object({
  upload_id: FieldPhotoUuid,
  project_id: FieldPhotoUuid,
  object_id: FieldPhotoUuid,
  object_version: z.string().nullable(),
  object_updated_at: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size_bytes: z.number().int().positive().max(MAX_FIELD_PHOTO_BYTES),
  status: z.enum(["verified", "hash_mismatch"]),
  verified_by: FieldPhotoUuid,
  verified_at: z.string(),
  validator_version: z.literal("stream-sha256/v1"),
});
export type FieldPhotoReceipt = z.infer<typeof FieldPhotoReceiptSchema>;

export function parseFieldPhotoUpload(
  raw: unknown,
  projectId: string,
  uploadId: string,
): FieldPhotoUpload {
  const row = FieldPhotoUploadSchema.parse(raw);
  if (
    row.id !== uploadId ||
    row.project_id !== projectId ||
    row.storage_path !== `${projectId}/field-uploads/${uploadId}/original`
  )
    throw new Error("Uploadkvitteringen matcher ikke det valgte foto og projekt.");
  return row;
}
export function parseFieldPhotoReceipt(raw: unknown, upload: FieldPhotoUpload): FieldPhotoReceipt {
  const row = FieldPhotoReceiptSchema.parse(raw);
  if (
    !upload.received_at ||
    row.upload_id !== upload.id ||
    row.project_id !== upload.project_id ||
    row.object_id !== upload.object_id ||
    row.object_version !== upload.object_version ||
    row.object_updated_at !== upload.object_updated_at ||
    row.size_bytes !== upload.payload.sizeBytes ||
    (row.status === "verified") !== (row.sha256 === upload.payload.sha256)
  )
    throw new Error("Serverkontrollen matcher ikke den modtagne originalfil.");
  return row;
}
