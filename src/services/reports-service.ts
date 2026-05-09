// Reports Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchReportsByProject, fetchAllReports } from "@/lib/supabase/queries";
import { SEED_REPORTS } from "@/data/platform-seed";
import type { Report } from "@/lib/supabase/types";

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
