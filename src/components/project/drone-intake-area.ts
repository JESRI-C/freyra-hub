import { booleanPointInPolygon, point } from "@turf/turf";
import { validateProjectPolygon } from "@/services/geo-service";
import {
  isDroneCameraLocationStatus,
  type DroneLocalizationPhoto,
} from "@/services/geospatial/drone-localization";

export type DroneIntakeCameraPhoto = Pick<DroneLocalizationPhoto, "status" | "cameraPosition">;

/** Camera positions are a consistency gate, never the photographed footprint. */
export function droneIntakeAreaAssessment(polygon: unknown, photos: DroneIntakeCameraPhoto[]) {
  const area = validateProjectPolygon(polygon);
  const located = photos.filter((photo) => isDroneCameraLocationStatus(photo.status));
  let outsideCount = 0;
  for (const photo of located) {
    const position = photo.cameraPosition;
    if (
      !area.valid ||
      !position ||
      !Number.isFinite(position.longitude) ||
      !Number.isFinite(position.latitude) ||
      position.longitude < -180 ||
      position.longitude > 180 ||
      position.latitude < -90 ||
      position.latitude > 90 ||
      !booleanPointInPolygon(point([position.longitude, position.latitude]), area.polygon)
    )
      outsideCount++;
  }
  return { validArea: area.valid, locatedCount: located.length, outsideCount };
}

export function droneIntakeEffectiveReference(input: {
  explicitReferenceId: string;
  savedReferenceId?: string | null;
  suggestedReferenceId?: string | null;
  useProposedArea: boolean;
}): string {
  return (
    input.explicitReferenceId ||
    (input.useProposedArea
      ? input.suggestedReferenceId
      : input.savedReferenceId || input.suggestedReferenceId) ||
    ""
  );
}
