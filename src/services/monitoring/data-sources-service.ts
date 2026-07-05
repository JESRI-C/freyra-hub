// Data sources service — CRUD and column mappings for the "Add data source"
// wizard. Connection testing lives in add-data-source.functions.ts as a
// server function so credentials never live in the browser.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logAuditEvent } from "./audit-service";

export type DataSource = Database["public"]["Tables"]["data_sources"]["Row"];
export type DataSourceInsert = Database["public"]["Tables"]["data_sources"]["Insert"];
export type DataSourceMapping = Database["public"]["Tables"]["data_source_mappings"]["Row"];
export type DataSourceMappingInsert = Database["public"]["Tables"]["data_source_mappings"]["Insert"];

export type DataSourceCategory = "device" | "satellite" | "api" | "file" | "manual" | "public_geodata";

export const DATA_SOURCE_TYPES: { value: string; label: string; category: DataSourceCategory }[] = [
  { value: "sensor", label: "IoT-sensor", category: "device" },
  { value: "gateway", label: "Gateway", category: "device" },
  { value: "camera", label: "Vildtkamera", category: "device" },
  { value: "acoustic", label: "Akustisk optager", category: "device" },
  { value: "drone", label: "Drone", category: "device" },
  { value: "satellite", label: "Satellit", category: "satellite" },
  { value: "weather", label: "Vejrdata", category: "satellite" },
  { value: "api", label: "REST API", category: "api" },
  { value: "webhook", label: "Webhook", category: "api" },
  { value: "csv", label: "CSV-import", category: "file" },
  { value: "excel", label: "Excel-import", category: "file" },
  { value: "geojson", label: "GeoJSON", category: "file" },
  { value: "kml", label: "KML", category: "file" },
  { value: "gpx", label: "GPX", category: "file" },
  { value: "manual_field", label: "Manuel feltregistrering", category: "manual" },
  { value: "manual_species", label: "Artsregistrering", category: "manual" },
  { value: "public_geodata", label: "Offentlige geodata", category: "public_geodata" },
];

export const SYNC_FREQUENCIES = [
  { value: "realtime", label: "Realtid" },
  { value: "5m", label: "Hvert 5. minut" },
  { value: "15m", label: "Hvert 15. minut" },
  { value: "hourly", label: "Hver time" },
  { value: "daily", label: "Dagligt" },
  { value: "weekly", label: "Ugentligt" },
  { value: "monthly", label: "Månedligt" },
  { value: "manual", label: "Manuelt" },
  { value: "on_upload", label: "Ved upload" },
  { value: "on_webhook", label: "Ved webhook" },
];

export async function listDataSources(projectId: string): Promise<DataSource[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("data_sources")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DataSource[] | null) ?? [];
}

export async function createDataSource(input: DataSourceInsert, mappings: Omit<DataSourceMappingInsert, "data_source_id">[] = []): Promise<DataSource> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: raw, error } = await supabase.from("data_sources").insert(input as never).select("*").single();
  const data = raw as DataSource;
  if (error) throw error;
  const source = data as DataSource;
  if (mappings.length) {
    const rows = mappings.map((m) => ({ ...m, data_source_id: source.id })) as never[];
    const { error: mErr } = await supabase.from("data_source_mappings").insert(rows);
    if (mErr) throw mErr;
  }
  await logAuditEvent({
    projectId: source.project_id,
    eventType: "data_source_created",
    entityType: "data_source",
    entityId: source.id,
    title: `Datakilde oprettet: ${source.name}`,
    description: `${source.source_type ?? "ukendt type"} · ${mappings.length} feltmappings`,
    afterData: { id: source.id, source_type: source.source_type, status: source.status },
  });
  return source;
}

export async function listMappings(dataSourceId: string): Promise<DataSourceMapping[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from("data_source_mappings").select("*").eq("data_source_id", dataSourceId);
  if (error) throw error;
  return (data as DataSourceMapping[] | null) ?? [];
}

export async function setDataSourceStatus(id: string, status: string, message?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("data_sources")
    .update({ status, last_sync_status: status, last_sync_message: message ?? null, last_sync_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDataSource(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: existing } = await supabase.from("data_sources").select("*").eq("id", id).maybeSingle();
  const { error } = await supabase.from("data_sources").delete().eq("id", id);
  if (error) throw error;
  await logAuditEvent({
    projectId: existing?.project_id ?? null,
    eventType: "data_source_deleted",
    entityType: "data_source",
    entityId: id,
    title: `Datakilde slettet`,
    beforeData: existing as Record<string, unknown> | null,
  });
}
