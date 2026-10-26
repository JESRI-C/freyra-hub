// Reports Service

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { logAuditEvent } from "@/services/audit-service";
import { updateReport } from "@/lib/supabase/queries";

interface UntypedQueryBuilder {
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  select(columns?: string): UntypedQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}
interface UntypedDb {
  from(table: string): UntypedQueryBuilder;
}
function getDb(): UntypedDb | null {
  return supabase as unknown as UntypedDb | null;
}
import { fetchReportsByProject, fetchAllReports } from "@/lib/supabase/queries";
import { SEED_REPORTS } from "@/data/platform-seed";
import type { Report } from "@/lib/supabase/types";

export interface CreateReportInput {
  type: string;
  organization: string;
  period: string;
  modules: string[];
  audience: string;
  tone: string;
  language: string;
  detailLevel: string;
  formats: string[];
}

export async function createReport(input: CreateReportInput): Promise<{ id: string }> {
  const db = getDb();
  if (isSupabaseConfigured && db) {
    const { data, error } = await db
      .from("reports")
      .insert({
        type: input.type,
        organization: input.organization,
        period: input.period,
        modules: input.modules,
        audience: input.audience,
        tone: input.tone,
        language: input.language,
        detail_level: input.detailLevel,
        formats: input.formats,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = data?.["id"] as string | undefined;
    if (!id) throw new Error("Rapporten blev ikke gemt.");
    void logAuditEvent({
      event_type: "report_created",
      title: `Rapport oprettet: ${input.type} (${input.period})`,
      description: `Målgruppe: ${input.audience} · Format: ${input.formats.join(", ")}`,
      actor: "Bruger",
      source: "manual",
    });
    return { id };
  }
  throw new Error("Database ikke konfigureret; rapporten er ikke gemt.");
}

export async function approveReport(id: string, projectId?: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateReport(id, { status: "approved" });
  void logAuditEvent({
    project_id: projectId,
    event_type: "report",
    title: "Rapport godkendt",
    description: `Rapport-ID: ${id}`,
    actor: "Bruger",
    source: "manual",
  });
}

export async function submitReportForReview(id: string, projectId?: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateReport(id, { status: "review" });
  void logAuditEvent({
    project_id: projectId,
    event_type: "report",
    title: "Rapport sendt til review",
    description: `Rapport-ID: ${id}`,
    actor: "Bruger",
    source: "manual",
  });
}

export async function exportReport(_id: string, _projectId?: string): Promise<void> {
  throw new Error("Vælg en gemt rapportversion i Rapportcenter for at generere en faktisk fil.");
}

function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "PGRST205");
}

export async function getReportsByProject(projectId: string): Promise<Report[]> {
  const fallback = () => SEED_REPORTS.filter((r) => r.project_id === projectId);
  if (!isSupabaseConfigured) return [];
  try {
    return await fetchReportsByProject(projectId);
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

export async function getAllReports(): Promise<Report[]> {
  const fallback = () => [...SEED_REPORTS].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!isSupabaseConfigured) return [];
  try {
    return await fetchAllReports();
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

// Returns a badge tone for a report status value.
export function reportStatusTone(
  status: string | null,
): "success" | "warning" | "info" | "neutral" {
  switch (status) {
    case "Eksporteret":
    case "Godkendt":
      return "success";
    case "Klar til review":
      return "warning";
    case "Kladde":
      return "info";
    default:
      return "neutral";
  }
}
