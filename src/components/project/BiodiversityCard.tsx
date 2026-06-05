import { RefreshCw, Sprout, Leaf, ShieldAlert, Lightbulb } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { Progress } from "@/components/ui/progress";
import { useBiodiversity, formatBiodiversityScore, explainScore } from "@/hooks/useBiodiversity";
import { useNdvi } from "@/hooks/useNdvi";
import type { Project } from "@/lib/supabase/types";

interface BiodiversityCardProps {
  project: Project;
}

export function BiodiversityCard({ project }: BiodiversityCardProps) {
  const lat = project.geometry_centroid_lat ?? null;
  const lng = project.geometry_centroid_lng ?? null;

  const { ndvi } = useNdvi(project.id, lat, lng);
  const {
    score,
    components,
    classification,
    confidence,
    p3,
    species,
    recommendations,
    highPriorityRecs,
    isLoading,
    isError,
    error,
    run,
    isRunning,
    savedToDb,
  } = useBiodiversity(project, ndvi);

  const hasGeometry = lat != null && lng != null;
  const fmt = score != null ? formatBiodiversityScore(score) : null;

  return (
    <Card>
      <CardHeader
        title="Biodiversitetsindeks"
        subtitle="§3-natur · artsobservationer · NDVI"
        action={
          <div className="flex items-center gap-2">
            {score != null && fmt && (
              <Pill
                tone={
                  score >= 55 ? "success" : score >= 35 ? "warning" : "danger"
                }
              >
                {score}/100 · {fmt.label}
              </Pill>
            )}
            <button
              type="button"
              onClick={() => run()}
              disabled={!hasGeometry || isRunning || isLoading}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border bg-card hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title="Genberegn biodiversitetsindeks"
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
            Projektgeometri mangler — kan ikke beregne biodiversitetsindeks.
          </p>
        )}

        {hasGeometry && isLoading && score == null && (
          <p className="text-sm text-muted-foreground">Beregner biodiversitetsindeks …</p>
        )}

        {hasGeometry && isError && (
          <p className="text-sm text-destructive">
            {error ?? "Kunne ikke beregne biodiversitetsindeks"}
          </p>
        )}

        {hasGeometry && score != null && components && (
          <>
            {/* Score components */}
            <div className="space-y-2">
              {[
                { key: "vegetation", label: "Vegetation (NDVI)" },
                { key: "habitatCoverage", label: "§3-naturdækning" },
                { key: "speciesDiversity", label: "Artsdiversitet" },
                { key: "protectedSpecies", label: "Fredede / rødlistede" },
                { key: "habitatVariety", label: "Habitatvariation" },
              ].map((c) => {
                const v = components[c.key as keyof typeof components];
                return (
                  <div key={c.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="font-medium tabular-nums">{v}/100</span>
                    </div>
                    <Progress value={v} className="h-1.5" />
                  </div>
                );
              })}
            </div>

            <div className="text-[11px] text-muted-foreground">
              {explainScore(components)}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
              {p3 && (
                <div className="flex items-start gap-1.5">
                  <Leaf className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium tabular-nums">{p3.overlapHa} ha</div>
                    <div className="text-muted-foreground">§3-natur ({p3.overlapPercent}%)</div>
                  </div>
                </div>
              )}
              {species && (
                <>
                  <div className="flex items-start gap-1.5">
                    <Sprout className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium tabular-nums">{species.species.length}</div>
                      <div className="text-muted-foreground">arter</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium tabular-nums">
                        {species.protectedCount + species.redListedCount}
                      </div>
                      <div className="text-muted-foreground">
                        {species.redListedCount} rødlistede
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                  Anbefalinger ({highPriorityRecs.length} højt prioriteret)
                </div>
                <ul className="space-y-1.5">
                  {recommendations.slice(0, 3).map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Pill
                        tone={
                          rec.priority === "Høj"
                            ? "danger"
                            : rec.priority === "Medium"
                              ? "warning"
                              : "default"
                        }
                      >
                        {rec.priority}
                      </Pill>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{rec.title}</div>
                        <div className="text-muted-foreground text-[11px]">{rec.rationale}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground pt-2 border-t flex items-center justify-between">
              <span>
                Konfidens: <span className="text-foreground capitalize">{confidence}</span>
                {classification && <> · Klassifikation: {classification}</>}
              </span>
              {savedToDb && <span className="text-emerald-600">✓ gemt</span>}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
