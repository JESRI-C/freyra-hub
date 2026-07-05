// Actions Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchOpenActionsByProject,
  fetchAllOpenActions,
  insertAction,
  updateAction,
  deleteAction,
  fetchActionEvidence,
  insertActionEvidence,
  deleteActionEvidence,
} from "@/lib/supabase/queries";
import { logAuditEvent } from "@/services/audit-service";
import { SEED_ACTIONS } from "@/data/platform-seed";
import type { IoTSensor } from "@/services/iot-simulation-service";
import type { Action, ActionEvidence } from "@/lib/supabase/types";

function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "PGRST205");
}

export async function getOpenActionsByProject(projectId: string): Promise<Action[]> {
  const fallback = () =>
    SEED_ACTIONS.filter((a) => a.project_id === projectId && a.status !== "Lukket").sort(
      (a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""),
    );
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchOpenActionsByProject(projectId);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

export async function getAllOpenActions(): Promise<Action[]> {
  const fallback = () =>
    SEED_ACTIONS.filter((a) => a.status !== "Lukket").sort((a, b) =>
      (a.due_date ?? "").localeCompare(b.due_date ?? ""),
    );
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchAllOpenActions();
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createAction(input: {
  project_id: string;
  title: string;
  description?: string;
  priority?: "Høj" | "Medium" | "Lav";
  due_date?: string;
  owner?: string;
  site_id?: string | null;
  action_type?: string | null;
  linked_indicator_id?: string | null;
  expected_impact?: string | null;
  requires_evidence?: boolean;
}): Promise<{ id: string }> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  const action = await insertAction({ ...input, status: "Åben" });
  void logAuditEvent({
    project_id: input.project_id,
    event_type: "action_created",
    title: `Handling oprettet: ${input.title}`,
    description: input.description,
    actor: input.owner ?? "Bruger",
    source: "manual",
  });
  return action;
}

export async function startAction(id: string, projectId?: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateAction(id, { status: "I gang", started_at: new Date().toISOString() });
  void logAuditEvent({
    project_id: projectId,
    event_type: "action_updated",
    title: "Handling startet",
    actor: "Bruger",
    source: "manual",
  });
}

export async function completeAction(
  id: string,
  projectId?: string,
  actual_impact?: string,
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateAction(id, {
    status: "Lukket",
    completed_at: new Date().toISOString(),
    ...(actual_impact ? { actual_impact } : {}),
  });
  void logAuditEvent({
    project_id: projectId,
    event_type: "action_completed",
    title: "Handling markeret som afsluttet",
    description: actual_impact,
    actor: "Bruger",
    source: "manual",
  });
}

export async function updateActionDetails(
  id: string,
  input: Partial<{
    title: string; description: string; priority: string; due_date: string;
    owner: string; status: string; site_id: string | null;
    action_type: string | null; linked_indicator_id: string | null;
    expected_impact: string | null; actual_impact: string | null;
    requires_evidence: boolean;
  }>,
  projectId?: string,
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await updateAction(id, input);
  void logAuditEvent({
    project_id: projectId,
    event_type: "action_updated",
    title: `Handling opdateret${input.status ? `: status → ${input.status}` : ""}`,
    actor: "Bruger",
    source: "manual",
  });
}

// ─── Action Evidence ──────────────────────────────────────────────────────────

export async function getActionEvidence(actionId: string): Promise<ActionEvidence[]> {
  if (!isSupabaseConfigured) return [];
  try {
    return await fetchActionEvidence(actionId);
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

export async function addActionEvidence(input: {
  action_id: string;
  evidence_type: "photo" | "document" | "note" | string;
  media_id?: string | null;
  evidence_file_id?: string | null;
  note?: string | null;
  project_id?: string;
}): Promise<ActionEvidence> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  const ev = await insertActionEvidence({
    action_id: input.action_id,
    evidence_type: input.evidence_type,
    media_id: input.media_id ?? null,
    evidence_file_id: input.evidence_file_id ?? null,
    note: input.note ?? null,
  });
  void logAuditEvent({
    project_id: input.project_id,
    event_type: "evidence_added",
    title: `Evidens tilføjet til handling`,
    description: input.note ?? input.evidence_type,
    actor: "Bruger",
    source: "manual",
  });
  return ev;
}

export async function removeActionEvidence(id: string, projectId?: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await deleteActionEvidence(id);
  void logAuditEvent({
    project_id: projectId,
    event_type: "evidence_removed",
    title: "Evidens fjernet fra handling",
    actor: "Bruger",
    source: "manual",
  });
}

export async function removeAction(id: string, projectId?: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await deleteAction(id);
  void logAuditEvent({
    project_id: projectId,
    event_type: "action_deleted",
    title: "Handling slettet",
    actor: "Bruger",
    source: "manual",
  });
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
