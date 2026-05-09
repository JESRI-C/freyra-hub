// Actions Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchOpenActionsByProject, fetchAllOpenActions } from "@/lib/supabase/queries";
import { SEED_ACTIONS } from "@/data/platform-seed";
import type { IoTSensor } from "@/services/iot-simulation-service";
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

export interface SuggestedSensorAction {
  label: string;
  priority: "Høj" | "Medium" | "Lav";
  reason: string;
}

/**
 * Derive suggested field actions from the current sensor readings.
 * Returns an empty array when all sensors are healthy.
 */
export function suggestSensorActions(sensors: IoTSensor[]): SuggestedSensorAction[] {
  const actions: SuggestedSensorAction[] = [];

  const offline = sensors.filter((s) => s.status === "offline");
  const lowBat = sensors.filter((s) => s.batteryPercent < 20 && s.status !== "offline");
  const warnings = sensors.filter((s) => s.status === "warning");

  if (offline.length > 0) {
    actions.push({
      label: `Tjek ${offline.length} offline sensor${offline.length > 1 ? "er" : ""} i felten`,
      priority: "Høj",
      reason: `${offline.map((s) => s.label).join(", ")} sender ikke data.`,
    });
  }

  if (lowBat.length > 0) {
    actions.push({
      label: `Udskift batteri i ${lowBat.length} sensor${lowBat.length > 1 ? "er" : ""}`,
      priority: "Medium",
      reason: `Batteriniveau under 20%: ${lowBat.map((s) => `${s.label} (${s.batteryPercent}%)`).join(", ")}.`,
    });
  }

  if (warnings.length > 0) {
    actions.push({
      label: `Inspicér ${warnings.length} sensor${warnings.length > 1 ? "er" : ""} med advarselsstatus`,
      priority: "Medium",
      reason: `${warnings.map((s) => s.label).join(", ")} rapporterer advarselsstatus.`,
    });
  }

  return actions;
}
