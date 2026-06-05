import { RefreshCw, Leaf, Bird, MapPin, AlertCircle } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { useNdvi } from "@/hooks/useNdvi";
import { useBiodiversity, formatBiodiversityScore } from "@/hooks/useBiodiversity";
import type { Project } from "@/lib/supabase/types";

interface BiodiversityCardProps {
  project: Project;
}

export function BiodiversityCard({ project }: BiodiversityCardProps) {
  const { ndvi } = useNdvi(
    project.id,
    project.geometry_centroid_lat ?? null,
    project.geometry_centroid_lng ?? null,
  );

  const {
    score,
    classification,
    components,
    p3,
    species,
    recommendations,
    isLoading,
    run,
    isRunning,
  } = useBiodiversity(project, ndvi);

  const hasGeometry =
    project.geometry_centroid_lat != null &&
    project.geometry_centroid_lng != null;

  const fmt = score != null ? formatBiodiversityScore(score) : null;
  const scoreTone =
    score == null
      ? "default"
      : score >= 55
        ? "success"
        : score >= 35
          ? "warning"
          : "danger";

  const priorityTone = (p: "Høj" | "Medium" | "Lav") =>
    p === "Høj" ? "danger" : p === "Medium" ? "warning" : "default";

  return (
    <Card>
      <CardHeader
        title="Biodiversitet"
        subtitle="§3-natur, arter og samlet indeks 0-100"
        action={
          <div className="flex items-center gap-2">
            {score != null && (
              <Pill tone={scoreTone}>
                {score}/100 · {classification ?? fmt?.label}
              </Pill>
            )}
            <button
              type="button"
              onClick={() => run()}
              disabled={!hasGeometry || isRunning || isLoading}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border bg-card hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title="Genberegn biodiversitet"
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
            Projektgeometri mangler — kan ikke køre biodiversitetsanalyse.
          </p>
        )}

        {hasGeometry && isLoading && score == null && (
          <p className="text-sm text-muted-foreground">Henter biodiversitetsdata …</p>
        )}

        {hasGeometry && score != null && (
          <>
            {/* Score-komponenter */}
            {components && (
              <div className="space-y-1.5">
                {(
                  [
                    ["vegetation", "Vegetation (NDVI)"],
                    ["habitatCoverage", "§3-naturdækning"],
                    ["speciesDiversity", "Artsdiversitet"],
                    ["protectedSpecies", "Fredede / rødlistede"],
                    ["habitatVariety", "Habitatvariation"],
                  ] as const
                ).map(([key, label]) => {
                  const v = components[key] ?? 0;
                  return (
                    <div key={key} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">{v}/100</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${v >= 55 ? "bg-emerald-500" : v >= 35 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, v)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* §3-natur */}
            {p3 && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-sm font-medium">§3-beskyttet natur</div>
                  <div className="text-xs text-muted-foreground">
                    Overlap:{" "}
                    <span className="text-foreground font-medium">
                      {p3.overlapHa.toFixed(2)} ha ({p3.overlapPercent.toFixed(0)}%)
                    </span>
                  </div>
                  {p3.natureTypes.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Naturtyper:{" "}
                      <span className="text-foreground">{p3.natureTypes.join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Arter */}
            {species && (
              <div className="flex items-start gap-3">
                <Bird className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-sm font-medium">Arter</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">{species.species.length}</span>{" "}
                    registrerede ·{" "}
                    <span className="text-foreground font-medium">{species.redListedCount}</span>{" "}
                    rødlistede ·{" "}
                    <span className="text-foreground font-medium">{species.protectedCount}</span>{" "}
                    fredede
                  </div>
                </div>
              </div>
            )}

            {/* Anbefalinger */}
            {recommendations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Leaf className="h-4 w-4 text-muted-foreground" />
                  Anbefalinger
                </div>
                <ul className="space-y-1.5">
                  {recommendations.slice(0, 3).map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Pill tone={priorityTone(rec.priority)}>{rec.priority}</Pill>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">{rec.title}</div>
                        <div className="text-muted-foreground">{rec.rationale}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {hasGeometry && !isLoading && score == null && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            Ingen biodiversitetsdata tilgængelig endnu.
          </div>
        )}
      </div>
    </Card>
  );
}
