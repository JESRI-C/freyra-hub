import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";
import { surveyRoundVersionFromRow } from "@/services/baseline/survey-round-persistence";
import {
  originalJpeg,
  canonicalUpload,
  storageObject,
} from "@/services/monitoring/__tests__/drone-original-validation.fixtures";
import {
  validateDroneOriginalBytes,
  originalValidationSha256,
} from "@/services/monitoring/drone-original-validation.server";
import { canonicalDroneMediaReference } from "@/services/monitoring/canonical-drone-media-reference";
import {
  buildSurveyRoundMediaManifestV1,
  surveyRoundMediaVersionFromRow,
  SURVEY_ROUND_MEDIA_BUILDER,
  type SaveSurveyRoundMediaInput,
} from "@/services/baseline/survey-round-media-persistence";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";

export const MEDIA_ID = "a1000000-0000-4000-8000-000000000001";
export const BINDING_ID = "a2000000-0000-4000-8000-000000000001";
export const REQUEST_ID = "a3000000-0000-4000-8000-000000000001";
export async function makeMediaUiFixture() {
  const base = await makeRoundFixture();
  const round = await surveyRoundVersionFromRow(base.row, base.baseline, base.planRow);
  const bytes = originalJpeg();
  const upload = {
    ...canonicalUpload(bytes),
    project_id: round.projectId,
    uploaded_by: base.row.created_by,
  };
  const object = { ...storageObject(bytes), owner_id: upload.uploaded_by };
  const validation = await validateDroneOriginalBytes(upload, object, bytes, upload.uploaded_by, {
    now: () => base.row.created_at,
  });
  const validationHash = await originalValidationSha256(validation);
  const media = canonicalDroneMediaReference(
    {
      id: MEDIA_ID,
      project_id: round.projectId,
      source_upload_id: upload.id,
      original_role: "drone_original",
      original_sha256: validation.original.sha256,
      original_validation_sha256: validationHash,
      original_validation_status: validation.status,
      storage_bucket: "monitoring-uploads",
      file_path: upload.storage_path,
      storage_object_id: object.id,
      storage_object_version: object.version,
      storage_object_updated_at: object.updated_at,
      file_size_bytes: bytes.byteLength,
      mime_type: "image/jpeg",
      category: "drone_image",
      source: "drone",
      status: "uploaded",
      is_report_ready: false,
    },
    round.projectId,
    MEDIA_ID,
  );
  const candidate = {
    mediaId: MEDIA_ID,
    fileName: "DJI_0001.JPG",
    originalSha256: media.original_sha256,
    originalValidationSha256: validationHash,
    originalValidationStatus: media.original_validation_status,
    sizeBytes: bytes.byteLength,
  };
  const input: SaveSurveyRoundMediaInput = {
    projectId: round.projectId,
    roundVersionId: round.id,
    roundSha256: round.manifestSha256,
    baselineId: round.baselineId,
    baselineSha256: round.baselineSha256,
    planId: round.planId,
    planSha256: round.planSha256,
    mediaId: MEDIA_ID,
    requestId: REQUEST_ID,
    questionIds: [round.manifest.questionIds[0]],
  };
  async function savedFor(value: SaveSurveyRoundMediaInput) {
    const manifest = await buildSurveyRoundMediaManifestV1(value, round, media, validation);
    const row = {
      id: BINDING_ID,
      project_id: round.projectId,
      version_no: 1,
      round_version_id: round.id,
      round_sha256: round.manifestSha256,
      baseline_id: round.baselineId,
      baseline_sha256: round.baselineSha256,
      plan_id: round.planId,
      plan_sha256: round.planSha256,
      media_id: media.id,
      original_sha256: media.original_sha256,
      original_validation_sha256: validationHash,
      storage_object_id: object.id,
      storage_object_version: object.version,
      storage_object_updated_at: object.updated_at,
      builder_version: SURVEY_ROUND_MEDIA_BUILDER,
      status: "draft_assignment",
      manifest_sha256: await baselineSha256(manifest),
      manifest,
      created_at: base.row.created_at,
      created_by: base.row.created_by,
      request_id: value.requestId,
    };
    return surveyRoundMediaVersionFromRow(row, round, media, validation);
  }
  return {
    ...base,
    round,
    media,
    candidate,
    validation,
    input,
    savedFor,
    version: await savedFor(input),
  };
}
