import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { sha256 } from "./drone-ingest";
import { PROVIDER_BLOCKER } from "./drone-processing";

/** Persist a manifest-bound blocked job. Only an authorized server worker may claim it. */
export async function registerProcessingJob(
  projectId: string,
  flightId: string,
): Promise<{ id: string; status: string; error: string | null }> {
  if (!supabase) throw new Error("Supabase ikke konfigureret");
  const db = supabase as unknown as SupabaseClient;
  const media: { id: string; sha256: string | null }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("project_media")
      .select("id,sha256")
      .eq("project_id", projectId)
      .eq("flight_id", flightId)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    media.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  if (!media?.length || media.some((m) => !m.sha256))
    throw new Error("Flyvningen mangler originaler med checksum.");
  const manifest = media
    .map((m) => ({ id: String(m.id), sha256: String(m.sha256) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const inputVersion = await sha256(new Blob([JSON.stringify(manifest)]));
  const { data: existing, error: readError } = await db
    .from("drone_processing_jobs")
    .select("id,status,error")
    .eq("flight_id", flightId)
    .eq("input_version", inputVersion)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  const { data, error: writeError } = await db
    .from("drone_processing_jobs")
    .insert({
      project_id: projectId,
      flight_id: flightId,
      input_version: inputVersion,
      input_manifest: manifest,
      status: "blocked",
      progress: 0,
      error: PROVIDER_BLOCKER,
    })
    .select("id,status,error")
    .single();
  if (writeError) throw writeError;
  return data;
}
