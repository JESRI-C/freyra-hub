import { z } from "zod";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  DroneImageInspectionDraftSchema,
  DRONE_IMAGE_INSPECTION_METHOD,
  DRONE_IMAGE_INSPECTION_PROMPT_VERSION,
  MAX_DRONE_IMAGE_INSPECTION_BYTES,
  type DroneImageInspectionDraft,
} from "./drone-image-inspection";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Timestamp = z.string().datetime({ offset: true });
export const DroneImageInspectionFailureSchema = z.enum([
  "provider_unavailable",
  "provider_error",
  "invalid_output",
  "image_error",
  "timeout",
]);
export type DroneImageInspectionFailure = z.infer<typeof DroneImageInspectionFailureSchema>;

// Lease ownership is never returned through authenticated table reads or UI DTOs.
export const DRONE_IMAGE_INSPECTION_SELECT = [
  "id",
  "project_id",
  "media_id",
  "created_by",
  "request_id",
  "provider",
  "model_id",
  "prompt_version",
  "method_version",
  "original_sha256",
  "original_validation_sha256",
  "storage_object_id",
  "storage_object_version",
  "storage_object_updated_at",
  "source_snapshot_id",
  "source_snapshot_sha256",
  "status",
  "attempt_count",
  "lease_expires_at",
  "result",
  "result_text",
  "result_sha256",
  "failure_code",
  "created_at",
  "updated_at",
  "completed_at",
].join(",");

const RowSchema = z
  .object({
    id: Uuid,
    project_id: Uuid,
    media_id: Uuid,
    created_by: Uuid,
    request_id: Uuid,
    provider: z.literal("cloudflare-workers-ai"),
    model_id: z.literal("@cf/qwen/qwen3.8-27b"),
    prompt_version: z.literal(DRONE_IMAGE_INSPECTION_PROMPT_VERSION),
    method_version: z.literal(DRONE_IMAGE_INSPECTION_METHOD),
    original_sha256: Hash,
    original_validation_sha256: Hash,
    storage_object_id: Uuid,
    storage_object_version: z.string().nullable(),
    storage_object_updated_at: Timestamp,
    source_snapshot_id: Uuid.nullable(),
    source_snapshot_sha256: Hash.nullable(),
    status: z.enum(["pending", "failed", "completed"]),
    attempt_count: z.number().int().min(1).max(3),
    lease_expires_at: Timestamp.nullable(),
    result: DroneImageInspectionDraftSchema.nullable(),
    result_text: z.string().max(MAX_DRONE_IMAGE_INSPECTION_BYTES).nullable(),
    result_sha256: Hash.nullable(),
    failure_code: DroneImageInspectionFailureSchema.nullable(),
    created_at: Timestamp,
    updated_at: Timestamp,
    completed_at: Timestamp.nullable(),
  })
  .strict();

export interface DroneImageInspectionRecord {
  id: string;
  projectId: string;
  mediaId: string;
  createdBy: string;
  requestId: string;
  provider: "cloudflare-workers-ai";
  modelId: "@cf/qwen/qwen3.8-27b";
  promptVersion: typeof DRONE_IMAGE_INSPECTION_PROMPT_VERSION;
  methodVersion: typeof DRONE_IMAGE_INSPECTION_METHOD;
  originalSha256: string;
  originalValidationSha256: string;
  storageObjectId: string;
  storageObjectVersion: string | null;
  storageObjectUpdatedAt: string;
  sourceSnapshotId: string | null;
  sourceSnapshotHash: string | null;
  status: "pending" | "failed" | "completed";
  attemptCount: number;
  leaseExpiresAt: string | null;
  result: DroneImageInspectionDraft | null;
  resultSha256: string | null;
  failureCode: DroneImageInspectionFailure | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export function droneImageInspectionCanonicalText(value: unknown): string {
  const draft = DroneImageInspectionDraftSchema.parse(value);
  const text = canonicalBaselineJson(draft);
  if (new TextEncoder().encode(text).byteLength > MAX_DRONE_IMAGE_INSPECTION_BYTES)
    throw new Error("Billedvurderingen overskrider den tilladte størrelse.");
  return text;
}
export const droneImageInspectionResultText = droneImageInspectionCanonicalText;

/** Replay every immutable result, including exact canonical bytes and pins. */
export async function droneImageInspectionFromRow(
  raw: unknown,
  projectId: string,
  mediaId?: string,
): Promise<DroneImageInspectionRecord> {
  const row = RowSchema.parse(raw);
  if (
    row.project_id !== projectId ||
    (mediaId !== undefined && row.media_id !== mediaId) ||
    (row.source_snapshot_id === null) !== (row.source_snapshot_sha256 === null)
  )
    throw new Error("Billedvurderingen matcher ikke projektets gemte input.");
  if (row.status === "completed") {
    if (
      !row.result ||
      row.result_text === null ||
      row.result_sha256 === null ||
      row.completed_at === null ||
      row.failure_code !== null ||
      row.lease_expires_at !== null
    )
      throw new Error("Den gemte billedvurdering er ufuldstændig.");
    const result = row.result,
      provenance = result.provenance;
    if (
      droneImageInspectionCanonicalText(result) !== row.result_text ||
      (await baselineSha256(result)) !== row.result_sha256 ||
      provenance.projectId !== row.project_id ||
      provenance.mediaId !== row.media_id ||
      provenance.requestId !== row.request_id ||
      provenance.originalSha256 !== row.original_sha256 ||
      provenance.originalValidationSha256 !== row.original_validation_sha256 ||
      provenance.provider !== row.provider ||
      provenance.model !== row.model_id ||
      provenance.promptVersion !== row.prompt_version ||
      result.methodVersion !== row.method_version ||
      (row.source_snapshot_id === null
        ? result.sourceContext !== null
        : result.sourceContext?.snapshotId !== row.source_snapshot_id ||
          result.sourceContext?.snapshotSha256 !== row.source_snapshot_sha256)
    )
      throw new Error(
        "Billedvurderingens indhold matcher ikke de gemte original- og kildehenvisninger.",
      );
  } else {
    if (
      row.result !== null ||
      row.result_text !== null ||
      row.result_sha256 !== null ||
      row.completed_at !== null ||
      (row.status === "pending"
        ? row.lease_expires_at === null || row.failure_code !== null
        : row.lease_expires_at !== null || row.failure_code === null)
    )
      throw new Error("Billedvurderingens arbejdsstatus er ugyldig.");
  }
  return {
    id: row.id,
    projectId: row.project_id,
    mediaId: row.media_id,
    createdBy: row.created_by,
    requestId: row.request_id,
    provider: row.provider,
    modelId: row.model_id,
    promptVersion: row.prompt_version,
    methodVersion: row.method_version,
    originalSha256: row.original_sha256,
    originalValidationSha256: row.original_validation_sha256,
    storageObjectId: row.storage_object_id,
    storageObjectVersion: row.storage_object_version,
    storageObjectUpdatedAt: row.storage_object_updated_at,
    sourceSnapshotId: row.source_snapshot_id,
    sourceSnapshotHash: row.source_snapshot_sha256,
    status: row.status,
    attemptCount: row.attempt_count,
    leaseExpiresAt: row.lease_expires_at,
    result: row.result,
    resultSha256: row.result_sha256,
    failureCode: row.failure_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function droneImageInspectionClaimFromRow(
  raw: unknown,
  projectId: string,
  mediaId: string,
): Promise<{
  state: "claimed" | "busy" | "completed";
  inspection: DroneImageInspectionRecord;
  claimToken: string | null;
}> {
  const claim = z
    .object({
      state: z.enum(["claimed", "busy", "completed"]),
      inspection: z.unknown(),
      claimToken: Uuid.nullable(),
    })
    .strict()
    .parse(raw);
  const inspection = await droneImageInspectionFromRow(claim.inspection, projectId, mediaId);
  if (
    (claim.state === "claimed"
      ? claim.claimToken === null || inspection.status !== "pending"
      : claim.claimToken !== null) ||
    (claim.state === "completed" && inspection.status !== "completed") ||
    (claim.state === "busy" && inspection.status !== "pending")
  )
    throw new Error("Billedvurderingens serverreservation er ugyldig.");
  return { ...claim, inspection };
}

const AnswerText = (max: number, required = true) =>
  z
    .string()
    .trim()
    .min(required ? 1 : 0)
    .max(max)
    .refine(
      (text) =>
        [...text].every((c) => {
          const p = c.codePointAt(0)!;
          return p === 10 || (p >= 32 && (p < 127 || p > 159));
        }),
      "Svaret må ikke indeholde kontroltegn.",
    );
export const DroneImageInspectionAnswerSchema = z
  .object({
    questionId: z
      .string()
      .regex(/^photo-followup:v1:[a-z_]+$/)
      .max(100),
    assessment: z.enum(["confirmed", "not_confirmed", "uncertain"]),
    note: AnswerText(2000),
    followup: AnswerText(1000, false).default(""),
  })
  .strict();
export const DroneImageInspectionAnswersSchema = z
  .array(DroneImageInspectionAnswerSchema)
  .min(1)
  .max(9)
  .refine(
    (answers) => new Set(answers.map((answer) => answer.questionId)).size === answers.length,
    "Hvert spørgsmål kan kun besvares én gang i samme version.",
  );
export type DroneImageInspectionAnswer = z.infer<typeof DroneImageInspectionAnswerSchema>;
export const SaveDroneImageInspectionAnswersInputSchema = z
  .object({
    projectId: Uuid,
    inspectionId: Uuid,
    inspectionResultSha256: Hash,
    requestId: Uuid,
    answers: DroneImageInspectionAnswersSchema,
  })
  .strict();
export type SaveDroneImageInspectionAnswersInput = z.input<
  typeof SaveDroneImageInspectionAnswersInputSchema
>;
export const DRONE_IMAGE_INSPECTION_ANSWERS_SELECT =
  "id,project_id,inspection_id,inspection_result_sha256,created_by,request_id,answers,answers_text,answers_sha256,status,professionally_reviewed,report_eligible,created_at";
const AnswersRow = z
  .object({
    id: Uuid,
    project_id: Uuid,
    inspection_id: Uuid,
    inspection_result_sha256: Hash,
    created_by: Uuid,
    request_id: Uuid,
    answers: DroneImageInspectionAnswersSchema,
    answers_text: z.string().max(32768),
    answers_sha256: Hash,
    status: z.literal("draft_unreviewed"),
    professionally_reviewed: z.literal(false),
    report_eligible: z.literal(false),
    created_at: Timestamp,
  })
  .strict();
export interface DroneImageInspectionAnswersRecord {
  id: string;
  projectId: string;
  inspectionId: string;
  inspectionResultSha256: string;
  createdBy: string;
  requestId: string;
  answers: DroneImageInspectionAnswer[];
  answersSha256: string;
  status: "draft_unreviewed";
  professionallyReviewed: false;
  reportEligible: false;
  createdAt: string;
}
export function droneImageInspectionAnswersCanonicalText(raw: unknown): string {
  const answers = DroneImageInspectionAnswersSchema.parse(raw),
    text = canonicalBaselineJson(answers);
  if (new TextEncoder().encode(text).byteLength > 32768)
    throw new Error("Svarene overskrider den tilladte størrelse.");
  return text;
}
export function validateDroneImageInspectionAnswerQuestions(
  answers: DroneImageInspectionAnswer[],
  inspection: DroneImageInspectionRecord,
): void {
  if (inspection.status !== "completed" || !inspection.result || !inspection.resultSha256)
    throw new Error("Svar kræver den præcise gemte billedvurdering.");
  const questionIds = new Set(inspection.result.followupQuestions.map((question) => question.id));
  if (answers.some((answer) => !questionIds.has(answer.questionId)))
    throw new Error("Svaret henviser ikke til et gemt billedspørgsmål.");
}
export async function droneImageInspectionAnswersFromRow(
  raw: unknown,
  projectId: string,
  inspection: DroneImageInspectionRecord,
): Promise<DroneImageInspectionAnswersRecord> {
  const row = AnswersRow.parse(raw);
  if (
    row.project_id !== projectId ||
    inspection.projectId !== projectId ||
    row.inspection_id !== inspection.id ||
    row.inspection_result_sha256 !== inspection.resultSha256 ||
    droneImageInspectionAnswersCanonicalText(row.answers) !== row.answers_text ||
    (await baselineSha256(row.answers)) !== row.answers_sha256
  )
    throw new Error("Svarversionen matcher ikke billedvurderingen og dens gemte indhold.");
  validateDroneImageInspectionAnswerQuestions(row.answers, inspection);
  return {
    id: row.id,
    projectId: row.project_id,
    inspectionId: row.inspection_id,
    inspectionResultSha256: row.inspection_result_sha256,
    createdBy: row.created_by,
    requestId: row.request_id,
    answers: row.answers,
    answersSha256: row.answers_sha256,
    status: row.status,
    professionallyReviewed: row.professionally_reviewed,
    reportEligible: row.report_eligible,
    createdAt: row.created_at,
  };
}
