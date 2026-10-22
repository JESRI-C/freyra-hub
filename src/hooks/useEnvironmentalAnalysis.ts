/**
 * useEnvironmentalAnalysis
 * Kører CO₂, vandkvalitet og jordbundsdata parallelt for et projekt.
 * Kombinerer resultaterne til én samlet miljøvurdering.
 *
 * Brug i Lovable UI:
 *   const { carbon, water, soil, runAll } = useEnvironmentalAnalysis(project, ndvi)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { runCarbonAnalysis } from "@/services/nature/carbon-engine";
import { runWaterQualityAnalysis } from "@/services/nature/water-quality-engine";
import { fetchSoilProfile, fetchTerrainProfile } from "@/services/nature/geus-service";
import type { Project } from "@/lib/supabase/types";

export function useEnvironmentalAnalysis(project: Project | null, ndvi?: number | null) {
  const queryClient = useQueryClient();

  const lat = project?.geometry_centroid_lat ?? null;
  const lng = project?.geometry_centroid_lng ?? null;
  const enabled = !!project && !!lat && !!lng;

  // CO₂-binding
  const carbonQuery = useQuery({
    queryKey: ["carbon", project?.id, ndvi],
    queryFn: () => runCarbonAnalysis(
      project!.id, lat!, lng!,
      project!.geometry_area_ha ?? 1,
      project!.project_type,
      ndvi,
      project!.start_date,
    ),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  // Vandkvalitetsrisiko
  const waterQuery = useQuery({
    queryKey: ["water-quality", project?.id, ndvi],
    queryFn: () => runWaterQualityAnalysis(
      project!.id, lat!, lng!,
      project!.project_type,
      ndvi,
    ),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  // Jordbundsprofil (raw, til visning)
  const soilQuery = useQuery({
    queryKey: ["soil", lat, lng],
    queryFn: () => Promise.all([
      fetchSoilProfile(lat!, lng!),
      fetchTerrainProfile(lat!, lng!),
    ]).then(([soil, terrain]) => ({ soil, terrain })),
    enabled,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 dage — jordbund ændrer sig ikke
    retry: 1,
  });

  // Refresh alle
  const refreshMutation = useMutation({
    mutationFn: async () => {
      if (!project || !lat || !lng) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["carbon", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["water-quality", project.id] }),
        queryClient.invalidateQueries({ queryKey: ["soil", lat, lng] }),
      ]);
    },
  });

  const carbon = carbonQuery.data?.estimate ?? null;
  const water = waterQuery.data?.risk ?? null;
  const soil = soilQuery.data?.soil ?? null;
  const terrain = soilQuery.data?.terrain ?? null;

  return {
    // CO₂
    carbon,
    annualCO2: carbon?.annualSequestration ?? null,
    totalCO2_30yr: carbon?.totalOver30Years ?? null,
    vegetationType: carbon?.vegetationType ?? null,

    // Vandkvalitet
    water,
    waterRisk: water?.overall ?? null,
    waterScore: water?.score ?? null,
    watercourseDistM: water?.nearestWatercourseM ?? null,
    mitigationRequired: water?.mitigationRequired ?? false,
    waterRecs: water?.recommendations ?? [],

    // Jordbund
    soil,
    terrain,
    soilLabel: soil?.soilLabel ?? null,
    soilClass: soil?.dominantClass ?? null,

    // Loading states
    isLoading: carbonQuery.isLoading || waterQuery.isLoading || soilQuery.isLoading,
    carbonLoading: carbonQuery.isLoading,
    waterLoading: waterQuery.isLoading,
    soilLoading: soilQuery.isLoading,

    // Actions
    runAll: () => refreshMutation.mutate(),
    isRunning: refreshMutation.isPending,
  };
}

/**
 * Samlet miljøscore 0-100 baseret på alle indikatorer.
 * Høj score = godt miljø / lav påvirkning.
 */
export function computeOverallEnvironmentalScore(params: {
  biodiversityScore: number | null;
  ndvi: number | null;
  waterRiskScore: number | null;
  co2Annual: number | null;
  areaHa: number;
}): { score: number; label: string; color: string } {
  const weights = { biodiversity: 0.35, vegetation: 0.25, water: 0.25, carbon: 0.15 };

  const biodiversityPart = (params.biodiversityScore ?? 50) * weights.biodiversity;
  const vegetationPart = ((params.ndvi ?? 0.4) * 100) * weights.vegetation;
  const waterPart = (100 - (params.waterRiskScore ?? 50)) * weights.water; // inverter: lav risiko = høj score
  const carbonPer = params.co2Annual !== null
    ? Math.min(100, (params.co2Annual / params.areaHa) * 15)
    : 40;
  const carbonPart = carbonPer * weights.carbon;

  const score = Math.round(biodiversityPart + vegetationPart + waterPart + carbonPart);

  if (score >= 70) return { score, label: "Fremragende", color: "text-emerald-700" };
  if (score >= 55) return { score, label: "God", color: "text-emerald-600" };
  if (score >= 40) return { score, label: "Acceptabel", color: "text-amber-600" };
  if (score >= 25) return { score, label: "Under standard", color: "text-orange-600" };
  return { score, label: "Kritisk", color: "text-red-600" };
}
