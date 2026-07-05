// Integration connections service — 3.-parts kilder (fx Sentinel Hub, MiljøGIS, GBIF).
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type IntegrationConnection = Database["public"]["Tables"]["integration_connections"]["Row"];
export type IntegrationConnectionInsert = Database["public"]["Tables"]["integration_connections"]["Insert"];

export async function listIntegrations(projectId: string): Promise<IntegrationConnection[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("integration_connections")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as IntegrationConnection[] | null) ?? [];
}

export async function createIntegration(input: IntegrationConnectionInsert): Promise<IntegrationConnection> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from("integration_connections").insert(input as never).select("*").single();
  if (error) throw error;
  return data as IntegrationConnection;
}

export async function deleteIntegration(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("integration_connections").delete().eq("id", id);
  if (error) throw error;
}
