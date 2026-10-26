import { baselineSha256 } from "../public-baseline-service";
import {
  buildVerificationPlanManifest,
  VERIFICATION_PLAN_GENERATOR,
} from "../verification-plan-persistence";
import type { PublicBaselineSnapshot } from "../public-baseline-types";
import { ACTOR_ID, COLLECTED_AT, PROJECT_ID, makeSnapshot } from "./public-baseline.fixtures";

export const PLAN_ID = "70000000-0000-4000-8000-000000000001";
export const PLAN_REQUEST_ID = "80000000-0000-4000-8000-000000000001";
export async function makePlanRow(baselineInput?: PublicBaselineSnapshot, version = 1) {
  const baseline = baselineInput ?? (await makeSnapshot());
  const manifest = await buildVerificationPlanManifest(baseline);
  return {
    id: PLAN_ID,
    project_id: PROJECT_ID,
    version_no: version,
    baseline_id: baseline.id,
    baseline_sha256: baseline.manifestSha256,
    generator_version: VERIFICATION_PLAN_GENERATOR,
    manifest_sha256: await baselineSha256(manifest),
    manifest,
    created_at: COLLECTED_AT,
    created_by: ACTOR_ID,
    request_id: PLAN_REQUEST_ID,
  };
}
