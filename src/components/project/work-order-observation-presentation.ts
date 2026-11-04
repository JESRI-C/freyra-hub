import type { ObservationDraftSource } from "@/lib/work-order-observation-drafts";
import { maskCoordinates } from "@/services/monitoring/observations-service";

export function observationSourceName(source: ObservationDraftSource) {
  return (
    source.snapshot.species_name?.trim() || source.snapshot.observation_type || "Feltobservation"
  );
}

export function observationTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Tidspunkt uafklaret";
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function observationPosition(source: ObservationDraftSource) {
  const { latitude, longitude, visibility } = source.snapshot;
  if (visibility === "hidden") return "Position skjult";
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return "Position uafklaret";
  if (!["precise", "masked", "zone_only"].includes(visibility)) return "Position uafklaret";
  const masked = maskCoordinates(
    latitude,
    longitude,
    visibility as "precise" | "masked" | "zone_only",
  );
  const prefix =
    visibility === "precise"
      ? "Gemt position"
      : visibility === "masked"
        ? "Afrundet position"
        : "Afrundet zoneposition";
  return `${prefix}: ${masked.latitude}, ${masked.longitude}`;
}
