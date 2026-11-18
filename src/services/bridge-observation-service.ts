import type { SupabaseClient } from "@supabase/supabase-js";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { BRIDGE_OBSERVATION_TYPE, bridgeObservationInsert } from "@/lib/bridge-observation";
import type { Database } from "@/integrations/supabase/types";
import { createObservation } from "./monitoring/observations-service";

type BridgeInsert = ReturnType<typeof bridgeObservationInsert>;

export async function listBridgeObservations(projectId: string, actorId: string) {
  const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient<Database>;
  type Row = Pick<
    Database["public"]["Tables"]["field_observations"]["Row"],
    "id" | "observed_at" | "metadata" | "latitude" | "longitude" | "notes"
  >;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("field_observations")
      .select("id,observed_at,metadata,latitude,longitude,notes")
      .eq("project_id", projectId)
      .eq("observation_type", BRIDGE_OBSERVATION_TYPE)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

/** Reconcile a retry whose first insert may have committed before the response was lost. */
export async function saveBridgeObservation(input: BridgeInsert, actorId: string) {
  if (input.observer_id !== actorId) throw new Error("Registreringen tilhører en anden bruger.");
  try {
    return await createObservation(input, actorId);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "23505")
      throw error;
  }

  const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient<Database>;
  const { data, error } = await client
    .from("field_observations")
    .select("*")
    .eq("id", input.id)
    .eq("project_id", input.project_id)
    .eq("observer_id", actorId)
    .eq("observation_type", input.observation_type)
    .maybeSingle();
  if (error) throw error;
  const metadata = data?.metadata;
  if (
    !data ||
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    metadata.schema !== input.metadata.schema
  )
    throw new Error("Den eksisterende broregistrering kunne ikke bekræftes. Genindlæs sagen.");
  const existing = bridgeObservationInsert(
    {
      ...metadata,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracyM: data.accuracy_m,
      conditions: data.notes,
    },
    data.project_id,
    data.observer_id ?? "",
    data.id,
  );
  if (JSON.stringify(existing) !== JSON.stringify(input))
    throw new Error("Registreringen er allerede gemt med andre oplysninger. Genindlæs sagen.");
  return data;
}
