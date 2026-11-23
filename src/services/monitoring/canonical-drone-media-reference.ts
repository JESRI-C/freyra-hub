import { z } from "zod";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Timestamp = z.string().datetime({ offset: true });
const Reference = z.object({
  id: Uuid,
  project_id: Uuid,
  source_upload_id: Uuid,
  original_role: z.literal("drone_original"),
  original_sha256: Hash,
  original_validation_sha256: Hash,
  original_validation_status: z.enum(["raw_original_validated", "review_required"]),
  storage_bucket: z.literal("monitoring-uploads"),
  file_path: z.string().min(1).max(1024),
  storage_object_id: Uuid,
  storage_object_version: z.string().nullable(),
  storage_object_updated_at: Timestamp,
  file_size_bytes: z
    .number()
    .int()
    .positive()
    .max(32 * 1024 * 1024),
  mime_type: z.literal("image/jpeg"),
  category: z.literal("drone_image"),
  source: z.literal("drone"),
  status: z.literal("uploaded"),
  is_report_ready: z.literal(false),
});
export type CanonicalDroneMediaReference = z.infer<typeof Reference>;

export function canonicalDroneMediaReference(
  raw: unknown,
  projectId: string,
  mediaId: string,
): CanonicalDroneMediaReference {
  const row = Reference.parse(raw);
  const parts = row.file_path.split("/");
  if (
    row.project_id !== projectId ||
    row.id !== mediaId ||
    parts.length !== 4 ||
    !Uuid.safeParse(parts[0]).success ||
    parts[1] !== "intents" ||
    parts[2] !== row.source_upload_id ||
    !/^[a-zA-Z0-9._-]+\.(jpg|jpeg)$/i.test(parts[3])
  )
    throw new Error("Det kanoniske medie matcher ikke projektets originale uploadreference.");
  return row;
}

export function validateCanonicalDroneMediaRead(
  raw: unknown,
  expected: CanonicalDroneMediaReference,
): void {
  const result = z
    .object({
      media: z.unknown(),
      upload: z.record(z.string(), z.unknown()),
      object: z.record(z.string(), z.unknown()),
    })
    .parse(raw);
  const media = canonicalDroneMediaReference(result.media, expected.project_id, expected.id);
  for (const key of Object.keys(expected) as (keyof CanonicalDroneMediaReference)[]) {
    if (media[key] !== expected[key])
      throw new Error("Det kanoniske medies originalreference er ændret.");
  }
  if (
    result.upload.id !== expected.source_upload_id ||
    result.upload.project_id !== expected.project_id ||
    result.upload.storage_path !== expected.file_path ||
    result.upload.original_sha256 !== expected.original_sha256 ||
    result.upload.original_validation_sha256 !== expected.original_validation_sha256 ||
    result.object.id !== expected.storage_object_id ||
    result.object.version !== expected.storage_object_version ||
    result.object.updated_at !== expected.storage_object_updated_at ||
    result.object.owner_id !== result.upload.uploaded_by ||
    result.object.size !== expected.file_size_bytes ||
    result.object.mimetype !== "image/jpeg"
  )
    throw new Error("Originalfilens aktuelle Storage-version matcher ikke den gemte reference.");
}
