// Monitoring devices service — CRUD + status derivation
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MonitoringDevice = Database["public"]["Tables"]["monitoring_devices"]["Row"];
export type MonitoringDeviceInsert = Database["public"]["Tables"]["monitoring_devices"]["Insert"];
export type MonitoringDeviceUpdate = Database["public"]["Tables"]["monitoring_devices"]["Update"];

export type DeviceStatus = "online" | "partial" | "attention" | "offline" | "not_activated";

function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  return supabase;
}

/** Compute a device status from last_seen_at + expected_interval_minutes. */
export function deriveDeviceStatus(device: Pick<MonitoringDevice, "status" | "last_seen_at" | "expected_interval_minutes" | "battery_level">): DeviceStatus {
  if (device.status === "not_activated") return "not_activated";
  if (!device.last_seen_at) return "offline";
  const ageMin = (Date.now() - new Date(device.last_seen_at).getTime()) / 60_000;
  const interval = device.expected_interval_minutes ?? 60;
  if (ageMin > interval * 4) return "offline";
  if (ageMin > interval * 2) return "attention";
  if ((device.battery_level ?? 100) < 20) return "partial";
  return "online";
}

export async function listDevices(projectId: string): Promise<MonitoringDevice[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("monitoring_devices")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as MonitoringDevice[] | null) ?? [];
}

export async function getDevice(id: string): Promise<MonitoringDevice | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.from("monitoring_devices").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as MonitoringDevice | null;
}

export async function createDevice(input: MonitoringDeviceInsert): Promise<MonitoringDevice> {
  const { data, error } = await client().from("monitoring_devices").insert(input as never).select("*").single();
  if (error) throw error;
  return data as MonitoringDevice;
}

export async function updateDevice(id: string, patch: MonitoringDeviceUpdate): Promise<MonitoringDevice> {
  const { data, error } = await client().from("monitoring_devices").update(patch as never).eq("id", id).select("*").single();
  if (error) throw error;
  return data as MonitoringDevice;
}

export async function deleteDevice(id: string): Promise<void> {
  const { error } = await client().from("monitoring_devices").delete().eq("id", id);
  if (error) throw error;
}

export interface DeviceKpis {
  total: number;
  online: number;
  attention: number;
  offline: number;
  lowBattery: number;
}

export function computeDeviceKpis(devices: MonitoringDevice[]): DeviceKpis {
  const kpi: DeviceKpis = { total: devices.length, online: 0, attention: 0, offline: 0, lowBattery: 0 };
  for (const d of devices) {
    const status = deriveDeviceStatus(d);
    if (status === "online") kpi.online++;
    else if (status === "attention" || status === "partial") kpi.attention++;
    else if (status === "offline") kpi.offline++;
    if ((d.battery_level ?? 100) < 20) kpi.lowBattery++;
  }
  return kpi;
}
