import { RefreshCw, TreePine, Droplets, Mountain } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { useNdvi } from "@/hooks/useNdvi";
import { useEnvironmentalAnalysis } from "@/hooks/useEnvironmentalAnalysis";
import type { Project } from "@/lib/supabase/types";

interface EnvironmentalCardProps {
  project: Project;
}

export function EnvironmentalCard({ project }: EnvironmentalCardProps) {
  const { ndvi } = useNdvi(
    project.id,
    project.geometry_centroid_lat ?? null,
    project.geometry_centroid_lng ?? null,
  );

  const {
    annualCO2,
    totalCO2_30yr,
    vegetationType,
    waterRisk,
    waterScore,
    watercourseDistM,
    mitigationRequired,
    waterRecs,
    soilLabel,
    soilClass,
    isLoading,
    runAll,
    isRunning,
  } = useEnvironmentalAnalysis(project, ndvi);

  const hasGeometry =
    project.geometry_centroid_lat != null &&
    project.geometry_centroid_lng != null;

  const co2Display = annualCO2 != null ? `${annualCO2.toFixed(1)} t/år` : null;
  const co2TotalDisplay = totalCO2_30yr != null ? `${totalCO2_30yr.toFixed(0)} t (30 år)` : null;

  const waterRiskLabel = waterRisk?.label ?? null;
  const waterRiskTone =
    waterRisk?.score != null
      ? waterRisk.score > 70
        ? "danger"
        : waterRisk.score > 40
          ? "warning"
          : "success"
      : null;

  return (
    <Card>
      <CardHeader
        title="Miljøanalyse"
        subtitle="CO₂, vand og jordbund baseret på projektgeometri"
        action={
          <div className="flex items-center gap-2">
            {waterScore != null && (
              <Pill tone={waterRiskTone ?? "default