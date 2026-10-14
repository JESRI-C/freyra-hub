import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { makeRoundFixture } from "@/services/baseline/__tests__/survey-round.fixtures";
import { surveyRoundVersionFromRow } from "@/services/baseline/survey-round-persistence";
import { canonicalDroneMediaReference } from "@/services/monitoring/canonical-drone-media-reference";
import {
  buildSurveyRoundMediaManifestV1,
  SURVEY_ROUND_MEDIA_BUILDER,
  type SaveSurveyRoundMediaInput,
} from "@/services/baseline/survey-round-media-persistence";
import {
  ACTOR_ID,
  COLLECTED_AT,
  PROJECT_ID,
} from "@/services/baseline/__tests__/public-baseline.fixtures";
export const MEDIA_ID = "a1000000-0000-4000-8000-000000000001";
export const UPLOAD_ID = "a2000000-0000-4000-8000-000000000001";
export const OBJECT_ID = "a3000000-0000-4000-8000-000000000001";
export const BINDING_ID = "a4000000-0000-4000-8000-000000000001";
export const BINDING_REQUEST_ID = "a5000000-0000-4000-8000-000000000001";
export async function makeRoundMediaFixture(withMetadata = false) {
  const fixture = await makeRoundFixture();
  const round = await surveyRoundVersionFromRow(fixture.row, fixture.baseline, fixture.planRow);
  const path = `${ACTOR_ID}/intents/${UPLOAD_ID}/original.jpg`;
  const validation = {
    schema: "gofreyra.drone-original-validation/v1",
    validatorVersion: "jpeg-structure-exifr/v1",
    projectId: PROJECT_ID,
    uploadId: UPLOAD_ID,
    validatedAt: COLLECTED_AT,
    validatedBy: ACTOR_ID,
    original: {
      sha256: "a".repeat(64),
      sizeBytes: 137,
      mimeType: "image/jpeg",
      storagePath: path,
      receivedAt: COLLECTED_AT,
      object: {
        id: OBJECT_ID,
        version: "test-version-1",
        updated_at: COLLECTED_AT,
        owner_id: ACTOR_ID,
        size: 137,
        mimetype: "image/jpeg",
      },
    },
    status: "review_required",
    jpegStructure: {
      widthPx: 1,
      heightPx: 1,
      components: 1,
      encoding: "baseline",
      scans: 1,
    },
    metadata: withMetadata
      ? {
          schemaVersion: "drone-image-metadata/v1",
          extractor: "exifr@7.1.3",
          file: {
            name: "original.jpg",
            sizeBytes: 137,
            mimeType: "image/jpeg",
            lastModified: 0,
            sha256: "a".repeat(64),
          },
          raw: {
            exif: {
              serial: "MUST-NOT-LEAVE-SOURCE",
              private: "RAW-EXIF-SECRET",
            },
            xmp: {},
            xmpXml: "PRIVATE-XMP",
            parseErrors: [],
          },
          capture: {
            timezoneKnown: false,
            localTimestamp: "2026-10-01T09:30:00",
          },
          position: {
            latitude: 55.35,
            longitude: 9.26,
            source: "exif",
            serial: "NOT-A-GEOMETRY",
          },
          altitude: {},
          orientation: {},
          camera: { serial: "PRIVATE-CAMERA-SERIAL" },
          rtk: {},
          footprintReadiness: "insufficient",
          qa: { status: "review_required", errors: [], warnings: [] },
        }
      : null,
    cameraPositionEligible: false,
    pixelDecoded: false,
    georeferenced: false,
    reportEligible: false,
    errors: [],
    warnings: [],
  };
  const media = canonicalDroneMediaReference(
    {
      id: MEDIA_ID,
      project_id: PROJECT_ID,
      source_upload_id: UPLOAD_ID,
      original_role: "drone_original",
      original_sha256: "a".repeat(64),
      original_validation_sha256: await baselineSha256(validation),
      original_validation_status: "review_required",
      storage_bucket: "monitoring-uploads",
      file_path: path,
      storage_object_id: OBJECT_ID,
      storage_object_version: "test-version-1",
      storage_object_updated_at: COLLECTED_AT,
      file_size_bytes: 137,
      mime_type: "image/jpeg",
      category: "drone_image",
      source: "drone",
      status: "uploaded",
      is_report_ready: false,
    },
    PROJECT_ID,
    MEDIA_ID,
  );
  const input: SaveSurveyRoundMediaInput = {
    projectId: PROJECT_ID,
    roundVersionId: round.id,
    roundSha256: round.manifestSha256,
    baselineId: round.baselineId,
    baselineSha256: round.baselineSha256,
    planId: round.planId,
    planSha256: round.planSha256,
    mediaId: MEDIA_ID,
    requestId: BINDING_REQUEST_ID,
    questionIds: [round.manifest.questionIds[0]],
  };
  const manifest = await buildSurveyRoundMediaManifestV1(input, round, media, validation);
  const row = {
    id: BINDING_ID,
    project_id: PROJECT_ID,
    version_no: 1,
    round_version_id: round.id,
    round_sha256: round.manifestSha256,
    baseline_id: round.baselineId,
    baseline_sha256: round.baselineSha256,
    plan_id: round.planId,
    plan_sha256: round.planSha256,
    media_id: MEDIA_ID,
    original_sha256: media.original_sha256,
    original_validation_sha256: media.original_validation_sha256,
    storage_object_id: OBJECT_ID,
    storage_object_version: media.storage_object_version,
    storage_object_updated_at: COLLECTED_AT,
    builder_version: SURVEY_ROUND_MEDIA_BUILDER,
    status: "draft_assignment",
    manifest_sha256: await baselineSha256(manifest),
    manifest,
    created_at: COLLECTED_AT,
    created_by: ACTOR_ID,
    request_id: BINDING_REQUEST_ID,
  };
  return {
    ...fixture,
    round,
    media,
    validation,
    bindingInput: input,
    bindingManifest: manifest,
    bindingRow: row,
  };
}
