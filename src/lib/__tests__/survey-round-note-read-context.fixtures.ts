import { makeManifest, makeSnapshot } from "@/services/baseline/__tests__/public-baseline.fixtures";
import { makePlanRow } from "@/services/baseline/__tests__/verification-plan.fixtures";
import { ACTUAL_NATIVE_FEATURES } from "@/services/baseline/__tests__/water-plan-nature.fixtures";
import { canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  buildSurveyRoundManifestV1,
  SURVEY_ROUND_BUILDER_V1,
} from "@/services/baseline/survey-round-persistence";

export async function makeSyntheticCase(targetBytes: number) {
  const manifest = await makeManifest();
  const features: unknown[] = [];
  const publicFeatures = Object.values(ACTUAL_NATIVE_FEATURES).flat();
  const payload = { schema: "gofreyra.synthetic-runtime-benchmark/v1", features };
  const source = manifest.sources.find((item) => item.id === "water-plan-nature")!;
  if (targetBytes > 0) {
    let length = 0,
      index = 0;
    while (length < targetBytes) {
      const feature = {
        ...publicFeatures[index % publicFeatures.length],
        id: `synthetic-runtime-feature-${index}`,
      };
      features.push(feature);
      length += JSON.stringify(feature).length + 1;
      index++;
    }
    source.mode = "live";
    source.status = "partial";
    source.error = null;
    source.payload = payload as never;
    source.payloadSha256 = await baselineSha256(payload);
    source.quality.evidenceKind = "official_registration";
    source.quality.warnings = [
      "Synthetic performance fixture using repeated public curated geometry. Not actual source inventory or municipal acceptance.",
    ];
  }
  const baseline = await makeSnapshot(manifest);
  const baselineRow = {
    id: baseline.id,
    project_id: baseline.projectId,
    version_no: baseline.version,
    created_at: baseline.createdAt,
    created_by: baseline.createdBy,
    request_id: baseline.requestId,
    manifest_sha256: baseline.manifestSha256,
    manifest: baseline.manifest,
  };
  const planRow = await makePlanRow(baseline);
  const plan = await verificationPlanVersionFromRow(planRow, baseline);
  const input = {
    projectId: PROJECT_ID,
    baselineId: baseline.id,
    baselineSha256: baseline.manifestSha256,
    planId: plan.id,
    planSha256: plan.manifestSha256,
    requestId: "93000000-0000-4000-8000-000000000001",
    kind: "before" as const,
    title: "Synthetic runtime benchmark",
    recordingWindow: { dateFrom: "2026-10-13", dateTo: "2026-10-14" },
    questionIds: plan.manifest.questions.map((q) => q.id),
  };
  const roundManifest = await buildSurveyRoundManifestV1(input, baseline, plan);
  const roundRow = {
    id: "91000000-0000-4000-8000-000000000001",
    round_id: "92000000-0000-4000-8000-000000000001",
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
    manifest_sha256: await baselineSha256(roundManifest),
    manifest: roundManifest,
    created_at: COLLECTED_AT,
    created_by: ACTOR_ID,
    request_id: input.requestId,
  };
  return {
    baselineRow,
    baseline,
    planRow,
    roundRow,
    manifestBytes: new TextEncoder().encode(canonicalBaselineJson(manifest)).byteLength,
    sourcePayloadBytes: new TextEncoder().encode(canonicalBaselineJson(source.payload)).byteLength,
  };
}
import { makeRoundMediaFixture } from "@/services/baseline/__tests__/survey-round-media.fixtures";
import {
  ACTOR_ID,
  PROJECT_ID,
  COLLECTED_AT,
} from "@/services/baseline/__tests__/public-baseline.fixtures";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { verificationPlanVersionFromRow } from "@/services/baseline/verification-plan-persistence";
import { surveyRoundVersionFromRow } from "@/services/baseline/survey-round-persistence";
import {
  buildSurveyRoundMediaManifestV1,
  surveyRoundMediaVersionFromRow,
} from "@/services/baseline/survey-round-media-persistence";
import { buildSurveyRoundNoteManifestV1 } from "@/services/baseline/survey-round-note-persistence";
import {
  executeGetSurveyRoundNote,
  executeListSurveyRoundNotes,
} from "@/lib/survey-round-note.functions";

export async function makeCase(uniqueMediaCount = 1, targetBytes = 270_000) {
  const base = await makeSyntheticCase(targetBytes);
  const mediaFixture = await makeRoundMediaFixture();
  const plan = await verificationPlanVersionFromRow(base.planRow, base.baseline);
  const round = await surveyRoundVersionFromRow(base.roundRow, base.baseline, base.planRow);
  const bindingInput = {
    ...mediaFixture.bindingInput,
    roundSha256: round.manifestSha256,
    baselineSha256: round.baselineSha256,
    planSha256: round.planSha256,
    questionIds: [plan.manifest.questions[0].id],
  };
  const bindingManifest = await buildSurveyRoundMediaManifestV1(
    bindingInput,
    round,
    mediaFixture.media,
    mediaFixture.validation,
  );
  const bindingRow = {
    ...mediaFixture.bindingRow,
    round_sha256: round.manifestSha256,
    baseline_sha256: round.baselineSha256,
    plan_sha256: round.planSha256,
    manifest: bindingManifest,
    manifest_sha256: await baselineSha256(bindingManifest),
  };
  const allBindings = [],
    allMedia = [],
    allUploads = [];
  for (let index = 1; index <= uniqueMediaCount; index++) {
    const suffix = index.toString().padStart(12, "0");
    const mediaId = `a1000000-0000-4000-8000-${suffix}`,
      uploadId = `a2000000-0000-4000-8000-${suffix}`,
      objectId = `a3000000-0000-4000-8000-${suffix}`;
    const path = `${ACTOR_ID}/intents/${uploadId}/original.jpg`;
    const validation = structuredClone(mediaFixture.validation);
    validation.uploadId = uploadId;
    validation.original.sha256 = index.toString(16).padStart(64, "0");
    validation.original.storagePath = path;
    validation.original.object.id = objectId;
    const media = {
      ...mediaFixture.media,
      id: mediaId,
      source_upload_id: uploadId,
      original_sha256: validation.original.sha256,
      original_validation_sha256: await baselineSha256(validation),
      file_path: path,
      storage_object_id: objectId,
    };
    const input = { ...bindingInput, mediaId, requestId: `a5000000-0000-4000-8000-${suffix}` };
    const manifest = await buildSurveyRoundMediaManifestV1(input, round, media, validation);
    const row = {
      ...bindingRow,
      id: `a4000000-0000-4000-8000-${suffix}`,
      version_no: index,
      media_id: mediaId,
      original_sha256: media.original_sha256,
      original_validation_sha256: media.original_validation_sha256,
      storage_object_id: objectId,
      manifest,
      manifest_sha256: await baselineSha256(manifest),
      request_id: input.requestId,
    };
    allBindings.push(row);
    allMedia.push(media);
    allUploads.push({
      id: uploadId,
      project_id: PROJECT_ID,
      uploaded_by: ACTOR_ID,
      file_name: "original.jpg",
      original_file_name: "original.jpg",
      file_size: media.file_size_bytes,
      mime_type: "image/jpeg",
      upload_type: "drone_photo",
      storage_path: path,
      intent_request_id: `a6000000-0000-4000-8000-${suffix}`,
      received_at: COLLECTED_AT,
      original_validation: validation,
      original_validation_sha256: media.original_validation_sha256,
      status: "archived",
    });
  }
  const notes = [];
  for (let index = 1; index <= 31; index++) {
    const suffix = index.toString().padStart(12, "0");
    const selected = (index - 1) % uniqueMediaCount;
    const binding = await surveyRoundMediaVersionFromRow(
      allBindings[selected],
      round,
      allMedia[selected],
      allUploads[selected].original_validation,
    );
    const input = {
      projectId: PROJECT_ID,
      logicalNoteId: `b2000000-0000-4000-8000-${suffix}`,
      requestId: `b3000000-0000-4000-8000-${suffix}`,
      mediaBindingId: binding.id,
      mediaBindingSha256: binding.manifestSha256,
      roundVersionId: round.id,
      roundSha256: round.manifestSha256,
      baselineId: round.baselineId,
      baselineSha256: round.baselineSha256,
      planId: plan.id,
      planSha256: plan.manifestSha256,
      questionId: plan.manifest.questions[0].id,
      manual: {
        qualitativeAnswer: "inconclusive" as const,
        manualStatement: "Syntetisk manuel performance-note.",
        uncertainty: "Placeringen er ikke afklaret.",
        proposedFollowup: "Foreslå besigtigelse.",
        proposedPriority: "not_assessed" as const,
      },
    };
    const manifest = await buildSurveyRoundNoteManifestV1(input, binding, plan);
    notes.push({
      id: `b1000000-0000-4000-8000-${suffix}`,
      project_id: PROJECT_ID,
      logical_note_id: input.logicalNoteId,
      note_version_no: 1,
      supersedes_id: null,
      version_no: index,
      media_binding_id: binding.id,
      media_binding_sha256: binding.manifestSha256,
      round_version_id: round.id,
      round_sha256: round.manifestSha256,
      baseline_id: round.baselineId,
      baseline_sha256: round.baselineSha256,
      plan_id: plan.id,
      plan_sha256: plan.manifestSha256,
      media_id: allMedia[selected].id,
      original_sha256: allMedia[selected].original_sha256,
      original_validation_sha256: allMedia[selected].original_validation_sha256,
      question_id: input.questionId,
      method_version: manifest.methodVersion,
      status: manifest.status,
      manifest_sha256: await baselineSha256(manifest),
      manifest,
      created_at: COLLECTED_AT,
      created_by: ACTOR_ID,
      request_id: input.requestId,
    });
  }
  return {
    ...base,
    bindingRow: allBindings[0],
    media: allMedia[0],
    upload: allUploads[0],
    allBindings,
    allMedia,
    allUploads,
    notes,
    uniqueMediaCount,
  };
}

export function makeClient(
  fixture: Awaited<ReturnType<typeof makeCase>>,
  organizationFallback = false,
  rawResults = false,
) {
  const queryCounts: Record<string, number> = {};
  let rpcCalls = 0;
  const tableRows: Record<string, Record<string, unknown>[]> = {
    projects: [
      {
        id: PROJECT_ID,
        organization_id: "c1000000-0000-4000-8000-000000000001",
        geometry_centroid_lat: 55.3,
        geometry_centroid_lng: 9.2,
      },
    ],
    project_members: organizationFallback
      ? []
      : [{ project_id: PROJECT_ID, user_id: ACTOR_ID, role: "editor" }],
    organization_memberships: [
      { organization_id: "c1000000-0000-4000-8000-000000000001", user_id: ACTOR_ID, role: "owner" },
    ],
    project_baseline_snapshots: [fixture.baselineRow],
    verification_plan_versions: [fixture.planRow],
    survey_round_versions: [fixture.roundRow],
    survey_round_media_versions: fixture.allBindings,
    project_media: fixture.allMedia,
    uploads: fixture.allUploads,
    survey_round_note_versions: fixture.notes,
  };
  const client = {
    from(table: string) {
      if (!(table in tableRows)) throw new Error("Unexpected table: " + table);
      const filters: [string, unknown][] = [],
        less: [string, unknown][] = [],
        included: [string, unknown[]][] = [];
      let descending = false,
        limit = Infinity;
      const result = (single: boolean) => {
        queryCounts[table] = (queryCounts[table] ?? 0) + 1;
        let rows = tableRows[table].filter(
          (row) =>
            filters.every(([key, value]) => row[key] === value) &&
            less.every(([key, value]) => (row[key] as number) < (value as number)) &&
            included.every(([key, values]) => values.includes(row[key])),
        );
        if (descending)
          rows = [...rows].sort((a, b) => Number(b.version_no) - Number(a.version_no));
        rows = rows.slice(0, limit);
        const value = single ? (rows[0] ?? null) : rows;
        return { data: rawResults ? value : structuredClone(value), error: null };
      };
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        in(key: string, values: unknown[]) {
          included.push([key, values]);
          return query;
        },
        lt(key: string, value: unknown) {
          less.push([key, value]);
          return query;
        },
        order(_key: string, options: { ascending: boolean }) {
          descending = !options.ascending;
          return query;
        },
        limit(value: number) {
          limit = value;
          return query;
        },
        maybeSingle: async () => result(true),
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve(result(false)).then(resolve, reject);
        },
      };
      return query;
    },
    rpc() {
      rpcCalls++;
      throw new Error("No RPC allowed in historical offline read");
    },
  };
  return {
    client,
    queryCounts,
    tableRows,
    get rpcCalls() {
      return rpcCalls;
    },
  };
}

export async function measure(
  fixture: Awaited<ReturnType<typeof makeCase>>,
  operation: "get" | "list",
  count: number,
  fallback: boolean,
) {
  const mocked = makeClient(fixture, fallback);
  const input = {
    projectId: PROJECT_ID,
    ...(operation === "get" ? { noteVersionId: fixture.notes[0].id } : { limit: count }),
  };
  const result =
    operation === "get"
      ? await executeGetSurveyRoundNote(input as never, ACTOR_ID, mocked.client as never)
      : await executeListSurveyRoundNotes(input as never, ACTOR_ID, mocked.client as never);
  if (!result) throw new Error("Synthetic expected note missing");
  const listResult = "items" in result ? result : null;
  return {
    operation,
    count,
    fallback,
    queryCounts: mocked.queryCounts,
    totalQueries: Object.values(mocked.queryCounts).reduce((a, b) => a + b, 0),
    rpcCalls: mocked.rpcCalls,
    resultIds: listResult ? listResult.items.map((row) => row.id) : [(result as { id: string }).id],
    nextBeforeVersion: listResult?.nextBeforeVersion ?? null,
    dtoJson: JSON.stringify(result),
  };
}
