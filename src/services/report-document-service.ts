import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  BRIDGE_OBSERVATION_TYPE,
  BridgeReportObservationSchema,
  compareBridgeObservations,
  includeBridgeObservations,
} from "@/lib/bridge-observation";
import type { FieldObservation } from "./monitoring/observations-service";
import {
  OBSERVATION_KIND_LABELS,
  observationQualityLabel,
  type WatercourseObservation,
} from "./watercourse-observations";
import type { WatercourseVersion } from "./watercourse-geometry";
import type { Database } from "@/integrations/supabase/types";
import { includeNatureSurvey, NatureSurveyReportSchema } from "@/lib/nature-survey-report";
import { NATURE_SURVEY_OBSERVATION, SURVEY_ZONE_TYPE } from "./nature-survey-service";
import { validateProjectPolygon } from "./geo-service";
import {
  ReportContentSchema,
  ReportPhotoPointReviewSchema,
  SourceSchema,
  validateReportRevision,
  type ReportContent,
  type ReportDocument,
  type ReportRevision,
  type ReportSource,
  type ReportStatus,
} from "@/lib/report-document";
// Additive tables are typed here until generated database types are refreshed after migration.
const db = () => supabase as unknown as SupabaseClient;
export async function listReportDocuments(
  organizationId: string,
  projectId: string,
): Promise<ReportDocument[]> {
  const { data, error } = await db()
    .from("report_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Rapportarkiv kan ikke indlæses: ${error.message}`);
  return data ?? [];
}
export async function getReportRevisions(
  organizationId: string,
  projectId: string,
  reportId: string,
): Promise<ReportRevision[]> {
  const { data: document, error: scopeError } = await db()
    .from("report_documents")
    .select("id")
    .eq("id", reportId)
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (scopeError) throw new Error(scopeError.message);
  if (!document)
    throw new Error("Rapporten tilhører ikke det valgte projekt, eller adgang mangler.");
  const { data, error } = await db()
    .from("report_revisions")
    .select("*")
    .eq("report_id", reportId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (row) => ({ ...row, content: ReportContentSchema.parse(row.content) }) as ReportRevision,
  );
}
export async function saveReportDocument(input: {
  organizationId: string;
  projectId: string;
  reportId: string | null;
  expectedVersion: number;
  status: ReportStatus;
  content: ReportContent;
}): Promise<ReportRevision> {
  validateReportRevision(input.content, input.status);
  const { data, error } = await db().rpc("save_report_revision", {
    _report_id: input.reportId,
    _organization_id: input.organizationId,
    _project_id: input.projectId,
    _expected_version: input.expectedVersion,
    _status: input.status,
    _content:
      input.status === "draft" && !input.content.workOrderApproval
        ? { ...input.content, photoLayoutVersion: 2 }
        : input.content,
  });
  if (error) throw new Error(`Rapporten blev ikke gemt: ${error.message}`);
  if (!data?.id || !data?.report_id)
    throw new Error("Serveren returnerede ingen gemt rapportversion.");
  return { ...data, content: ReportContentSchema.parse(data.content) } as ReportRevision;
}
export async function saveApprovedWorkOrderReport(input: {
  organizationId: string;
  projectId: string;
  actionId: string;
  submissionId: string;
  reviewId: string;
}): Promise<ReportRevision> {
  const { data, error } = await db().rpc("save_approved_work_order_report", {
    p_organization_id: input.organizationId,
    p_project_id: input.projectId,
    p_action_id: input.actionId,
    p_submission_id: input.submissionId,
    p_review_id: input.reviewId,
  });
  if (error)
    throw new Error("Rapporten kunne ikke hentes eller oprettes. Opdatér opgaven og prøv igen.");
  const content = ReportContentSchema.parse(data?.content);
  if (
    !data?.report_id ||
    data.version !== 1 ||
    content.workOrderApproval?.actionId !== input.actionId ||
    content.workOrderApproval.submissionId !== input.submissionId ||
    content.workOrderApproval.reviewId !== input.reviewId
  )
    throw new Error("Rapportens afleveringsgrundlag stemmer ikke.");
  return { ...data, content } as ReportRevision;
}
async function sourcePages<T>(
  table: string,
  columns: string,
  projectId: string,
  filter?: { column: string; value: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db().from(table).select(columns).eq("project_id", projectId);
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query.order("id").range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 500) return rows;
  }
}

export async function loadBridgeReport(projectId: string, report: ReportContent) {
  const [rows, sources, registrations] = await Promise.all([
    sourcePages<FieldObservation>(
      "field_observations",
      "id,observed_at,metadata,latitude,longitude,accuracy_m,notes",
      projectId,
      { column: "observation_type", value: BRIDGE_OBSERVATION_TYPE },
    ),
    loadReportSources(projectId),
    loadRegistrationSources(projectId),
  ]);
  if (!rows.length) throw new Error("Sagen har ingen broregistreringer endnu.");
  const observations = rows.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {};
    const parsed = BridgeReportObservationSchema.safeParse({
      ...metadata,
      id: row.id,
      observedAt: row.observed_at,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.accuracy_m,
      conditions: row.notes,
    });
    if (!parsed.success)
      throw new Error(`Feltregistrering ${row.id} har ugyldige eller ufuldstændige oplysninger.`);
    return parsed.data;
  });
  observations.sort(compareBridgeObservations);
  const content = includeBridgeObservations(report, observations, sources);
  return citeRegistrationSources(
    content,
    registrations,
    observations.map(({ id }) => `field:${id}`),
    ["section-2", "section-3", "section-4", "section-5", "section-11"],
  );
}

async function loadRegistrationSources(projectId: string): Promise<ReportSource[]> {
  const rows = await sourcePages<{ source: unknown }>(
    "report_registration_sources",
    "id,source",
    projectId,
  );
  return rows.map(({ source }) => SourceSchema.parse(source));
}

function citeRegistrationSources(
  content: ReportContent,
  sources: ReportSource[],
  ids: string[],
  sectionIds: string[],
) {
  const used = sources.filter(({ id }) => ids.includes(id));
  const byId = new Map([...content.sources, ...used].map((source) => [source.id, source]));
  if (used.length !== ids.length)
    throw new Error("Feltregistreringernes kilder kunne ikke indlæses fuldt ud.");
  return {
    ...content,
    sources: [...byId.values()],
    sections: content.sections.map((section) =>
      sectionIds.includes(section.id) && section.basis === "observed"
        ? { ...section, sourceIds: [...new Set([...section.sourceIds, ...ids])] }
        : section,
    ),
  };
}

export async function loadNatureSurveyReport(projectId: string, report: ReportContent) {
  type Area = Database["public"]["Tables"]["monitoring_zones"]["Row"];
  const [areas, observations, registrations] = await Promise.all([
    sourcePages<Area>("monitoring_zones", "id,name,description,geometry,area_hectares", projectId, {
      column: "zone_type",
      value: SURVEY_ZONE_TYPE,
    }),
    sourcePages<FieldObservation>(
      "field_observations",
      "id,zone_id,observed_at,metadata,notes",
      projectId,
      { column: "observation_type", value: NATURE_SURVEY_OBSERVATION },
    ),
    loadRegistrationSources(projectId),
  ]);
  if (!areas.length) throw new Error("Sagen har ingen registrerede naturundersøgelsesområder.");
  const areaIds = new Set(areas.map(({ id }) => id));
  const survey = NatureSurveyReportSchema.parse({
    areas: areas
      .map((area) => {
        const geometry = validateProjectPolygon(area.geometry);
        if (!geometry.valid)
          throw new Error(`Undersøgelsesområdet ${area.name} har en ugyldig grænse.`);
        return {
          id: area.id,
          name: area.name,
          method: area.description,
          hectares: area.area_hectares,
          geometry: geometry.polygon,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "da", { numeric: true })),
    observations: observations
      .map((row) => {
        if (!row.zone_id || !areaIds.has(row.zone_id))
          throw new Error(`Feltobservation ${row.id} mangler et tilgængeligt undersøgelsesområde.`);
        const metadata =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? row.metadata
            : {};
        return {
          ...metadata,
          id: row.id,
          zoneId: row.zone_id,
          observedAt: row.observed_at,
          notes: row.notes,
        };
      })
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)),
  });
  return citeRegistrationSources(
    includeNatureSurvey(report, survey),
    registrations,
    [
      ...survey.areas.map(({ id }) => `survey-area:${id}`),
      ...survey.observations.map(({ id }) => `field:${id}`),
    ],
    report.templateId === "biodiversity"
      ? ["section-2", "section-3", "section-4", "section-5", "section-6", "section-11"]
      : ["section-2", "section-3", "section-4", "section-5"],
  );
}
interface MediaSourceRow {
  photo_point_review: unknown;
  method: string | null;
  version: string | null;
  capture_date: string | null;
  id: string;
  title: string;
  category: string;
  captured_at: string | null;
  uploaded_at: string;
  lat: number | null;
  lng: number | null;
  sha256: string | null;
  file_path: string;
  storage_bucket: string | null;
  mime_type: string | null;
}
interface EvidenceSourceRow {
  id: string;
  title: string;
  evidence_type: string | null;
  created_at: string | null;
}
export async function loadReportSources(projectId: string): Promise<ReportSource[]> {
  const [media, files] = await Promise.all([
    sourcePages<MediaSourceRow>(
      "reviewed_report_media_sources",
      "id,title,captured_at,capture_date,uploaded_at,lat,lng,category,sha256,file_path,storage_bucket,mime_type,photo_point_review,method,version",
      projectId,
    ),
    sourcePages<EvidenceSourceRow>(
      "evidence_files",
      "id,title,created_at,evidence_type",
      projectId,
    ),
  ]);
  return [
    ...(media ?? []).map((m) => ({
      id: `media:${m.id}`,
      filePath: m.file_path,
      storageBucket: m.storage_bucket ?? "project-media",
      mimeType: m.mime_type,
      title: m.title,
      kind: m.category,
      capturedAt: m.captured_at,
      ...(m.capture_date ? { localCaptureDate: m.capture_date } : {}),
      ...(m.photo_point_review
        ? { photoPointReview: ReportPhotoPointReviewSchema.parse(m.photo_point_review) }
        : {}),
      checksum: m.sha256 ?? null,
      position: m.lat !== null && m.lng !== null ? ([m.lng, m.lat] as [number, number]) : null,
      method: m.method ?? "Originalfoto; position fra registrerede metadata, ikke målfast ortofoto",
      version: m.version ?? m.uploaded_at,
    })),
    ...(files ?? []).map((f) => ({
      id: `evidence:${f.id}`,
      title: f.title,
      kind: f.evidence_type ?? "dokument",
      capturedAt: f.created_at,
      checksum: null,
      position: null,
      method: "Registreret dokument; indhold kræver faglig gennemgang",
      version: f.created_at ?? "ukendt",
    })),
  ];
}

export async function loadReviewedReportObservations(projectId: string, organizationId: string) {
  const rows = await sourcePages<
    WatercourseObservation & {
      watercourse_versions: Pick<
        WatercourseVersion,
        "id" | "version" | "method" | "source" | "segments"
      > | null;
    }
  >(
    "watercourse_observations",
    "*,watercourse_observation_reviews!inner(approved_at,approved_by),watercourse_versions(id,version,method,source,segments)",
    projectId,
    { column: "organization_id", value: organizationId },
  );

  return rows.flatMap((row) => {
    const review = row.watercourse_observation_reviews;
    if (!review?.approved_at) return [];
    const line = row.watercourse_versions;
    const segment = line?.segments.find(({ id }) => id === row.segment_id);
    if (
      !line ||
      line.id !== row.centerline_version_id ||
      !segment ||
      !Number.isFinite(segment.fromM) ||
      !Number.isFinite(segment.toM)
    )
      throw new Error(`Den gemte delstrækning for observation ${row.id} kunne ikke indlæses.`);
    const sourceIds = row.source_ids.map((id) => `media:${id}`);
    const pair = row.comparison;
    const photos = pair?.afterId
      ? `Førfoto: media:${pair.beforeId} (${pair.beforeLight ?? "lys ukendt"}). Efterfoto: media:${pair.afterId} (${pair.afterLight ?? "lys ukendt"}).`
      : `Kildefoto: ${sourceIds.join(", ")}${pair?.beforeLight ? ` (${pair.beforeLight})` : ""}.`;
    const level = {
      observed: "Observeret",
      species_suggestion: "Artsforslag",
      screening: "Screening",
    }[row.determination_level];
    return [
      {
        comparison: pair?.afterId ? pair : null,
        screening: row.determination_level !== "observed",
        sourceIds,
        text: [
          `${segment.name} · station ${segment.fromM.toLocaleString("da-DK")}–${segment.toM.toLocaleString("da-DK")} m · ${row.feature_key}. ${row.text}`,
          photos,
          `Centerlinjeversion ${line.version} (${line.id}), delstrækning ${row.segment_id}. Linjekilde: ${line.source}. Opmålingsmetode: ${line.method}.`,
          `${OBSERVATION_KIND_LABELS[row.kind]} · ${level}. Observation ${row.id}. Gennemgået ${review.approved_at} af ${review.approved_by}. Forbehold: ${row.quality_flags.map(observationQualityLabel).join(", ") || "ingen registreret"}.`,
        ].join("\n"),
      },
    ];
  });
}
