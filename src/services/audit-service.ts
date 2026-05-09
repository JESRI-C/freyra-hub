// Audit Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchAuditEventsByProject, fetchAllAuditEvents } from "@/lib/supabase/queries";
import { SEED_AUDIT_EVENTS } from "@/data/platform-seed";
import type { AuditEvent } from "@/lib/supabase/types";

export async function getAuditEventsByProject(
  projectId: string,
  limit = 20,
): Promise<AuditEvent[]> {
  if (!isSupabaseConfigured) {
    return SEED_AUDIT_EVENTS.filter((e) => e.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  return fetchAuditEventsByProject(projectId, limit);
}

export async function getAllAuditEvents(limit = 30): Promise<AuditEvent[]> {
  if (!isSupabaseConfigured) {
    return [...SEED_AUDIT_EVENTS]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  return fetchAllAuditEvents(limit);
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
