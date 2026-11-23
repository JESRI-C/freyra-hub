import { z } from "zod";
import { requireVerifiedInputContext, type VerifiedInputContext } from "./verified-input-context";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import {
  buildVerificationPlanManifest,
  validateVerificationBaseline,
  verificationPlanCanonicalText,
  verificationPlanVersionFromRow,
  VERIFICATION_PLAN_GENERATOR_V1,
  VERIFICATION_PLAN_SCHEMA,
  type VerificationPlanVersion,
} from "@/services/baseline/verification-plan-persistence";

export const SURVEY_ROUND_SCHEMA = "gofreyra.survey-round/v1" as const;
/** The saved builder remains frozen; a future interpretation requires a new version. */
export const SURVEY_ROUND_BUILDER_V1 = "gofreyra.survey-round-draft/v1" as const;
export const MAX_SURVEY_ROUND_BYTES = 65_536;
export const MAX_SURVEY_ROUND_QUESTIONS = 50;

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const SafeText = z.string().refine((value) =>
  [...value].every((character) => {
    const point = character.codePointAt(0)!;
    return point >= 0x20 && (point < 0x7f || point > 0x9f);
  }),
);
const QuestionId = SafeText.min(1).max(300);
export const SurveyRoundKind = z.enum(["before", "after", "control"]);
const DateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      value >= "0001-01-01" &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Registreringsperioden kræver en faktisk kalenderdato.");
const DateWindow = z
  .object({
    dateFrom: DateText,
    dateTo: DateText,
  })
  .strict()
  .refine(
    (window) => window.dateFrom <= window.dateTo,
    "Periodens slutdato ligger før startdatoen.",
  );
const Title = SafeText.min(1)
  .max(120)
  .refine(
    (value) => value.trim() === value && value.length > 0,
    "Titlen skal være udfyldt uden ydre mellemrum.",
  );
const SelectedQuestionIds = z
  .array(QuestionId)
  .min(1)
  .max(MAX_SURVEY_ROUND_QUESTIONS)
  .refine((ids) => new Set(ids).size === ids.length, "Et spørgsmål må kun vælges én gang.");

export const SaveSurveyRoundInputSchema = z
  .object({
    projectId: Uuid,
    baselineId: Uuid,
    baselineSha256: Hash,
    planId: Uuid,
    planSha256: Hash,
    requestId: Uuid,
    kind: SurveyRoundKind,
    title: Title,
    recordingWindow: DateWindow,
    questionIds: SelectedQuestionIds,
  })
  .strict();
export const GetSurveyRoundInputSchema = z
  .object({ projectId: Uuid, roundVersionId: Uuid })
  .strict();
export const ListSurveyRoundsInputSchema = z
  .object({
    projectId: Uuid,
    roundId: Uuid.optional(),
    baselineId: Uuid.optional(),
    planId: Uuid.optional(),
    beforeVersion: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(30).default(30),
  })
  .strict();
export type SaveSurveyRoundInput = z.infer<typeof SaveSurveyRoundInputSchema>;
export type ListSurveyRoundsInput = z.input<typeof ListSurveyRoundsInputSchema>;

const ManifestSchema = z
  .object({
    schema: z.literal(SURVEY_ROUND_SCHEMA),
    builderVersion: z.literal(SURVEY_ROUND_BUILDER_V1),
    status: z.literal("draft"),
    projectId: Uuid,
    baselineId: Uuid,
    baselineSha256: Hash,
    baselineSchema: z.enum(["gofreyra.public-baseline/v1", "gofreyra.public-baseline/v2"]),
    planId: Uuid,
    planSha256: Hash,
    planSchema: z.literal(VERIFICATION_PLAN_SCHEMA),
    planGeneratorVersion: z.literal(VERIFICATION_PLAN_GENERATOR_V1),
    kind: SurveyRoundKind,
    title: Title,
    recordingWindow: z
      .object({
        dateFrom: DateText,
        dateTo: DateText,
        timeZone: z.literal("Europe/Copenhagen"),
        datePrecision: z.literal("calendar_date"),
        actualCoverage: z.literal("not_verified"),
      })
      .strict()
      .refine((window) => window.dateFrom <= window.dateTo),
    questionIds: SelectedQuestionIds,
    acceptance: z
      .object({
        municipalScopeApproved: z.literal(false),
        professionalApproved: z.literal(false),
        reportAccepted: z.literal(false),
      })
      .strict(),
  })
  .strict();
export type SurveyRoundManifest = z.infer<typeof ManifestSchema>;

const SummaryRow = z.object({
  id: Uuid,
  round_id: Uuid,
  round_version_no: z.literal(1),
  supersedes_id: z.null(),
  project_id: Uuid,
  version_no: z.number().int().positive(),
  baseline_id: Uuid,
  baseline_sha256: Hash,
  plan_id: Uuid,
  plan_sha256: Hash,
  builder_version: z.literal(SURVEY_ROUND_BUILDER_V1),
  status: z.literal("draft"),
  kind: SurveyRoundKind,
  title: Title,
  recording_date_from: DateText,
  recording_date_to: DateText,
  manifest_sha256: Hash,
  created_at: z.string().datetime({ offset: true }),
  created_by: Uuid,
  request_id: Uuid,
});
export interface SurveyRoundSummary {
  /** Immutable version-row identity, used by future photo/report bindings. */
  id: string;
  /** Stable logical round identity; v1 supports its initial version only. */
  roundId: string;
  roundVersion: 1;
  supersedesId: null;
  projectId: string;
  version: number;
  baselineId: string;
  baselineSha256: string;
  planId: string;
  planSha256: string;
  builderVersion: typeof SURVEY_ROUND_BUILDER_V1;
  status: "draft";
  kind: z.infer<typeof SurveyRoundKind>;
  title: string;
  recordingWindow: { dateFrom: string; dateTo: string; timeZone: "Europe/Copenhagen" };
  manifestSha256: string;
  createdAt: string;
  createdBy: string;
  requestId: string;
}
export interface SurveyRoundVersion extends SurveyRoundSummary {
  manifest: SurveyRoundManifest;
}
export interface SurveyRoundPage {
  items: SurveyRoundSummary[];
  nextBeforeVersion: number | null;
}

export function surveyRoundCanonicalText(value: unknown): string {
  const canonical = canonicalBaselineJson(value);
  if (new TextEncoder().encode(canonical).byteLength > MAX_SURVEY_ROUND_BYTES)
    throw new Error("Registreringsrunden overskrider grænsen på 64 KiB.");
  return canonical;
}

/** Public input cannot replace a stored plan or its baseline with browser content. */
export async function buildSurveyRoundManifestV1(
  raw: SaveSurveyRoundInput,
  baseline: PublicBaselineSnapshot,
  plan: VerificationPlanVersion,
  context?: VerifiedInputContext,
): Promise<SurveyRoundManifest> {
  const input = SaveSurveyRoundInputSchema.parse(raw);
  if (context !== undefined) {
    const scope = requireVerifiedInputContext(context);
    baseline = await scope.verifyBaseline(baseline, input.projectId, input.baselineId);
    plan = await scope.verifyPlan(plan, baseline);
  }
  await validateVerificationBaseline(baseline, input.projectId, input.baselineId, context);
  const expectedPlan = await buildVerificationPlanManifest(
    baseline,
    plan.generatorVersion,
    context,
  );
  if (
    baseline.manifestSha256 !== input.baselineSha256 ||
    plan.id !== input.planId ||
    plan.projectId !== input.projectId ||
    plan.baselineId !== input.baselineId ||
    plan.baselineSha256 !== input.baselineSha256 ||
    plan.manifestSha256 !== input.planSha256 ||
    plan.status !== "draft" ||
    (context === undefined && (await baselineSha256(plan.manifest)) !== plan.manifestSha256) ||
    verificationPlanCanonicalText(plan.manifest) !== verificationPlanCanonicalText(expectedPlan)
  )
    throw new Error("Registreringsrunden kræver den præcise gemte plan og baseline i samme sag.");
  const availableQuestionIds = new Set(plan.manifest.questions.map((question) => question.id));
  if (input.questionIds.some((id) => !availableQuestionIds.has(id)))
    throw new Error("Vælg kun faktiske spørgsmål fra den gemte planversion.");
  const manifest: SurveyRoundManifest = {
    schema: SURVEY_ROUND_SCHEMA,
    builderVersion: SURVEY_ROUND_BUILDER_V1,
    status: "draft",
    projectId: input.projectId,
    baselineId: input.baselineId,
    baselineSha256: input.baselineSha256,
    baselineSchema: baseline.manifest.schema,
    planId: input.planId,
    planSha256: input.planSha256,
    planSchema: VERIFICATION_PLAN_SCHEMA,
    planGeneratorVersion: plan.generatorVersion,
    kind: input.kind,
    title: input.title,
    recordingWindow: {
      ...input.recordingWindow,
      timeZone: "Europe/Copenhagen",
      datePrecision: "calendar_date",
      actualCoverage: "not_verified",
    },
    questionIds: [...input.questionIds].sort(),
    acceptance: {
      municipalScopeApproved: false,
      professionalApproved: false,
      reportAccepted: false,
    },
  };
  ManifestSchema.parse(manifest);
  surveyRoundCanonicalText(manifest);
  return manifest;
}

export function surveyRoundSummaryFromRow(value: unknown): SurveyRoundSummary {
  const row = SummaryRow.parse(value);
  DateWindow.parse({ dateFrom: row.recording_date_from, dateTo: row.recording_date_to });
  return {
    id: row.id,
    roundId: row.round_id,
    roundVersion: row.round_version_no,
    supersedesId: row.supersedes_id,
    projectId: row.project_id,
    version: row.version_no,
    baselineId: row.baseline_id,
    baselineSha256: row.baseline_sha256,
    planId: row.plan_id,
    planSha256: row.plan_sha256,
    builderVersion: row.builder_version,
    status: row.status,
    kind: row.kind,
    title: row.title,
    recordingWindow: {
      dateFrom: row.recording_date_from,
      dateTo: row.recording_date_to,
      timeZone: "Europe/Copenhagen",
    },
    manifestSha256: row.manifest_sha256,
    createdAt: row.created_at,
    createdBy: row.created_by,
    requestId: row.request_id,
  };
}

/** Replay exact saved inputs and v1 builder; no upstream request or current geometry. */
export async function surveyRoundVersionFromRow(
  value: unknown,
  baseline: PublicBaselineSnapshot,
  planRow: unknown,
  context?: VerifiedInputContext,
): Promise<SurveyRoundVersion> {
  const row = SummaryRow.extend({ manifest: z.unknown() }).parse(value);
  const manifest = ManifestSchema.parse(row.manifest);
  if (context !== undefined)
    baseline = await requireVerifiedInputContext(context).verifyBaseline(
      baseline,
      baseline.projectId,
      baseline.id,
    );
  const plan = await verificationPlanVersionFromRow(planRow, baseline, context);
  const expected = await buildSurveyRoundManifestV1(
    {
      projectId: row.project_id,
      baselineId: row.baseline_id,
      baselineSha256: row.baseline_sha256,
      planId: row.plan_id,
      planSha256: row.plan_sha256,
      requestId: row.request_id,
      kind: row.kind,
      title: row.title,
      recordingWindow: { dateFrom: row.recording_date_from, dateTo: row.recording_date_to },
      questionIds: manifest.questionIds,
    },
    baseline,
    plan,
    context,
  );
  if (
    (await baselineSha256(manifest)) !== row.manifest_sha256 ||
    surveyRoundCanonicalText(manifest) !== surveyRoundCanonicalText(expected)
  )
    throw new Error("Den gemte registreringsrunde matcher ikke sin plan, baseline eller checksum.");
  return { ...surveyRoundSummaryFromRow(row), manifest };
}
