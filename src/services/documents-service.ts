// Documents service — project documentation & report generation

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { logAuditEvent } from "@/services/audit-service";
import type { ProjectDocument, Project, Action, Indicator, Site } from "@/lib/supabase/types";
import { renderProjectReportPdf } from "@/services/project-report-pdf";

interface UntypedDb {
  from(table: string): {
    select: (cols?: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
    insert: (values: Record<string, unknown>) => {
      select: (cols?: string) => {
        single: () => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    delete: () => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
}

function getDb(): UntypedDb | null {
  return isSupabaseConfigured ? (supabase as unknown as UntypedDb) : null;
}

export async function listDocuments(projectId: string): Promise<ProjectDocument[]> {
  const db = getDb();
  if (!db) return [];
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectDocument[];
}

export async function deleteDocument(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const { error } = await db.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent({
    event_type: "document.deleted",
    title: "Dokument slettet",
    description: id,
  });
}

export interface GenerateReportInput {
  project: Project;
  sites: Site[];
  actions: Action[];
  indicators: Indicator[];
  reportType: "status" | "indicator" | "authority";
  title?: string;
}

export interface GenerateReportOutput {
  documentId: string | null;
  blob: Blob;
  fileName: string;
}

export async function generateProjectReport(
  input: GenerateReportInput,
): Promise<GenerateReportOutput> {
  const { project, sites, actions, indicators, reportType } = input;
  const title = input.title || defaultTitle(reportType, project.name);
  const fileName = `${slug(title)}-v1.pdf`;

  const pdf = renderProjectReportPdf({
    project,
    sites,
    actions,
    indicators,
    reportType,
    title,
    generatedAt: new Date(),
  });

  const blob = pdf.output("blob");

  // Save row
  let documentId: string | null = null;
  const db = getDb();
  if (db) {
    const { data, error } = await db
      .from("documents")
      .insert({
        project_id: project.id,
        title,
        document_type: reportType,
        status: "generated",
        file_name: fileName,
        mime_type: "application/pdf",
        file_size: blob.size,
        version: 1,
        generated_from: "auto:project-report",
        metadata: {
          sites: sites.length,
          actions: actions.length,
          indicators: indicators.length,
          generated_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();
    if (!error && data) {
      documentId = (data as { id: string }).id;
      await logAuditEvent({
        project_id: project.id,
        event_type: "document.generated",
        title: `Rapport genereret: ${title}`,
        description: `Type: ${reportType}`,
      });
    }
  }

  return { documentId, blob, fileName };
}

function defaultTitle(t: string, name: string) {
  const d = new Date().toISOString().slice(0, 10);
  const label =
    t === "authority"
      ? "Myndighedsrapport"
      : t === "indicator"
        ? "Indikatorrapport"
        : "Projektstatusrapport";
  return `${label} – ${name} – ${d}`;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Documentation completeness scoring
export interface DocumentationScore {
  score: number; // 0-100
  breakdown: { label: string; ok: boolean; weight: number; hint?: string }[];
}

export function computeDocumentationScore(input: {
  project: Project;
  sites: Site[];
  actions: Action[];
  indicators: Indicator[];
  documents: ProjectDocument[];
  evidenceCountByAction: Record<string, number>;
}): DocumentationScore {
  const { project, sites, actions, indicators, documents, evidenceCountByAction } = input;
  const recentActions = actions
    .filter((a) => a.status === "Færdig" || a.completed_at)
    .sort((a, b) => (b.completed_at || b.created_at).localeCompare(a.completed_at || a.created_at))
    .slice(0, 5);
  const missingEvidence = recentActions.filter((a) => (evidenceCountByAction[a.id] ?? 0) === 0);

  const items = [
    {
      label: "Projektbeskrivelse",
      ok: !!project.description && project.description.length > 20,
      weight: 10,
    },
    { label: "Mindst ét site defineret", ok: sites.length > 0, weight: 15 },
    { label: "Mindst én indikator", ok: indicators.length > 0, weight: 15 },
    {
      label: "Indikatorer med tærskler",
      ok: indicators.some((i) => i.threshold_warning != null || i.threshold_critical != null),
      weight: 10,
    },
    { label: "Aktive handlinger", ok: actions.some((a) => a.status !== "Færdig"), weight: 10 },
    {
      label: "Foto/evidens på seneste 5 færdige handlinger",
      ok: recentActions.length > 0 && missingEvidence.length === 0,
      weight: 20,
      hint: missingEvidence.length ? `${missingEvidence.length} mangler` : undefined,
    },
    { label: "Mindst én genereret rapport", ok: documents.length > 0, weight: 10 },
    { label: "Areal / geografi opgivet", ok: !!project.geometry_area_ha, weight: 10 },
  ];
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const scored = items.reduce((s, i) => s + (i.ok ? i.weight : 0), 0);
  const score = Math.round((scored / totalWeight) * 100);
  return { score, breakdown: items };
}
