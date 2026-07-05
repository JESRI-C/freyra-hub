import { createFileRoute, notFound, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, MapPin, Upload, Pencil, CheckCircle2, AlertCircle, X, Layers } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui-bits";
import { MapEditorMap, type WmsOverlay } from "@/components/maps/MapEditorMap";
import { AddressSearch } from "@/components/maps/AddressSearch";
import { useMapEditor } from "@/hooks/useMapEditor";
import { getProjectBySlug } from "@/services/projects-service";
import { parseProjectGeometry } from "@/services/geo-service";
import type { GeoJsonPolygon } from "@/services/zones-service";

export const Route = createFileRoute("/app/projects/geometry/$slug")({
  head: () => ({ meta: [{ title: "Definér projektområde — GoFreyra" }] }),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    const project = await queryClient.ensureQueryData({
      queryKey: ["project-by-slug", slug],
      queryFn: () => getProjectBySlug(slug),
    });
    if (!project) throw notFound();
    return project;
  },
  component: GeometryEditorPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-center text-muted-foreground">Projekt ikke fundet.</div>
  ),
});

// Denmark centroid fallback so the map has a starting point when no geometry exists.
const DK_FALLBACK = { lat: 56.0, lng: 10.5 };

// Dataforsyningen token (kan sættes via env; ellers bruges åbne endpoints).
const DAF_TOKEN = import.meta.env.VITE_DATAFORSYNINGEN_TOKEN as string | undefined;

// Kendte offentlige WMS-endpoints for danske overlays.
// Matriklen leveres af Datafordeleren via Dataforsyningen. Kræver token.
// Markblokke leveres af Landbrugsstyrelsen (åbne data).
const OVERLAY_DEFS: Record<
  "cadastre" | "fieldBlocks" | "protectedNature",
  Omit<WmsOverlay, "id"> & { label: string; description: string; requiresToken?: boolean }
> = {
  cadastre: {
    label: "Matrikelskel",
    description: "Ejendoms- og matrikelgrænser (Datafordeleren)",
    url: `https://api.dataforsyningen.dk/wms/matrikel${DAF_TOKEN ? `?token=${DAF_TOKEN}` : ""}`,
    layers: "MatrikelSkel,Centroide",
    opacity: 0.9,
    transparent: true,
    format: "image/png",
    attribution: "© Styrelsen for Dataforsyning og Effektivisering",
    requiresToken: true,
  },
  fieldBlocks: {
    label: "Markblokke",
    description: "Landbrugsstyrelsens markblokke (offentlig data)",
    url: "https://kort.lbst.dk/service?SERVICENAME=marker_wms_v3",
    layers: "Markblokke",
    opacity: 0.65,
    transparent: true,
    format: "image/png",
    attribution: "© Landbrugsstyrelsen",
  },
  protectedNature: {
    label: "§3 Beskyttet natur",
    description: "Miljøportalens beskyttede naturarealer",
    url: "https://arealdata-api.miljoeportal.dk/download/wms/main",
    layers: "dai:bes_nat_samlet_offentlig",
    opacity: 0.55,
    transparent: true,
    format: "image/png",
    attribution: "© Danmarks Miljøportal",
  },
};

type OverlayKey = keyof typeof OVERLAY_DEFS;

function GeometryEditorPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<OverlayKey, boolean>>({
    cadastre: false,
    fieldBlocks: false,
    protectedNature: false,
  });
  const [center, setCenter] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  const { data: project } = useSuspenseQuery({
    queryKey: ["project-by-slug", slug],
    queryFn: () => getProjectBySlug(slug),
  });

  const map = useMapEditor(project, null);

  const wmsOverlays = useMemo<WmsOverlay[]>(() => {
    return (Object.keys(enabled) as OverlayKey[])
      .filter((k) => enabled[k])
      .map((k) => ({ id: k, ...OVERLAY_DEFS[k] }));
  }, [enabled]);

  if (!project) return null;

  const hasPolygon = project.geometry_polygon != null;
  const lat = project.geometry_centroid_lat ?? DK_FALLBACK.lat;
  const lng = project.geometry_centroid_lng ?? DK_FALLBACK.lng;

  const handleFile = async (file: File) => {
    setUploadError(null);
    try {
      const text = await file.text();
      const parsed = parseProjectGeometry(text, "uploaded");
      if (!parsed.hasValidGeometry || !parsed.polygon) {
        setUploadError("Filen indeholder ikke en gyldig Polygon-geometri.");
        return;
      }
      map.handleBoundaryDrawn(parsed.polygon as GeoJsonPolygon, parsed.areaHa ?? 0);
      toast.success("Projektområde uploadet");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Kunne ikke læse fil");
    }
  };

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4 pb-16">
      <div className="flex items-start gap-4">
        <Link
          to="/app/projects/$slug"
          params={{ slug }}
          className="h-9 w-9 rounded-xl border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <MapPin className="h-3 w-3" />
            <span>Projektområde</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight truncate">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tegn projektgrænsen på kortet, søg efter adresse, eller upload en GeoJSON-fil.
            Alle beregninger (NDVI, biodiversitet, miljø) baseres på dette område.
          </p>
        </div>
      </div>

      {map.lastError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{map.lastError}</span>
          <button onClick={map.clearError} aria-label="Luk"><X className="h-4 w-4" /></button>
        </div>
      )}
      {uploadError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)} aria-label="Luk"><X className="h-4 w-4" /></button>
        </div>
      )}
      {map.boundarySaved && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">Projektområde gemt. Beregninger er nu tilgængelige.</span>
          <button
            onClick={() => navigate({ to: "/app/projects/$slug", params: { slug } })}
            className="text-xs font-medium underline"
          >
            Gå til projekt →
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        {/* Side panel */}
        <div className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold">Find sted</div>
            <AddressSearch
              onSelect={(p) => setCenter({ lat: p.lat, lng: p.lng, zoom: 17 })}
            />
            <p className="text-[11px] text-muted-foreground">
              Søger i alle danske adresser og stednavne via DAWA.
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold">Værktøjer</div>
            <button
              type="button"
              onClick={() => map.setDrawMode(map.drawMode === "boundary" ? "none" : "boundary")}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
                map.drawMode === "boundary"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted"
              }`}
            >
              <Pencil className="h-4 w-4" />
              {map.drawMode === "boundary" ? "Tegner… klik for at stoppe" : "Tegn projektgrænse"}
            </button>

            <div className="pt-2 border-t">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm bg-background hover:bg-muted transition"
              >
                <Upload className="h-4 w-4" />
                Upload GeoJSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Understøtter GeoJSON Polygon eller Feature med polygon-geometri.
              </p>
            </div>

            {map.isSavingBoundary && (
              <p className="text-xs text-muted-foreground">Gemmer…</p>
            )}
          </Card>

          <Card className="p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4" />
              Kortlag
            </div>
            {(Object.keys(OVERLAY_DEFS) as OverlayKey[]).map((key) => {
              const def = OVERLAY_DEFS[key];
              const missingToken = def.requiresToken && !DAF_TOKEN;
              return (
                <label
                  key={key}
                  className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition ${
                    enabled[key] ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabled[key]}
                    onChange={(e) => setEnabled((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-foreground">{def.label}</span>
                    <span className="block text-muted-foreground">{def.description}</span>
                    {missingToken && enabled[key] && (
                      <span className="block mt-1 text-amber-600 dark:text-amber-400">
                        Kræver Dataforsyningen-token (VITE_DATAFORSYNINGEN_TOKEN).
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </Card>

          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Nuværende område</div>
            {hasPolygon ? (
              <div className="space-y-0.5 text-sm">
                <div className="font-medium">
                  {project.geometry_area_ha?.toFixed(1) ?? "—"} ha
                </div>
                <div className="text-xs text-muted-foreground">
                  Centroid: {project.geometry_centroid_lat?.toFixed(4)}°N,{" "}
                  {project.geometry_centroid_lng?.toFixed(4)}°E
                </div>
                <div className="text-xs text-muted-foreground">
                  Kilde: {project.geometry_source ?? "—"}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Intet område defineret endnu.
              </p>
            )}
          </Card>
        </div>

        {/* Map */}
        <div className="rounded-xl border overflow-hidden bg-card">
          <MapEditorMap
            projectId={project.id}
            projectName={project.name}
            lat={lat}
            lng={lng}
            areaHa={project.geometry_area_ha ?? undefined}
            boundaryGeoJSON={project.geometry_polygon as GeoJsonPolygon | null}
            showSensors={false}
            showParagraph3={false}
            showWatercourses={false}
            drawMode={map.drawMode}
            onDrawModeChange={map.setDrawMode}
            onBoundaryDrawn={map.handleBoundaryDrawn}
            centerOverride={center}
            wmsOverlays={wmsOverlays}
            height={640}
          />
        </div>
      </div>
    </main>
  );
}
