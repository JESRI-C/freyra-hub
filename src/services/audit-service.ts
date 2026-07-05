// Audit Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchAuditEventsByProject, fetchAllAuditEvents, insertAuditEvent } from "@/lib/supabase/queries";
import { SEED_AUDIT_EVENTS } from "@/data/platform-seed";
import type { AuditEvent } from "@/lib/supabase/types";

function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "PGRST205");
}

export async function getAuditEventsByProject(
  projectId: string,
  limit = 20,
): Promise<AuditEvent[]> {
  const fallback = () =>
    SEED_AUDIT_EVENTS.filter((e) => e.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchAuditEventsByProject(projectId, limit);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

export async function getAllAuditEvents(limit = 30): Promise<AuditEvent[]> {
  const fallback = () =>
    [...SEED_AUDIT_EVENTS]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  if (!isSupabaseConfigured) return fallback();
  try {
    return await fetchAllAuditEvents(limit);
  } catch (err) {
    if (isMissingTable(err)) return fallback();
    throw err;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function logAuditEvent(input: {
  project_id?: string;
  event_type?: string;
  title: string;
  description?: string;
  actor?: string;
  source?: "manual" | "automated" | "api";
  entity_type?: string;
  entity_id?: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
}): Promise<void> {
  if (!isSupabaseConfigured) return; // silent no-op i dev
  await insertAuditEvent(input);
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function auditEventsToCsv(events: AuditEvent[]): string {
  const headers = ["created_at", "event_type", "entity_type", "entity_id", "title", "description", "actor", "source"];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const rows = events.map((e) =>
    [
      e.created_at,
      e.event_type,
      e.entity_type,
      e.entity_id,
      e.title,
      e.description,
      e.actor,
      e.source,
    ].map(escape).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export function downloadAuditCsv(events: AuditEvent[], fileName = "audit-trail.csv"): void {
  const blob = new Blob([auditEventsToCsv(events)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Returns a Lucide icon name for the event_type.
export function auditEventIcon(eventType: string | null): string {
  switch (eventType) {
    case "verification":
      return "ShieldCheck";
    case "data_update":
      return "RefreshCw";
    case "observation":
      return "Eye";
    case "report":
      return "FileText";
    case "risk":
      return "AlertTriangle";
    default:
      return "Activity";
  }
}
