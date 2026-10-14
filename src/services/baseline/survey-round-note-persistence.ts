import { z } from "zod";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  SURVEY_ROUND_MEDIA_SCHEMA,
  SURVEY_ROUND_MEDIA_BUILDER,
  type SurveyRoundMediaVersion,
} from "@/services/baseline/survey-round-media-persistence";
import {
  VERIFICATION_PLAN_GENERATOR_V1,
  VERIFICATION_PLAN_SCHEMA,
  type VerificationPlanVersion,
} from "@/services/baseline/verification-plan-persistence";

export const SURVEY_ROUND_NOTE_SCHEMA = "gofreyra.survey-round-note/v1" as const;
export const SURVEY_ROUND_NOTE_METHOD = "manual-photo-question-note/v1" as const;
export const MAX_SURVEY_ROUND_NOTE_BYTES = 16384;
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const safeText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(
      (s) =>
        s.trim().length > 0 &&
        [...s].every(
          (c) => c.codePointAt(0)! >= 32 && (c.codePointAt(0)! < 127 || c.codePointAt(0)! > 159),
        ),
      "Teksten skal indeholde indhold uden kontroltegn.",
    );
const Timestamp = z.string().datetime({ offset: true });
const savedText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) =>
      [...s].every(
        (c) => c.codePointAt(0)! >= 32 && (c.codePointAt(0)! < 127 || c.codePointAt(0)! > 159),
      ),
    );
export const ManualSurveyRoundNoteSchema = z
  .object({
    qualitativeAnswer: z.enum(["supports_reference", "does_not_support_reference", "inconclusive"]),
    manualStatement: safeText(2000),
    uncertainty: safeText(1000),
    proposedFollowup: safeText(1000),
    proposedPriority: z.enum(["not_assessed", "high", "normal", "low"]),
  })
  .strict();
export const SaveSurveyRoundNoteInputSchema = z
  .object({
    projectId: Uuid,
    logicalNoteId: Uuid,
    requestId: Uuid,
    mediaBindingId: Uuid,
    mediaBindingSha256: Hash,
    roundVersionId: Uuid,
    roundSha256: Hash,
    baselineId: Uuid,
    baselineSha256: Hash,
    planId: Uuid,
    planSha256: Hash,
    questionId: safeText(300),
    manual: ManualSurveyRoundNoteSchema.extend({
      proposedPriority: ManualSurveyRoundNoteSchema.shape.proposedPriority.default("not_assessed"),
    }).strict(),
  })
  .strict();
export type SaveSurveyRoundNoteInput = z.infer<typeof SaveSurveyRoundNoteInputSchema>;
export const GetSurveyRoundNoteInputSchema = z
  .object({ projectId: Uuid, noteVersionId: Uuid })
  .strict();
export const ListSurveyRoundNotesInputSchema = z
  .object({
    projectId: Uuid,
    roundVersionId: Uuid.optional(),
    mediaBindingId: Uuid.optional(),
    beforeVersion: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(30).default(30),
  })
  .strict();
export type ListSurveyRoundNotesInput = z.input<typeof ListSurveyRoundNotesInputSchema>;

// Only bounded saved capture/camera metadata is carried over. Camera position is
// context, never a location for the described object or proof of a viewed photo.
const SourceMetadata = z
  .object({
    source: z.literal("saved_original_validation"),
    capture: z
      .object({
        capturedAtUtc: Timestamp.nullable(),
        localTimestamp: savedText(80).nullable(),
        offset: savedText(16).nullable(),
        timezoneKnown: z.boolean(),
        source: z.enum(["exif-offset", "gps-utc", "xmp-offset"]).nullable(),
        relationToPlannedWindow: z.literal("not_verified"),
      })
      .strict(),
    cameraPosition: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        source: z.enum(["exif", "xmp"]),
        geometryRole: z.literal("camera_position_only"),
        objectGeometry: z.null(),
        footprint: z.null(),
      })
      .strict()
      .nullable(),
    jpegStructure: z
      .object({
        widthPx: z.number().int().min(1).max(65535),
        heightPx: z.number().int().min(1).max(65535),
      })
      .strict(),
  })
  .strict();
export const SurveyRoundNoteManifestSchema = SaveSurveyRoundNoteInputSchema.omit({
  requestId: true,
})
  .extend({
    schema: z.literal(SURVEY_ROUND_NOTE_SCHEMA),
    methodVersion: z.literal(SURVEY_ROUND_NOTE_METHOD),
    status: z.literal("draft_unreviewed"),
    noteVersion: z.literal(1),
    supersedesId: z.null(),
    questionKind: z.literal("official-reference-location/v1"),
    manual: ManualSurveyRoundNoteSchema,
    mediaId: Uuid,
    originalSha256: Hash,
    originalValidationSha256: Hash,
    sourceMetadata: SourceMetadata,
  })
  .strict();
export type SurveyRoundNoteManifest = z.infer<typeof SurveyRoundNoteManifestSchema>;
export function surveyRoundNoteCanonicalText(value: unknown): string {
  const text = canonicalBaselineJson(value);
  if (new TextEncoder().encode(text).byteLength > MAX_SURVEY_ROUND_NOTE_BYTES)
    throw new Error("Noten overskrider 16 KiB.");
  return text;
}
/** Inputs are replayed through existing immutable DB readers before this pure builder. */
export async function buildSurveyRoundNoteManifestV1(
  raw: SaveSurveyRoundNoteInput,
  binding: SurveyRoundMediaVersion,
  plan: VerificationPlanVersion,
): Promise<SurveyRoundNoteManifest> {
  const input = SaveSurveyRoundNoteInputSchema.parse(raw),
    m = binding.manifest;
  const question = plan.manifest.questions.find((q) => q.id === input.questionId);
  if (
    binding.id !== input.mediaBindingId ||
    binding.projectId !== input.projectId ||
    binding.manifestSha256 !== input.mediaBindingSha256 ||
    (await baselineSha256(m)) !== binding.manifestSha256 ||
    m.schema !== SURVEY_ROUND_MEDIA_SCHEMA ||
    m.builderVersion !== SURVEY_ROUND_MEDIA_BUILDER ||
    m.status !== "draft_assignment" ||
    m.projectId !== input.projectId ||
    binding.roundVersionId !== input.roundVersionId ||
    binding.mediaId !== m.mediaId ||
    m.roundVersionId !== input.roundVersionId ||
    m.roundSha256 !== input.roundSha256 ||
    m.baselineId !== input.baselineId ||
    m.baselineSha256 !== input.baselineSha256 ||
    m.planId !== input.planId ||
    m.planSha256 !== input.planSha256 ||
    !m.questionIds.includes(input.questionId) ||
    plan.id !== input.planId ||
    plan.projectId !== input.projectId ||
    plan.baselineId !== input.baselineId ||
    plan.baselineSha256 !== input.baselineSha256 ||
    plan.manifestSha256 !== input.planSha256 ||
    (await baselineSha256(plan.manifest)) !== plan.manifestSha256 ||
    plan.generatorVersion !== VERIFICATION_PLAN_GENERATOR_V1 ||
    plan.manifest.generatorVersion !== VERIFICATION_PLAN_GENERATOR_V1 ||
    plan.manifest.schema !== VERIFICATION_PLAN_SCHEMA ||
    plan.manifest.projectId !== input.projectId ||
    plan.manifest.snapshotId !== input.baselineId ||
    plan.manifest.snapshotSha256 !== input.baselineSha256 ||
    plan.status !== "draft" ||
    plan.manifest.status !== "draft" ||
    !question ||
    input.questionId !== `verification:${input.baselineId}:official-reference-location:v1` ||
    question.snapshotId !== input.baselineId ||
    question.snapshotSha256 !== input.baselineSha256 ||
    canonicalBaselineJson(question.sourceIds) !==
      canonicalBaselineJson(["official-watercourse-reference"]) ||
    question.result !== null
  )
    throw new Error(
      "Noten kræver den præcise gemte billedtilknytning og dens understøttede referencespørgsmål.",
    );
  const { requestId: _requestId, ...pins } = input;
  const manifest = SurveyRoundNoteManifestSchema.parse({
    ...pins,
    schema: SURVEY_ROUND_NOTE_SCHEMA,
    methodVersion: SURVEY_ROUND_NOTE_METHOD,
    status: "draft_unreviewed",
    noteVersion: 1,
    supersedesId: null,
    questionKind: "official-reference-location/v1",
    mediaId: m.mediaId,
    originalSha256: m.originalSha256,
    originalValidationSha256: m.originalValidationSha256,
    sourceMetadata: structuredClone(m.sourceMetadata),
  });
  surveyRoundNoteCanonicalText(manifest);
  return manifest;
}
const RowSchema = z.object({
  id: Uuid,
  project_id: Uuid,
  logical_note_id: Uuid,
  note_version_no: z.literal(1),
  supersedes_id: z.null(),
  version_no: z.number().int().positive(),
  media_binding_id: Uuid,
  media_binding_sha256: Hash,
  round_version_id: Uuid,
  round_sha256: Hash,
  baseline_id: Uuid,
  baseline_sha256: Hash,
  plan_id: Uuid,
  plan_sha256: Hash,
  media_id: Uuid,
  original_sha256: Hash,
  original_validation_sha256: Hash,
  question_id: safeText(300),
  method_version: z.literal(SURVEY_ROUND_NOTE_METHOD),
  status: z.literal("draft_unreviewed"),
  manifest_sha256: Hash,
  manifest: SurveyRoundNoteManifestSchema,
  created_at: Timestamp,
  created_by: Uuid,
  request_id: Uuid,
});
export interface SurveyRoundNoteVersion {
  id: string;
  projectId: string;
  logicalNoteId: string;
  noteVersion: 1;
  version: number;
  mediaBindingId: string;
  roundVersionId: string;
  manifestSha256: string;
  manifest: SurveyRoundNoteManifest;
  createdAt: string;
  createdBy: string;
  requestId: string;
}
export async function surveyRoundNoteVersionFromRow(
  value: unknown,
  binding: SurveyRoundMediaVersion,
  plan: VerificationPlanVersion,
): Promise<SurveyRoundNoteVersion> {
  const r = RowSchema.parse(value),
    m = r.manifest;
  const expected = await buildSurveyRoundNoteManifestV1(
    {
      projectId: r.project_id,
      logicalNoteId: r.logical_note_id,
      requestId: r.request_id,
      mediaBindingId: r.media_binding_id,
      mediaBindingSha256: r.media_binding_sha256,
      roundVersionId: r.round_version_id,
      roundSha256: r.round_sha256,
      baselineId: r.baseline_id,
      baselineSha256: r.baseline_sha256,
      planId: r.plan_id,
      planSha256: r.plan_sha256,
      questionId: r.question_id,
      manual: m.manual,
    },
    binding,
    plan,
  );
  if (
    r.media_id !== m.mediaId ||
    r.original_sha256 !== m.originalSha256 ||
    r.original_validation_sha256 !== m.originalValidationSha256 ||
    (await baselineSha256(m)) !== r.manifest_sha256 ||
    surveyRoundNoteCanonicalText(m) !== surveyRoundNoteCanonicalText(expected)
  )
    throw new Error("Den gemte notes indhold eller inputchecksum er ændret.");
  return {
    id: r.id,
    projectId: r.project_id,
    logicalNoteId: r.logical_note_id,
    noteVersion: 1,
    version: r.version_no,
    mediaBindingId: r.media_binding_id,
    roundVersionId: r.round_version_id,
    manifestSha256: r.manifest_sha256,
    manifest: m,
    createdAt: r.created_at,
    createdBy: r.created_by,
    requestId: r.request_id,
  };
}
