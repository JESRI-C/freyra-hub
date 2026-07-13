import { createFileRoute, notFound, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MapPin, Upload, Pencil, CheckCircle2, AlertCircle, X, Layers, Grid3x3, LandPlot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui-bits";
import { MapEditorMap, type WmsOverlay } from "@/components/maps/MapEditorMap";
import { AddressSearch } from "@/components/maps/AddressSearch";
import { useMapEditor } from "@/hooks/useMapEditor";
import { getProjectBySlug } from "@/services/projects-service";
import { parseProjectGeometry } from "@/services/geo-service";
import { pickMarkblok, pickMatrikel, type PickedFeature } from "@/lib/geo-search.functions";
import { AreaCadastrePanel } from "@/components/data-foundation/AreaCadastrePanel";
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
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-center text-muted-foreground">Projekt ikke fundet.</div>,
});

const DK_FALLBACK = { lat: 56.0, lng: 10.5 };

// Datafordeler-token til visning af matrikellag (WMS er offentligt token-baseret).
const DAF_TOKEN = import.meta.env.VITE_DATAFORSYNINGEN_TOKEN as string | undefined;

// Kortlag der kan slås til/fra som visuel reference.
const OVERLAY_DEFS: Record<
  "cadastre" | "fieldBlocks" | "protectedNature",
  Omit<WmsOverlay, "id"> & { label: string; description: string; requiresToken?: boolean }
> = {
  cadastre: {
    label: "Matrikelskel",
    description: "Ejendoms- og matrikelgrænser — vises som vektorer fra Dataforsyningen (zoom ind)",
    url: `https://api.dataforsyningen.dk/wms/matrikel${DAF_TOKEN ? `?token=${DAF_TOKEN}` : ""}`,
    layers: "MatrikelSkel,Centroide",
    opacity: 0.9,
    transparent: true,
    format: "image/png",
    attribution: "© Styrelsen for Dataforsyning",
    // WMS-varianten kræver token; uden token tegnes matrikler som vektorlag
    // (DAWA) direkte i MapEditorMap via showCadastreParcels.
    requiresToken: true,
  },
  fieldBlocks: {
    label: "Markblokke",
    description: "Landbrugsstyrelsens markblokke",
    url: "https://kort.lbst.dk/service?SERVICENAME=marker_wms_v3",
    layers: "Markblokke",
    opacity: 0.55,
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
type PickMode = "markblok" | "matrikel" | null;

function GeometryEditorPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<OverlayKey, boolean>>({
    cadastre: false,
    fieldBlocks: true,
    protectedNature: false,
  });
  const [center, setCenter] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [addressMarker, setAddressMarker] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [pickedFeature, setPickedFeature] = useState<PickedFeature | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // Fremhævet matrikel/markblok fra områdepanelet (vises som preview på kortet).
  const [highlightGeom, setHighlightGeom] = useState<GeoJsonPolygon | null>(null);

  const { data: project } = useSuspenseQuery({
    queryKey: ["project-by-slug", slug],
    queryFn: () => getProjectBySlug(slug),
  });

  const map = useMapEditor(project, null);
  const pickMarkblokFn = useServerFn(pickMarkblok);
  const pickMatrikelFn = useServerFn(pickMatrikel);

  const wmsOverlays = useMemo<WmsOverlay[]>(
    () =>
      (Object.keys(enabled) as OverlayKey[])
        .filter((k) => enabled[k])
        // Matrikel-WMS'en virker kun med token — uden token dækker vektorlaget
        // (showCadastreParcels), så vi undlader døde WMS-requests.
        .filter((k) => !(k === "cadastre" && !DAF_TOKEN))
        .map((k) => ({ id: k, ...OVERLAY_DEFS[k] })),
    [enabled],
  );

  if (!project) return null;

  const hasPolygon = project.geometry_polygon != null;
  const lat = project.geometry_centroid_lat ?? DK_FALLBACK.lat;
  const lng = project.geometry_centroid_lng ?? DK_FALLBACK.lng;

  const activateDrawing = () => {
    setPickMode(null);
    setPickedFeature(null);
    map.setDrawMode(map.drawMode === "boundary" ? "none" : "boundary");
  };

  const activatePick = (mode: PickMode) => {
    map.setDrawMode("none");
    setPickedFeature(null);
    setPickError(null);
    setPickMode((cur) => (cur === mode ? null : mode));
    // Sørg for at markbloklaget er tændt så brugeren ser hvad de vælger
    if (mode === "markblok") setEnabled((e) => ({ ...e, fieldBlocks: true }));
    if (mode === "matrikel") setEnabled((e) => ({ ...e, cadastre: true }));
  };

  const handleFeaturePick = async (ll: { lat: number; lng: number }) => {
    if (!pickMode || picking) return;
    setPicking(true);
    setPickError(null);
    try {
      const fn = pickMode === "markblok" ? pickMarkblokFn : pickMatrikelFn;
      const result = await fn({ data: ll });
      if (!result) {
        setPickError(`Ingen ${pickMode} fundet på det klikkede punkt.`);
        return;
      }
      setPickedFeature(result);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : "Kunne ikke hente valgt geometri");
    } finally {
      setPicking(false);
    }
  };

  const useFeatureAsBoundary = () => {
    if (!pickedFeature) return;
    map.handleBoundaryDrawn(pickedFeature.geometry as GeoJsonPolygon, pickedFeature.areaHa, pickedFeature.source);
    toast.success(`${pickedFeature.label} valgt som projektgrænse`);
    setPickedFeature(null);
    setPickMode(null);
  };

  const handleFile = async (file: File) => {
    setUploadError(null);
    try {
      const text = await file.text();
      const parsed = parseProjectGeometry(text, "uploaded");
      if (!parsed.hasValidGeometry || !parsed.polygon) {
        setUploadError("Filen indeholder ikke en gyldig Polygon-geometri.");
        return;
      }
      map.handleBoundaryDrawn(parsed.polygon as GeoJsonPolygon, parsed.areaHa ?? 0, "uploaded");
      toast.success("Projektområde uploadet");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Kunne ikke læse fil");
    }
  };

  const toolButton = (active: boolean, disabled = false) =>
    `w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
      disabled
        ? "opacity-50 cursor-not-allowed bg-muted/40"
        : active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted"
    }`;

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4 pb-16">
      {/* Header */}
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
            Find området, vælg en matrikel eller markblok, eller tegn selv. Alle analyser baseres
            på det gemte projektområde.
          </p>
        </div>
      </div>

      {/* Feedback banners */}
      {map.lastError && (
        <Banner tone="error" onClose={map.clearError}>{map.lastError}</Banner>
      )}
      {uploadError && (
        <Banner tone="error" onClose={() => setUploadError(null)}>{uploadError}</Banner>
      )}
      {pickError && (
        <Banner tone="error" onClose={() => setPickError(null)}>{pickError}</Banner>
      )}
      {map.boundarySaved && (
        <Banner tone="success">
          Projektområde gemt.{" "}
          <button
            onClick={() => navigate({ to: "/app/projects/$slug", params: { slug } })}
            className="underline font-medium"
          >
            Gå til projekt →
          </button>
        </Banner>
      )}

      <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
        {/* ── Sidepanel ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* 1. Find sted */}
          <Card className="p-4 space-y-2">
            <SectionTitle n={1}>Find sted</SectionTitle>
            <AddressSearch
              onSelect={(p) => {
                setCenter({ lat: p.lat, lng: p.lng, zoom: 17 });
                setAddressMarker({ lat: p.lat, lng: p.lng, label: p.label });
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Adresse, vej, stednavn eller koordinater. Kortet zoomer direkte ind på stedet.
            </p>
          </Card>

          {/* 2. Vælg projektgrænse */}
          <Card className="p-4 space-y-2">
            <SectionTitle n={2}>Vælg projektgrænse</SectionTitle>
            <button
              type="button"
              onClick={activateDrawing}
              className={toolButton(map.drawMode === "boundary")}
            >
              <Pencil className="h-4 w-4" />
              {map.drawMode === "boundary" ? "Tegner … stop" : "Tegn manuelt"}
            </button>

            <button
              type="button"
              onClick={() => activatePick("matrikel")}
              className={toolButton(pickMode === "matrikel")}
              title="Kræver Datafordeler service-bruger på serveren"
            >
              <Grid3x3 className="h-4 w-4" />
              Vælg matrikel
            </button>

            <button
              type="button"
              onClick={() => activatePick("markblok")}
              className={toolButton(pickMode === "markblok")}
            >
              <LandPlot className="h-4 w-4" />
              Vælg markblok
            </button>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={toolButton(false)}
            >
              <Upload className="h-4 w-4" />
              Upload GeoJSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
            />

            {(map.isSavingBoundary || picking) && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {picking ? "Henter valgt geometri …" : "Gemmer …"}
              </p>
            )}
          </Card>

          {/* Picked feature preview */}
          {pickedFeature && (
            <Card className="p-4 space-y-2 border-amber-300 bg-amber-50/40">
              <div className="text-sm font-semibold text-amber-900">{pickedFeature.label}</div>
              <dl className="text-xs space-y-0.5 text-amber-900/80">
                <div className="flex justify-between"><dt>Areal</dt><dd>{pickedFeature.areaHa} ha</dd></div>
                <div className="flex justify-between"><dt>Kilde</dt><dd className="truncate ml-2">{pickedFeature.attribution}</dd></div>
              </dl>
              <p className="text-[10px] text-amber-900/70 italic">{pickedFeature.disclaimer}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={useFeatureAsBoundary}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                >
                  Brug som projektgrænse
                </button>
                <button
                  onClick={() => setPickedFeature(null)}
                  className="text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted"
                >
                  Annuller
                </button>
              </div>
            </Card>
          )}

          {/* 3. Kortlag */}
          <Card className="p-4 space-y-2">
            <SectionTitle n={3} icon={<Layers className="h-3.5 w-3.5" />}>Kortlag</SectionTitle>
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
                    {missingToken && enabled[key] && key === "cadastre" && (
                      <span className="block mt-1 text-muted-foreground">
                        Vises som vektorer (zoom ind til niveau 15+).
                      </span>
                    )}
                    {missingToken && enabled[key] && key !== "cadastre" && (
                      <span className="block mt-1 text-amber-600">Kræver Datafordeler-token.</span>
                    )}
                  </span>
                </label>
              );
            })}
          </Card>

          {/* 4. Aktuelt område */}
          <Card className="p-4 space-y-1.5">
            <SectionTitle n={4}>Aktuelt projektområde</SectionTitle>
            {hasPolygon ? (
              <>
                <div className="text-lg font-semibold">
                  {project.geometry_area_ha?.toFixed(2) ?? "—"} ha
                </div>
                <dl className="text-xs text-muted-foreground space-y-0.5">
                  <div>
                    Centroid: {project.geometry_centroid_lat?.toFixed(4)}°N,{" "}
                    {project.geometry_centroid_lng?.toFixed(4)}°E
                  </div>
                  <div>Kilde: {sourceLabel(project.geometry_source)}</div>
                </dl>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Ryd projektgrænsen? Alle afledte beregninger vil kræve at der tegnes et nyt område.")) {
                      map.clearBoundary();
                      toast.success("Projektgrænse ryddet");
                    }
                  }}
                  disabled={map.isClearingBoundary}
                  className="mt-2 w-full text-xs px-2.5 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-50"
                >
                  {map.isClearingBoundary ? "Rydder …" : "Ryd projektgrænse"}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Intet område defineret endnu.</p>
            )}
          </Card>

          {/* 5. Matrikler & markblokke i området */}
          {hasPolygon && (
            <Card className="p-4">
              <AreaCadastrePanel
                polygon={project.geometry_polygon as GeoJsonPolygon | null}
                onHighlight={setHighlightGeom}
              />
            </Card>
          )}
        </div>

        {/* ── Kort ──────────────────────────────────────────────────────────── */}
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
            addressMarker={addressMarker}
            pickMode={pickMode}
            onFeaturePicked={handleFeaturePick}
            showCadastreParcels={enabled.cadastre}
            previewPolygon={(pickedFeature?.geometry ?? highlightGeom ?? null) as GeoJsonPolygon | null}
            height={640}
          />
        </div>
      </div>
    </main>
  );
}

// ─── UI-hjælpere ────────────────────────────────────────────────────────────

function SectionTitle({ n, children, icon }: { n: number; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] flex items-center justify-center font-bold">
        {n}
      </span>
      {icon}
      {children}
    </div>
  );
}

function Banner({
  tone,
  children,
  onClose,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-destructive/30 bg-destructive/10 text-destructive";
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${cls}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Luk"><X className="h-4 w-4" /></button>
      )}
    </div>
  );
}

function sourceLabel(src: string | null | undefined): string {
  switch (src) {
    case "manual": return "Manuelt tegnet";
    case "uploaded": return "GeoJSON-upload";
    case "markblok": return "Markblok";
    case "matrikel": return "Matrikel";
    case "estimated": return "Estimeret";
    default: return src ?? "—";
  }
}
