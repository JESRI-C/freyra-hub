// Rene transformationer for natur-geodata: WFS-features → GeoJSON-lag og
// database-rækker (geo_features / nature_contexts). Ingen I/O — testbar isoleret.

/** JSON-sikker værditype — kræves for at server-funktioner kan serialisere resultatet. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Koordinater for Point/LineString/Polygon/Multi*-geometrier. */
export type GeoCoordinates = number[] | number[][] | number[][][] | number[][][][];

export interface RawWfsFeature {
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: { type: string; coordinates: unknown } | null;
}

export interface NatureFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: Record<string, Json>;
    geometry: { type: string; coordinates: GeoCoordinates };
  }>;
}

/**
 * Stabilt eksternt id for en WFS-feature. Bruges som dedupe-nøgle ved upsert i
 * geo_features, så gentagne hentninger ikke skaber dubletter.
 */
export function featureExternalId(feature: RawWfsFeature, prefix: string, index: number): string {
  if (feature.id != null && String(feature.id).length > 0) return `${prefix}:${feature.id}`;
  const objectId =
    feature.properties?.["objekt_id"] ?? feature.properties?.["gml_id"] ?? feature.properties?.["fid"];
  if (objectId != null) return `${prefix}:${objectId}`;
  return `${prefix}:idx-${index}`;
}

/** Normaliser rå WFS-features til en GeoJSON FeatureCollection med metadata. */
export function toFeatureCollection(
  features: RawWfsFeature[],
  opts: { idPrefix: string; extraProperties?: Record<string, unknown> },
): NatureFeatureCollection {
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => f.geometry != null)
      .map((f, i) => ({
        type: "Feature" as const,
        id: featureExternalId(f, opts.idPrefix, i),
        properties: { ...(f.properties ?? {}), ...(opts.extraProperties ?? {}) } as Record<string, Json>,
        geometry: f.geometry as { type: string; coordinates: GeoCoordinates },
      })),
  };
}

export interface GeoFeatureRow {
  layer_id: string;
  external_id: string;
  name: string | null;
  feature_type: string;
  properties: Record<string, unknown>;
  geojson: Record<string, unknown>;
}

/** Map en FeatureCollection til geo_features-rækker for et givet lag. */
export function buildGeoFeatureRows(layerId: string, fc: NatureFeatureCollection, featureType: string): GeoFeatureRow[] {
  return fc.features.map((f) => ({
    layer_id: layerId,
    external_id: f.id,
    name:
      (f.properties["navn"] as string | undefined) ??
      (f.properties["natureType"] as string | undefined) ??
      null,
    feature_type: featureType,
    properties: f.properties,
    geojson: f as unknown as Record<string, unknown>,
  }));
}

export interface NatureContextInput {
  paragraph3AreasHa: number;
  natureTypes: string[];
  watercourseCount: number;
  nearestWatercourseM: number | null;
  natura2000WithinM: number | null;
  natura2000Name: string | null;
}

/** Byg en nature_contexts-række ud fra hentede naturdata. */
export function buildNatureContextRow(projectId: string, input: NatureContextInput) {
  return {
    project_id: projectId,
    adjacent_nature_type: input.natureTypes.length > 0 ? input.natureTypes.join(", ") : null,
    watercourse_present: input.watercourseCount > 0,
    distance_to_watercourse_m: input.nearestWatercourseM,
    protected_nature_present: input.paragraph3AreasHa > 0,
    protected_nature_type: input.natureTypes[0] ?? null,
    natura2000_nearby: input.natura2000WithinM != null && input.natura2000WithinM < 5000,
    distance_to_natura2000_m: input.natura2000WithinM,
  };
}
