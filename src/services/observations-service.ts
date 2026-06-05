// Observations Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchObservationsByProject, insertObservation } from "@/lib/supabase/queries";
import { SEED_OBSERVATIONS } from "@/data/platform-seed";
import type { Observation } from "@/lib/supabase/types";

export async function getObservationsByProject(
  projectId: string,
  limit = 20,
): Promise<Observation[]> {
  if (!isSupabaseConfigured) {
    return [...SEED_OBSERVATIONS]
      .filter((o) => o.project_id === projectId)
      .sort((a, b) => (b.observed_at ?? "").localeCompare(a.observed_at ?? ""))
      .slice(0, limit);
  }
  return fetchObservationsByProject(projectId, limit);
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function recordObservation(input: {
  project_id: string;
  observation_type: "sensor" | "field" | "satellite" | "drone" | "manual" | "remote";
  indicator_key?: string;
  value?: number;
  unit?: string;
  confidence?: number;
  observed_at?: string;
  metadata?: object;
}): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Database ikke konfigureret");
  await insertObservation({
    ...input,
    observed_at: input.observed_at ?? new Date().toISOString(),
  });
}

export function observationTypeLabel(type: string | null): string {
  switch (type) {
    case "sensor":
      return "Sensor";
    case "field":
      return "Feltobservation";
    case "satellite":
      return "Satellitdata";
    case "drone":
      return "Drone";
    case "manual":
      return "Manuel";
    default:
      return "Ukendt";
  }
}
