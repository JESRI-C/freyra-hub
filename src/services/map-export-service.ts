import type { GeoFeatureCollection } from "@/services/geospatial-service";

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
    ["id", "feature_class", "observation_type", "value", "unit", "lng", "lat"],
  ];

  for (const feature of collection.features) {
    if (feature.geometry?.type !== "Point") continue;
    const coordinates = Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : [];
    rows.push([
      feature.id,
      feature.properties["feature_class"],
      feature.properties["observation_type"],
      feature.properties["value"],
      feature.properties["unit"],
      coordinates[0],
      coordinates[1],
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
