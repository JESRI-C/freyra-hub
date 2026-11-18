import { z } from "zod";
import {
  originalValidationSha256,
  parseStoredDroneOriginalValidation,
  type PreparedDroneOriginal,
} from "./drone-original-validation.server";
import {
  DRONE_ORIGINAL_PROMOTION_SCHEMA,
  type DroneOriginalPromotion,
  type DroneOriginalPromotionInput,
} from "./drone-original-promotion-types";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Timestamp = z.string().datetime({ offset: true });
const Status = z.enum(["raw_original_validated", "review_required"]);
const Media = z.object({
  id: Uuid,
  project_id: Uuid,
  source_upload_id: Uuid,
  original_role: z.literal("drone_original"),
  original_sha256: Hash,
  original_validation_sha256: Hash,
  original_validation_status: Status,
  storage_bucket: z.literal("monitoring-uploads"),
  file_path: z.string().min(1),
  storage_object_id: Uuid,
  storage_object_version: z.string().nullable(),
  storage_object_updated_at: Timestamp,
  promoted_at: Timestamp,
  promoted_by: Uuid,
  is_report_ready: z.literal(false),
  status: z.literal("uploaded"),
  category: z.literal("drone_image"),
  source: z.literal("drone"),
  mime_type: z.literal("image/jpeg"),
  file_size_bytes: z
    .number()
    .int()
    .positive()
    .max(32 * 1024 * 1024),
  url: z.literal(""),
  thumbnail_url: z.null(),
});
const Origin = z.object({
  id: Uuid,
  project_id: Uuid,
  media_id: Uuid,
  upload_id: Uuid,
  original_role: z.literal("drone_original"),
  original_sha256: Hash,
  original_validation_sha256: Hash,
  storage_bucket: z.literal("monitoring-uploads"),
  storage_path: z.string().min(1),
  object_id: Uuid,
  object_version: z.string().nullable(),
  object_updated_at: Timestamp,
  created_at: Timestamp,
  created_by: Uuid,
});
const Receipt = z.object({
  id: Uuid,
  project_id: Uuid,
  created_by: Uuid,
  request_id: Uuid,
  upload_id: Uuid,
  media_id: Uuid,
  origin_id: Uuid,
  created_at: Timestamp,
});

/** Revalidate H08's stored checksum and exact current object before promotion. */
export async function requirePromotableDroneOriginal(
  prepared: PreparedDroneOriginal,
): Promise<void> {
  if (!prepared.existing || !prepared.existingSha256)
    throw new Error(
      "Originalfilen skal serverkontrolleres, før den kan tilknyttes medieregisteret.",
    );
  const result = await parseStoredDroneOriginalValidation(
    prepared.existing,
    prepared.existingSha256,
    prepared.upload,
  );
  if (result.status === "rejected" || prepared.upload.status === "rejected")
    throw new Error("En afvist originalfil kan ikke tilknyttes som et brugbart aktiv.");
  if (
    (await originalValidationSha256(result.original.object)) !==
    (await originalValidationSha256(prepared.object))
  )
    throw new Error("Originalfilens aktuelle Storage-version matcher ikke serverkontrollen.");
}

/** Parse the persisted graph; a duplicate keeps its own upload/object origin. */
export function droneOriginalPromotionFromRow(
  raw: unknown,
  input: DroneOriginalPromotionInput,
  actorId: string,
  prepared: PreparedDroneOriginal,
): DroneOriginalPromotion {
  const parsed = z
    .object({ media: Media, origin: Origin, request: Receipt, deduplicated: z.boolean() })
    .parse(raw);
  const { media, origin, request } = parsed;
  const original = prepared.existing;
  if (
    !original ||
    media.project_id !== input.projectId ||
    media.original_sha256 !== original.original.sha256 ||
    origin.project_id !== input.projectId ||
    origin.media_id !== media.id ||
    origin.upload_id !== input.uploadId ||
    origin.original_sha256 !== original.original.sha256 ||
    origin.original_validation_sha256 !== prepared.existingSha256 ||
    origin.storage_path !== prepared.upload.storage_path ||
    origin.object_id !== prepared.object.id ||
    origin.object_version !== prepared.object.version ||
    origin.object_updated_at !== prepared.object.updated_at ||
    request.project_id !== input.projectId ||
    request.created_by !== actorId ||
    request.request_id !== input.requestId ||
    request.upload_id !== input.uploadId ||
    request.media_id !== media.id ||
    request.origin_id !== origin.id ||
    parsed.deduplicated !== (media.source_upload_id !== input.uploadId)
  )
    throw new Error("Databasen bekræftede ikke den ønskede originale fil og dubletproveniens.");
  if (
    !parsed.deduplicated &&
    (media.file_path !== origin.storage_path ||
      media.original_validation_sha256 !== origin.original_validation_sha256 ||
      media.original_validation_status !== original.status ||
      media.storage_object_id !== origin.object_id ||
      media.storage_object_version !== origin.object_version ||
      media.storage_object_updated_at !== origin.object_updated_at ||
      media.file_size_bytes !== prepared.upload.file_size)
  )
    throw new Error("Det kanoniske aktiv matcher ikke sin primære originalreference.");
  return {
    schema: DRONE_ORIGINAL_PROMOTION_SCHEMA,
    projectId: input.projectId,
    mediaId: media.id,
    uploadId: input.uploadId,
    originId: origin.id,
    requestId: input.requestId,
    receiptId: request.id,
    originalRole: "drone_original",
    originalSha256: origin.original_sha256,
    originalValidationSha256: origin.original_validation_sha256,
    originalValidationStatus: original.status as DroneOriginalPromotion["originalValidationStatus"],
    deduplicated: parsed.deduplicated,
    promotedAt: media.promoted_at,
    storage: {
      bucket: origin.storage_bucket,
      path: origin.storage_path,
      objectId: origin.object_id,
      objectVersion: origin.object_version,
      objectUpdatedAt: origin.object_updated_at,
    },
    pixelDecoded: false,
    georeferenced: false,
    reportEligible: false,
  };
}
