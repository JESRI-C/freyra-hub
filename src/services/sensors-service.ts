// Sensors Service

import { isDemoDataEnabled, requireCustomerDatabase } from "@/lib/data-mode";
import { fetchSensorsByProject } from "@/lib/supabase/queries";
import { SEED_SENSORS } from "@/data/platform-seed";
import type { Sensor } from "@/lib/supabase/types";

export async function getSensorsByProject(projectId: string): Promise<Sensor[]> {
  if (isDemoDataEnabled) {
    return SEED_SENSORS.filter((s) => s.project_id === projectId).sort((a, b) =>
      (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""),
    );
  }
  requireCustomerDatabase();
  return fetchSensorsByProject(projectId);
}

export function sensorStatusTone(
  status: string | null,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "online":
      return "success";
    case "warning":
      return "warning";
    case "offline":
      return "danger";
    default:
      return "neutral";
  }
}

export function sensorStatusLabel(status: string | null): string {
  switch (status) {
    case "online":
      return "Online";
    case "warning":
      return "Advarsel";
    case "offline":
      return "Offline";
    default:
      return "Ukendt";
  }
}
