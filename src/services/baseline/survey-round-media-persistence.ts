import { z } from "zod";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  canonicalDroneMediaReference,
  type CanonicalDroneMediaReference,
} from "@/services/monitoring/canonical-drone-media-reference";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";

export const SURVEY_ROUND_MEDIA_SCHEMA = "gofreyra.survey-round-media/v1" as const;
export const SURVEY_ROUND_MEDIA_BUILDER = "gofreyra.survey-round-media-draft/v1" as const;
export const MAX_SURVEY_ROUND_MEDIA_BYTES = 32_768;
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Timestamp = z.string().datetime({ offset: true });
const Text = z
  .string()
  .refine((s) =>
    [...s].every(
      (c) => c.codePointAt(0)! >= 32 && (c.codePointAt(0)! < 127 || c.codePointAt(0)! > 159),
    ),
  );
const QuestionIds = z
  .array(Text.min(1).max(300))
  .min(1)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length);
export const SaveSurveyRoundMediaInputSchema = z
  .object({
    projectId: Uuid,
    roundVersionId: Uuid,
    roundSha256: Hash,
    baselineId: Uuid,
    baselineSha256: Hash,
    planId: Uuid,
    planSha256: Hash,
    mediaId: Uuid,
    requestId: Uuid,
    questionIds: QuestionIds,
  })
  .strict();
export type SaveSurveyRoundMediaInput = z.infer<typeof SaveSurveyRoundMediaInputSchema>;
export const GetSurveyRoundMediaInputSchema = z
  .object({ projectId: Uuid, bindingId: Uuid })
  .strict();
export const ListSurveyRoundMediaInputSchema = z
  .object({
    projectId: Uuid,
    roundVersionId: Uuid.optional(),
    mediaId: Uuid.optional(),
    beforeVersion: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(30).default(30),
  })
  .strict();
export type ListSurveyRoundMediaInput = z.input<typeof ListSurveyRoundMediaInputSchema>;
const SourceMetadataSchema = z
  .object({
    source: z.literal("saved_original_validation"),
    capture: z
      .object({
        capturedAtUtc: Timestamp.nullable(),
        localTimestamp: Text.max(80).nullable(),
        offset: Text.max(16).nullable(),
        timezoneKnown: z.boolean(),
        source: z.enum(["exif-offset", "gps-utc", "xmp-offset"]).nullable(),
        relationToPlannedWindow: z.literal("not_verified"),
      })
      .strict(),
    cameraPosition: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        source: z.enum(["exif", "xmp"]),
        geometryRole: z.literal("camera_position_only"),
        objectGeometry: z.null(),
        footprint: z.null(),
      })
      .strict()
      .nullable(),
    jpegStructure: z
      .object({
        widthPx: z.number().int().positive().max(65535),
        heightPx: z.number().int().positive().max(65535),
      })
      .strict(),
  })
  .strict();
const SourceValidation = z.object({
  schema: z.literal("gofreyra.drone-original-validation/v1"),
  validatorVersion: z.literal("jpeg-structure-exifr/v1"),
  projectId: Uuid,
  uploadId: Uuid,
  original: z.object({
    sha256: Hash,
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(32 * 1024 * 1024),
    mimeType: z.literal("image/jpeg"),
    storagePath: z.string(),
    object: z.object({
      id: Uuid,
      version: z.string().nullable(),
      updated_at: Timestamp,
    }),
  }),
  status: z.enum(["raw_original_validated", "review_required"]),
  metadata: z
    .object({
      capture: z.object({
        capturedAtUtc: Timestamp.optional(),
        localTimestamp: Text.max(80).optional(),
        offset: Text.max(16).optional(),
        timezoneKnown: z.boolean(),
        source: z.enum(["exif-offset", "gps-utc", "xmp-offset"]).optional(),
      }),
      position: z
        .object({
          latitude: z.number().finite().min(-90).max(90),
          longitude: z.number().finite().min(-180).max(180),
          source: z.enum(["exif", "xmp"]),
        })
        .optional(),
    })
    .nullable(),
  jpegStructure: z.object({
    widthPx: z.number().int().positive().max(65535),
    heightPx: z.number().int().positive().max(65535),
  }),
  pixelDecoded: z.literal(false),
  georeferenced: z.literal(false),
  reportEligible: z.literal(false),
});
const Acceptance = z
  .object({
    municipalScopeApproved: z.literal(false),
    professionalApproved: z.literal(false),
    pixelDecoded: z.literal(false),
    georeferenced: z.literal(false),
    reportEligible: z.literal(false),
    reportAccepted: z.literal(false),
  })
  .strict();
const ManifestSchema = z
  .object({
    schema: z.literal(SURVEY_ROUND_MEDIA_SCHEMA),
    builderVersion: z.literal(SURVEY_ROUND_MEDIA_BUILDER),
    status: z.literal("draft_assignment"),
    projectId: Uuid,
    roundVersionId: Uuid,
    roundSha256: Hash,
    baselineId: Uuid,
    baselineSha256: Hash,
    planId: Uuid,
    planSha256: Hash,
    mediaId: Uuid,
    originalRole: z.literal("drone_original"),
    originalSha256: Hash,
    originalValidationSha256: Hash,
    originalValidationStatus: z.enum(["raw_original_validated", "review_required"]),
    sourceUploadId: Uuid,
    storage: z
      .object({
        bucket: z.literal("monitoring-uploads"),
        objectId: Uuid,
        objectVersion: Text.max(256).nullable(),
        objectUpdatedAt: Timestamp,
      })
      .strict(),
    questionIds: QuestionIds,
    sourceMetadata: SourceMetadataSchema,
    acceptance: Acceptance,
  })
  .strict();
export type SurveyRoundMediaManifest = z.infer<typeof ManifestSchema>;
export function surveyRoundMediaCanonicalText(value: unknown): string {
  const text = canonicalBaselineJson(value);
  if (new TextEncoder().encode(text).byteLength > MAX_SURVEY_ROUND_MEDIA_BYTES)
    throw new Error("Billedtilknytningen overskrider 32 KiB.");
  return text;
}

/** The full saved validation is hashed before projecting a bounded metadata subset. */
export async function buildSurveyRoundMediaManifestV1(
  raw: SaveSurveyRoundMediaInput,
  round: SurveyRoundVersion,
  mediaValue: CanonicalDroneMediaReference,
  savedValidation: unknown,
): Promise<SurveyRoundMediaManifest> {
  const input = SaveSurveyRoundMediaInputSchema.parse(raw);
  const media = canonicalDroneMediaReference(mediaValue, input.projectId, input.mediaId);
  const validation = SourceValidation.parse(savedValidation);
  if (
    new TextEncoder().encode(canonicalBaselineJson(savedValidation)).byteLength > 1024 * 1024 ||
    (await baselineSha256(savedValidation)) !== media.original_validation_sha256
  )
    throw new Error("Originalvalideringens checksum er ugyldig.");
  if (
    round.id !== input.roundVersionId ||
    round.projectId !== input.projectId ||
    round.manifestSha256 !== input.roundSha256 ||
    (await baselineSha256(round.manifest)) !== round.manifestSha256 ||
    round.baselineId !== input.baselineId ||
    round.baselineSha256 !== input.baselineSha256 ||
    round.planId !== input.planId ||
    round.planSha256 !== input.planSha256 ||
    round.status !== "draft" ||
    input.questionIds.some((id) => !round.manifest.questionIds.includes(id))
  )
    throw new Error("Vælg den præcise gemte runde og dens valgte spørgsmål i denne sag.");
  if (
    validation.projectId !== input.projectId ||
    validation.uploadId !== media.source_upload_id ||
    validation.status !== media.original_validation_status ||
    validation.original.sha256 !== media.original_sha256 ||
    validation.original.sizeBytes !== media.file_size_bytes ||
    validation.original.storagePath !== media.file_path ||
    validation.original.object.id !== media.storage_object_id ||
    validation.original.object.version !== media.storage_object_version ||
    validation.original.object.updated_at !== media.storage_object_updated_at
  )
    throw new Error("Originalens gemte identitet og serverkontrol matcher ikke.");
  const capture = validation.metadata?.capture;
  if (
    (capture?.timezoneKnown && (!capture.capturedAtUtc || !capture.source)) ||
    (!capture?.timezoneKnown && (capture?.capturedAtUtc || capture?.source || capture?.offset))
  )
    throw new Error("Optagetidens tidszone og kilde er ikke entydigt dokumenteret.");
  const position = validation.metadata?.position;
  const manifest: SurveyRoundMediaManifest = {
    schema: SURVEY_ROUND_MEDIA_SCHEMA,
    builderVersion: SURVEY_ROUND_MEDIA_BUILDER,
    status: "draft_assignment",
    projectId: input.projectId,
    roundVersionId: input.roundVersionId,
    roundSha256: input.roundSha256,
    baselineId: input.baselineId,
    baselineSha256: input.baselineSha256,
    planId: input.planId,
    planSha256: input.planSha256,
    mediaId: media.id,
    originalRole: "drone_original",
    originalSha256: media.original_sha256,
    originalValidationSha256: media.original_validation_sha256,
    originalValidationStatus: media.original_validation_status,
    sourceUploadId: media.source_upload_id,
    storage: {
      bucket: "monitoring-uploads",
      objectId: media.storage_object_id,
      objectVersion: media.storage_object_version,
      objectUpdatedAt: media.storage_object_updated_at,
    },
    questionIds: [...input.questionIds].sort(),
    sourceMetadata: {
      source: "saved_original_validation",
      capture: {
        capturedAtUtc: capture?.capturedAtUtc ?? null,
        localTimestamp: capture?.localTimestamp ?? null,
        offset: capture?.offset ?? null,
        timezoneKnown: capture?.timezoneKnown ?? false,
        source: capture?.source ?? null,
        relationToPlannedWindow: "not_verified",
      },
      cameraPosition: position
        ? {
            latitude: position.latitude,
            longitude: position.longitude,
            source: position.source,
            geometryRole: "camera_position_only",
            objectGeometry: null,
            footprint: null,
          }
        : null,
      jpegStructure: {
        widthPx: validation.jpegStructure.widthPx,
        heightPx: validation.jpegStructure.heightPx,
      },
    },
    acceptance: {
      municipalScopeApproved: false,
      professionalApproved: false,
      pixelDecoded: false,
      georeferenced: false,
      reportEligible: false,
      reportAccepted: false,
    },
  };
  ManifestSchema.parse(manifest);
  surveyRoundMediaCanonicalText(manifest);
  return manifest;
}
const RowSchema = z.object({
  id: Uuid,
  project_id: Uuid,
  version_no: z.number().int().positive(),
  round_version_id: Uuid,
  round_sha256: Hash,
  baseline_id: Uuid,
  baseline_sha256: Hash,
  plan_id: Uuid,
  plan_sha256: Hash,
  media_id: Uuid,
  original_sha256: Hash,
  original_validation_sha256: Hash,
  storage_object_id: Uuid,
  storage_object_version: z.string().nullable(),
  storage_object_updated_at: Timestamp,
  builder_version: z.literal(SURVEY_ROUND_MEDIA_BUILDER),
  status: z.literal("draft_assignment"),
  manifest_sha256: Hash,
  manifest: z.unknown(),
  created_at: Timestamp,
  created_by: Uuid,
  request_id: Uuid,
});
export interface SurveyRoundMediaVersion {
  id: string;
  projectId: string;
  version: number;
  roundVersionId: string;
  mediaId: string;
  manifestSha256: string;
  manifest: SurveyRoundMediaManifest;
  createdAt: string;
  createdBy: string;
  requestId: string;
}
/** Historical replay uses immutable DB inputs. Current Storage availability is a separate read. */
export async function surveyRoundMediaVersionFromRow(
  value: unknown,
  round: SurveyRoundVersion,
  media: CanonicalDroneMediaReference,
  validation: unknown,
): Promise<SurveyRoundMediaVersion> {
  const row = RowSchema.parse(value);
  const manifest = ManifestSchema.parse(row.manifest);
  const expected = await buildSurveyRoundMediaManifestV1(
    {
      projectId: row.project_id,
      roundVersionId: row.round_version_id,
      roundSha256: row.round_sha256,
      baselineId: row.baseline_id,
      baselineSha256: row.baseline_sha256,
      planId: row.plan_id,
      planSha256: row.plan_sha256,
      mediaId: row.media_id,
      requestId: row.request_id,
      questionIds: manifest.questionIds,
    },
    round,
    media,
    validation,
  );
  if (
    row.original_sha256 !== manifest.originalSha256 ||
    row.original_validation_sha256 !== manifest.originalValidationSha256 ||
    row.storage_object_id !== manifest.storage.objectId ||
    row.storage_object_version !== manifest.storage.objectVersion ||
    row.storage_object_updated_at !== manifest.storage.objectUpdatedAt ||
    (await baselineSha256(manifest)) !== row.manifest_sha256 ||
    surveyRoundMediaCanonicalText(manifest) !== surveyRoundMediaCanonicalText(expected)
  )
    throw new Error(
      "Den gemte billedtilknytning matcher ikke sine originale input eller checksum.",
    );
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version_no,
    roundVersionId: row.round_version_id,
    mediaId: row.media_id,
    manifestSha256: row.manifest_sha256,
    manifest,
    createdAt: row.created_at,
    createdBy: row.created_by,
    requestId: row.request_id,
  };
}
