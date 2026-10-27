// Reports Service
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { isDemoDataEnabled, requireCustomerDatabase } from "@/lib/data-mode";
import { logAuditEvent } from "@/services/audit-service";
import { updateReport } from "@/lib/supabase/queries";
interface UntypedQueryBuilder {
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  select(columns?: string): UntypedQueryBuilder;
  single(): Promise<{
    data: Record<string, unknown> | null;
    error: {
      message: string;
    } | null;
  }>;
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
export async function createReport(input: CreateReportInput): Promise<{
  id: string;
}> {
  requireCustomerDatabase();
  const db = getDb();
  if (db) {
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
    if (error) throw error;
    const id = data?.["id"];
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("Databasen bekræftede ikke den oprettede rapport.");
    }
    void logAuditEvent({
      event_type: "report_created",
      title: `Rapport oprettet: ${input.type} (${input.period})`,
      description: `Målgruppe: ${input.audience} · Format: ${input.formats.join(", ")}`,
      actor: "Bruger",
      source: "manual",
    });
    return { id };
  }
  throw new Error("Database ikke konfigureret");
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
export async function exportReport(id: string, projectId?: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateReport(id, { status: "exported" });
  void logAuditEvent({
    project_id: projectId,
    event_type: "report",
    title: "Rapport eksporteret",
    description: `Rapport-ID: ${id}`,
    actor: "Bruger",
    source: "manual",
  });
}
export async function getReportsByProject(projectId: string): Promise<Report[]> {
  const fallback = () => SEED_REPORTS.filter((r) => r.project_id === projectId);
  requireCustomerDatabase();
  return fetchReportsByProject(projectId);
}
export async function getAllReports(): Promise<Report[]> {
  const fallback = () => [...SEED_REPORTS].sort((a, b) => b.created_at.localeCompare(a.created_at));
  requireCustomerDatabase();
  return fetchAllReports();
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
