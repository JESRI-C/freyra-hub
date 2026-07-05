// Documents service — project documentation & report generation

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { logAuditEvent } from "@/services/audit-service";
import type { ProjectDocument, Project, Action, Indicator, Site } from "@/lib/supabase/types";
import jsPDF from "jspdf";

interface UntypedDb {
  from(table: string): {
    select: (cols?: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
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
  return (isSupabaseConfigured ? (supabase as unknown as UntypedDb) : null);
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
  await logAuditEvent({ event_type: "document.deleted", title: "Dokument slettet", description: id });
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

export async function generateProjectReport(input: GenerateReportInput): Promise<GenerateReportOutput> {
  const { project, sites, actions, indicators, reportType } = input;
  const title = input.title || defaultTitle(reportType, project.name);
  const fileName = `${slug(title)}-v1.pdf`;

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  let y = 56;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(title, 40, y);
  y += 18;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(120);
  pdf.text(`Genereret ${new Date().toLocaleString("da-DK")}`, 40, y);
  y += 24;
  pdf.setTextColor(20);

  // Project summary
  section(pdf, "Projekt", y); y += 18;
  y = kv(pdf, "Navn", project.name, y);
  y = kv(pdf, "Type", project.project_type || "—", y);
  y = kv(pdf, "Status", project.status || "—", y);
  y = kv(pdf, "Areal", project.geometry_area_ha ? `${project.geometry_area_ha} ha` : "—", y);
  y = kv(pdf, "Lokation", project.location_name || project.municipality || "—", y);
  y += 8;

  // Sites
  section(pdf, `Sites (${sites.length})`, y); y += 18;
  if (sites.length === 0) {
    pdf.setFontSize(10); pdf.text("Ingen sites registreret.", 40, y); y += 14;
  } else {
    for (const s of sites.slice(0, 15)) {
      y = ensure(pdf, y);
      pdf.setFontSize(10);
      pdf.text(`• ${s.name}${s.site_type ? ` (${s.site_type})` : ""}${s.area_ha ? ` – ${s.area_ha} ha` : ""}`, 40, y);
      y += 14;
    }
  }
  y += 8;

  // Indicators
  section(pdf, `Indikatorer (${indicators.length})`, y); y += 18;
  if (indicators.length === 0) {
    pdf.setFontSize(10); pdf.text("Ingen indikatorer defineret.", 40, y); y += 14;
  } else {
    for (const i of indicators) {
      y = ensure(pdf, y);
      pdf.setFontSize(10);
      const val = i.current_value != null ? `${i.current_value}${i.unit ? ` ${i.unit}` : ""}` : "—";
      const target = i.target_value != null ? ` / mål ${i.target_value}${i.unit ? ` ${i.unit}` : ""}` : "";
      pdf.text(`• ${i.name}: ${val}${target} — ${i.status || "ukendt"}`, 40, y);
      y += 14;
    }
  }
  y += 8;

  // Actions
  section(pdf, `Handlinger (${actions.length})`, y); y += 18;
  const grouped = groupByStatus(actions);
  for (const [status, items] of Object.entries(grouped)) {
    y = ensure(pdf, y);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
    pdf.text(`${status} (${items.length})`, 40, y); y += 14;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    for (const a of items.slice(0, 20)) {
      y = ensure(pdf, y);
      const line = `• ${a.title}${a.priority ? ` [${a.priority}]` : ""}${a.due_date ? ` — frist ${a.due_date}` : ""}`;
      pdf.text(splitText(pdf, line, w - 80), 40, y);
      y += 14;
    }
    y += 4;
  }

  // Footer
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8); pdf.setTextColor(150);
    pdf.text(`GoFreyra · ${title} · Side ${p}/${pages}`, 40, pdf.internal.pageSize.getHeight() - 20);
  }

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
  const label = t === "authority" ? "Myndighedsrapport" : t === "indicator" ? "Indikatorrapport" : "Projektstatusrapport";
  return `${label} – ${name} – ${d}`;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function section(pdf: jsPDF, label: string, y: number) {
  pdf.setDrawColor(200); pdf.line(40, y - 4, pdf.internal.pageSize.getWidth() - 40, y - 4);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.text(label, 40, y + 10);
}

function kv(pdf: jsPDF, k: string, v: string, y: number) {
  y = ensure(pdf, y);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text(`${k}:`, 40, y);
  pdf.setFont("helvetica", "normal"); pdf.text(v, 120, y);
  return y + 14;
}

function ensure(pdf: jsPDF, y: number) {
  if (y > pdf.internal.pageSize.getHeight() - 60) { pdf.addPage(); return 56; }
  return y;
}

function splitText(pdf: jsPDF, text: string, maxWidth: number): string {
  const arr = pdf.splitTextToSize(text, maxWidth);
  return arr.join("\n");
}

function groupByStatus(actions: Action[]): Record<string, Action[]> {
  const g: Record<string, Action[]> = {};
  for (const a of actions) {
    const k = a.status || "Ukendt";
    (g[k] ||= []).push(a);
  }
  return g;
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
    { label: "Projektbeskrivelse", ok: !!project.description && project.description.length > 20, weight: 10 },
    { label: "Mindst ét site defineret", ok: sites.length > 0, weight: 15 },
    { label: "Mindst én indikator", ok: indicators.length > 0, weight: 15 },
    { label: "Indikatorer med målværdi", ok: indicators.some((i) => i.target_value != null), weight: 10 },
    { label: "Aktive handlinger", ok: actions.some((a) => a.status !== "Færdig"), weight: 10 },
    { label: "Foto/evidens på seneste 5 færdige handlinger", ok: recentActions.length > 0 && missingEvidence.length === 0, weight: 20, hint: missingEvidence.length ? `${missingEvidence.length} mangler` : undefined },
    { label: "Mindst én genereret rapport", ok: documents.length > 0, weight: 10 },
    { label: "Areal / geografi opgivet", ok: !!project.area_hectares, weight: 10 },
  ];
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const scored = items.reduce((s, i) => s + (i.ok ? i.weight : 0), 0);
  const score = Math.round((scored / totalWeight) * 100);
  return { score, breakdown: items };
}
