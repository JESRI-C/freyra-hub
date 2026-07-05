// Field observations service — CRUD for artsobservationer og feltregistreringer.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type FieldObservation = Database["public"]["Tables"]["field_observations"]["Row"];
export type FieldObservationInsert = Database["public"]["Tables"]["field_observations"]["Insert"];

export async function listObservations(projectId: string, opts?: { limit?: number }): Promise<FieldObservation[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let q = supabase.from("field_observations").select("*").eq("project_id", projectId).order("observed_at", { ascending: false });
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FieldObservation[] | null) ?? [];
}

export async function createObservation(input: FieldObservationInsert): Promise<FieldObservation> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from("field_observations").insert(input as never).select("*").single();
  if (error) throw error;
  return data as FieldObservation;
}

export type ObservationVisibility = "precise" | "masked" | "zone_only" | "hidden";

/** Skjul præcise koordinater for følsomme arter (rundes til zone-centrum). */
export function maskCoordinates(
  lat: number | null,
  lng: number | null,
  visibility: ObservationVisibility,
): { latitude: number | null; longitude: number | null } {
  if (lat == null || lng == null) return { latitude: null, longitude: null };
  switch (visibility) {
    case "precise":
      return { latitude: lat, longitude: lng };
    case "masked":
      // ~1 km grid
      return { latitude: Math.round(lat * 100) / 100, longitude: Math.round(lng * 100) / 100 };
    case "zone_only":
      // ~10 km grid
      return { latitude: Math.round(lat * 10) / 10, longitude: Math.round(lng * 10) / 10 };
    case "hidden":
    default:
      return { latitude: null, longitude: null };
  }
}
