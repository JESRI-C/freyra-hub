import { z } from "zod";
import { requireVerifiedInputContext, type VerifiedInputContext } from "./verified-input-context";
import {
  baselineSha256,
  canonicalBaselineJson,
  validatePublicBaselineManifest,
} from "./public-baseline-service";
import type { PublicBaselineSnapshot } from "./public-baseline-types";
import { createDraftVerificationPlanV1, type DraftVerificationPlan } from "./verification-plan";

export const VERIFICATION_PLAN_SCHEMA = "gofreyra.verification-plan/v1" as const;
/** Changes to the v1 generator require a new version; stored plans retain v1. */
export const VERIFICATION_PLAN_GENERATOR_V1 = "gofreyra.reference-location-plan/v1" as const;
export const VERIFICATION_PLAN_GENERATOR = VERIFICATION_PLAN_GENERATOR_V1;
const SUPPORTED_PLAN_GENERATORS = [VERIFICATION_PLAN_GENERATOR_V1] as const;
export type VerificationPlanGenerator = (typeof SUPPORTED_PLAN_GENERATORS)[number];
export const MAX_VERIFICATION_PLAN_BYTES = 2 * 1024 * 1024;

export interface VerificationPlanManifest extends Omit<DraftVerificationPlan, "schema"> {
  schema: typeof VERIFICATION_PLAN_SCHEMA;
  generatorVersion: VerificationPlanGenerator;
  baselineSchema: PublicBaselineSnapshot["manifest"]["schema"];
}

export interface VerificationPlanSummary {
  id: string;
  projectId: string;
  version: number;
  baselineId: string;
  baselineSha256: string;
  generatorVersion: VerificationPlanGenerator;
  manifestSha256: string;
  createdAt: string;
  createdBy: string;
  requestId: string;
  status: "draft";
}

export interface VerificationPlanVersion extends VerificationPlanSummary {
  manifest: VerificationPlanManifest;
}

export interface SaveVerificationPlanInput {
  projectId: string;
  baselineId: string;
  requestId: string;
}

export interface ListVerificationPlansInput {
  projectId: string;
  baselineId?: string;
  beforeVersion?: number;
  limit?: number;
}

export interface VerificationPlanPage {
  items: VerificationPlanSummary[];
  nextBeforeVersion: number | null;
}

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const SummaryRow = z.object({
  id: Uuid,
  project_id: Uuid,
  version_no: z.number().int().positive(),
  baseline_id: Uuid,
  baseline_sha256: Hash,
  generator_version: z.enum(SUPPORTED_PLAN_GENERATORS),
  manifest_sha256: Hash,
  created_at: z.string().datetime({ offset: true }),
  created_by: Uuid,
  request_id: Uuid,
});
const ManifestShape = z
  .object({
    schema: z.literal(VERIFICATION_PLAN_SCHEMA),
    generatorVersion: z.enum(SUPPORTED_PLAN_GENERATORS),
    baselineSchema: z.enum(["gofreyra.public-baseline/v1", "gofreyra.public-baseline/v2"]),
    status: z.literal("draft"),
    projectId: Uuid,
    snapshotId: Uuid,
    snapshotSha256: Hash,
    // The v1 generator supports one conservative location question. Exact nested
    // contents are compared with the frozen generator below, without stripping keys.
    questions: z.array(z.unknown()).max(1),
    baselineDataGaps: z.array(z.unknown()),
    contextSourceIds: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export async function validateVerificationBaseline(
  snapshot: PublicBaselineSnapshot,
  projectId: string,
  baselineId: string,
  context?: VerifiedInputContext,
): Promise<void> {
  if (context !== undefined) {
    await requireVerifiedInputContext(context).verifyBaseline(snapshot, projectId, baselineId);
    return;
  }
  const manifest = await validatePublicBaselineManifest(snapshot.manifest);
  if (
    snapshot.id !== baselineId ||
    snapshot.projectId !== projectId ||
    manifest.project.id !== projectId ||
    (await baselineSha256(manifest)) !== snapshot.manifestSha256
  )
    throw new Error("Verifikationsplanen kræver den uændrede, gemte baseline i denne sag.");
}

function generateVersionedDraft(
  snapshot: PublicBaselineSnapshot,
  generatorVersion: VerificationPlanGenerator,
  context?: VerifiedInputContext,
) {
  switch (generatorVersion) {
    case VERIFICATION_PLAN_GENERATOR_V1:
      return createDraftVerificationPlanV1(snapshot, context);
    default:
      throw new Error("Planens gemte generatorversion understøttes ikke.");
  }
}

export async function buildVerificationPlanManifest(
  snapshot: PublicBaselineSnapshot,
  generatorVersion: VerificationPlanGenerator = VERIFICATION_PLAN_GENERATOR,
  context?: VerifiedInputContext,
): Promise<VerificationPlanManifest> {
  if (context !== undefined)
    return requireVerifiedInputContext(context).planManifest(snapshot, generatorVersion);
  return buildVerificationPlanManifestUncached(snapshot, generatorVersion);
}

/** Context factory calls only this hardcoded generator, never a caller-supplied callback. */
export async function buildVerificationPlanManifestUncached(
  snapshot: PublicBaselineSnapshot,
  generatorVersion: VerificationPlanGenerator = VERIFICATION_PLAN_GENERATOR,
  context?: VerifiedInputContext,
): Promise<VerificationPlanManifest> {
  if (context !== undefined)
    snapshot = await requireVerifiedInputContext(context).verifyBaseline(
      snapshot,
      snapshot.projectId,
      snapshot.id,
    );
  await validateVerificationBaseline(snapshot, snapshot.projectId, snapshot.id, context);
  const draft = await generateVersionedDraft(snapshot, generatorVersion, context);
  const manifest: VerificationPlanManifest = {
    ...draft,
    schema: VERIFICATION_PLAN_SCHEMA,
    generatorVersion,
    baselineSchema: snapshot.manifest.schema,
  };
  verificationPlanCanonicalText(manifest);
  return manifest;
}

export function verificationPlanCanonicalText(value: unknown): string {
  const canonical = canonicalBaselineJson(value);
  if (new TextEncoder().encode(canonical).byteLength > MAX_VERIFICATION_PLAN_BYTES)
    throw new Error("Verifikationsplanen overskrider grænsen på 2 MiB.");
  return canonical;
}

export function verificationPlanSummaryFromRow(value: unknown): VerificationPlanSummary {
  const row = SummaryRow.parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version_no,
    baselineId: row.baseline_id,
    baselineSha256: row.baseline_sha256,
    generatorVersion: row.generator_version,
    manifestSha256: row.manifest_sha256,
    createdAt: row.created_at,
    createdBy: row.created_by,
    requestId: row.request_id,
    status: "draft",
  };
}

/** Validate the stored content; never fetch sources or overwrite a saved version. */
export async function verificationPlanVersionFromRow(
  value: unknown,
  baseline: PublicBaselineSnapshot,
  context?: VerifiedInputContext,
): Promise<VerificationPlanVersion> {
  if (context !== undefined)
    return requireVerifiedInputContext(context).planFromRow(value, baseline);
  return verificationPlanVersionFromRowUncached(value, baseline);
}

export async function verificationPlanVersionFromRowUncached(
  value: unknown,
  baseline: PublicBaselineSnapshot,
  context?: VerifiedInputContext,
): Promise<VerificationPlanVersion> {
  if (context !== undefined)
    baseline = await requireVerifiedInputContext(context).verifyBaseline(
      baseline,
      baseline.projectId,
      baseline.id,
    );
  const row = SummaryRow.extend({ manifest: z.unknown() }).parse(value);
  const manifest = ManifestShape.parse(row.manifest);
  await validateVerificationBaseline(baseline, row.project_id, row.baseline_id, context);
  const expected = await buildVerificationPlanManifest(baseline, row.generator_version, context);
  if (
    row.baseline_sha256 !== baseline.manifestSha256 ||
    manifest.projectId !== row.project_id ||
    manifest.snapshotId !== row.baseline_id ||
    manifest.snapshotSha256 !== row.baseline_sha256 ||
    manifest.generatorVersion !== row.generator_version ||
    (await baselineSha256(manifest)) !== row.manifest_sha256 ||
    verificationPlanCanonicalText(manifest) !== verificationPlanCanonicalText(expected)
  )
    throw new Error(
      "Den gemte verifikationsplan matcher ikke sin baseline, metode eller checksum.",
    );
  return {
    ...verificationPlanSummaryFromRow(row),
    manifest: manifest as VerificationPlanManifest,
  };
}
