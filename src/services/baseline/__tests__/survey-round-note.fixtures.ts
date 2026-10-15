import { makeRoundMediaFixture } from "@/services/baseline/__tests__/survey-round-media.fixtures";
import { surveyRoundMediaVersionFromRow } from "@/services/baseline/survey-round-media-persistence";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import {
  buildSurveyRoundNoteManifestV1,
  type SaveSurveyRoundNoteInput,
} from "@/services/baseline/survey-round-note-persistence";
import { ACTOR_ID, COLLECTED_AT } from "@/services/baseline/__tests__/public-baseline.fixtures";
export const NOTE_ID = "b1000000-0000-4000-8000-000000000001",
  LOGICAL_NOTE_ID = "b2000000-0000-4000-8000-000000000001",
  NOTE_REQUEST_ID = "b3000000-0000-4000-8000-000000000001";
export async function makeRoundNoteFixture(withMetadata = false) {
  const f = await makeRoundMediaFixture(withMetadata),
    binding = await surveyRoundMediaVersionFromRow(f.bindingRow, f.round, f.media, f.validation);
  const noteInput: SaveSurveyRoundNoteInput = {
    projectId: binding.projectId,
    logicalNoteId: LOGICAL_NOTE_ID,
    requestId: NOTE_REQUEST_ID,
    mediaBindingId: binding.id,
    mediaBindingSha256: binding.manifestSha256,
    roundVersionId: f.round.id,
    roundSha256: f.round.manifestSha256,
    baselineId: f.round.baselineId,
    baselineSha256: f.round.baselineSha256,
    planId: f.plan.id,
    planSha256: f.plan.manifestSha256,
    questionId: f.plan.manifest.questions[0].id,
    manual: {
      qualitativeAnswer: "inconclusive",
      manualStatement: "Syntetisk manuel note: placeringen kan ikke afgøres.",
      uncertainty: "Billedets geografiske sammenhæng er ikke dokumenteret.",
      proposedFollowup: "Foreslå besigtigelse og kontrolleret stedreference.",
      proposedPriority: "not_assessed",
    },
  };
  const noteManifest = await buildSurveyRoundNoteManifestV1(noteInput, binding, f.plan);
  const noteRow = {
    id: NOTE_ID,
    project_id: noteInput.projectId,
    logical_note_id: LOGICAL_NOTE_ID,
    note_version_no: 1,
    supersedes_id: null,
    version_no: 1,
    media_binding_id: binding.id,
    media_binding_sha256: binding.manifestSha256,
    round_version_id: f.round.id,
    round_sha256: f.round.manifestSha256,
    baseline_id: f.round.baselineId,
    baseline_sha256: f.round.baselineSha256,
    plan_id: f.plan.id,
    plan_sha256: f.plan.manifestSha256,
    media_id: f.media.id,
    original_sha256: f.media.original_sha256,
    original_validation_sha256: f.media.original_validation_sha256,
    question_id: noteInput.questionId,
    method_version: noteManifest.methodVersion,
    status: noteManifest.status,
    manifest_sha256: await baselineSha256(noteManifest),
    manifest: noteManifest,
    created_at: COLLECTED_AT,
    created_by: ACTOR_ID,
    request_id: NOTE_REQUEST_ID,
  };
  return { ...f, binding, noteInput, noteManifest, noteRow };
}
