// Alert rules, comments and lifecycle helpers.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logAuditEvent } from "./audit-service";

export type AlertRule = Database["public"]["Tables"]["alert_rules"]["Row"];
export type AlertRuleInsert = Database["public"]["Tables"]["alert_rules"]["Insert"];
export type AlertComment = Database["public"]["Tables"]["alert_comments"]["Row"];
export type MonitoringAlert = Database["public"]["Tables"]["monitoring_alerts"]["Row"];

export const ALERT_TRIGGER_TYPES = [
  { value: "device_offline", label: "Enhed offline" },
  { value: "low_battery", label: "Lavt batteri" },
  { value: "missing_data", label: "Manglende data" },
  { value: "integration_failed", label: "Integration fejlet" },
  { value: "import_failed", label: "Import fejlet" },
  { value: "low_data_quality", label: "Lav datakvalitet" },
  { value: "data_anomaly", label: "Dataafvigelse" },
  { value: "critical_reading", label: "Kritisk måling" },
  { value: "action_overdue", label: "Handling forfalden" },
  { value: "manual", label: "Manuel" },
] as const;

export const ALERT_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export async function listAlertRules(projectId: string | null): Promise<AlertRule[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let q = supabase.from("alert_rules").select("*").order("created_at", { ascending: false });
  if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as AlertRule[] | null) ?? [];
}

export async function createAlertRule(input: AlertRuleInsert): Promise<AlertRule> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: raw, error } = await supabase.from("alert_rules").insert(input as never).select("*").single();
  const data = raw as AlertRule;
  if (error) throw error;
  await logAuditEvent({
    projectId: data.project_id,
    eventType: "alert_rule_created",
    entityType: "alert_rule",
    entityId: data.id,
    title: `Alarmregel oprettet: ${data.name}`,
    afterData: { id: data.id, trigger_type: data.trigger_type, severity: data.severity },
  });
  return data as AlertRule;
}

export async function toggleAlertRule(id: string, isActive: boolean): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("alert_rules").update({ is_active: isActive } as never).eq("id", id);
  if (error) throw error;
}

export async function deleteAlertRule(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("alert_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function listComments(alertId: string): Promise<AlertComment[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from("alert_comments").select("*").eq("alert_id", alertId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data as AlertComment[] | null) ?? [];
}

export async function addComment(alertId: string, content: string): Promise<AlertComment> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("alert_comments")
    .insert({ alert_id: alertId, author_id: auth.user.id, content } as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as AlertComment;
}

export async function assignAlert(alertId: string, userId: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: current } = await supabase.from("monitoring_alerts").select("*").eq("id", alertId).maybeSingle();
  const { error } = await supabase.from("monitoring_alerts").update({ assigned_to: userId } as never).eq("id", alertId);
  if (error) throw error;
  await logAuditEvent({
    projectId: current?.project_id ?? null,
    eventType: "alert_assigned",
    entityType: "monitoring_alert",
    entityId: alertId,
    title: userId ? "Alarm tildelt" : "Alarm afvist tildeling",
    beforeData: { assigned_to: current?.assigned_to ?? null },
    afterData: { assigned_to: userId },
  });
}

export async function markAlertStatus(alertId: string, status: string, meta?: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const patch: Record<string, unknown> = { status };
  if (status === "resolved") {
    patch.resolved_at = new Date().toISOString();
    if (meta) patch.resolution_data = meta;
  }
  if (status === "acknowledged") {
    const { data: auth } = await supabase.auth.getUser();
    patch.acknowledged_at = new Date().toISOString();
    patch.acknowledged_by = auth.user?.id ?? null;
  }
  const { error } = await supabase.from("monitoring_alerts").update(patch as never).eq("id", alertId);
  if (error) throw error;
  await logAuditEvent({
    eventType: `alert_${status}`,
    entityType: "monitoring_alert",
    entityId: alertId,
    title: `Alarm markeret som ${status}`,
    afterData: patch,
  });
}
