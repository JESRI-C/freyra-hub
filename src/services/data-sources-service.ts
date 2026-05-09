// Data Sources Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchDataSourcesByProject, fetchAllDataSources } from "@/lib/supabase/queries";
import { SEED_DATA_SOURCES } from "@/data/platform-seed";
import type { DataSource } from "@/lib/supabase/types";

export async function getDataSourcesByProjectAsync(projectId: string): Promise<DataSource[]> {
  if (!isSupabaseConfigured) {
    return SEED_DATA_SOURCES.filter((d) => d.project_id === projectId);
  }
  return fetchDataSourcesByProject(projectId);
}

export async function getAllDataSources(): Promise<DataSource[]> {
  if (!isSupabaseConfigured) {
    return [...SEED_DATA_SOURCES].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return fetchAllDataSources();
}

export function dataSourceStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "online":
      return "success";
    case "partial":
      return "warning";
    case "attention":
      return "warning";
    case "offline":
      return "danger";
    default:
      return "neutral";
  }
}

export function dataSourceStatusLabel(status: string): string {
  switch (status) {
    case "online":
      return "Online";
    case "partial":
      return "Delvis";
    case "attention":
      return "Kræver handling";
    case "offline":
      return "Offline";
    default:
      return status;
  }
}

export function formatLastSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return "Aldrig";
  const diff = Date.now() - new Date(lastSyncAt).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} t siden`;
  return `${Math.floor(hrs / 24)} d siden`;
}
