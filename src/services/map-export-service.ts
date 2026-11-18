import type { GeoFeatureCollection } from "@/services/geospatial-service";
import type { MapDevice } from "@/services/monitoring/map-devices-service";

/** Includes the selected device layer without fabricating missing positions. */
export function withMapDevices(
  collection: GeoFeatureCollection,
  devices: readonly MapDevice[],
): GeoFeatureCollection & { exportSchemaVersion: string } {
  if (devices.some((device) => device.projectId !== collection.projectId))
    throw Error("Enhedsdata tilhører en anden sag.");
  return {
    ...collection,
    generatedAt: new Date().toISOString(),
    exportSchemaVersion: "gofreyra.map-export/v2",
    features: [
      ...collection.features.filter(
        (feature) => feature.properties["feature_class"] !== "monitoring_device",
      ),
      ...devices.map((device) => ({
        type: "Feature" as const,
        id: `monitoring-device:${device.id}`,
        geometry: device.coordinates
          ? {
              type: "Point" as const,
              coordinates: [device.coordinates.lng, device.coordinates.lat],
            }
          : null,
        properties: {
          feature_class: "monitoring_device",
          project_id: device.projectId,
          device_id: device.id,
          name: device.label,
          observation_type: device.deviceType,
          value: device.measurement?.value ?? null,
          unit: device.measurement?.unit ?? null,
          measurement_id: device.measurement?.id ?? null,
          measured_at: device.measurement?.measuredAt ?? null,
          quality_status: device.measurement?.qualityStatus ?? null,
          position_source: device.coordinates?.source ?? null,
          position_recorded_at: device.coordinates?.recordedAt ?? null,
          data_classification: device.dataClassification ?? "unverified",
          battery_percent: device.batteryPercent,
          signal_strength: device.signalStrength,
          last_seen_at: device.lastSeen,
        },
      })),
    ],
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  // Regneark fortolker tekst, der starter med disse tegn, som en formel.
  // Tal forbliver tal; kun tekstfelter neutraliseres med en synlig apostrof.
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildObservationCsv(collection: GeoFeatureCollection): string {
  const rows: unknown[][] = [
    [
      "id",
      "feature_class",
      "observation_type",
      "value",
      "unit",
      "lng",
      "lat",
      "project_id",
      "device_id",
      "measurement_id",
      "measured_at",
      "position_source",
      "position_recorded_at",
      "quality_status",
      "data_classification",
      "name",
    ],
  ];

  for (const feature of collection.features) {
    if (feature.geometry?.type !== "Point") continue;
    const coordinates = feature.geometry.coordinates;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      typeof coordinates[0] !== "number" ||
      typeof coordinates[1] !== "number" ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1]) ||
      Math.abs(coordinates[0]) > 180 ||
      Math.abs(coordinates[1]) > 90
    )
      continue;
    rows.push([
      feature.id,
      feature.properties["feature_class"],
      feature.properties["observation_type"],
      feature.properties["value"],
      feature.properties["unit"],
      coordinates[0],
      coordinates[1],
      feature.properties["project_id"] ?? collection.projectId,
      feature.properties["device_id"],
      feature.properties["measurement_id"],
      feature.properties["measured_at"],
      feature.properties["position_source"],
      feature.properties["position_recorded_at"],
      feature.properties["quality_status"],
      feature.properties["data_classification"],
      feature.properties["name"],
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
