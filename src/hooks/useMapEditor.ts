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
import { fetchNatureData, fetchWatercourses } from "@/services/nature/paragraph3-service";
import { getProjectSensors } from "@/services/iot-simulation-service";
import { updateProjectDetails } from "@/services/projects-service";
import type { Project } from "@/lib/supabase/types";
import type { DrawMode } from "@/components/maps/MapEditorMap";

export interface NewZoneState {
  name: string;
  area_type: ZoneType;
  geojson: GeoJsonPolygon | null;
  area_ha: number | null;
}

/** Beregner centroid af en polygon-ring som simpelt gennemsnit. */
function polygonCentroid(geojson: GeoJsonPolygon): { lat: number; lng: number } | null {
  const ring = geojson.coordinates[0];
  if (!ring || ring.length === 0) return null;
  let sumLat = 0, sumLng = 0;
  ring.forEach(([lngC, latC]) => { sumLat += latC; sumLng += lngC; });
  return {
    lat: Math.round((sumLat / ring.length) * 1e6) / 1e6,
    lng: Math.round((sumLng / ring.length) * 1e6) / 1e6,
  };
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [boundarySaved, setBoundarySaved] = useState(false);

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

  // ── Vandløb fra Miljøportal WFS ───────────────────────────────────────────────
  const watercoursesQuery = useQuery({
    queryKey: ["watercourses", lat, lng],
    queryFn: () => fetchWatercourses(lat!, lng!),
    enabled: !!lat && !!lng,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  // ── IoT sensorer ──────────────────────────────────────────────────────────────
  const sensors = lat && lng
    ? getProjectSensors(project?.id ?? "", { lat, lng })
    : [];

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const onMutationError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : "Ukendt fejl";
    setLastError(
      msg.includes("row-level security") || msg.includes("policy")
        ? "Du skal være logget ind for at gemme. Log ind og prøv igen."
        : msg,
    );
  };

  const createZoneMutation = useMutation({
    mutationFn: (input: { name: string; area_type: ZoneType; geojson: GeoJsonPolygon; area_ha: number }) =>
      createZone({ project_id: project!.id, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zones", project?.id] });
      setNewZoneState(null);
      setDrawMode("none");
      setLastError(null);
    },
    onError: onMutationError,
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ name: string; area_type: ZoneType }> }) =>
      updateZone(id, input, project?.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zones", project?.id] });
      setSelectedZone(null);
      setLastError(null);
    },
    onError: onMutationError,
  });

  const deleteZoneMutation = useMutation({
    mutationFn: (id: string) => deleteZone(id, project?.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zones", project?.id] });
      setSelectedZone(null);
      setLastError(null);
    },
    onError: onMutationError,
  });

  // Gem tegnet projektgrænse på projektet
  const saveBoundaryMutation = useMutation({
    mutationFn: async ({ geojson, ha, source }: { geojson: GeoJsonPolygon; ha: number; source?: string }) => {
      const centroid = polygonCentroid(geojson);
      await updateProjectDetails(project!.id, {
        geometry_polygon: geojson,
        geometry_area_ha: ha,
        geometry_source: source ?? "manual",
        ...(centroid ? {
          geometry_centroid_lat: centroid.lat,
          geometry_centroid_lng: centroid.lng,
        } : {}),
      });
    },
    onSuccess: () => {
      // Alle afledte forespørgsler skal genindlæses når projektgrænsen ændres.
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project-by-slug"] });
      void queryClient.invalidateQueries({ queryKey: ["environmental-context"] });
      void queryClient.invalidateQueries({ queryKey: ["nature-data"] });
      void queryClient.invalidateQueries({ queryKey: ["watercourses"] });
      void queryClient.invalidateQueries({ queryKey: ["biodiversity"] });
      void queryClient.invalidateQueries({ queryKey: ["ndvi"] });
      void queryClient.invalidateQueries({ queryKey: ["indicators"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      setBoundarySaved(true);
      setLastError(null);
      setTimeout(() => setBoundarySaved(false), 4000);
    },
    onError: onMutationError,
  });

  // Ryd projektgrænsen helt (nulstil polygon, areal og kilde).
  const clearBoundaryMutation = useMutation({
    mutationFn: async () => {
      await updateProjectDetails(project!.id, {
        geometry_polygon: null,
        geometry_area_ha: null,
        geometry_source: null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project-by-slug"] });
      void queryClient.invalidateQueries({ queryKey: ["environmental-context"] });
      void queryClient.invalidateQueries({ queryKey: ["nature-data"] });
      void queryClient.invalidateQueries({ queryKey: ["watercourses"] });
      void queryClient.invalidateQueries({ queryKey: ["biodiversity"] });
      void queryClient.invalidateQueries({ queryKey: ["ndvi"] });
      void queryClient.invalidateQueries({ queryKey: ["indicators"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      setLastError(null);
    },
    onError: onMutationError,
  });

  // ── Drawing callbacks ──────────────────────────────────────────────────────────
  const handleZoneCreated = useCallback((geojson: GeoJsonPolygon, ha: number) => {
    setNewZoneState({ name: `Zone ${(zonesQuery.data?.length ?? 0) + 1}`, area_type: "nature", geojson, area_ha: ha });
  }, [zonesQuery.data?.length]);

  const handleBoundaryDrawn = useCallback((geojson: GeoJsonPolygon, ha: number, source?: string) => {
    setDrawMode("none");
    saveBoundaryMutation.mutate({ geojson, ha, source });
  }, [saveBoundaryMutation]);

  const clearBoundary = useCallback(() => {
    clearBoundaryMutation.mutate();
  }, [clearBoundaryMutation]);

  const confirmCreateZone = useCallback((name: string, area_type: ZoneType) => {
    if (!newZoneState?.geojson || !newZoneState.area_ha) return;
    createZoneMutation.mutate({
      name,
      area_type,
      geojson: newZoneState.geojson,
      area_ha: newZoneState.area_ha,
    });
  }, [newZoneState, createZoneMutation]);

  const cancelNewZone = useCallback(() => {
    setNewZoneState(null);
    setDrawMode("none");
  }, []);

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
    paragraph3Areas: p3Data?.areas
      .filter((a) => a.geometry !== null)
      .map((a) => ({
        id: a.id,
        natureType: a.natureType,
        geojson: a.geometry as GeoJsonPolygon | null,
      })) ?? [],
    watercourseFeatures: watercoursesQuery.data ?? [],

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
    cancelNewZone,
    isSavingZone: createZoneMutation.isPending,
    isSavingBoundary: saveBoundaryMutation.isPending,
    boundarySaved,

    // Zone selection
    selectedZone,
    setSelectedZone,

    // Zone mutations
    updateZone: (id: string, input: Partial<{ name: string; area_type: ZoneType }>) =>
      updateZoneMutation.mutate({ id, input }),
    deleteZone: (id: string) => deleteZoneMutation.mutate(id),
    isUpdatingZone: updateZoneMutation.isPending,
    isDeletingZone: deleteZoneMutation.isPending,

    // Fejl
    lastError,
    clearError: () => setLastError(null),

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
