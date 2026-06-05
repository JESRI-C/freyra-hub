/**
 * useBiodiversity — React hook til biodiversitetsanalyse.
 * Kombinerer §3-overlap, artsobservationer og NDVI til én samlet score.
 *
 * Brug i Lovable UI:
 *   const { score, p3, species, recommendations, run } = useBiodiversity(project);
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  runBiodiversityAnalysis,
  generateRecommendations,
  type BiodiversityScore,
} from "@/services/nature/biodiversity-engine";
import type { Project } from "@/lib/supabase/types";

export function useBiodiversity(project: Project | null, ndvi?: number | null) {
  const queryClient = useQueryClient();

  const lat = project?.geometry_centroid_lat ?? null;
  const lng = project?.geometry_centroid_lng ?? null;
  const areaHa = project?.geometry_area_ha ?? 1;

  const { data, isLoading, error } = useQuery({
    queryKey: ["biodiversity", project?.id, ndvi],
    queryFn: () =>
      runBiodiversityAnalysis(project!.id, lat!, lng!, areaHa, ndvi),
    enabled: !!project && !!lat && !!lng,
    staleTime: 12 * 60 * 60 * 1000, // 12 timer
    retry: 1,
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      runBiodiversityAnalysis(project!.id, lat!, lng!, areaHa, ndvi),
    onSuccess: (result) => {
      queryClient.setQueryData(["biodiversity", project?.id, ndvi], result);
    },
  });

  const score = data?.score ?? null;
  const recommendations = score ? generateRecommendations(score) : [];

  return {
    // Score og komponenter
    score: score?.total ?? null,
    components: score?.components ?? null,
    classification: score?.classification ?? null,
    confidence: score?.confidence ?? null,

    // Naturdata
    p3: score?.p3 ?? null,
    species: score?.species ?? null,

    // Anbefalinger
    recommendations,
    highPriorityRecs: recommendations.filter((r) => r.priority === "Høj"),

    // Status
    isLoading,
    isError: !!error,
    error: error instanceof Error ? error.message : data?.error ?? null,
    savedToDb: data?.savedToDb ?? false,

    // Actions
    run: () => refreshMutation.mutate(),
    isRunning: refreshMutation.isPending,
  };
}

/**
 * Formatterer biodiversitetsscore til display.
 */
export function formatBiodiversityScore(score: number): {
  color: string;
  bgColor: string;
  label: string;
} {
  if (score >= 75) return { color: "text-emerald-700", bgColor: "bg-emerald-100", label: "Meget høj" };
  if (score >= 55) return { color: "text-emerald-600", bgColor: "bg-emerald-50", label: "Høj" };
  if (score >= 35) return { color: "text-amber-600", bgColor: "bg-amber-50", label: "Moderat" };
  if (score >= 20) return { color: "text-orange-600", bgColor: "bg-orange-50", label: "Lav" };
  return { color: "text-red-600", bgColor: "bg-red-50", label: "Meget lav" };
}

/**
 * Forklarer hvad der driver scoren op/ned.
 */
export function explainScore(components: BiodiversityScore["components"]): string {
  const sorted = Object.entries(components)
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => a.value - b.value);

  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  const labels: Record<string, string> = {
    vegetation: "vegetationsdækning",
    habitatCoverage: "§3-naturareal",
    speciesDiversity: "artsdiversitet",
    protectedSpecies: "fredede arter",
    habitatVariety: "habitatvariation",
  };

  return `Stærkest: ${labels[strongest.key]} (${strongest.value}/100) · Svageste: ${labels[weakest.key]} (${weakest.value}/100)`;
}
