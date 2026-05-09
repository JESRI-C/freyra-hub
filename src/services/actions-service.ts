// Actions Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchOpenActionsByProject, fetchAllOpenActions } from "@/lib/supabase/queries";
import { SEED_ACTIONS } from "@/data/platform-seed";
import type { Action } from "@/lib/supabase/types";

export async function getOpenActionsByProject(projectId: string): Promise<Action[]> {
  if (!isSupabaseConfigured) {
    return SEED_ACTIONS.filter((a) => a.project_id === projectId && a.status !== "Lukket").sort(
      (a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""),
    );
  }
  return fetchOpenActionsByProject(projectId);
}

export async function getAllOpenActions(): Promise<Action[]> {
  if (!isSupabaseConfigured) {
    return SEED_ACTIONS.filter((a) => a.status !== "Lukket").sort((a, b) =>
      (a.due_date ?? "").localeCompare(b.due_date ?? ""),
    );
  }
  return fetchAllOpenActions();
}

export function actionPriorityTone(priority: string): "danger" | "warning" | "neutral" {
  switch (priority) {
    case "Høj":
      return "danger";
    case "Medium":
      return "warning";
    default:
      return "neutral";
  }
}

export function actionPriorityColor(priority: string): string {
  switch (priority) {
    case "Høj":
      return "text-destructive";
    case "Medium":
      return "text-amber-600";
    default:
      return "text-muted-foreground";
  }
}
