import { makeRoundNoteFixture } from "@/services/baseline/__tests__/survey-round-note.fixtures";
import { surveyRoundNoteVersionFromRow } from "@/services/baseline/survey-round-note-persistence";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { ACTOR_ID, COLLECTED_AT } from "@/services/baseline/__tests__/public-baseline.fixtures";
import {
  buildDroneImageInspectionDraft,
  DRONE_IMAGE_INSPECTION_METHOD,
  DRONE_IMAGE_INSPECTION_PROMPT_VERSION,
} from "../drone-image-inspection";
import type {
  DroneImageInspectionRecord,
  DroneImageInspectionAnswersRecord,
} from "../drone-image-inspection-persistence";
import { compileMunicipalReportV1, type MunicipalReportCompileInput } from "../municipal-report";

export async function makeMunicipalReportFixture() {
  const f = await makeRoundNoteFixture(true);
  const note = await surveyRoundNoteVersionFromRow(f.noteRow, f.binding, f.plan);
  const inspectionId = "c1000000-0000-4000-8000-000000000001";
  const result = buildDroneImageInspectionDraft({
    visual: {
      quality: {
        assessment: "limited",
        issues: ["partial_view"],
        limitation: "En del af bredden ses ikke.",
      },
      watercourseVisibility: "partly_visible",
      features: [
        {
          kind: "possible_obstruction",
          appearance: "Et lyst objekt ses i billedet.",
          confidence: 0.5,
          uncertainty: "Objektets funktion kan ikke afgøres.",
          region: null,
        },
      ],
      overallUncertainty: "Et nærfoto og en feltkontrol kan være nødvendig.",
    },
    provenance: {
      projectId: f.baseline.projectId,
      mediaId: f.media.id,
      requestId: "c2000000-0000-4000-8000-000000000001",
      originalSha256: f.media.original_sha256,
      originalValidationSha256: f.media.original_validation_sha256,
      derivative: {
        sha256: "d".repeat(64),
        mimeType: "image/jpeg",
        widthPx: 1,
        heightPx: 1,
        transformVersion: "synthetic-fixture/v1",
      },
      provider: "cloudflare-workers-ai",
      model: "@cf/google/gemma-4-26b-a4b-it",
      promptVersion: DRONE_IMAGE_INSPECTION_PROMPT_VERSION,
      generatedAt: COLLECTED_AT,
    },
    sourceContext: {
      snapshotId: f.baseline.id,
      snapshotSha256: f.baseline.manifestSha256,
      limitations: ["Regulativ og lokal feltkontrol mangler."],
    },
  });
  const inspection: DroneImageInspectionRecord = {
    id: inspectionId,
    projectId: f.baseline.projectId,
    mediaId: f.media.id,
    createdBy: ACTOR_ID,
    requestId: result.provenance.requestId,
    provider: "cloudflare-workers-ai",
    modelId: "@cf/google/gemma-4-26b-a4b-it",
    promptVersion: DRONE_IMAGE_INSPECTION_PROMPT_VERSION,
    methodVersion: DRONE_IMAGE_INSPECTION_METHOD,
    originalSha256: f.media.original_sha256,
    originalValidationSha256: f.media.original_validation_sha256,
    storageObjectId: f.media.storage_object_id,
    storageObjectVersion: f.media.storage_object_version,
    storageObjectUpdatedAt: f.media.storage_object_updated_at,
    sourceSnapshotId: f.baseline.id,
    sourceSnapshotHash: f.baseline.manifestSha256,
    status: "completed",
    attemptCount: 1,
    leaseExpiresAt: null,
    result,
    resultSha256: await baselineSha256(result),
    failureCode: null,
    createdAt: COLLECTED_AT,
    updatedAt: COLLECTED_AT,
    completedAt: COLLECTED_AT,
  };
  const savedAnswers = [
    {
      questionId: result.followupQuestions[0].id,
      assessment: "uncertain" as const,
      note: "Syntetisk gemt svar: der kræves et skarpere foto.",
      followup: "Tag et nærfoto ved en besigtigelse.",
    },
  ];
  const answer: DroneImageInspectionAnswersRecord = {
    id: "c3000000-0000-4000-8000-000000000001",
    projectId: f.baseline.projectId,
    inspectionId,
    inspectionResultSha256: inspection.resultSha256!,
    createdBy: ACTOR_ID,
    requestId: "c4000000-0000-4000-8000-000000000001",
    answers: savedAnswers,
    answersSha256: await baselineSha256(savedAnswers),
    status: "draft_unreviewed",
    professionallyReviewed: false,
    reportEligible: false,
    createdAt: COLLECTED_AT,
  };
  const input: MunicipalReportCompileInput = {
    projectId: f.baseline.projectId,
    generatedAt: "2026-10-15T09:00:00.000Z",
    baseline: f.baseline,
    plan: f.plan,
    round: f.round,
    mediaBindings: [f.binding],
    notes: [note],
    inspections: [inspection],
    answers: [answer],
  };
  const manifest = await compileMunicipalReportV1(input);
  return { ...f, input, manifest, inspection, answer, note };
}
