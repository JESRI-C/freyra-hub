import { z } from "zod";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  MunicipalReportManifestSchema,
  MUNICIPAL_REPORT_GENERATOR,
  MUNICIPAL_REPORT_GENERATOR_V2,
  MUNICIPAL_REPORT_GENERATOR_V3,
  type MunicipalReportGenerator,
  municipalReportCanonicalText,
  type MunicipalReportManifest,
} from "./municipal-report";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Timestamp = z.string().datetime({ offset: true });

/** The caller selects one saved round. Content and source pins are server derived. */
export const SaveMunicipalReportInputSchema = z
  .object({ projectId: Uuid, roundVersionId: Uuid, requestId: Uuid })
  .strict();
export type SaveMunicipalReportInput = z.infer<typeof SaveMunicipalReportInputSchema>;
export const GetMunicipalReportInputSchema = z
  .object({ projectId: Uuid, reportVersionId: Uuid })
  .strict();
export const ListMunicipalReportsInputSchema = z
  .object({
    projectId: Uuid,
    roundVersionId: Uuid.optional(),
    beforeVersion: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(30).default(30),
  })
  .strict();
export type ListMunicipalReportsInput = z.input<typeof ListMunicipalReportsInputSchema>;

const SummaryRowSchema = z.object({
  id: Uuid,
  project_id: Uuid,
  version_no: z.number().int().positive(),
  baseline_id: Uuid,
  baseline_sha256: Hash,
  plan_id: Uuid,
  plan_sha256: Hash,
  round_version_id: Uuid,
  round_sha256: Hash,
  generator_version: z.enum([
    MUNICIPAL_REPORT_GENERATOR,
    MUNICIPAL_REPORT_GENERATOR_V2,
    MUNICIPAL_REPORT_GENERATOR_V3,
  ]),
  status: z.literal("draft_unreviewed"),
  report_eligible: z.literal(false),
  professionally_reviewed: z.literal(false),
  municipal_scope_approved: z.literal(false),
  generated_at: Timestamp,
  manifest_sha256: Hash,
  created_at: Timestamp,
  created_by: Uuid,
  request_id: Uuid,
});

export const MUNICIPAL_REPORT_SUMMARY_SELECT = [
  "id",
  "project_id",
  "version_no",
  "baseline_id",
  "baseline_sha256",
  "plan_id",
  "plan_sha256",
  "round_version_id",
  "round_sha256",
  "generator_version",
  "status",
  "report_eligible",
  "professionally_reviewed",
  "municipal_scope_approved",
  "generated_at",
  "manifest_sha256",
  "created_at",
  "created_by",
  "request_id",
].join(",");
export const MUNICIPAL_REPORT_SELECT = MUNICIPAL_REPORT_SUMMARY_SELECT + ",manifest,manifest_text";

export interface MunicipalReportSummary {
  id: string;
  projectId: string;
  version: number;
  baselineId: string;
  baselineSha256: string;
  planId: string;
  planSha256: string;
  roundVersionId: string;
  roundSha256: string;
  generatorVersion: MunicipalReportGenerator;
  status: "draft_unreviewed";
  reportEligible: false;
  professionallyReviewed: false;
  municipalScopeApproved: false;
  generatedAt: string;
  manifestSha256: string;
  createdAt: string;
  createdBy: string;
  requestId: string;
}
export interface MunicipalReportVersion extends MunicipalReportSummary {
  manifest: MunicipalReportManifest;
}
export interface MunicipalReportPage {
  items: MunicipalReportSummary[];
  nextBeforeVersion: number | null;
}

export function municipalReportSummaryFromRow(value: unknown): MunicipalReportSummary {
  const row = SummaryRowSchema.parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version_no,
    baselineId: row.baseline_id,
    baselineSha256: row.baseline_sha256,
    planId: row.plan_id,
    planSha256: row.plan_sha256,
    roundVersionId: row.round_version_id,
    roundSha256: row.round_sha256,
    generatorVersion: row.generator_version,
    status: row.status,
    reportEligible: row.report_eligible,
    professionallyReviewed: row.professionally_reviewed,
    municipalScopeApproved: row.municipal_scope_approved,
    generatedAt: row.generated_at,
    manifestSha256: row.manifest_sha256,
    createdAt: row.created_at,
    createdBy: row.created_by,
    requestId: row.request_id,
  };
}

/** Only a first-call timestamp may differ between concurrent identical retries. */
export function municipalReportSameRequestContent(
  first: MunicipalReportManifest,
  second: MunicipalReportManifest,
): boolean {
  const { generatedAt: _firstTime, ...firstContent } = MunicipalReportManifestSchema.parse(first);
  const { generatedAt: _secondTime, ...secondContent } =
    MunicipalReportManifestSchema.parse(second);
  return canonicalBaselineJson(firstContent) === canonicalBaselineJson(secondContent);
}

/**
 * Replay a stored report without collection, current geometry or Storage signing.
 * The service-only writer checks all exact pins against authoritative DB rows.
 */
export async function municipalReportVersionFromRow(
  value: unknown,
): Promise<MunicipalReportVersion> {
  const row = SummaryRowSchema.extend({
    manifest: MunicipalReportManifestSchema,
    manifest_text: z.string(),
  }).parse(value);
  const manifest = row.manifest;
  if (
    manifest.projectId !== row.project_id ||
    manifest.generatorVersion !== row.generator_version ||
    manifest.status !== row.status ||
    manifest.reportEligible !== row.report_eligible ||
    manifest.professionallyReviewed !== row.professionally_reviewed ||
    manifest.municipalScopeApproved !== row.municipal_scope_approved ||
    manifest.pins.baseline.id !== row.baseline_id ||
    manifest.pins.baseline.sha256 !== row.baseline_sha256 ||
    manifest.pins.plan.id !== row.plan_id ||
    manifest.pins.plan.sha256 !== row.plan_sha256 ||
    manifest.pins.round.id !== row.round_version_id ||
    manifest.pins.round.sha256 !== row.round_sha256 ||
    Date.parse(manifest.generatedAt) !== Date.parse(row.generated_at) ||
    municipalReportCanonicalText(manifest) !== row.manifest_text ||
    (await baselineSha256(manifest)) !== row.manifest_sha256
  )
    throw new Error(
      "Den gemte rapportversion matcher ikke sine input, sit indhold eller checksum.",
    );
  return { ...municipalReportSummaryFromRow(row), manifest };
}
