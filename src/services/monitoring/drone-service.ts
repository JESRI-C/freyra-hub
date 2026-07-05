// Drone flights service — CRUD for planlagte og gennemførte droneflyvninger + tilhørende assets.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DroneFlight = Database["public"]["Tables"]["drone_flights"]["Row"];
export type DroneFlightInsert = Database["public"]["Tables"]["drone_flights"]["Insert"];
export type DroneAsset = Database["public"]["Tables"]["drone_assets"]["Row"];

export async function listFlights(projectId: string): Promise<DroneFlight[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("drone_flights")
    .select("*")
    .eq("project_id", projectId)
    .order("flown_at", { ascending: false });
  if (error) throw error;
  return (data as DroneFlight[] | null) ?? [];
}

export async function createFlight(input: DroneFlightInsert): Promise<DroneFlight> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from("drone_flights").insert(input as never).select("*").single();
  if (error) throw error;
  return data as DroneFlight;
}

export async function listFlightAssets(flightId: string): Promise<DroneAsset[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from("drone_assets").select("*").eq("flight_id", flightId);
  if (error) throw error;
  return (data as DroneAsset[] | null) ?? [];
}
