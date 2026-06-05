/**
 * Zones Service
 * CRUD for projektzoner (project_areas) i Supabase.
 * Zoner er polygoner inden for et projektområde med type og metadata.
 */

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { logAuditEvent } from "@/services/audit-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ZoneType =
  | "pilot_area"       // Pilotområde
  | "buffer"           // Bufferzoner
  | "nature"           // §3-naturareal
  | "watercourse"      // Vandløb/sø
  | "forest"           // Skov
  | "grassland"        // Eng/overdrev
  | "wetland"          // Mose/vådområde
  | "exclusion"        // Eksklusionszone
  | "reference"        // Referenceområde
  | "sensor_zone";     // Sensorzone

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  pilot_area:   "Pilotområde",
  buffer:       "Bufferzone",
  nature:       "§3-natur",
  watercourse:  "Vandløb / Sø",
  forest:       "Skov",
  grassland:    "Eng / Overdrev",
  wetland:      "Mose / Vådområde",
  exclusion:    "Eksklusionszone",
  reference:    "Referenceområde",
  sensor_zone:  "Sensorzone",
};

export const ZONE_TYPE_COLORS: Record<ZoneType, { fill: string; stroke: string }> = {
  pilot_area:   { fill: "#2BC48A", stroke: "#1a9e70" },
  buffer:       { fill: "#8B5CF6", stroke: "#6d40d4" },
  nature:       { fill: "#22c55e", stroke: "#16a34a" },
  watercourse:  { fill: "#3B82F6", stroke: "#2563eb" },
  forest:       { fill: "#15803d", stroke: "#14532d" },
  grassland:    { fill: "#84cc16", stroke: "#65a30d" },
  wetland:      { fill: "#06b6d4", stroke: "#0891b2" },
  exclusion:    { fill: "#ef4444", stroke: "#dc2626" },
  reference:    { fill: "#f59e0b", stroke: "#d97706" },
  sensor_zone:  { fill: "#6366f1", stroke: "#4f46e5" },
};

export interface Zone {
  id: string;
  project_id: string;
  name: string;
  area_type: ZoneType;
  area_ha: number | null;
  geojson: GeoJsonPolygon | null;
  created_at: string;
  properties?: Record<string, unknown>;
}

export interface GeoJsonPolygon {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][];
}

export interface CreateZoneInput {
  project_id: string;
  name: string;
  area_type: ZoneType;
  geojson: GeoJsonPolygon;
  area_ha?: number;
}

// ─── Seed fallback ────────────────────────────────────────────────────────────

const SEED_ZONES: Zone[] = [
  {
    id: "zone-001",
    project_id: "10000000-0000-0000-0000-000000000001",
    name: "Zone A — Vandløb",
    area_type: "watercourse",
    area_ha: 1.4,
    created_at: new Date().toISOString(),
    geojson: {
      type: "Polygon",
      coordinates: [[[9.4821, 55.2514], [9.4826, 55.2514], [9.4826, 55.2520], [9.4821, 55.2520], [9.4821, 55.2514]]],
    },
  },
  {
    id: "zone-002",
    project_id: "10000000-0000-0000-0000-000000000001",
    name: "Zone B — Eng og vådområde",
    area_type: "wetland",
    area_ha: 3.2,
    created_at: new Date().toISOString(),
    geojson: {
      type: "Polygon",
      coordinates: [[[9.4826, 55.2514], [9.4833, 55.2514], [9.4833, 55.2522], [9.4826, 55.2522], [9.4826, 55.2514]]],
    },
  },
  {
    id: "zone-003",
    project_id: "10000000-0000-0000-0000-000000000001",
    name: "Zone C — Skovkant",
    area_type: "forest",
    area_ha: 1.9,
    created_at: new Date().toISOString(),
    geojson: {
      type: "Polygon",
      coordinates: [[[9.4821, 55.2520], [9.4828, 55.2520], [9.4828, 55.2525], [9.4821, 55.2525], [9.4821, 55.2520]]],
    },
  },
  {
    id: "zone-004",
    project_id: "10000000-0000-0000-0000-000000000001",
    name: "Zone D — Bufferområde",
    area_type: "buffer",
    area_ha: 0.8,
    created_at: new Date().toISOString(),
    geojson: {
      type: "Polygon",
      coordinates: [[[9.4828, 55.2520], [9.4835, 55.2520], [9.4835, 55.2525], [9.4828, 55.2525], [9.4828, 55.2520]]],
    },
  },
];

// ─── Read ──────────────────────────────────────────────────────────────────────

export async function getZonesByProject(projectId: string): Promise<Zone[]> {
  if (!isSupabaseConfigured || !supabase) {
    return SEED_ZONES.filter((z) => z.project_id === projectId);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("project_areas")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r["id"] as string,
      project_id: r["project_id"] as string,
      name: r["name"] as string,
      area_type: (r["area_type"] as ZoneType) ?? "pilot_area",
      area_ha: r["area_ha"] as number | null,
      geojson: r["geojson"] as GeoJsonPolygon | null,
      created_at: r["created_at"] as string,
    }));
  } catch {
    return SEED_ZONES.filter((z) => z.project_id === projectId);
  }
}

// ─── Write ─────────────────────────────────────────────────────────────────────

export async function createZone(input: CreateZoneInput): Promise<Zone> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Database ikke konfigureret");
  }

  // Beregn areal med Turf hvis ikke givet
  let areaHa = input.area_ha;
  if (!areaHa && input.geojson) {
    try {
      const { area } = await import("@turf/turf");
      areaHa = Math.round((area({ type: "Feature", geometry: input.geojson, properties: {} }) / 10_000) * 100) / 100;
    } catch { /* turf fejl er ikke kritisk */ }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("project_areas")
    .insert({
      project_id: input.project_id,
      name: input.name,
      area_type: input.area_type,
      geojson: input.geojson,
      area_ha: areaHa ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  void logAuditEvent({
    project_id: input.project_id,
    event_type: "zone_created",
    title: `Zone oprettet: ${input.name}`,
    description: `Type: ${ZONE_TYPE_LABELS[input.area_type]} · Areal: ${areaHa?.toFixed(1) ?? "–"} ha`,
    actor: "Bruger",
    source: "manual",
  });

  return {
    id: data["id"],
    project_id: data["project_id"],
    name: data["name"],
    area_type: data["area_type"],
    area_ha: data["area_ha"],
    geojson: data["geojson"],
    created_at: data["created_at"],
  };
}

export async function updateZone(
  id: string,
  input: Partial<{ name: string; area_type: ZoneType; geojson: GeoJsonPolygon; area_ha: number }>,
  projectId?: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Database ikke konfigureret");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("project_areas")
    .update(input)
    .eq("id", id);

  if (error) throw error;

  void logAuditEvent({
    project_id: projectId,
    event_type: "zone_updated",
    title: `Zone opdateret${input.name ? `: ${input.name}` : ""}`,
    actor: "Bruger",
    source: "manual",
  });
}

export async function deleteZone(id: string, projectId?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Database ikke konfigureret");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("project_areas")
    .delete()
    .eq("id", id);

  if (error) throw error;

  void logAuditEvent({
    project_id: projectId,
    event_type: "zone_deleted",
    title: "Zone slettet",
    actor: "Bruger",
    source: "manual",
  });
}

// ─── Areal-beregning ──────────────────────────────────────────────────────────

export async function calculatePolygonArea(geojson: GeoJsonPolygon): Promise<number> {
  const { area } = await import("@turf/turf");
  return Math.round((area({ type: "Feature", geometry: geojson, properties: {} }) / 10_000) * 100) / 100;
}
