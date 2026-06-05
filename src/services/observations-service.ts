// Observations Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchObservationsByProject, insertObservation } from "@/lib/supabase/queries";
import { logAuditEvent } from "@/services/audit-service";
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
  void logAuditEvent({
    project_id: input.project_id,
    event_type: "observation",
    title: `${observationTypeLabel(input.observation_type)}: ${input.indicator_key ?? input.observation_type}`,
    description: input.value !== undefined
      ? `Målt: ${input.value}${input.unit ? " " + input.unit : ""}`
      : undefined,
    actor: input.observation_type === "sensor" ? "IoT System" : "Bruger",
    source: input.observation_type === "sensor" ? "automated" : "manual",
  });
}

/**
 * Batch-logger sensor-målinger fra IoT-simuleringen.
 * Skrives kun hvis Supabase er konfigureret — fejler aldrig stille.
 */
export async function recordSensorBatch(
  projectId: string,
  readings: Array<{ sensorType: string; value: number; unit: string; label: string }>,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  await Promise.allSettled(
    readings.map((r) =>
      recordObservation({
        project_id: projectId,
        observation_type: "sensor",
        indicator_key: r.sensorType,
        value: r.value,
        unit: r.unit,
      }),
    ),
  );
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
