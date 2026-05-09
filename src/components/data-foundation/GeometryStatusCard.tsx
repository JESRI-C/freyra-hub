import type { ProjectGeometry } from "@/lib/supabase/types";
import { Card, CardHeader } from "@/components/ui-bits";
import { CheckCircle2, AlertTriangle, MapPin } from "lucide-react";
import { ProjectGeometryMap } from "./ProjectGeometryMap";

interface Props {
  geometry: ProjectGeometry;
  projectName: string;
}

export function GeometryStatusCard({ geometry, projectName }: Props) {
  return (
    <Card>
      <CardHeader
        title="Projektgeometri"
        subtitle={
          geometry.hasValidGeometry ? "Gyldig polygon registreret" : "Geometri ikke tilgængelig"
        }
      />
      <div className="px-5 pb-5 space-y-4">
        {/* Interactive map */}
        <ProjectGeometryMap geometry={geometry} projectName={projectName} height={320} />
        {/* Status row */}
        <div className="flex items-center gap-2">
          {geometry.hasValidGeometry ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          <span className="text-sm font-medium">
            {geometry.hasValidGeometry
              ? "Polygon klar til geografisk analyse"
              : geometry.geometrySource === "estimated"
                ? "Estimeret centroid — polygon mangler"
                : "Ingen geometri registreret"}
          </span>
        </div>

        {/* Key-value grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Kilde</div>
            <div className="mt-0.5 font-medium capitalize">
              {geometry.geometrySource === "none"
                ? "Ingen"
                : geometry.geometrySource === "estimated"
                  ? "Estimeret"
                  : geometry.geometrySource === "manual"
                    ? "Manuel"
                    : "Upload"}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Areal</div>
            <div className="mt-0.5 font-medium">
              {geometry.areaHa != null ? `${geometry.areaHa} ha` : "—"}
            </div>
          </div>
          {geometry.centroid && (
            <div className="rounded-xl border bg-muted/30 p-3 col-span-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Centroid
              </div>
              <div className="mt-0.5 font-mono text-xs">
                {geometry.centroid.lat.toFixed(5)}°N, {geometry.centroid.lng.toFixed(5)}°Ø
              </div>
            </div>
          )}
        </div>

        {/* Buffer zones */}
        <div>
          <div className="text-xs text-muted-foreground mb-2">Buffer-zoner (metadata)</div>
          <div className="flex gap-2 flex-wrap">
            {(["buffer100m", "buffer500m", "buffer1000m"] as const).map((key) => {
              const label =
                key === "buffer100m" ? "100 m" : key === "buffer500m" ? "500 m" : "1 000 m";
              const active = geometry.bufferZones[key];
              return (
                <span
                  key={key}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                    active
                      ? "bg-leaf/15 text-primary border-leaf/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label} {active ? "✓" : "—"}
                </span>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Pixel-præcis bufferpåvirkning kræver turf.js. Næste sprint.
          </p>
        </div>
      </div>
    </Card>
  );
}
