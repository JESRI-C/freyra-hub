/**
 * useNdvi — React hook til NDVI-beregning og caching.
 * Bruger TanStack Query til at cache resultater i 24 timer.
 *
 * Brug i Lovable UI:
 *   const { ndvi, isLoading, refresh } = useNdvi(projectId, lat, lng);
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { runProjectNdvi, interpretNdvi, seasonalNdviDelta } from "@/services/satellite/ndvi-engine";

export function useNdvi(projectId: string, lat: number | null, lng: number | null) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["ndvi", projectId, lat, lng],
    queryFn: () => runProjectNdvi(projectId, lat!, lng!),
    enabled: !!projectId && !!lat && !!lng,
    staleTime: 24 * 60 * 60 * 1000, // 24 timer — Sentinel-2 opdaterer hver 5. dag
    retry: 1,
  });

  const refreshMutation = useMutation({
    mutationFn: () => runProjectNdvi(projectId, lat!, lng!),
    onSuccess: (result) => {
      queryClient.setQueryData(["ndvi", projectId, lat, lng], result);
    },
  });

  const interpretation = data?.ndvi != null ? interpretNdvi(data.ndvi) : null;
  const delta = data?.ndvi != null && data.sceneDate
    ? seasonalNdviDelta(data.ndvi, data.sceneDate)
    : null;

  return {
    // Kerneddata
    ndvi: data?.ndvi ?? null,
    confidence: data?.confidence ?? null,
    method: data?.method ?? null,
    sceneDate: data?.sceneDate ?? null,
    cloudCover: data?.cloudCover ?? null,
    sceneId: data?.sceneId ?? null,

    // Fortolkning
    interpretation,
    seasonalDelta: delta,

    // Status
    isLoading,
    isError: !!error,
    error: error instanceof Error ? error.message : data?.error ?? null,
    savedToDb: data?.savedToDb ?? false,

    // Actions
    refresh: () => refreshMutation.mutate(),
    isRefreshing: refreshMutation.isPending,
  };
}

/**
 * useSceneHistory — henter historik over fundne scener for et projekt.
 * Viser tidslinjen af Sentinel-2 overflyveninger.
 */
export function useSceneHistory(lat: number | null, lng: number | null) {
  return useQuery({
    queryKey: ["sentinel-scenes", lat, lng],
    queryFn: async () => {
      const { findScenes } = await import("@/services/satellite/sentinel-service");
      return findScenes(lat!, lng!, { maxCloudCover: 80, limit: 20, daysBack: 365 });
    },
    enabled: !!lat && !!lng,
    staleTime: 6 * 60 * 60 * 1000, // 6 timer
    retry: 1,
  });
}
