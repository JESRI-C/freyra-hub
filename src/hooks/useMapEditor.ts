/**
 * useMapEditor — Orkestrerer al data til korteditor-siden.
 * Kombinerer zoner, sensorer, §3-natur, NDVI og vandløb.
 *
 * Brug i Lovable UI:
 *   const map = useMapEditor(project)
 *   <MapEditorMap {...map.mapProps} />
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getZonesByProject,
  createZone,
  updateZone,
  deleteZone,
  type Zone,
  type ZoneType,
  type GeoJsonPolygon,
} from "@/services/zones-service";
import { fetchNatureData } from "@/services/nature/paragraph3-service";
import { getProjectSensors } from "@/services/iot-simulation-service";
import type { Project } from "@/lib/supabase/types";
import type { DrawMode, BaseLayer } from "@/components/maps/MapEditorMap";

export interface NewZoneState {
  name: string;
  area_type: ZoneType;
  geojson: GeoJsonPolygon | null;
  area_ha: number | null;
}

export function useMapEditor(project: Project | null, ndvi?: number | null) {
  const queryClient = useQueryClient();
  const lat = project?.geometry_centroid_lat ?? null;
  const lng = project?.geometry_centroid_lng ?? null;
  const areaHa = project?.geometry_area_ha ?? 1;

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [newZoneState, setNewZoneState] = useState<NewZoneState | null>(null);
  const [showSensors, setShowSensors] = useState(true);
  const [showParagraph3, setShowParagraph3] = useState(true);
  const [showWatercourses, setShowWatercourses] = useState(true);
  const [showNdviOverlay, setShowNdviOverlay] = useState(false);

  // ── Zoner ─────────────────────────────────────────────────────────────────────
  const zonesQuery = useQuery({
    queryKey: ["zones", project?.id],
    queryFn: () => getZonesByProject(project!.id),
    enabled: !!project?.id,
    staleTime: 5 * 60 * 1000,
  });

  // ── §3 og artsobservationer ───────────────────────────────────────────────────
  const natureQuery = useQuery({
    queryKey: ["nature-data", lat, lng, areaHa],
    queryFn: () => fetchNatureData(lat!, lng!, areaHa),
    enabled: !!lat && !!lng,
    staleTime: 12 * 60 * 60 * 1000,
  });

  // ── IoT sensorer ──────────────────────────────────────────────────────────────
  const sensors = lat && lng
    ? getProjectSensors(project?.id ?? "", { lat, lng })
    : [];

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createZoneMutation = useMutation({
    mutationFn: (input: { name: string; area_type: ZoneType; geojson: GeoJsonPolygon; area_ha: number }) =>
      createZone({ project_id: project!.id, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zones", project?.id] });
      setNewZoneState(null);
      setDrawMode("none");
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ name: string; area_type: ZoneType }> }) =>
      updateZone(id, input, project?.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zones", project?.id] });
      setSelectedZone(null);
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: (id: string) => deleteZone(id, project?.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zones", project?.id] });
      setSelectedZone(null);
    },
  });

  // ── Drawing callbacks ──────────────────────────────────────────────────────────
  const handleZoneCreated = useCallback((geojson: GeoJsonPolygon, ha: number) => {
    setNewZoneState({ name: `Zone ${(zonesQuery.data?.length ?? 0) + 1}`, area_type: "nature", geojson, area_ha: ha });
  }, [zonesQuery.data?.length]);

  const handleBoundaryDrawn = useCallback((_geojson: GeoJsonPolygon, _ha: number) => {
    // Opdatér projektgrænse — kald updateProjectDetails
    setDrawMode("none");
  }, []);

  const confirmCreateZone = useCallback((name: string, area_type: ZoneType) => {
    if (!newZoneState?.geojson || !newZoneState.area_ha) return;
    createZoneMutation.mutate({
      name,
      area_type,
      geojson: newZoneState.geojson,
      area_ha: newZoneState.area_ha,
    });
  }, [newZoneState, createZoneMutation]);

  // ── Data coverage beregning ───────────────────────────────────────────────────
  const p3Data = natureQuery.data?.p3;
  const sensorCoverage = sensors.length > 0 ? Math.round((sensors.filter((s) => s.status === "online").length / sensors.length) * 100) : 0;
  const ndviCoverage = ndvi !== null && ndvi !== undefined ? 100 : 0;
  const p3Coverage = p3Data ? Math.min(100, p3Data.overlapPercent * 1.5) : 0;
  const fieldCoverage = 58; // fra felt-observationer — beregnes fra geo_observations

  return {
    // Kortdata
    zones: zonesQuery.data ?? [],
    sensors,
    paragraph3Areas: p3Data?.areas.filter((a) => a.geometry !== null).map((a) => ({
      id: a.id,
      natureType: a.natureType,
      geojson: null as GeoJsonPolygon | null, // WFS geometri
    })) ?? [],
    watercourseFeatures: [] as Array<{ id: string; name?: string; coordinates: number[][] }>,

    // Layer synlighed
    showSensors,
    setShowSensors,
    showParagraph3,
    setShowParagraph3,
    showWatercourses,
    setShowWatercourses,
    showNdviOverlay,
    setShowNdviOverlay,

    // Drawing
    drawMode,
    setDrawMode,
    handleZoneCreated,
    handleBoundaryDrawn,
    newZoneState,
    confirmCreateZone,
    isSavingZone: createZoneMutation.isPending,

    // Zone selection
    selectedZone,
    setSelectedZone,

    // Zone mutations
    updateZone: (id: string, input: Partial<{ name: string; area_type: ZoneType }>) =>
      updateZoneMutation.mutate({ id, input }),
    deleteZone: (id: string) => deleteZoneMutation.mutate(id),

    // Datadækning
    coverage: {
      sensor: sensorCoverage,
      satellite: ndviCoverage,
      nature: p3Coverage,
      field: fieldCoverage,
    },

    // Loading
    isLoading: zonesQuery.isLoading || natureQuery.isLoading,
    isNatureLoading: natureQuery.isLoading,
    p3Data,
    speciesData: natureQuery.data?.species,
  };
}
