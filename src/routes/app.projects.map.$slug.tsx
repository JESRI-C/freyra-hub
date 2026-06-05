import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { getProjectBySlug } from "@/services/projects-service";
import { getProjectGeometrySeed } from "@/services/geo-service";
import { getProjectSensors } from "@/services/iot-simulation-service";
import { buildProjectEnvironmentalContext } from "@/services/connector-service";
import { getMapLayers, getProjectGeoJSON, getProjectMetrics } from "@/services/geospatial-service";
import { LiveProjectMap } from "@/components/maps/LiveProjectMap";
import { LayerControlPanel } from "@/components/maps/LayerControlPanel";
import { ProjectMetricsPanel } from "@/components/maps/ProjectMetricsPanel";
import { ConnectorStatusPanel } from "@/components/maps/ConnectorStatusPanel";
import { MapExportPanel } from "@/components/maps/MapExportPanel";
import { FieldSensorPanel } from "@/components/project-workspace/FieldSensorPanel";
import { NdviCard } from "@/components/project/NdviCard";
import { EnvironmentalCard } from "@/components/project/EnvironmentalCard";
import { BiodiversityCard } from "@/components/project/BiodiversityCard";
import type { ConnectorStatusItem } from "@/components/maps/ConnectorStatusPanel";

export const Route = createFileRoute("/app/projects/map/$slug")({
  head: () => ({ meta: [{ title: "Geodata-kort — GoFreyra" }] }),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    const project = await queryClient.ensureQueryData({
      queryKey: ["project-by-slug", slug],
      queryFn: () => getProjectBySlug(slug),
    });
    if (!project) throw notFound();
    return project;
  },
  component: GeoMapPage,
  notFoundComponent: () => (
    <div className="p-6 text-center text-muted-foreground">Projekt ikke fundet.</div>
  ),
});

// ─── Static connector status list ─────────────────────────────────────────────
const CONNECTOR_STATUS: ConnectorStatusItem[] = [
  {
    name: "Copernicus Sentinel-2",
    slug: "sentinel",
    status: "preview",
    provider: "ESA / Copernicus",
    note: "NDVI via open STAC — kræver token for download",
  },
  {
    name: "Danmarks Miljøportal",
    slug: "miljodata",
    status: "preview",
    provider: "Miljøministeriet",
    note: "§3 natur og vandløbsdata via åbent WFS",
  },
  {
    name: "Dataforsyningen",
    slug: "dataforsyningen",
    status: "live",
    provider: "Styrelsen for Dataforsyning",
    note: "Reverse geocoding — ingen nøgle krævet",
  },
  {
    name: "DMI Vejrdata",
    slug: "dmi",
    status: "live",
    provider: "DMI Open Data",
    note: "Temperatur og nedbør via åbent API",
  },
  {
    name: "IoT Feltsensorer",
    slug: "iot",
    status: "preview",
    provider: "GoFreyra IoT (simuleret)",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function GeoMapPage() {
  const { slug } = Route.useParams();

  const { data: project } = useSuspenseQuery({
    queryKey: ["project-by-slug", slug],
    queryFn: () => getProjectBySlug(slug),
  });

  const projectId = project?.id ?? "";
  const geometry = getProjectGeometrySeed(projectId);
  const sensors = geometry.centroid ? getProjectSensors(projectId, geometry.centroid) : [];

  // Environmental context for DMI overlay
  const { data: envCtx } = useQuery({
    queryKey: ["environmental-context", slug],
    queryFn: () =>
      buildProjectEnvironmentalContext(
        projectId,
        project?.name ?? "",
        project?.location_name ?? "Danmark",
        project?.municipality ?? "Danmark",
        geometry,
      ),
    enabled: !!projectId,
  });

  // Geo data
  const { data: mapLayers = [] } = useQuery({
    queryKey: ["map-layers"],
    queryFn: getMapLayers,
  });

  const { data: geoJSON = null } = useQuery({
    queryKey: ["project-geojson", projectId],
    queryFn: () => getProjectGeoJSON(projectId, project?.name ?? "Projekt"),
    enabled: !!projectId,
  });

  const { data: metrics } = useQuery({
    queryKey: ["project-metrics", projectId],
    queryFn: () => getProjectMetrics(projectId),
    enabled: !!projectId,
  });

  // Layer visibility state
  const [visibleSlugs, setVisibleSlugs] = useState<Set<string>>(
    () => new Set(mapLayers.filter((l) => l.isActive).map((l) => l.slug)),
  );

  const toggleLayer = (slug: string) => {
    setVisibleSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  if (!project) return null;

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5 pb-16">
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
            <span>Geodata-kort</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight truncate">{project.name}</h1>
          {project.municipality && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {project.municipality}
              {project.location_name ? ` · ${project.location_name}` : ""}
            </p>
          )}
        </div>
        <Link
          to="/app/projects/$slug"
          params={{ slug }}
          className="hidden sm:inline-flex items-center gap-1.5 text-sm text-primary hover:underline shrink-0"
        >
          Projektworkspace →
        </Link>
      </div>

      {/* Main layout: map + side panel */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Left: Map */}
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden border shadow-sm">
            <LiveProjectMap
              geometry={geometry}
              projectName={project.name}
              projectId={projectId}
              height={540}
              sensors={visibleSlugs.has("sensors") ? sensors : []}
              dmiData={
                envCtx?.liveData?.weather
                  ? {
                      temperature: envCtx.liveData.weather.temperature,
                      windSpeed: envCtx.liveData.weather.windSpeed,
                      precipitation: envCtx.liveData.weather.precipitation,
                      observedAt: envCtx.liveData.weather.fetchedAt,
                      mode: envCtx.liveData.weather.mode,
                    }
                  : undefined
              }
            />
          </div>

          {/* Metrics */}
          {metrics && <ProjectMetricsPanel metrics={metrics} />}

          <NdviCard
            projectId={projectId}
            lat={geometry.centroid?.lat ?? null}
            lng={geometry.centroid?.lng ?? null}
          />
          <EnvironmentalCard project={project} />

          {/* Sensor panel */}
          {sensors.length > 0 && visibleSlugs.has("sensors") && (
            <FieldSensorPanel sensors={sensors} />
          )}
        </div>

        {/* Right: Panels */}
        <div className="space-y-4">
          <LayerControlPanel
            layers={mapLayers.length > 0 ? mapLayers : [
              { id: "l1", name: "Projektområde", slug: "project_area", category: "nature", provider: null, layerType: "geojson", isActive: true, requiresApiKey: false, refreshInterval: null, status: "preview" },
              { id: "l2", name: "Beskyttet natur (§3)", slug: "protected_nature", category: "nature", provider: "Miljøportal", layerType: "wfs", isActive: true, requiresApiKey: false, refreshInterval: "24h", status: "preview" },
              { id: "l3", name: "Vandløb", slug: "watercourses", category: "water", provider: "Miljøportal", layerType: "wfs", isActive: true, requiresApiKey: false, refreshInterval: "24h", status: "preview" },
              { id: "l4", name: "Jordbundstyper", slug: "soil_types", category: "terrain", provider: "GEUS", layerType: "wms", isActive: true, requiresApiKey: false, refreshInterval: "7d", status: "preview" },
              { id: "l5", name: "Sentinel-2 NDVI", slug: "sentinel_ndvi", category: "satellite", provider: "Copernicus", layerType: "tile", isActive: false, requiresApiKey: true, refreshInterval: "5d", status: "preview" },
              { id: "l6", name: "IoT Feltsensorer", slug: "sensors", category: "sensors", provider: "GoFreyra IoT", layerType: "sensor", isActive: true, requiresApiKey: false, refreshInterval: "realtime", status: "preview" },
            ]}
            visibleSlugs={visibleSlugs}
            onToggle={toggleLayer}
          />

          <ConnectorStatusPanel connectors={CONNECTOR_STATUS} />

          <MapExportPanel
            geoJSON={geoJSON}
            projectName={project.name}
          />
        </div>
      </div>
    </main>
  );
}
