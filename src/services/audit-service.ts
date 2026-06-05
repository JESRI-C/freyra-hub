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
}): Promise<void> {
  if (!isSupabaseConfigured) return; // silent no-op i dev
  await insertAuditEvent(input);
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
