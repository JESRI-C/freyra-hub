import type { ObservationDraftSource } from "@/lib/work-order-observation-drafts";
import { maskCoordinates } from "@/services/monitoring/observations-service";

export function observationSourceName(source: ObservationDraftSource) {
  return (
    source.snapshot.species_name?.trim() || observationTypeLabel(source.snapshot.observation_type)
  );
}

export function observationTypeLabel(value: string) {
  switch (value) {
    case "species":
      return "Artsobservation";
    case "manual":
      return "Manuel registrering";
    case "field":
      return "Feltobservation";
    case "inspection":
      return "Besigtigelse";
    default:
      return value || "Observationstype uafklaret";
  }
}

export function observationStatusLabel(value: string) {
  switch (value) {
    case "draft":
      return "Kladde";
    case "confirmed":
      return "Bekræftet registrering";
    case "rejected":
      return "Afvist registrering";
    default:
      return value || "Status uafklaret";
  }
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
