import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  ReportContentSchema,
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
    _content: input.content,
  });
  if (error) throw new Error(`Rapporten blev ikke gemt: ${error.message}`);
  if (!data?.id || !data?.report_id)
    throw new Error("Serveren returnerede ingen gemt rapportversion.");
  return { ...data, content: ReportContentSchema.parse(data.content) } as ReportRevision;
}
async function sourcePages<T>(table: string, columns: string, projectId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db()
      .from(table)
      .select(columns)
      .eq("project_id", projectId)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 500) return rows;
  }
}
interface MediaSourceRow {
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
      "project_media",
      "id,title,captured_at,uploaded_at,lat,lng,category,sha256,file_path,storage_bucket,mime_type",
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
      checksum: m.sha256 ?? null,
      position: m.lat !== null && m.lng !== null ? ([m.lng, m.lat] as [number, number]) : null,
      method: "Originalfoto; position fra registrerede metadata, ikke målfast ortofoto",
      version: m.uploaded_at,
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
  const { data, error } = await db()
    .from("watercourse_observations")
    .select("*, watercourse_observation_reviews(approved_at,approved_by)")
    .eq("project_id", projectId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => row.watercourse_observation_reviews?.approved_at)
    .map((row) => ({
      comparison: row.comparison ?? null,
      text: `${row.segment_id} / ${row.kind}: ${row.text}${row.comparison ? `\nFørfoto: media:${row.comparison.beforeId} (${row.comparison.beforeLight ?? "lys ukendt"}). Efterfoto: ${row.comparison.afterId ? `media:${row.comparison.afterId}` : "mangler"} (${row.comparison.afterLight ?? "lys ukendt"}).` : ""}\nBestemmelsesniveau: ${row.determination_level}. Observation ${row.id}, centerlinjeversion ${row.centerline_version_id}. Gennemgået ${row.watercourse_observation_reviews.approved_at}. Kvalitetsflag: ${(row.quality_flags ?? []).join(", ") || "ingen registreret"}.`,
      sourceIds: (row.source_ids as string[]).map((id) => `media:${id}`),
    }));
}
