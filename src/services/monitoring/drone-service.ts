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
  const { data, error } = await supabase
    .from("drone_flights")
    .insert(input as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as DroneFlight;
}

export async function listFlightAssets(flightId: string): Promise<DroneAsset[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.from("drone_assets").select("*").eq("flight_id", flightId);
  if (error) throw error;
  return (data as DroneAsset[] | null) ?? [];
}

/** Survey metadata augments the existing flight record, without making up flight geometry. */
export async function createSurvey(
  projectId: string,
  phase: import("./drone-ingest").SurveyPhase,
  date: string,
): Promise<DroneFlight> {
  if (!projectId || !date || Number.isNaN(new Date(date).getTime()))
    throw new Error("Vælg projekt og gyldig flyvedato.");
  return createFlight({
    project_id: projectId,
    flown_at: new Date(date).toISOString(),
    status: "uploaded",
    purpose: phase,
    metadata: { phase, schema_version: 1 },
  });
}
