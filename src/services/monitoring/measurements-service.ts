// Device measurements service — insert + querying + anomaly detection
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DeviceMeasurement = Database["public"]["Tables"]["device_measurements"]["Row"];
export type DeviceMeasurementInsert = Database["public"]["Tables"]["device_measurements"]["Insert"];

export async function listMeasurements(deviceId: string, opts?: { from?: Date; to?: Date; limit?: number }): Promise<DeviceMeasurement[]> {
  if (!isSupabaseConfigured) return [];
  let q = supabase.from("device_measurements").select("*").eq("device_id", deviceId).order("measured_at", { ascending: false });
  if (opts?.from) q = q.gte("measured_at", opts.from.toISOString());
  if (opts?.to) q = q.lte("measured_at", opts.to.toISOString());
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function insertMeasurement(m: DeviceMeasurementInsert): Promise<DeviceMeasurement> {
  const { data, error } = await supabase.from("device_measurements").insert(m).select("*").single();
  if (error) throw error;
  return data;
}

/** Simple z-score anomaly detection on a numeric series. */
export function detectAnomalies(values: number[], threshold = 2.5): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance) || 1;
  return values.map((v) => Math.abs((v - mean) / sd) > threshold);
}
