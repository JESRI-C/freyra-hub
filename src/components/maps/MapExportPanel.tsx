import { useEffect, useRef, useState } from "react";
import { Download, FileJson, FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import type { GeoFeatureCollection } from "@/services/geospatial-service";
import { buildObservationCsv } from "@/services/map-export-service";
import { logProjectExportRequest } from "@/services/audit-service";

interface MapExportPanelProps {
  geoJSON: GeoFeatureCollection | null;
  projectId: string;
  projectName: string;
  disabledReason?: string | null;
  className?: string;
}
export function MapExportPanel({
  geoJSON,
  projectId,
  projectName,
  disabledReason,
  className,
}: MapExportPanelProps) {
  const { user, currentOrg, loading, refreshing } = useAuth();
  const canExport =
    !!geoJSON &&
    geoJSON.projectId === projectId &&
    !disabledReason &&
    !loading &&
    !refreshing &&
    !!user?.id &&
    !!currentOrg?.projects.some((project) => project.id === projectId);
  const scopeKey = canExport ? `${user!.id}:${currentOrg!.id}:${projectId}` : null;
  const activeScope = useRef<string | null>(null);
  const operation = useRef<symbol | null>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (activeScope.current !== scopeKey) {
    operation.current = null;
    activeScope.current = scopeKey;
  }
  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [scopeKey]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current = null;
    };
  }, []);
  const slug =
    projectName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 120) || "projekt";
  async function exportFile(format: "geojson" | "csv") {
    if (!canExport || !geoJSON || !user || !scopeKey || operation.current) return;
    const token = Symbol("map-export"),
      key = scopeKey;
    operation.current = token;
    setBusy(true);
    setError(null);
    const current = () =>
      alive.current && activeScope.current === key && operation.current === token;
    try {
      // Encode the clicked snapshot before awaiting the request receipt.
      const payload =
        format === "geojson" ? JSON.stringify(geoJSON, null, 2) : buildObservationCsv(geoJSON);
      const filename = `${slug}-${format === "geojson" ? "geojson.json" : "punktdata.csv"}`;
      await logProjectExportRequest({ projectId, actorId: user.id, format, filename });
      if (!current()) return;
      const blob = new Blob([payload], {
        type:
          format === "geojson" ? "application/geo+json;charset=utf-8" : "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (reason) {
      if (current())
        setError(
          reason instanceof Error ? reason.message : "Kortdata kunne ikke eksporteres. Prøv igen.",
        );
    } finally {
      if (current()) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <Card className={className}>
      <CardHeader
        title="Eksport af aktuelle kortdata"
        subtitle="Løbende projektdata; ikke en låst eller fagligt gennemgået rapport"
      />
      <div className="space-y-2 px-5 pb-5">
        <p className="text-xs text-muted-foreground">
          Enheder følger det valgte kortlag. GeoJSON bevarer også poster uden position. CSV medtager
          kun gyldige punktpositioner. Filerne indeholder kilde-id, tidspunkt og positionens
          grundlag.
        </p>
        {disabledReason && (
          <p role="status" className="text-sm text-muted-foreground">
            {disabledReason}
          </p>
        )}
        {!canExport && !disabledReason && (
          <p role="status" className="text-sm text-muted-foreground">
            Vælg en sag med aktuelle data og læseadgang for at eksportere.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void exportFile("geojson")}
          disabled={!canExport || busy}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm disabled:opacity-50"
        >
          <FileJson className="h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="font-medium">Download GeoJSON</div>
            <div className="text-xs text-muted-foreground">
              {canExport && geoJSON
                ? `${geoJSON.features.length} poster`
                : "Ingen aktuelle kortdata til eksport"}
            </div>
          </div>
          <Download className="ml-auto h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void exportFile("csv")}
          disabled={!canExport || busy}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm disabled:opacity-50"
        >
          <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <div className="font-medium">Download punktdata (CSV)</div>
            <div className="text-xs text-muted-foreground">Punktdata med koordinater</div>
          </div>
          <Download className="ml-auto h-3.5 w-3.5" />
        </button>
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            Registrerer eksport på sagen…
          </p>
        )}
      </div>
    </Card>
  );
}
