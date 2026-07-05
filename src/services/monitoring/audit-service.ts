// Audit event helper — logs mutations to public.audit_events.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export interface AuditEventInput {
  projectId?: string | null;
  eventType: string;
  entityType?: string;
  entityId?: string;
  title: string;
  description?: string;
  actor?: string;
  source?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from("audit_events").insert({
    project_id: input.projectId ?? null,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    title: input.title,
    description: input.description ?? null,
    actor: input.actor ?? null,
    source: input.source ?? "monitoring",
    before_data: (input.beforeData ?? null) as never,
    after_data: (input.afterData ?? null) as never,
  } as never);
  // Non-blocking: swallow errors so the primary operation isn't rolled back by
  // audit-log failures.
  if (error) {
    console.warn("[audit] failed to write event", error.message);
  }
}
