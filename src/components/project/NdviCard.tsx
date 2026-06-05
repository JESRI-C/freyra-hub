import { RefreshCw, Satellite, CloudSun, CalendarDays } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { useNdvi } from "@/hooks/useNdvi";

interface NdviCardProps {
  projectId: string;
  lat: number | null;
  lng: number | null;
}

export function NdviCard({ projectId, lat, lng }: NdviCardProps) {
  const {
    ndvi,
    interpretation,
    sceneDate,
    cloudCover,
    sceneId,
    method,
    seasonalDelta,
    confidence,
    isLoading,
    isError,
    error,
    refresh,
    isRefreshing,
  } = useNdvi(projectId, lat, lng);

  const hasGeometry = lat != null && lng != null;

  return (
    <Card>
      <CardHeader
        title="Vegetationsindeks (NDVI)"
        subtitle="Sentinel-2 satellitobservation"
        action={
          <div className="flex items-center gap-2">
            {ndvi != null && (
              <Pill tone={ndvi >= 0.5 ? "success" : ndvi >= 0.3 ? "warning" : "danger"}>
                {ndvi.toFixed(2)}
              </Pill>
            )}
            <button
              type="button"
              onClick={() => refresh()}
              disabled={!hasGeometry || isRefreshing || isLoading}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border bg-card hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title="Hent seneste Sentinel-2 scene"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
              Opdatér
            </button>
          </div>
        }
      />
      <div className="px-5 pb-5 space-y-3">
        {!hasGeometry && (
          <p className="text-sm text-muted-foreground">
            Projektgeometri mangler — kan ikke hente satellitdata.
          </p>
        )}

        {hasGeometry && isLoading && !ndvi && (
          <p className="text-sm text-muted-foreground">Henter Sentinel-2 scene …</p>
        )}

        {hasGeometry && isError && (
          <p className="text-sm text-destructive">{error ?? "Kunne ikke hente NDVI-data"}</p>
        )}

        {hasGeometry && ndvi != null && interpretation && (
          <>
            <div className="flex items-baseline gap-3">
              <Satellite className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${interpretation.color}`}>
                  {interpretation.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {interpretation.description}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {sceneDate && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  <span>Scene: {new Date(sceneDate).toLocaleDateString("da-DK")}</span>
                </div>
              )}
              {cloudCover != null && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CloudSun className="h-3 w-3" />
                  <span>Skydækning: {cloudCover.toFixed(1)}%</span>
                </div>
              )}
              {seasonalDelta != null && (
                <div className="text-muted-foreground">
                  Sæsonafvigelse:{" "}
                  <span
                    className={
                      seasonalDelta > 0.05
                        ? "text-emerald-600"
                        : seasonalDelta < -0.05
                          ? "text-amber-600"
                          : "text-foreground"
                    }
                  >
                    {seasonalDelta > 0 ? "+" : ""}
                    {seasonalDelta.toFixed(2)}
                  </span>
                </div>
              )}
              {confidence && (
                <div className="text-muted-foreground">
                  Konfidens: <span className="text-foreground capitalize">{confidence}</span>
                </div>
              )}
            </div>

            {(method || sceneId) && (
              <div className="text-[11px] text-muted-foreground pt-2 border-t">
                {method && <span>Metode: {method}</span>}
                {method && sceneId && <span> · </span>}
                {sceneId && <span className="font-mono truncate">{sceneId}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
