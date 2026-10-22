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

  const waterRiskLabel = waterRisk ?? null;
  const waterRiskTone =
    waterRisk === "Meget høj"
      ? "danger"
      : waterRisk === "Høj"
        ? "danger"
        : waterRisk === "Moderat"
          ? "warning"
          : "success";

  return (
    <Card>
      <CardHeader
        title="Miljøanalyse"
        subtitle="CO₂, vand og jordbund baseret på projektgeometri"
        action={
          <div className="flex items-center gap-2">
            {waterScore != null && (
              <Pill tone={waterRiskTone ?? "default"}>{waterScore.toFixed(0)}</Pill>
            )}
            <button
              type="button"
              onClick={() => runAll()}
              disabled={!hasGeometry || isRunning || isLoading}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border bg-card hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title="Genberegn miljøanalyse"
            >
              <RefreshCw className={`h-3 w-3 ${isRunning ? "animate-spin" : ""}`} />
              Genberegn
            </button>
          </div>
        }
      />
      <div className="px-5 pb-5 space-y-4">
        {!hasGeometry && (
          <p className="text-sm text-muted-foreground">
            Projektgeometri mangler — kan ikke køre miljøanalyse.
          </p>
        )}

        {hasGeometry && isLoading && !annualCO2 && !waterRiskLabel && !soilLabel && (
          <p className="text-sm text-muted-foreground">Henter miljødata …</p>
        )}

        {hasGeometry && (
          <>
            {/* CO₂-binding */}
            {(annualCO2 != null || vegetationType) && (
              <div className="flex items-start gap-3">
                <TreePine className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-sm font-medium">CO₂-binding</div>
                  {co2Display && (
                    <div className="text-xs text-muted-foreground">
                      Årlig sekvestrering: <span className="text-foreground font-medium">{co2Display}</span>
                    </div>
                  )}
                  {co2TotalDisplay && (
                    <div className="text-xs text-muted-foreground">
                      Total (30 år): <span className="text-foreground font-medium">{co2TotalDisplay}</span>
                    </div>
                  )}
                  {vegetationType && (
                    <div className="text-xs text-muted-foreground">
                      Vegetationstype: <span className="text-foreground">{vegetationType}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Vandkvalitet */}
            {(waterRiskLabel != null || watercourseDistM != null) && (
              <div className="flex items-start gap-3">
                <Droplets className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-sm font-medium">Vandkvalitetsrisiko</div>
                  {waterRiskLabel && (
                    <div className="text-xs text-muted-foreground">
                      Samlet risiko: <span className="text-foreground font-medium">{waterRiskLabel}</span>
                    </div>
                  )}
                  {watercourseDistM != null && (
                    <div className="text-xs text-muted-foreground">
                      Nærmeste vandløb: <span className="text-foreground">{watercourseDistM.toFixed(0)} m</span>
                    </div>
                  )}
                  {mitigationRequired && (
                    <div className="text-xs text-amber-600 font-medium">
                      Afværgeforanstaltning anbefales
                    </div>
                  )}
                  {waterRecs.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc list-inside pt-0.5">
                      {waterRecs.slice(0, 3).map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Jordbund */}
            {(soilLabel || soilClass) && (
              <div className="flex items-start gap-3">
                <Mountain className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-sm font-medium">Jordbund</div>
                  {soilLabel && (
                    <div className="text-xs text-muted-foreground">
                      Dominant type: <span className="text-foreground font-medium">{soilLabel}</span>
                    </div>
                  )}
                  {soilClass && (
                    <div className="text-xs text-muted-foreground">
                      Klasse: <span className="text-foreground">{soilClass}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!annualCO2 && !waterRiskLabel && !soilLabel && !isLoading && (
              <p className="text-sm text-muted-foreground">
                Ingen miljødata tilgængelig for dette projekt.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
