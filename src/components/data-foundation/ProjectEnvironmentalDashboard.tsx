import type { ProjectEnvironmentalContext, LiveDataSnapshot } from "@/lib/supabase/types";
import { AlertTriangle } from "lucide-react";
import { EnvironmentalContextCard } from "./EnvironmentalContextCard";
import { GeometryStatusCard } from "./GeometryStatusCard";

// ─── Score chip helpers ───────────────────────────────────────────────────────

const RISK_COLORS = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const RISK_LABELS = {
  low: "Lav",
  medium: "Moderat",
  high: "Høj",
  critical: "Kritisk",
};

const READINESS_COLORS = {
  complete: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  pending: "bg-muted text-muted-foreground",
};

const READINESS_LABELS = {
  complete: "Komplet",
  partial: "Delvis",
  pending: "Afventer",
};

// ─── Live data status section ─────────────────────────────────────────────────

function LiveDataStatusSection({ liveData }: { liveData: LiveDataSnapshot }) {
  const modePill =
    liveData.weather?.mode === "live" || liveData.nature?.mode === "live" ? (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
        Live
      </span>
    ) : (
      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
        Preview
      </span>
    );

  const fetchedLabel = new Date(liveData.fetchedAt).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Live Data</div>
        <div className="flex items-center gap-2">
          {modePill}
          <span className="text-xs text-muted-foreground">Hentet {fetchedLabel}</span>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {liveData.weather && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Vejr (DMI)
            </div>
            {liveData.weather.temperature !== undefined && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Temperatur</span>
                <span className="text-xs font-medium">{liveData.weather.temperature} °C</span>
              </div>
            )}
            {liveData.weather.windSpeed !== undefined && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Vindhastighed</span>
                <span className="text-xs font-medium">{liveData.weather.windSpeed} m/s</span>
              </div>
            )}
            {liveData.weather.humidity !== undefined && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Luftfugtighed</span>
                <span className="text-xs font-medium">{liveData.weather.humidity} %</span>
              </div>
            )}
          </div>
        )}
        {liveData.nature && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Natur (Miljøportal)
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Registreringer</span>
              <span className="text-xs font-medium">{liveData.nature.registrationCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Beskyttede arter</span>
              <span className="text-xs font-medium">{liveData.nature.protectedCount}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ProjectEnvironmentalDashboardProps {
  ctx: ProjectEnvironmentalContext;
}

export function ProjectEnvironmentalDashboard({ ctx }: ProjectEnvironmentalDashboardProps) {
  const { scores, overallReadiness } = ctx;

  // Collect non-null results
  const contextResults = [
    ctx.natureContext,
    ctx.satelliteContext,
    ctx.rainfallContext,
    ctx.groundwaterContext,
    ctx.terrainContext,
    ctx.protectedNatureContext,
    ctx.soilContext,
    ctx.watercourseContext,
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div className="space-y-4">
      {/* Geometry status card */}
      <GeometryStatusCard geometry={ctx.geometry} projectName={ctx.projectName} />

      {/* Geometry warning notice */}
      {!ctx.geometry.hasValidGeometry && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Geometri mangler</strong> — Miljøanalysen bruger preview-data. Upload en
            GeoJSON-polygon for at aktivere geografisk analyse.
          </div>
        </div>
      )}

      {/* Score chips */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Naturfølsomhed</div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[scores.natureSensitivity]}`}
          >
            {RISK_LABELS[scores.natureSensitivity]}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Afstrømningsrisiko</div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[scores.runoffRisk]}`}
          >
            {RISK_LABELS[scores.runoffRisk]}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Datadækning</div>
          <span className="text-xs font-semibold">{scores.dataCompleteness}%</span>
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${scores.dataCompleteness}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Samlet status</div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${READINESS_COLORS[overallReadiness]}`}
          >
            {READINESS_LABELS[overallReadiness]}
          </span>
        </div>
      </div>

      {/* Live data status */}
      {ctx.liveData && <LiveDataStatusSection liveData={ctx.liveData} />}

      {/* Context cards grid */}
      {contextResults.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {contextResults.map((result) => (
            <EnvironmentalContextCard key={result.connector.id} result={result} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Ingen miljødata tilgængelig for dette projekt.
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground">
        Miljødata hentes fra åbne datakilder og vises som preview-analyse. Fuld integration kræver
        API-konfiguration.
      </p>
    </div>
  );
}
