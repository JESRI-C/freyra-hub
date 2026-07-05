// Monitoring alerts service — list, ack, resolve, create.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MonitoringAlert = Database["public"]["Tables"]["monitoring_alerts"]["Row"];
export type MonitoringAlertInsert = Database["public"]["Tables"]["monitoring_alerts"]["Insert"];

export async function listAlerts(projectId: string, opts?: { status?: string; limit?: number }): Promise<MonitoringAlert[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let q = supabase.from("monitoring_alerts").select("*").eq("project_id", projectId).order("triggered_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data as MonitoringAlert[] | null) ?? [];
}

export async function createAlert(input: MonitoringAlertInsert): Promise<MonitoringAlert> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from("monitoring_alerts").insert(input as never).select("*").single();
  if (error) throw error;
  return data as MonitoringAlert;
}

export async function acknowledgeAlert(id: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("monitoring_alerts")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId, status: "acknowledged" } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function resolveAlert(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("monitoring_alerts")
    .update({ resolved_at: new Date().toISOString(), status: "resolved" } as never)
    .eq("id", id);
  if (error) throw error;
}

export function severityTone(severity: string): "danger" | "warning" | "info" | "neutral" {
  switch (severity) {
    case "critical":
      return "danger";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return "neutral";
  }
}
