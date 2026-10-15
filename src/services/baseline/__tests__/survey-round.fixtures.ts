import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  makeSnapshot,
  ACTOR_ID,
  PROJECT_ID,
  COLLECTED_AT,
} from "@/services/baseline/__tests__/public-baseline.fixtures";
import { makePlanRow, PLAN_ID } from "@/services/baseline/__tests__/verification-plan.fixtures";
import { verificationPlanVersionFromRow } from "@/services/baseline/verification-plan-persistence";
import {
  buildSurveyRoundManifestV1,
  SURVEY_ROUND_BUILDER_V1,
  type SaveSurveyRoundInput,
} from "@/services/baseline/survey-round-persistence";

export const ROUND_VERSION_ID = "91000000-0000-4000-8000-000000000001";
export const ROUND_ID = "92000000-0000-4000-8000-000000000001";
export const ROUND_REQUEST_ID = "93000000-0000-4000-8000-000000000001";
export async function makeRoundFixture() {
  const baseline = await makeSnapshot();
  const planRow = await makePlanRow(baseline);
  const plan = await verificationPlanVersionFromRow(planRow, baseline);
  const input: SaveSurveyRoundInput = {
    projectId: PROJECT_ID,
    baselineId: baseline.id,
    baselineSha256: baseline.manifestSha256,
    planId: PLAN_ID,
    planSha256: plan.manifestSha256,
    requestId: ROUND_REQUEST_ID,
    kind: "before",
    title: "Syntetisk FØR-registrering",
    recordingWindow: { dateFrom: "2026-10-13", dateTo: "2026-10-14" },
    questionIds: plan.manifest.questions.map((question) => question.id),
  };
  const manifest = await buildSurveyRoundManifestV1(input, baseline, plan);
  const row = {
    id: ROUND_VERSION_ID,
    round_id: ROUND_ID,
    round_version_no: 1,
    supersedes_id: null,
    project_id: PROJECT_ID,
    version_no: 1,
    baseline_id: baseline.id,
    baseline_sha256: baseline.manifestSha256,
    plan_id: plan.id,
    plan_sha256: plan.manifestSha256,
    builder_version: SURVEY_ROUND_BUILDER_V1,
    status: "draft",
    kind: input.kind,
    title: input.title,
    recording_date_from: input.recordingWindow.dateFrom,
    recording_date_to: input.recordingWindow.dateTo,
    manifest_sha256: await baselineSha256(manifest),
    manifest,
    created_at: COLLECTED_AT,
    created_by: ACTOR_ID,
    request_id: ROUND_REQUEST_ID,
  };
  return { baseline, planRow, plan, input, manifest, row };
}
