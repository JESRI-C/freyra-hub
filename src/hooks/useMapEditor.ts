/**
 * useMapEditor — Orkestrerer al data til korteditor-siden.
 * Kombinerer zoner, sensorer, §3-natur, NDVI og vandløb.
 *
 * Brug i Lovable UI:
 *   const map = useMapEditor(project)
 *   <MapEditorMap {...map.mapProps} />
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
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
import { useProjectMapDevices } from "./useProjectMapDevices";
import {
  BoundaryOperationInProgressError,
  clearProjectBoundary,
  createBoundaryOperationGuard,
  persistProjectBoundary,
  projectBoundaryMutationErrorMessage,
} from "@/services/projects-service";
import type { Project } from "@/lib/supabase/types";
import type { DrawMode } from "@/components/maps/MapEditorMap";
import { validateProjectPolygon } from "@/services/geo-service";

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
  const boundary = useMemo(
    () => validateProjectPolygon(project?.geometry_polygon),
    [project?.geometry_polygon],
  );
  const polygon = boundary.valid ? boundary.polygon : null;
  const hasCoordinates =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng);

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
  const [boundaryOperation, setBoundaryOperation] = useState<"save" | "clear" | null>(null);
  const boundaryOperationGuard = useRef(createBoundaryOperationGuard());
  const boundarySavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetBoundaryFeedback = () => {
    if (boundarySavedTimer.current) clearTimeout(boundarySavedTimer.current);
    boundarySavedTimer.current = null;
    setBoundarySaved(false);
  };

  useEffect(
    () => () => {
      if (boundarySavedTimer.current) clearTimeout(boundarySavedTimer.current);
    },
    [],
  );

  // ── Zoner ─────────────────────────────────────────────────────────────────────
  const zonesQuery = useQuery({
    queryKey: ["zones", project?.id],
    queryFn: () => getZonesByProject(project!.id),
    enabled: !!project?.id,
    staleTime: 5 * 60 * 1000,
  });

  // ── §3 og artsobservationer ───────────────────────────────────────────────────
  const natureQuery = useQuery({
    queryKey: ["nature-data", project?.id, polygon, lat, lng, areaHa],
    queryFn: () => fetchNatureData(lat!, lng!, areaHa, polygon),
    enabled: !!project?.id && !!polygon && hasCoordinates,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
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
  const mapDevices = useProjectMapDevices(project?.id);
  const sensors = mapDevices.points;

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const onMutationError = (err: unknown) => {
    resetBoundaryFeedback();
    setLastError(projectBoundaryMutationErrorMessage(err));
  };

  const createZoneMutation = useMutation({
    mutationFn: (input: {
      name: string;
      area_type: ZoneType;
      geojson: GeoJsonPolygon;
      area_ha: number;
    }) => createZone({ project_id: project!.id, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["zones", project?.id] });
      setNewZoneState(null);
      setDrawMode("none");
      setLastError(null);
    },
    onError: onMutationError,
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<{ name: string; area_type: ZoneType }>;
    }) => updateZone(id, input, project?.id),
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
    mutationFn: ({ geojson, source }: { geojson: GeoJsonPolygon; source?: string }) =>
      persistProjectBoundary(project!.id, { polygon: geojson, source }),
    onMutate: () => {
      resetBoundaryFeedback();
      setLastError(null);
    },
    onSuccess: async () => {
      // Alle afledte forespørgsler skal genindlæses når projektgrænsen ændres.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project-by-slug"] }),
        queryClient.invalidateQueries({ queryKey: ["environmental-context"] }),
        queryClient.invalidateQueries({ queryKey: ["nature-data"] }),
        queryClient.invalidateQueries({ queryKey: ["watercourses"] }),
        queryClient.invalidateQueries({ queryKey: ["biodiversity"] }),
        queryClient.invalidateQueries({ queryKey: ["ndvi"] }),
        queryClient.invalidateQueries({ queryKey: ["indicators"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
        queryClient.invalidateQueries({ queryKey: ["project-geojson", project?.id] }),
        queryClient.invalidateQueries({ queryKey: ["project-metrics", project?.id] }),
      ]);
      setBoundarySaved(true);
      setLastError(null);
      boundarySavedTimer.current = setTimeout(() => {
        setBoundarySaved(false);
        boundarySavedTimer.current = null;
      }, 4000);
    },
    onError: onMutationError,
  });

  // Ryd projektgrænsen helt, inklusive afledt centroid.
  const clearBoundaryMutation = useMutation({
    mutationFn: () => clearProjectBoundary(project!.id),
    onMutate: () => {
      resetBoundaryFeedback();
      setLastError(null);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project-by-slug"] }),
        queryClient.invalidateQueries({ queryKey: ["environmental-context"] }),
        queryClient.invalidateQueries({ queryKey: ["nature-data"] }),
        queryClient.invalidateQueries({ queryKey: ["watercourses"] }),
        queryClient.invalidateQueries({ queryKey: ["biodiversity"] }),
        queryClient.invalidateQueries({ queryKey: ["ndvi"] }),
        queryClient.invalidateQueries({ queryKey: ["indicators"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
        queryClient.invalidateQueries({ queryKey: ["project-geojson", project?.id] }),
        queryClient.invalidateQueries({ queryKey: ["project-metrics", project?.id] }),
      ]);
      setLastError(null);
    },
    onError: onMutationError,
  });

  // ── Drawing callbacks ──────────────────────────────────────────────────────────
  const handleZoneCreated = useCallback(
    (geojson: GeoJsonPolygon, ha: number) => {
      setNewZoneState({
        name: `Zone ${(zonesQuery.data?.length ?? 0) + 1}`,
        area_type: "nature",
        geojson,
        area_ha: ha,
      });
    },
    [zonesQuery.data?.length],
  );

  const handleBoundaryDrawn = useCallback(
    async (geojson: GeoJsonPolygon, _ha: number, source?: string): Promise<boolean> => {
      setDrawMode("none");
      try {
        return await boundaryOperationGuard.current.run(async () => {
          setBoundaryOperation("save");
          try {
            await saveBoundaryMutation.mutateAsync({ geojson, source });
            return true;
          } finally {
            setBoundaryOperation(null);
          }
        });
      } catch (error) {
        if (error instanceof BoundaryOperationInProgressError) setLastError(error.message);
        return false;
      }
    },
    [saveBoundaryMutation],
  );

  const clearBoundary = useCallback(async (): Promise<boolean> => {
    try {
      return await boundaryOperationGuard.current.run(async () => {
        setBoundaryOperation("clear");
        try {
          await clearBoundaryMutation.mutateAsync();
          return true;
        } finally {
          setBoundaryOperation(null);
        }
      });
    } catch (error) {
      if (error instanceof BoundaryOperationInProgressError) setLastError(error.message);
      return false;
    }
  }, [clearBoundaryMutation]);

  const confirmCreateZone = useCallback(
    (name: string, area_type: ZoneType) => {
      if (!newZoneState?.geojson || !newZoneState.area_ha) return;
      createZoneMutation.mutate({
        name,
        area_type,
        geojson: newZoneState.geojson,
        area_ha: newZoneState.area_ha,
      });
    },
    [newZoneState, createZoneMutation],
  );

  const cancelNewZone = useCallback(() => {
    setNewZoneState(null);
    setDrawMode("none");
  }, []);

  // ── Data coverage beregning ───────────────────────────────────────────────────
  // Cached data must not look current after an unsuccessful source refresh.
  const p3Data =
    !natureQuery.isError && natureQuery.data?.p3.mode === "live" ? natureQuery.data.p3 : undefined;
  const natureStatus = !project
    ? null
    : !polygon
      ? "§3-overlap er ikke beregnet. Tegn eller indlæs en gyldig projektgrænse."
      : !hasCoordinates
        ? "§3-overlap er ikke beregnet. Projektets koordinater mangler."
        : natureQuery.isError
          ? "Naturdata kunne ikke hentes. §3-overlap er ikke beregnet. Prøv igen senere."
          : natureQuery.isFetching
            ? "Henter naturdata for projektgrænsen…"
            : null;
  const sensorCoverage = mapDevices.onlinePercent;
  const ndviAvailable = ndvi !== null && ndvi !== undefined && Number.isFinite(ndvi);
  const p3Coverage = p3Data ? p3Data.overlapPercent : null;
  // No spatial denominator or observation coverage query exists yet.
  const fieldCoverage = null;

  return {
    // Kortdata
    zones: zonesQuery.data ?? [],
    sensors,
    deviceStatus: mapDevices.status,
    paragraph3Areas:
      p3Data?.areas
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
    isBoundaryBusy:
      boundaryOperation !== null ||
      saveBoundaryMutation.isPending ||
      clearBoundaryMutation.isPending,
    boundarySaved,
    clearBoundary,
    isClearingBoundary: clearBoundaryMutation.isPending,

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
      satelliteAvailable: ndviAvailable,
      nature: p3Coverage,
      field: fieldCoverage,
    },

    // Loading
    isLoading: zonesQuery.isLoading || natureQuery.isLoading,
    isNatureLoading: natureQuery.isLoading,
    natureStatus,
    p3Data,
    speciesData:
      !natureQuery.isError && natureQuery.data?.species.mode === "live"
        ? natureQuery.data.species
        : undefined,
  };
}
