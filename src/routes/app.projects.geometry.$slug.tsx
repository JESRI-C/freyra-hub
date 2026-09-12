import { createFileRoute, notFound, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  MapPin,
  Upload,
  Pencil,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  Grid3x3,
  LandPlot,
  Loader2,
  Search,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui-bits";
import { MapEditorMap, type WmsOverlay } from "@/components/maps/MapEditorMap";
import { AddressSearch } from "@/components/maps/AddressSearch";
import { useMapEditor } from "@/hooks/useMapEditor";
import { getProjectBySlug } from "@/services/projects-service";
import {
  getProjectGeometryUploadSizeError,
  parseProjectGeometryDetailed,
  validateProjectPolygon,
} from "@/services/geo-service";
import { pickMarkblok, pickMatrikel, type PickedFeature } from "@/lib/geo-search.functions";
import { AreaCadastrePanel } from "@/components/data-foundation/AreaCadastrePanel";
import type { GeoJsonPolygon } from "@/services/zones-service";
import { KULSTOF2022_WMS } from "@/data/kulstof2022";
import {
  getSavedOfficialWatercourseReach,
  previewOfficialWatercourseReach,
  saveOfficialWatercourseReach,
  searchOfficialWatercourseReaches,
} from "@/lib/watercourse-reach.functions";
import type {
  OfficialWatercourseGeometry,
  OfficialWatercourseSuggestion,
} from "@/services/geospatial/official-watercourse-source";

export const Route = createFileRoute("/app/projects/geometry/$slug")({
  head: () => ({ meta: [{ title: "Definér projektområde — GoFreyra" }] }),
  // Geometry editing needs the browser user's Supabase session for every
  // project read/write, so this authenticated route must stay client-rendered.
  ssr: false,
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

const DK_FALLBACK = { lat: 56.0, lng: 10.5 };

// Datafordeler-token til visning af matrikellag (WMS er offentligt token-baseret).
const DAF_TOKEN = import.meta.env.VITE_DATAFORSYNINGEN_TOKEN as string | undefined;

// Kortlag der kan slås til/fra som visuel reference.
const OVERLAY_DEFS: Record<
  "cadastre" | "fieldBlocks" | "protectedNature" | "kulstof2022",
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
  kulstof2022: { ...KULSTOF2022_WMS, transparent: true, format: "image/png" },
};

type OverlayKey = keyof typeof OVERLAY_DEFS;
type PickMode = "markblok" | "matrikel" | null;

function GeometryEditorPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<OverlayKey, boolean>>({
    cadastre: false,
    fieldBlocks: true,
    protectedNature: false,
    kulstof2022: false,
  });
  const [center, setCenter] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [addressMarker, setAddressMarker] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [pickedFeature, setPickedFeature] = useState<PickedFeature | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [boundaryEditActive, setBoundaryEditActive] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // Fremhævet matrikel/markblok fra områdepanelet (vises som preview på kortet).
  const [highlightGeom, setHighlightGeom] = useState<GeoJsonPolygon | null>(null);

  const { data: project } = useSuspenseQuery({
    queryKey: ["project-by-slug", slug],
    queryFn: () => getProjectBySlug(slug),
  });

  const suggestedWatercourseName = (project?.location_name || project?.name || "")
    .split(/[–—]/, 1)[0]
    .trim();
  const [watercourseQuery, setWatercourseQuery] = useState(suggestedWatercourseName);
  const [watercourseResults, setWatercourseResults] = useState<OfficialWatercourseSuggestion[]>([]);
  const [watercoursePreview, setWatercoursePreview] = useState<OfficialWatercourseGeometry | null>(
    null,
  );
  const [watercourseError, setWatercourseError] = useState<string | null>(null);
  const [watercourseOperation, setWatercourseOperation] = useState<
    "search" | "preview" | "save" | null
  >(null);

  const map = useMapEditor(project, null);
  const pickMarkblokFn = useServerFn(pickMarkblok);
  const pickMatrikelFn = useServerFn(pickMatrikel);
  const searchWatercoursesFn = useServerFn(searchOfficialWatercourseReaches);
  const previewWatercourseFn = useServerFn(previewOfficialWatercourseReach);
  const saveWatercourseFn = useServerFn(saveOfficialWatercourseReach);
  const loadWatercourseFn = useServerFn(getSavedOfficialWatercourseReach);

  const savedWatercourseQuery = useQuery({
    queryKey: ["official-watercourse-reach", project?.id],
    queryFn: () => loadWatercourseFn({ data: { projectId: project!.id } }),
    enabled: !!project?.id,
    staleTime: 5 * 60 * 1000,
  });

  const activeWatercourse = watercoursePreview ?? savedWatercourseQuery.data ?? null;
  const watercourseMapFeatures = useMemo(
    () =>
      activeWatercourse?.geometry.coordinates.map((coordinates, index) => ({
        id: `${activeWatercourse.id}-${index}`,
        name: activeWatercourse.name,
        coordinates,
      })) ?? [],
    [activeWatercourse],
  );

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

  const persistedGeometryValidation = project.geometry_polygon
    ? validateProjectPolygon(project.geometry_polygon)
    : null;
  const hasPolygon = persistedGeometryValidation?.valid === true;
  const persistedGeometryError =
    persistedGeometryValidation && !persistedGeometryValidation.valid
      ? persistedGeometryValidation.error
      : null;
  const lat = hasPolygon ? (project.geometry_centroid_lat ?? DK_FALLBACK.lat) : DK_FALLBACK.lat;
  const lng = hasPolygon ? (project.geometry_centroid_lng ?? DK_FALLBACK.lng) : DK_FALLBACK.lng;
  const boundaryOperationBusy = map.isBoundaryBusy || picking || uploading;
  const boundaryUiBusy = boundaryOperationBusy || boundaryEditActive;

  const activateDrawing = () => {
    if (boundaryUiBusy) return;
    setPickMode(null);
    setPickedFeature(null);
    map.setDrawMode(map.drawMode === "boundary" ? "none" : "boundary");
  };

  const activatePick = (mode: PickMode) => {
    if (boundaryUiBusy) return;
    map.setDrawMode("none");
    setPickedFeature(null);
    setPickError(null);
    setPickMode((cur) => (cur === mode ? null : mode));
    // Sørg for at markbloklaget er tændt så brugeren ser hvad de vælger
    if (mode === "markblok") setEnabled((e) => ({ ...e, fieldBlocks: true }));
    if (mode === "matrikel") setEnabled((e) => ({ ...e, cadastre: true }));
  };

  const handleFeaturePick = async (ll: { lat: number; lng: number }) => {
    if (!pickMode || boundaryUiBusy) return;
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

  const savePickedFeatureAsBoundary = async () => {
    if (!pickedFeature || boundaryUiBusy) return;
    const saved = await map.handleBoundaryDrawn(
      pickedFeature.geometry as GeoJsonPolygon,
      pickedFeature.areaHa,
      pickedFeature.source,
    );
    if (!saved) return;
    toast.success(`${pickedFeature.label} valgt som projektgrænse`);
    setPickedFeature(null);
    setPickMode(null);
  };

  const handleFile = async (file: File) => {
    if (boundaryUiBusy) {
      setUploadError("En anden ændring af projektgrænsen er allerede i gang.");
      return;
    }
    const sizeError = getProjectGeometryUploadSizeError(file.size);
    if (sizeError) {
      setUploadError(sizeError);
      return;
    }
    setUploading(true);
    map.setDrawMode("none");
    setPickMode(null);
    setPickedFeature(null);
    setUploadError(null);
    try {
      const text = await file.text();
      const { geometry: parsed, error } = parseProjectGeometryDetailed(text, "uploaded");
      if (!parsed.hasValidGeometry || !parsed.polygon) {
        setUploadError(error ?? "Filen indeholder ikke en gyldig Polygon-geometri.");
        return;
      }
      const saved = await map.handleBoundaryDrawn(
        parsed.polygon as GeoJsonPolygon,
        parsed.areaHa ?? 0,
        "uploaded",
      );
      if (!saved) return;
      toast.success("Projektområde uploadet");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Kunne ikke læse fil");
    } finally {
      setUploading(false);
    }
  };

  const confirmAndClearBoundary = async () => {
    if (boundaryUiBusy) return;
    if (
      !confirm(
        "Ryd projektgrænsen? Alle afledte beregninger vil kræve at der tegnes et nyt område.",
      )
    ) {
      return;
    }
    if (await map.clearBoundary()) toast.success("Projektgrænse ryddet");
  };

  const handleWatercourseSearch = async () => {
    const query = watercourseQuery.trim();
    if (query.length < 2 || watercourseOperation) return;
    setWatercourseOperation("search");
    setWatercourseError(null);
    setWatercourseResults([]);
    try {
      const results = await searchWatercoursesFn({
        data: { projectId: project.id, query },
      });
      setWatercourseResults(results);
      if (results.length === 0) setWatercourseError("Ingen navngivne vandløb matchede søgningen.");
    } catch (error) {
      setWatercourseError(
        error instanceof Error ? error.message : "Kunne ikke søge efter vandløbsstrenge.",
      );
    } finally {
      setWatercourseOperation(null);
    }
  };

  const handleWatercoursePreview = async (suggestion: OfficialWatercourseSuggestion) => {
    if (watercourseOperation) return;
    setWatercourseOperation("preview");
    setWatercourseError(null);
    try {
      const reach = await previewWatercourseFn({
        data: { projectId: project.id, watercourseId: suggestion.id },
      });
      setWatercoursePreview({ ...reach, municipalities: suggestion.municipalities });
      setWatercourseResults([]);
      setCenter({ lat: reach.center.lat, lng: reach.center.lng, zoom: 13 });
    } catch (error) {
      setWatercourseError(
        error instanceof Error ? error.message : "Kunne ikke hente vandløbets geometri.",
      );
    } finally {
      setWatercourseOperation(null);
    }
  };

  const handleWatercourseSave = async () => {
    if (!watercoursePreview || watercourseOperation) return;
    setWatercourseOperation("save");
    setWatercourseError(null);
    try {
      const saved = await saveWatercourseFn({
        data: { projectId: project.id, watercourseId: watercoursePreview.id },
      });
      queryClient.setQueryData(["official-watercourse-reach", project.id], saved);
      setWatercoursePreview(null);
      toast.success("Vandløbsstrengen er gemt på projektet");
    } catch (error) {
      setWatercourseError(
        error instanceof Error ? error.message : "Kunne ikke gemme vandløbsstrengen.",
      );
    } finally {
      setWatercourseOperation(null);
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
            Find området, vælg en matrikel eller markblok, eller tegn selv. Alle analyser baseres på
            det gemte projektområde.
          </p>
        </div>
      </div>

      {/* Feedback banners */}
      {map.lastError && (
        <Banner tone="error" onClose={map.clearError}>
          {map.lastError}
        </Banner>
      )}
      {uploadError && (
        <Banner tone="error" onClose={() => setUploadError(null)}>
          {uploadError}
        </Banner>
      )}
      {pickError && (
        <Banner tone="error" onClose={() => setPickError(null)}>
          {pickError}
        </Banner>
      )}
      {watercourseError && (
        <Banner tone="error" onClose={() => setWatercourseError(null)}>
          {watercourseError}
        </Banner>
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
              disabled={boundaryUiBusy}
              className={toolButton(map.drawMode === "boundary", boundaryUiBusy)}
            >
              <Pencil className="h-4 w-4" />
              {map.drawMode === "boundary" ? "Tegner … stop" : "Tegn manuelt"}
            </button>

            <button
              type="button"
              onClick={() => activatePick("matrikel")}
              disabled={boundaryUiBusy}
              className={toolButton(pickMode === "matrikel", boundaryUiBusy)}
              title="Kræver Datafordeler service-bruger på serveren"
            >
              <Grid3x3 className="h-4 w-4" />
              Vælg matrikel
            </button>

            <button
              type="button"
              onClick={() => activatePick("markblok")}
              disabled={boundaryUiBusy}
              className={toolButton(pickMode === "markblok", boundaryUiBusy)}
            >
              <LandPlot className="h-4 w-4" />
              Vælg markblok
            </button>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={boundaryUiBusy}
              className={toolButton(false, boundaryUiBusy)}
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

            {boundaryOperationBusy && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {picking ? "Henter valgt geometri …" : uploading ? "Læser fil …" : "Gemmer …"}
              </p>
            )}
          </Card>

          {/* Picked feature preview */}
          {pickedFeature && (
            <Card className="p-4 space-y-2 border-amber-300 bg-amber-50/40">
              <div className="text-sm font-semibold text-amber-900">{pickedFeature.label}</div>
              <dl className="text-xs space-y-0.5 text-amber-900/80">
                <div className="flex justify-between">
                  <dt>Areal</dt>
                  <dd>{pickedFeature.areaHa} ha</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Kilde</dt>
                  <dd className="truncate ml-2">{pickedFeature.attribution}</dd>
                </div>
              </dl>
              <p className="text-[10px] text-amber-900/70 italic">{pickedFeature.disclaimer}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void savePickedFeatureAsBoundary()}
                  disabled={boundaryUiBusy}
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
            <SectionTitle n={3} icon={<Layers className="h-3.5 w-3.5" />}>
              Kortlag
            </SectionTitle>
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

          {/* 4. Officiel vandløbsstreng — separat fra projektgrænsen */}
          <Card className="p-4 space-y-3">
            <SectionTitle n={4}>Vandløbsstreng</SectionTitle>
            <p className="text-[11px] text-muted-foreground">
              Find en navngivet, officiel linje fra Dataforsyningen. Strengen gemmes som
              monitoreringsreference og ændrer ikke projektgrænsen.
            </p>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleWatercourseSearch();
              }}
            >
              <input
                value={watercourseQuery}
                onChange={(event) => setWatercourseQuery(event.target.value)}
                placeholder="Fx Bykær Bæk"
                aria-label="Vandløbsnavn"
                className="min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={watercourseQuery.trim().length < 2 || watercourseOperation !== null}
                className="inline-flex items-center justify-center rounded-lg border px-2.5 text-primary hover:bg-primary/5 disabled:opacity-50"
                aria-label="Søg efter vandløb"
              >
                {watercourseOperation === "search" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </form>

            {watercourseResults.length > 0 && (
              <div className="space-y-1.5" aria-label="Vandløbsresultater">
                {watercourseResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => void handleWatercoursePreview(result)}
                    disabled={watercourseOperation !== null}
                    className="w-full rounded-lg border p-2.5 text-left text-xs hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  >
                    <span className="block font-medium text-foreground">{result.name}</span>
                    <span className="block text-muted-foreground">
                      {result.municipalities.join(", ") || "Kommune ikke angivet"} ·{" "}
                      {result.nameStatus}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {watercourseOperation === "preview" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Henter officiel geometri …
              </p>
            )}

            {activeWatercourse && (
              <div className="space-y-2 rounded-lg border border-blue-300 bg-blue-50/60 p-3 text-xs text-blue-950 dark:bg-blue-950/20 dark:text-blue-100">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{activeWatercourse.name}</div>
                    <div className="text-blue-800/80 dark:text-blue-200/80">
                      {(activeWatercourse.lengthM / 1000).toFixed(2)} km ·{" "}
                      {activeWatercourse.segmentCount} delstrækninger ·{" "}
                      {activeWatercourse.vertexCount} punkter
                    </div>
                    {activeWatercourse.municipalities.length > 0 && (
                      <div className="text-blue-800/80 dark:text-blue-200/80">
                        {activeWatercourse.municipalities.join(", ")}
                      </div>
                    )}
                  </div>
                  <a
                    href={activeWatercourse.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Åbn kilden"
                    className="text-blue-700 hover:text-blue-900 dark:text-blue-300"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <p className="text-[10px] leading-relaxed text-blue-800/75 dark:text-blue-200/75">
                  {activeWatercourse.disclaimer}
                </p>
                {watercoursePreview ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleWatercourseSave()}
                      disabled={watercourseOperation !== null}
                      className="flex-1 rounded-md bg-blue-700 px-2.5 py-1.5 font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {watercourseOperation === "save" ? "Gemmer …" : "Gem på projektet"}
                    </button>
                    {savedWatercourseQuery.data && (
                      <button
                        type="button"
                        onClick={() => setWatercoursePreview(null)}
                        disabled={watercourseOperation !== null}
                        className="rounded-md border border-blue-300 px-2.5 py-1.5"
                      >
                        Brug gemt
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="font-medium text-emerald-700 dark:text-emerald-400">
                    Gemt på projektet · kilde-ID {activeWatercourse.id}
                  </div>
                )}
              </div>
            )}

            {savedWatercourseQuery.isError && (
              <p className="text-xs text-destructive">Kunne ikke læse en gemt vandløbsstreng.</p>
            )}
          </Card>

          {/* 5. Aktuelt område */}
          <Card className="p-4 space-y-1.5">
            <SectionTitle n={5}>Aktuelt projektområde</SectionTitle>
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
                  onClick={() => navigate({ to: "/app/projects/$slug", params: { slug } })}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Fortsæt til projekt
                </button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Området er gemt. Gå videre for at køre analyser og rapporter.
                </p>
                <button
                  type="button"
                  onClick={() => void confirmAndClearBoundary()}
                  disabled={boundaryUiBusy || map.drawMode !== "none" || pickMode !== null}
                  className="mt-2 w-full text-xs px-2.5 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-50"
                >
                  {map.isClearingBoundary ? "Rydder …" : "Ryd projektgrænse"}
                </button>
              </>
            ) : persistedGeometryError ? (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>Den gemte projektgrænse er ugyldig: {persistedGeometryError}</p>
                <p className="text-xs text-muted-foreground">
                  Fortsæt og matrikelanalyse er blokeret, indtil grænsen er erstattet eller ryddet.
                </p>
                <button
                  type="button"
                  onClick={() => void confirmAndClearBoundary()}
                  disabled={boundaryUiBusy}
                  className="w-full text-xs px-2.5 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-50"
                >
                  Ryd ugyldig projektgrænse
                </button>
              </div>
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
            boundaryGeoJSON={
              persistedGeometryValidation?.valid ? persistedGeometryValidation.polygon : null
            }
            showSensors={false}
            showParagraph3={false}
            showWatercourses={activeWatercourse !== null}
            watercourseFeatures={watercourseMapFeatures}
            fitWatercourses
            drawMode={map.drawMode}
            onDrawModeChange={map.setDrawMode}
            onBoundaryDrawn={map.handleBoundaryDrawn}
            boundaryBusy={boundaryOperationBusy || pickMode !== null}
            onBoundaryEditStateChange={setBoundaryEditActive}
            centerOverride={center}
            wmsOverlays={wmsOverlays}
            addressMarker={addressMarker}
            pickMode={pickMode}
            onFeaturePicked={handleFeaturePick}
            showCadastreParcels={enabled.cadastre}
            previewPolygon={
              (pickedFeature?.geometry ?? highlightGeom ?? null) as GeoJsonPolygon | null
            }
            height={640}
          />
        </div>
      </div>
    </main>
  );
}

// ─── UI-hjælpere ────────────────────────────────────────────────────────────

function SectionTitle({
  n,
  children,
  icon,
}: {
  n: number;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
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
        <button onClick={onClose} aria-label="Luk">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function sourceLabel(src: string | null | undefined): string {
  switch (src) {
    case "manual":
      return "Manuelt tegnet";
    case "uploaded":
      return "GeoJSON-upload";
    case "markblok":
      return "Markblok";
    case "matrikel":
      return "Matrikel";
    case "estimated":
      return "Estimeret";
    default:
      return src ?? "—";
  }
}
