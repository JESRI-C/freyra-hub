import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectNatureAccess,
  type ProjectAuthorizationClient,
} from "./project-nature-access.server";
import { createVerifiedInputContext } from "@/services/baseline/verified-input-context";
import { canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import { verificationPlanVersionFromRow } from "@/services/baseline/verification-plan-persistence";
import { surveyRoundVersionFromRow } from "@/services/baseline/survey-round-persistence";
import { surveyRoundMediaVersionFromRow } from "@/services/baseline/survey-round-media-persistence";
import { surveyRoundNoteVersionFromRow } from "@/services/baseline/survey-round-note-persistence";
import { parseHistoricalSurveyRoundMediaOriginalRows } from "./survey-round-media.functions";
import { canonicalDroneMediaReference } from "@/services/monitoring/canonical-drone-media-reference";
import {
  droneImageInspectionFromRow,
  droneImageInspectionAnswersFromRow,
  DRONE_IMAGE_INSPECTION_SELECT,
  DRONE_IMAGE_INSPECTION_ANSWERS_SELECT,
} from "@/services/monitoring/drone-image-inspection-persistence";
import {
  compileMunicipalReportV1,
  MUNICIPAL_REPORT_GENERATOR_V2,
  type MunicipalReportManifest,
} from "@/services/monitoring/municipal-report";
import {
  PHOTO_POINT_REVIEW_SELECT,
  photoPointReviewFromRow,
  type PhotoPointReviewRecord,
} from "@/services/monitoring/photo-point-review";
import {
  SaveMunicipalReportInputSchema,
  GetMunicipalReportInputSchema,
  ListMunicipalReportsInputSchema,
  MUNICIPAL_REPORT_SELECT,
  MUNICIPAL_REPORT_SUMMARY_SELECT,
  municipalReportVersionFromRow,
  municipalReportSummaryFromRow,
  type MunicipalReportVersion,
} from "@/services/monitoring/municipal-report-persistence";

type QueryResult = { data: unknown; error: unknown };
interface ReportQuery extends PromiseLike<QueryResult> {
  select(columns: string): ReportQuery;
  eq(column: string, value: unknown): ReportQuery;
  in(column: string, values: string[]): ReportQuery;
  order(column: string, options: { ascending: boolean }): ReportQuery;
  limit(count: number): ReportQuery;
  lt(column: string, value: number): ReportQuery;
  maybeSingle(): Promise<QueryResult>;
}
export interface MunicipalReportClient {
  from(table: string): ReportQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>;
}
type ReportInputs = Parameters<typeof compileMunicipalReportV1>[0];
export const SaveMunicipalReportEnvelopeSchema = SaveMunicipalReportInputSchema.extend({
  expectedCallerUserId: z.string().uuid(),
}).strict();
export interface MunicipalReportDependencies {
  authorize(
    client: ProjectAuthorizationClient,
    actorId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  loadRequest(
    client: MunicipalReportClient,
    projectId: string,
    actorId: string,
    requestId: string,
  ): Promise<unknown | null>;
  loadReport(
    client: MunicipalReportClient,
    projectId: string,
    reportId: string,
  ): Promise<unknown | null>;
  loadInputs(
    client: MunicipalReportClient,
    projectId: string,
    roundId: string,
    generatedAt: string,
    frozen?: MunicipalReportManifest,
  ): Promise<ReportInputs>;
  getWriter(): Promise<MunicipalReportClient>;
  persist(
    writer: MunicipalReportClient,
    projectId: string,
    actorId: string,
    requestId: string,
    manifest: MunicipalReportManifest,
  ): Promise<unknown>;
  now(): string;
}
const Uuid = z.string().uuid();
const RowIdentity = z.object({ id: Uuid, project_id: Uuid });
const uploadColumns =
  "id,project_id,uploaded_by,file_name,original_file_name,file_size,mime_type,upload_type,storage_path,intent_request_id,received_at,original_validation,original_validation_sha256";
const failRead = () =>
  new Error("Rapportens gemte input kunne ikke læses med din aktuelle adgang.");

async function readOne(
  client: MunicipalReportClient,
  table: string,
  projectId: string,
  id: string,
  columns = "*",
) {
  const { data, error } = await client
    .from(table)
    .select(columns)
    .eq("project_id", projectId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw failRead();
  if (data == null) return null;
  const copy = structuredClone(data),
    identity = RowIdentity.parse(copy);
  if (identity.id !== id || identity.project_id !== projectId) throw failRead();
  return copy;
}
async function required(
  client: MunicipalReportClient,
  table: string,
  projectId: string,
  id: string,
  columns = "*",
) {
  const row = await readOne(client, table, projectId, id, columns);
  if (!row) throw failRead();
  return row;
}
/** Every query is bounded; oversized rounds fail explicitly instead of exporting a partial report. */
async function readRows(query: ReportQuery, cap: number) {
  const { data, error } = await query.limit(cap + 1);
  if (error || !Array.isArray(data)) throw failRead();
  if (data.length > cap)
    throw new Error(
      "Undersøgelsen overskrider rapportens grænse. Del den i mindre undersøgelser; ingen fotos er udeladt automatisk.",
    );
  return structuredClone(data) as unknown[];
}
async function byIds(
  client: MunicipalReportClient,
  table: string,
  projectId: string,
  ids: string[],
  columns = "*",
) {
  const unique = [...new Set(ids)],
    result = new Map<string, unknown>();
  for (let start = 0; start < unique.length; start += 30) {
    const batch = unique.slice(start, start + 30);
    const rows = await readRows(
      client.from(table).select(columns).eq("project_id", projectId).in("id", batch),
      batch.length,
    );
    for (const row of rows) {
      const identity = RowIdentity.parse(row);
      if (
        identity.project_id !== projectId ||
        !batch.includes(identity.id) ||
        result.has(identity.id)
      )
        throw failRead();
      result.set(identity.id, row);
    }
    if (rows.length !== batch.length) throw failRead();
  }
  return result;
}
async function relatedRows(
  client: MunicipalReportClient,
  table: string,
  projectId: string,
  column: string,
  ids: string[],
  cap: number,
  columns = "*",
  filters: Record<string, string> = {},
) {
  const result: unknown[] = [],
    seen = new Set<string>();
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 30) {
    const batch = unique.slice(start, start + 30);
    let query = client.from(table).select(columns).eq("project_id", projectId).in(column, batch);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const rows = await readRows(query, cap - result.length);
    for (const row of rows) {
      const parsed = RowIdentity.extend({ [column]: Uuid }).parse(row);
      if (
        parsed.project_id !== projectId ||
        !batch.includes(parsed[column] as string) ||
        seen.has(parsed.id)
      )
        throw failRead();
      seen.add(parsed.id);
      result.push(row);
    }
  }
  return result;
}
export async function loadMunicipalReportInputs(
  client: MunicipalReportClient,
  projectId: string,
  roundId: string,
  generatedAt: string,
  frozen?: MunicipalReportManifest,
): Promise<ReportInputs> {
  const generatorVersion = frozen?.generatorVersion ?? MUNICIPAL_REPORT_GENERATOR_V2;
  const context = createVerifiedInputContext();
  const rawRound = await required(client, "survey_round_versions", projectId, roundId);
  const roundPins = z.object({ baseline_id: Uuid, plan_id: Uuid }).parse(rawRound);
  const baseline = await context.baselineFromRow(
    await required(client, "project_baseline_snapshots", projectId, roundPins.baseline_id),
  );
  const rawPlan = await required(
    client,
    "verification_plan_versions",
    projectId,
    roundPins.plan_id,
  );
  const plan = await verificationPlanVersionFromRow(rawPlan, baseline, context);
  const round = await surveyRoundVersionFromRow(rawRound, baseline, rawPlan, context);
  const bindingRows = frozen
    ? [
        ...(
          await byIds(
            client,
            "survey_round_media_versions",
            projectId,
            frozen.pins.mediaBindings.map((p) => p.id),
          )
        ).values(),
      ]
    : await readRows(
        client
          .from("survey_round_media_versions")
          .select("*")
          .eq("project_id", projectId)
          .eq("round_version_id", roundId)
          .order("version_no", { ascending: false }),
        200,
      );
  const bindingIds = bindingRows.map((row) => z.object({ id: Uuid, media_id: Uuid }).parse(row));
  const mediaRows = await byIds(
    client,
    "project_media",
    projectId,
    bindingIds.map((row) => row.media_id),
  );
  const mediaRefs = new Map(
    [...mediaRows].map(([id, row]) => [id, canonicalDroneMediaReference(row, projectId, id)]),
  );
  const uploadRows = await byIds(
    client,
    "uploads",
    projectId,
    [...mediaRefs.values()].map((row) => row.source_upload_id),
    uploadColumns,
  );
  const mediaBindings: ReportInputs["mediaBindings"] = [];
  for (const row of bindingRows) {
    const identity = z.object({ media_id: Uuid }).parse(row),
      media = mediaRefs.get(identity.media_id)!;
    const original = await parseHistoricalSurveyRoundMediaOriginalRows(
      media,
      uploadRows.get(media.source_upload_id),
      projectId,
      identity.media_id,
    );
    mediaBindings.push(
      await surveyRoundMediaVersionFromRow(row, round, original.media, original.validation),
    );
  }
  const bindingById = new Map(mediaBindings.map((binding) => [binding.id, binding]));
  const noteRows = frozen
    ? [
        ...(
          await byIds(
            client,
            "survey_round_note_versions",
            projectId,
            frozen.pins.notes.map((p) => p.id),
          )
        ).values(),
      ]
    : await readRows(
        client
          .from("survey_round_note_versions")
          .select("*")
          .eq("project_id", projectId)
          .eq("round_version_id", roundId),
        400,
      );
  const notes: ReportInputs["notes"] = [];
  for (const row of noteRows) {
    const pin = z.object({ media_binding_id: Uuid }).parse(row),
      binding = bindingById.get(pin.media_binding_id);
    if (!binding) throw failRead();
    notes.push(await surveyRoundNoteVersionFromRow(row, binding, plan));
  }
  const rawInspections = frozen
    ? [
        ...(
          await byIds(
            client,
            "drone_image_inspections",
            projectId,
            frozen.pins.inspections.map((p) => p.id),
            DRONE_IMAGE_INSPECTION_SELECT,
          )
        ).values(),
      ]
    : await relatedRows(
        client,
        "drone_image_inspections",
        projectId,
        "media_id",
        [...mediaRefs.keys()],
        400,
        DRONE_IMAGE_INSPECTION_SELECT,
        { status: "completed", source_snapshot_id: baseline.id },
      );
  const inspections: ReportInputs["inspections"] = [];
  for (const raw of rawInspections) {
    const inspection = await droneImageInspectionFromRow(raw, projectId);
    if (
      !frozen &&
      (inspection.status !== "completed" || inspection.sourceSnapshotId !== baseline.id)
    )
      continue;
    inspections.push(inspection);
  }
  // A new report selects one latest completed assessment per photo; re-opening a
  // saved report always replays its original selections, including old models.
  if (!frozen) {
    inspections.sort(
      (a, b) =>
        Date.parse(b.completedAt ?? b.createdAt) - Date.parse(a.completedAt ?? a.createdAt) ||
        b.id.localeCompare(a.id),
    );
    const selectedMedia = new Set<string>();
    for (let i = 0; i < inspections.length; ) {
      if (selectedMedia.has(inspections[i].mediaId)) inspections.splice(i, 1);
      else {
        selectedMedia.add(inspections[i].mediaId);
        i++;
      }
    }
  }
  const photoPointReviews: PhotoPointReviewRecord[] = [];
  if (generatorVersion === MUNICIPAL_REPORT_GENERATOR_V2) {
    const reviewRows = frozen
      ? [
          ...(
            await byIds(
              client,
              "photo_point_review_versions",
              projectId,
              (frozen.photoPointReviews ?? []).map((review) => review.id),
              PHOTO_POINT_REVIEW_SELECT,
            )
          ).values(),
        ]
      : await relatedRows(
          client,
          "photo_point_review_versions",
          projectId,
          "binding_id",
          [...bindingById.keys()],
          400,
          PHOTO_POINT_REVIEW_SELECT,
        );
    for (const raw of reviewRows) {
      const review = await photoPointReviewFromRow(raw, projectId);
      if (!bindingById.has(review.bindingId)) throw failRead();
      if (frozen || Date.parse(review.createdAt) <= Date.parse(generatedAt))
        photoPointReviews.push(review);
    }
    if (!frozen) {
      photoPointReviews.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
      );
      const selected = new Set<string>();
      for (let i = 0; i < photoPointReviews.length; ) {
        if (selected.has(photoPointReviews[i].bindingId)) photoPointReviews.splice(i, 1);
        else {
          selected.add(photoPointReviews[i].bindingId);
          i++;
        }
      }
      // A review may refer to an older, precisely identified AI result. Include
      // it alongside the newest assessment; never silently relabel the review.
      const missingIds = photoPointReviews.flatMap((record) =>
        record.review.inspectionId &&
        !inspections.some((item) => item.id === record.review.inspectionId)
          ? [record.review.inspectionId]
          : [],
      );
      for (const raw of (
        await byIds(
          client,
          "drone_image_inspections",
          projectId,
          missingIds,
          DRONE_IMAGE_INSPECTION_SELECT,
        )
      ).values())
        inspections.push(await droneImageInspectionFromRow(raw, projectId));
    }
  }
  const inspectionById = new Map(inspections.map((inspection) => [inspection.id, inspection]));
  const answerRows = frozen
    ? [
        ...(
          await byIds(
            client,
            "drone_image_inspection_answer_versions",
            projectId,
            frozen.pins.answers.map((p) => p.id),
            DRONE_IMAGE_INSPECTION_ANSWERS_SELECT,
          )
        ).values(),
      ]
    : await relatedRows(
        client,
        "municipal_report_latest_answers",
        projectId,
        "inspection_id",
        [...inspectionById.keys()],
        400,
        DRONE_IMAGE_INSPECTION_ANSWERS_SELECT,
      );
  const answers: ReportInputs["answers"] = [];
  for (const row of answerRows) {
    const { inspection_id: inspectionId } = z.object({ inspection_id: Uuid }).parse(row),
      inspection = inspectionById.get(inspectionId);
    if (!inspection) throw failRead();
    answers.push(await droneImageInspectionAnswersFromRow(row, projectId, inspection));
  }
  if (!frozen) {
    answers.sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
    );
    const selectedInspections = new Set<string>();
    for (let i = 0; i < answers.length; ) {
      if (selectedInspections.has(answers[i].inspectionId)) answers.splice(i, 1);
      else {
        selectedInspections.add(answers[i].inspectionId);
        i++;
      }
    }
  }
  return {
    generatorVersion,
    ...(generatorVersion === MUNICIPAL_REPORT_GENERATOR_V2 ? { photoPointReviews } : {}),
    projectId,
    generatedAt,
    baseline,
    plan,
    round,
    mediaBindings,
    notes,
    inspections,
    answers,
  };
}

const DEFAULTS: MunicipalReportDependencies = {
  authorize: requireProjectNatureAccess,
  loadRequest: async (client, projectId, actorId, requestId) => {
    const { data, error } = await client
      .from("municipal_report_versions")
      .select(MUNICIPAL_REPORT_SELECT)
      .eq("project_id", projectId)
      .eq("created_by", actorId)
      .eq("request_id", requestId)
      .maybeSingle();
    if (error) throw failRead();
    return data == null ? null : structuredClone(data);
  },
  loadReport: (client, projectId, id) =>
    readOne(client, "municipal_report_versions", projectId, id, MUNICIPAL_REPORT_SELECT),
  loadInputs: loadMunicipalReportInputs,
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as MunicipalReportClient;
  },
  persist: async (writer, projectId, actorId, requestId, manifest) => {
    const { data, error } = await writer.rpc("persist_municipal_report", {
      p_project_id: projectId,
      p_actor_id: actorId,
      p_request_id: requestId,
      p_manifest_text: canonicalBaselineJson(manifest),
    });
    if (error || !data)
      throw new Error(
        "Rapportversionen blev ikke gemt. Kontrollér adgang, valgte input og migration.",
      );
    return Array.isArray(data) ? data[0] : data;
  },
  now: () => new Date().toISOString(),
};
async function replayReport(
  raw: unknown,
  client: MunicipalReportClient,
  projectId: string,
  dependencies: MunicipalReportDependencies,
) {
  const report = await municipalReportVersionFromRow(raw);
  if (report.projectId !== projectId) throw failRead();
  const inputs = await dependencies.loadInputs(
    client,
    projectId,
    report.roundVersionId,
    report.manifest.generatedAt,
    report.manifest,
  );
  const replayed = await compileMunicipalReportV1(inputs);
  if (canonicalBaselineJson(replayed) !== canonicalBaselineJson(report.manifest))
    throw new Error("Rapportversionen matcher ikke sine præcise gemte input.");
  return report;
}
export async function executeSaveMunicipalReport(
  raw: z.input<typeof SaveMunicipalReportEnvelopeSchema>,
  actorId: string,
  client: MunicipalReportClient,
  overrides: Partial<MunicipalReportDependencies> = {},
): Promise<MunicipalReportVersion> {
  const input = SaveMunicipalReportEnvelopeSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  if (input.expectedCallerUserId !== actorId)
    throw new Error("Login er ændret. Genåbn rapporten under den aktuelle bruger.");
  const authorize = () =>
    deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  if (!(await authorize()).canPersist) throw new Error("Du har kun læseadgang til rapporten.");
  const existing = await deps.loadRequest(client, input.projectId, actorId, input.requestId);
  if (existing) {
    const saved = await replayReport(existing, client, input.projectId, deps);
    if (
      saved.roundVersionId !== input.roundVersionId ||
      saved.createdBy !== actorId ||
      saved.requestId !== input.requestId
    )
      throw new Error("Gemmeforsøget er allerede brugt til en anden rapport.");
    await authorize();
    return saved;
  }
  const inputs = await deps.loadInputs(client, input.projectId, input.roundVersionId, deps.now());
  const manifest = await compileMunicipalReportV1(inputs);
  if (manifest.projectId !== input.projectId || manifest.pins.round.id !== input.roundVersionId)
    throw failRead();
  if (!(await authorize()).canPersist) throw new Error("Din ret til at gemme rapporten er ændret.");
  const writer = await deps.getWriter();
  const saved = await replayReport(
    await deps.persist(writer, input.projectId, actorId, input.requestId, manifest),
    client,
    input.projectId,
    deps,
  );
  if (
    saved.createdBy !== actorId ||
    saved.requestId !== input.requestId ||
    saved.roundVersionId !== input.roundVersionId
  )
    throw failRead();
  await authorize();
  return saved;
}
export async function executeGetMunicipalReport(
  raw: z.input<typeof GetMunicipalReportInputSchema>,
  actorId: string,
  client: MunicipalReportClient,
  overrides: Partial<MunicipalReportDependencies> = {},
) {
  const input = GetMunicipalReportInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  const row = await deps.loadReport(client, input.projectId, input.reportVersionId);
  if (!row) return null;
  const saved = await replayReport(row, client, input.projectId, deps);
  if (saved.id !== input.reportVersionId) throw failRead();
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  return saved;
}
export async function executeListMunicipalReports(
  raw: z.input<typeof ListMunicipalReportsInputSchema>,
  actorId: string,
  client: MunicipalReportClient,
  overrides: Partial<MunicipalReportDependencies> = {},
) {
  const input = ListMunicipalReportsInputSchema.parse(raw),
    deps = { ...DEFAULTS, ...overrides };
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  let query = client
    .from("municipal_report_versions")
    .select(MUNICIPAL_REPORT_SUMMARY_SELECT)
    .eq("project_id", input.projectId);
  if (input.roundVersionId) query = query.eq("round_version_id", input.roundVersionId);
  if (input.beforeVersion) query = query.lt("version_no", input.beforeVersion);
  const { data, error } = await query
    .order("version_no", { ascending: false })
    .limit(input.limit + 1);
  if (error || !Array.isArray(data) || data.length > input.limit + 1) throw failRead();
  const rows: unknown[] = structuredClone(data);
  const items = rows.map(municipalReportSummaryFromRow);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item, index) =>
        item.projectId !== input.projectId ||
        (input.roundVersionId && item.roundVersionId !== input.roundVersionId) ||
        (input.beforeVersion && item.version >= input.beforeVersion) ||
        (index > 0 && items[index - 1].version <= item.version),
    )
  )
    throw failRead();
  await deps.authorize(client as unknown as ProjectAuthorizationClient, actorId, input.projectId);
  return {
    items: items.slice(0, input.limit),
    nextBeforeVersion: items.length > input.limit ? items[input.limit - 1].version : null,
  };
}
export const saveMunicipalReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveMunicipalReportEnvelopeSchema.parse(raw))
  .handler(({ data, context }) =>
    executeSaveMunicipalReport(
      data,
      context.userId,
      context.supabase as unknown as MunicipalReportClient,
    ),
  );
export const getMunicipalReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GetMunicipalReportInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeGetMunicipalReport(
      data,
      context.userId,
      context.supabase as unknown as MunicipalReportClient,
    ),
  );
export const listMunicipalReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListMunicipalReportsInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeListMunicipalReports(
      data,
      context.userId,
      context.supabase as unknown as MunicipalReportClient,
    ),
  );
