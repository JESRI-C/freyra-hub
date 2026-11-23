/** Pure public guards; callers/tests supply all values. No process/env/DB IO. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HASH = /^[0-9a-f]{64}$/;
export const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? "[" + value.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
          .join(",") +
        "}";
export const sha = (text) => createHash("sha256").update(text).digest("hex");
export const normalizedSha = (text) => sha(text.replaceAll("\r\n", "\n"));
export function validateNoteFixture(f) {
  assert.equal(f.schema, "gofreyra.disposable-round-note-fixture/v1");
  assert.equal(f.syntheticOnly, true);
  assert.equal(f.originalBytesUploadedOrStored, false);
  for (const key of ["projectId", "actorId", "organizationId", "baselineId", "planId"])
    assert(UUID.test(f[key]), "Full synthetic UUID required: " + key);
  for (const key of ["baselineSha256", "planSha256", "roundSha256"])
    assert(HASH.test(f[key]), "Exact immutable input hash required: " + key);
  for (const key of ["uploadId", "objectId", "promotionRequestId", "bindingRequestId"])
    assert(UUID.test(f.originalC[key]), "Full C UUID required: " + key);
  assert(HASH.test(f.originalC.originalSha256));
  assert(Number.isInteger(f.originalC.sizeBytes) && f.originalC.sizeBytes > 0);
  assert.notEqual(f.originalC.originalSha256, f.originalA.originalSha256);
  assert.notEqual(f.originalC.originalSha256, f.originalB.originalSha256);
  for (const original of [f.originalA, f.originalB]) {
    for (const key of ["uploadId", "objectId"]) assert(UUID.test(original[key]));
    assert(HASH.test(original.originalSha256));
  }
  const m = f.noteManifestTemplate;
  assert.equal(m.schema, "gofreyra.survey-round-note/v1");
  assert.equal(m.methodVersion, "manual-photo-question-note/v1");
  assert.equal(m.status, "draft_unreviewed");
  assert.equal(m.noteVersion, 1);
  assert.equal(m.supersedesId, null);
  assert.equal(m.projectId, f.projectId);
  assert.equal(m.baselineId, f.baselineId);
  assert.equal(m.baselineSha256, f.baselineSha256);
  assert.equal(m.planId, f.planId);
  assert.equal(m.planSha256, f.planSha256);
  assert.equal(m.questionId, `verification:${f.baselineId}:official-reference-location:v1`);
  assert.equal(m.questionKind, "official-reference-location/v1");
  assert.equal(m.manual.proposedPriority, "not_assessed");
  assert.deepEqual(
    Object.keys(m.manual).sort(),
    [
      "manualStatement",
      "proposedFollowup",
      "proposedPriority",
      "qualitativeAnswer",
      "uncertainty",
    ].sort(),
  );
  assert.equal(m.sourceMetadata.capture.capturedAtUtc, null);
  assert.equal(m.sourceMetadata.capture.timezoneKnown, false);
  assert.equal(m.sourceMetadata.cameraPosition, null);
  for (const key of [
    "acceptance",
    "reportReady",
    "professionalApproved",
    "photoViewed",
    "observedAt",
    "objectGeometry",
  ])
    assert(!Object.hasOwn(m, key), "Unsupported note claim: " + key);
  assert.equal(sha(f.roundCanonicalText), f.roundSha256);
  return f;
}
export function bindNoteManifest(template, binding, logicalNoteId) {
  assert(UUID.test(logicalNoteId));
  assert(UUID.test(binding.id));
  assert(HASH.test(binding.manifest_sha256));
  assert.equal(sha(canonical(binding.manifest)), binding.manifest_sha256);
  const b = binding.manifest,
    m = structuredClone(template);
  assert.equal(b.status, "draft_assignment");
  assert.equal(b.projectId, template.projectId);
  assert.equal(binding.project_id, template.projectId);
  for (const [column, key] of [
    ["round_version_id", "roundVersionId"],
    ["round_sha256", "roundSha256"],
    ["baseline_id", "baselineId"],
    ["baseline_sha256", "baselineSha256"],
    ["plan_id", "planId"],
    ["plan_sha256", "planSha256"],
    ["media_id", "mediaId"],
    ["original_sha256", "originalSha256"],
    ["original_validation_sha256", "originalValidationSha256"],
  ])
    assert.equal(binding[column], b[key]);
  for (const key of ["baselineId", "baselineSha256", "planId", "planSha256"])
    assert.equal(b[key], template[key]);
  assert(b.questionIds.includes(template.questionId));
  Object.assign(m, {
    logicalNoteId,
    mediaBindingId: binding.id,
    mediaBindingSha256: binding.manifest_sha256,
    roundVersionId: b.roundVersionId,
    roundSha256: b.roundSha256,
    mediaId: b.mediaId,
    originalSha256: b.originalSha256,
    originalValidationSha256: b.originalValidationSha256,
    sourceMetadata: structuredClone(b.sourceMetadata),
  });
  return m;
}
export function verifySavedNote(row, { projectId, actorId, requestId, logicalNoteId, manifest }) {
  assert(UUID.test(row.id));
  assert.equal(row.project_id, projectId);
  assert.equal(row.created_by, actorId);
  assert.equal(row.request_id, requestId);
  assert.equal(row.logical_note_id, logicalNoteId);
  assert.equal(row.note_version_no, 1);
  assert.equal(row.supersedes_id, null);
  assert.equal(row.status, "draft_unreviewed");
  assert.equal(row.manifest_sha256, sha(canonical(manifest)));
  assert.deepEqual(row.manifest, manifest);
  assert.equal(row.media_binding_id, manifest.mediaBindingId);
  assert.equal(row.media_binding_sha256, manifest.mediaBindingSha256);
  assert.equal(row.question_id, manifest.questionId);
  for (const [column, key] of [
    ["round_version_id", "roundVersionId"],
    ["round_sha256", "roundSha256"],
    ["baseline_id", "baselineId"],
    ["baseline_sha256", "baselineSha256"],
    ["plan_id", "planId"],
    ["plan_sha256", "planSha256"],
    ["media_id", "mediaId"],
    ["original_sha256", "originalSha256"],
    ["original_validation_sha256", "originalValidationSha256"],
  ])
    assert.equal(row[column], manifest[key]);
  return row;
}
export function assertResolvedNoteMigration(genesis) {
  assert.equal(genesis.syntheticOnly, true);
  assert.equal(genesis.bytesUploadedOrStored, false);
  assert(HASH.test(genesis.migration.authoredRawSha256));
  assert(HASH.test(genesis.migration.normalizedSqlSha256));
  assert.equal(
    genesis.migration.filenameResolved,
    true,
    "Root must resolve the CLI-generated note migration filename before database stages",
  );
  assert(
    /^supabase\/migrations\/[0-9]{14}_survey_round_note_versions\.sql$/.test(
      genesis.migration.filename,
    ),
    "Only the exact reviewed note migration filename is allowed",
  );
  assert.equal(
    genesis.migration.filename,
    genesis.migration.rootCreatedFilename,
    "Only root-created exact migration path may resolve",
  );
  return genesis.migration.filename;
}
