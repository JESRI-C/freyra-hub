// Audit Service
import {
  isSupabaseConfigured,
  supabase,
  createActorBoundSupabaseClient,
} from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoDataEnabled, requireCustomerDatabase } from "@/lib/data-mode";
import {
  fetchAuditEventsByProject,
  fetchAllAuditEvents,
  insertAuditEvent,
} from "@/lib/supabase/queries";
import { SEED_AUDIT_EVENTS } from "@/data/platform-seed";
import type { AuditEvent } from "@/lib/supabase/types";
export async function getAuditEventsByProject(
  projectId: string,
  limit = 20,
): Promise<AuditEvent[]> {
  const fallback = () =>
    SEED_AUDIT_EVENTS.filter((e) => e.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  requireCustomerDatabase();
  return fetchAuditEventsByProject(projectId, limit);
}
export async function getAllAuditEvents(limit = 30): Promise<AuditEvent[]> {
  const fallback = () =>
    [...SEED_AUDIT_EVENTS].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  requireCustomerDatabase();
  return fetchAllAuditEvents(limit);
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
/** Only the server can choose the event's author, kind and project scope. */
export async function logProjectExportRequest(input: {
  actorId?: string;
  projectId: string;
  format: "geojson" | "csv" | "xlsx";
  filename: string;
  entityType?: "watercourse_version" | "work_orders";
  entityId?: string;
}): Promise<void> {
  requireCustomerDatabase();
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  const db = input.actorId ? createActorBoundSupabaseClient(input.actorId) : supabase;
  let receipt: { data: unknown; error: unknown };
  try {
    receipt = await (db as unknown as SupabaseClient).rpc("record_project_data_export_request", {
      p_project_id: input.projectId,
      p_format: input.format,
      p_filename: input.filename,
      p_entity_type: input.entityType ?? null,
      p_entity_id: input.entityId ?? null,
    });
  } catch {
    throw new Error("Eksporten kunne ikke registreres. Kontrollér adgang og prøv igen.");
  }
  const { data, error } = receipt;
  if (
    error ||
    typeof data !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)
  )
    throw new Error("Eksporten kunne ikke registreres. Kontrollér adgang og prøv igen.");
}

export function auditEventsToCsv(events: AuditEvent[]): string {
  const headers = [
    "created_at",
    "event_type",
    "entity_type",
    "entity_id",
    "title",
    "description",
    "actor",
    "source",
  ];
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
    ]
      .map(escape)
      .join(","),
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
