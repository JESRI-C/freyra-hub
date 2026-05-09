// Reports Service

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

interface UntypedQueryBuilder {
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  select(columns?: string): UntypedQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}
interface UntypedDb { from(table: string): UntypedQueryBuilder; }
function getDb(): UntypedDb | null { return supabase as unknown as UntypedDb | null; }
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
    return { id: (data?.["id"] as string) ?? `report-${Date.now()}` };
  }
  return { id: `report-${Date.now()}` };
}

export async function getReportsByProject(projectId: string): Promise<Report[]> {
  if (!isSupabaseConfigured) {
    return SEED_REPORTS.filter((r) => r.project_id === projectId);
  }
  return fetchReportsByProject(projectId);
}

export async function getAllReports(): Promise<Report[]> {
  if (!isSupabaseConfigured) {
    return [...SEED_REPORTS].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
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
