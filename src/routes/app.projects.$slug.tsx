import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { ShieldCheck, RefreshCw, Eye, FileText, AlertTriangle, Activity, MapPin } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { IndicatorCard } from "@/components/project/IndicatorCard";
import { SitesPanel } from "@/components/project/SitesPanel";
import { ActionItem } from "@/components/project/ActionItem";
import { EvidenceList } from "@/components/project/EvidenceList";
import { EvidenceUploadForm } from "@/components/project/EvidenceUploadForm";
import { ReportPreviewCard } from "@/components/project/ReportPreviewCard";
import { NdviCard } from "@/components/project/NdviCard";
import { EnvironmentalCard } from "@/components/project/EnvironmentalCard";
import { BiodiversityCard } from "@/components/project/BiodiversityCard";
import {
  getProjectBySlug,
  getSitesByProject,
  getDataSourcesByProject,
} from "@/services/projects-service";
import { getIndicatorsByProject } from "@/services/indicators-service";
import { getReportsByProject, reportStatusTone } from "@/services/reports-service";
import { getAuditEventsByProject, auditEventIcon } from "@/services/audit-service";
import {
  getOpenActionsByProject,
  actionPriorityTone,
  suggestSensorActions,
  completeAction,
  updateActionDetails,
  createAction,
} from "@/services/actions-service";
import { getEvidenceFilesByProject } from "@/services/evidence-service";
import { getObservationsByProject, observationTypeLabel } from "@/services/observations-service";
import { generateProjectReportPreview, getRecommendedNextAction } from "@/lib/report-engine";
import { listProjectMedia } from "@/services/project-media-service";
import { ProjectMediaGallery } from "@/components/project-workspace/ProjectMediaGallery";
import { ProjectMediaUploadPanel } from "@/components/project-workspace/ProjectMediaUploadPanel";
import { FieldSensorPanel } from "@/components/project-workspace/FieldSensorPanel";
import { LiveProjectMap } from "@/components/maps/LiveProjectMap";
import { getProjectSensors } from "@/services/iot-simulation-service";
import { ProjectGeometryMap } from "@/components/data-foundation/ProjectGeometryMap";
import {
  dataSourceStatusTone,
  dataSourceStatusLabel,
  formatLastSync,
} from "@/services/data-sources-service";
import { buildProjectEnvironmentalContext } from "@/services/connector-service";
import { getProjectGeometrySeed } from "@/services/geo-service";
import { ProjectEnvironmentalDashboard } from "@/components/data-foundation/ProjectEnvironmentalDashboard";
import type { Action } from "@/lib/supabase/types";

// ─── Icon helper ──────────────────────────────────────────────────────────────

function AuditIcon({ name }: { name: string }) {
  switch (name) {
    case "ShieldCheck":
      return <ShieldCheck className="h-4 w-4" />;
    case "RefreshCw":
      return <RefreshCw className="h-4 w-4" />;
    case "Eye":
      return <Eye className="h-4 w-4" />;
    case "FileText":
      return <FileText className="h-4 w-4" />;
    case "AlertTriangle":
      return <AlertTriangle className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

export const Route = createFileRoute("/app/projects/$slug")({
  head: () => ({ meta: [{ title: "Projekt — GoFreyra" }] }),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    const project = await queryClient.ensureQueryData({
      queryKey: ["project-by-slug", slug],
      queryFn: () => getProjectBySlug(slug),
    });
    if (!project) throw notFound();
    return project;
  },
  component: ProjectDetailPage,
  notFoundComponent: () => (
    <div className="p-6 text-center text-muted-foreground">Projekt ikke fundet.</div>
  ),
});

const TABS = [
  { id: "overblik", label: "Overblik" },
  { id: "sites", label: "Sites" },
  { id: "datakilder", label: "Datakilder" },
  { id: "indikatorer", label: "Indikatorer" },
  { id: "handlinger", label: "Handlinger" },
  { id: "audit", label: "Audit trail" },
  { id: "dokumentation", label: "Dokumentation" },
  { id: "medier", label: "Medier" },
  { id: "rapporter", label: "Rapporter" },
  { id: "miljodata", label: "Miljødata" },
  { id: "livekort", label: "Livekort" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProjectDetailPage() {
  const { slug } = Route.useParams();

  const { data: project } = useSuspenseQuery({
    queryKey: ["project-by-slug", slug],
    queryFn: () => getProjectBySlug(slug),
  });

  // projectId is always set when project exists; hooks below use it unconditionally
  const projectId = project?.id ?? "";

  // Sub-queries — all parallel via standard suspense
  const { data: indicators } = useSuspenseQuery({
    queryKey: ["indicators", projectId],
    queryFn: () => getIndicatorsByProject(projectId),
  });
  const { data: reports } = useSuspenseQuery({
    queryKey: ["reports", projectId],
    queryFn: () => getReportsByProject(projectId),
  });
  const { data: auditEvents } = useSuspenseQuery({
    queryKey: ["audit", projectId],
    queryFn: () => getAuditEventsByProject(projectId),
  });
  const { data: actions } = useSuspenseQuery({
    queryKey: ["actions", projectId],
    queryFn: () => getOpenActionsByProject(projectId),
  });
  const { data: evidenceFiles } = useSuspenseQuery({
    queryKey: ["evidence", projectId],
    queryFn: () => getEvidenceFilesByProject(projectId),
  });
  const { data: observations } = useSuspenseQuery({
    queryKey: ["observations", projectId],
    queryFn: () => getObservationsByProject(projectId, 10),
  });

  // Environmental context query
  const { data: environmentalCtx } = useSuspenseQuery({
    queryKey: ["environmental-context", slug],
    queryFn: () => {
      const geometry = getProjectGeometrySeed(projectId);
      return buildProjectEnvironmentalContext(
        projectId,
        project?.name ?? "",
        project?.location_name ?? project?.municipality ?? "Danmark",
        project?.municipality ?? "Danmark",
        geometry,
      );
    },
  });

  // Sites and data sources — DB-backed via suspense query
  const { data: sites } = useSuspenseQuery({
    queryKey: ["sites", projectId],
    queryFn: () => getSitesByProject(projectId),
  });
  const { data: dataSources } = useSuspenseQuery({
    queryKey: ["data-sources", projectId],
    queryFn: () => getDataSourcesByProject(projectId),
  });
  // Geometri: DB-tegnet polygon vinder altid over seed-data. Kun hvis projektet
  // hverken har en gemt polygon eller centroid, falder vi tilbage til seed.
  const seedGeometry = getProjectGeometrySeed(projectId);
  const geometry = (() => {
    if (project?.geometry_polygon != null || project?.geometry_centroid_lat != null) {
      const polygon =
        (project.geometry_polygon as { type: "Polygon"; coordinates: number[][][] } | null) ??
        null;
      return {
        polygon,
        centroid:
          project.geometry_centroid_lat != null && project.geometry_centroid_lng != null
            ? { lat: project.geometry_centroid_lat, lng: project.geometry_centroid_lng }
            : null,
        areaHa: project.geometry_area_ha ?? null,
        hasValidGeometry: polygon != null,
        geometrySource:
          (project.geometry_source as "uploaded" | "manual" | "estimated" | "none" | null) ??
          "manual",
        bufferZones: { buffer100m: false, buffer500m: false, buffer1000m: false },
      };
    }
    return seedGeometry;
  })();

  // A project has "real" geometry only when a polygon has been drawn or uploaded —
  // a centroid alone (from location name) is not enough to run area-based analyses.
  const hasRealGeometry = project?.geometry_polygon != null;

  // Async media state
  const [mediaItems, setMediaItems] = useState<
    import("@/lib/platform/media-types").ProjectMediaItem[]
  >([]);
  const [mediaLoading, setMediaLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setMediaLoading(true);
    listProjectMedia(projectId).then((result) => {
      if (!cancelled) {
        setMediaItems(result.data ?? []);
        setMediaLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Local action state (optimistic UI)
  const [localActions, setLocalActions] = useState<Action[]>(actions);
  const queryClient = useQueryClient();

  // Keep localActions in sync if the underlying query refreshes
  useEffect(() => {
    setLocalActions(actions);
  }, [actions]);

  if (!project) {
    return <div className="p-6 text-center text-muted-foreground">Projekt ikke fundet.</div>;
  }

  const activeDataSourcesCount = dataSources.filter(
    (d) => d.status === "online" || d.status === "partial",
  ).length;

  const syncActions = async (ids: string[], newStatus: string) => {
    // Optimistic UI
    setLocalActions((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, status: newStatus } : a)),
    );

    if (!isSupabaseConfigured) {
      toast.info("Database ikke konfigureret — kun lokal opdatering");
      return;
    }

    try {
      await Promise.all(
        ids.map((id) =>
          newStatus === "Lukket"
            ? completeAction(id, projectId)
            : updateActionDetails(id, { status: newStatus }, projectId),
        ),
      );
      toast.success(
        newStatus === "Lukket" ? "Handling afsluttet" : `Handling opdateret: ${newStatus}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["actions", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["audit", projectId] });
    } catch (err) {
      toast.error(`Kunne ikke opdatere handling: ${(err as Error).message}`);
      // Roll back optimistic update on failure
      setLocalActions(actions);
    }
  };

  // IoT sensors — generated deterministically from project id + centroid
  const sensors = geometry.centroid ? getProjectSensors(projectId, geometry.centroid) : [];

  // Report preview
  const reportPreview = generateProjectReportPreview({
    project,
    sites,
    dataSources,
    indicators,
    observations,
    actions: localActions,
    auditEvents,
    evidenceFiles,
    mediaItems,
    sensors,
  });

  const nextAction = getRecommendedNextAction(project, indicators, localActions, mediaItems, sensors);
  const sensorActions = suggestSensorActions(sensors);

  return (
    <main className="p-6 max-w-[1200px] w-full mx-auto space-y-5 pb-16">
      <ProjectHeader
        project={project}
        sitesCount={sites.length}
        activeDataSourcesCount={activeDataSourcesCount}
        openActionsCount={localActions.filter((a) => a.status !== "Lukket").length}
      />

      <ProjectTabs tabs={TABS}>
        {(active) => (
          <>
            {/* ── Overblik ─────────────────────────────────────────────────── */}
            {active === "overblik" && (
              <div className="space-y-5">
                {!hasRealGeometry && <GeometryRequiredBanner slug={slug} />}
                {/* Recommended next action */}
                <Card className="p-4 flex items-center gap-4 bg-primary/5 border-primary/20">
                  <Activity className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Anbefalet næste skridt</div>
                    <div className="text-sm font-medium">{nextAction}</div>
                  </div>
                </Card>

                {/* KPI cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {indicators.slice(0, 6).map((ind) => (
                    <IndicatorCard key={ind.id} indicator={ind} />
                  ))}
                </div>

                {/* Recent observations */}
                {observations.length > 0 && (
                  <Card>
                    <CardHeader
                      title="Seneste observationer"
                      subtitle={`${observations.length} observationer hentet`}
                      action={<Pill tone="info">{observations.length}</Pill>}
                    />
                    <div className="px-5 pb-4 divide-y">
                      {observations.slice(0, 5).map((obs) => (
                        <div key={obs.id} className="py-2.5 flex items-center gap-3 text-sm">
                          <span className="text-xs bg-muted rounded px-1.5 py-0.5">
                            {observationTypeLabel(obs.observation_type)}
                          </span>
                          <span className="font-medium">{obs.indicator_key}</span>
                          <span className="tabular-nums">
                            {obs.value !== null ? `${obs.value} ${obs.unit ?? ""}`.trim() : "—"}
                          </span>
                          <span className="text-muted-foreground ml-auto text-xs">
                            {obs.observed_at
                              ? new Date(obs.observed_at).toLocaleDateString("da-DK")
                              : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Recent audit */}
                {auditEvents.length > 0 && (
                  <Card>
                    <CardHeader title="Seneste hændelser" />
                    <div className="px-5 pb-4 divide-y">
                      {auditEvents.slice(0, 5).map((ev) => (
                        <div key={ev.id} className="py-2.5 flex items-start gap-3 text-sm">
                          <span className="text-muted-foreground mt-0.5">
                            <AuditIcon name={auditEventIcon(ev.event_type)} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{ev.title}</div>
                            {ev.actor && (
                              <div className="text-xs text-muted-foreground">{ev.actor}</div>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {new Date(ev.created_at).toLocaleDateString("da-DK")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ── Sites ──────────────────────────────────────────────────── */}
            {active === "sites" && <SitesPanel projectId={projectId} sites={sites} />}


            {/* ── Datakilder ─────────────────────────────────────────────── */}
            {active === "datakilder" && (
              <DataSourcesPanel projectId={projectId} sites={sites} dataSources={dataSources} />
            )}


            {/* ── Indikatorer ────────────────────────────────────────────── */}
            {active === "indikatorer" && (
              <div className="space-y-4">
                {!hasRealGeometry ? (
                  <GeometryRequiredBanner slug={slug} variant="detailed" />
                ) : (
                  <>
                    <NdviCard
                      projectId={projectId}
                      lat={geometry.centroid?.lat ?? null}
                      lng={geometry.centroid?.lng ?? null}
                    />
                    <BiodiversityCard project={project} />
                    <EnvironmentalCard project={project} />
                  </>
                )}
                {indicators.length === 0 ? (
                  <Card className="py-10 text-center text-sm text-muted-foreground">
                    Ingen indikatorer registreret
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {indicators.map((ind) => (
                      <IndicatorCard key={ind.id} indicator={ind} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Handlinger ─────────────────────────────────────────────── */}
            {active === "handlinger" && (
              <div className="space-y-4">
                {/* Sensor-derived action suggestions */}
                {sensorActions.length > 0 && (
                  <Card>
                    <CardHeader
                      title="Sensor-anbefalinger"
                      subtitle="Automatisk afledt fra IoT-feltdata"
                      action={
                        <Pill tone="warning">{sensorActions.length} forslag</Pill>
                      }
                    />
                    <div className="px-5 pb-3 divide-y">
                      {sensorActions.map((sa, i) => (
                        <div key={i} className="py-3 flex items-start gap-3">
                          <AlertTriangle
                            className={`h-4 w-4 shrink-0 mt-0.5 ${
                              sa.priority === "Høj" ? "text-destructive" : "text-amber-500"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{sa.label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{sa.reason}</div>
                          </div>
                          <Pill
                            tone={
                              sa.priority === "Høj"
                                ? "danger"
                                : sa.priority === "Medium"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {sa.priority}
                          </Pill>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Project actions from Supabase / seed */}
                <Card>
                  <CardHeader
                    title="Handlinger"
                    subtitle="Åbne og igangværende handlinger"
                    action={
                      <Pill
                        tone={
                          localActions.filter((a) => a.status !== "Lukket").length > 0
                            ? "warning"
                            : "success"
                        }
                      >
                        {localActions.filter((a) => a.status !== "Lukket").length} åbne
                      </Pill>
                    }
                  />
                  <div className="px-5 pb-3">
                    {localActions.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">Ingen åbne handlinger</p>
                    ) : (
                      localActions.map((action) => (
                        <ActionItem
                          key={action.id}
                          action={action}
                          onMarkInProgress={(id) => syncActions([id], "I gang")}
                          onMarkCompleted={(id) => syncActions([id], "Lukket")}
                        />
                      ))
                    )}
                  </div>
                  <div className="px-5 pb-5 pt-2 border-t">
                    <CreateActionForm
                      projectId={projectId}
                      onCreated={async () => {
                        await queryClient.invalidateQueries({ queryKey: ["actions", projectId] });
                        await queryClient.invalidateQueries({ queryKey: ["audit", projectId] });
                      }}
                    />
                  </div>
                </Card>
              </div>
            )}

            {/* ── Audit trail ────────────────────────────────────────────── */}
            {active === "audit" && (
              <Card>
                <CardHeader
                  title="Audit trail"
                  subtitle="Kronologisk log over alle hændelser"
                  action={<Pill tone="info">{auditEvents.length}</Pill>}
                />
                <div className="px-5 pb-4 divide-y">
                  {auditEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">Ingen auditbegivenheder</p>
                  ) : (
                    auditEvents.map((ev) => (
                      <div key={ev.id} className="py-3 flex items-start gap-3 text-sm">
                        <span className="mt-0.5 text-muted-foreground">
                          <AuditIcon name={auditEventIcon(ev.event_type)} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{ev.title}</div>
                          {ev.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {ev.description}
                            </div>
                          )}
                          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                            {ev.actor && <span>{ev.actor}</span>}
                            {ev.source && <span>· {ev.source}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(ev.created_at).toLocaleDateString("da-DK")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}

            {/* ── Dokumentation ──────────────────────────────────────────── */}
            {active === "dokumentation" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader
                    title="Dokumentation"
                    subtitle="Evidensfiler og certifikater tilknyttet projektet"
                    action={<Pill tone="info">{evidenceFiles.length}</Pill>}
                  />
                  <div className="px-5 pb-4">
                    <EvidenceList files={evidenceFiles} />
                  </div>
                </Card>
                <Card className="p-5">
                  <EvidenceUploadForm projectId={projectId} />
                </Card>
              </div>
            )}

            {/* ── Medier ─────────────────────────────────────────────────── */}
            {active === "medier" && (
              <div className="space-y-5">
                {geometry.hasValidGeometry && (
                  <div className="rounded-xl overflow-hidden border">
                    <ProjectGeometryMap
                      geometry={geometry}
                      projectName={project.name}
                      height={280}
                      mediaItems={mediaItems.filter((m) => !!m.coordinates)}
                    />
                  </div>
                )}
                <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
                  <ProjectMediaGallery items={mediaItems} isLoading={mediaLoading} />
                  <ProjectMediaUploadPanel
                    projectId={projectId}
                    projectCentroid={geometry.centroid ?? undefined}
                    onUploadComplete={(item) => setMediaItems((prev) => [item, ...prev])}
                  />
                </div>
              </div>
            )}

            {/* ── Rapporter ──────────────────────────────────────────────── */}
            {active === "rapporter" && (
              <div className="space-y-4">
                {/* Existing reports */}
                {reports.length > 0 && (
                  <Card>
                    <CardHeader
                      title="Eksisterende rapporter"
                      action={<Pill tone="info">{reports.length}</Pill>}
                    />
                    <div className="px-5 pb-4 divide-y">
                      {reports.map((r) => {
                        const tone = reportStatusTone(r.status);
                        return (
                          <div key={r.id} className="py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{r.title}</span>
                              <Pill tone={tone === "neutral" ? "default" : tone}>
                                {r.status ?? "Kladde"}
                              </Pill>
                            </div>
                            {r.summary && (
                              <p className="text-xs text-muted-foreground mt-1">{r.summary}</p>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">
                              {r.period_start && r.period_end
                                ? `${r.period_start} – ${r.period_end}`
                                : ""}
                              {r.report_type ? ` · ${r.report_type}` : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Report preview */}
                <ReportPreviewCard preview={reportPreview} />
              </div>
            )}

            {/* ── Miljødata ───────────────────────────────────────────────── */}
            {active === "miljodata" && (
              <div className="space-y-4">
                <Card>
                  <CardHeader
                    title="Miljødata"
                    subtitle="Åbne datakilder fra Danmark og EU — preview-analyse baseret på projektlokation"
                  />
                  <div className="px-5 pb-5">
                    {environmentalCtx ? (
                      <ProjectEnvironmentalDashboard ctx={environmentalCtx} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-4">
                        Miljødata ikke tilgængelig.
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* ── Livekort ────────────────────────────────────────────────── */}
            {active === "livekort" && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Link
                    to="/app/projects/map/$slug"
                    params={{ slug }}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    Åbn fuldt geodata-kort →
                  </Link>
                </div>
                <LiveProjectMap
                  geometry={geometry}
                  projectName={project.name}
                  projectId={projectId}
                  height={500}
                  mediaItems={mediaItems}
                  sensors={sensors}
                  dmiData={
                    environmentalCtx?.liveData?.weather
                      ? {
                          temperature: environmentalCtx.liveData.weather.temperature,
                          windSpeed: environmentalCtx.liveData.weather.windSpeed,
                          precipitation: environmentalCtx.liveData.weather.precipitation,
                          observedAt: environmentalCtx.liveData.weather.fetchedAt,
                          mode: environmentalCtx.liveData.weather.mode,
                        }
                      : undefined
                  }
                />
                {sensors.length > 0 ? (
                  <FieldSensorPanel sensors={sensors} />
                ) : (
                  <Card className="py-10 text-center">
                    <CardHeader
                      title="Ingen sensorer"
                      subtitle="Tilknyt en projektgeometri for at aktivere IoT-sensorlaget"
                    />
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </ProjectTabs>
    </main>
  );
}

// ─── Create-action inline form ────────────────────────────────────────────────

function CreateActionForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"Høj" | "Medium" | "Lav">("Medium");
  const [dueDate, setDueDate] = useState("");
  const [owner, setOwner] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!isSupabaseConfigured) {
      toast.error("Database ikke konfigureret");
      return;
    }
    setSubmitting(true);
    try {
      await createAction({
        project_id: projectId,
        title: title.trim(),
        priority,
        due_date: dueDate || undefined,
        owner: owner.trim() || undefined,
      });
      toast.success("Handling oprettet");
      setTitle("");
      setDueDate("");
      setOwner("");
      setPriority("Medium");
      await onCreated();
    } catch (err) {
      toast.error(`Kunne ikke oprette handling: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 pt-3">
      <div className="text-xs font-medium text-muted-foreground">Opret ny handling</div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titel på handling"
        className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as "Høj" | "Medium" | "Lav")}
          className="text-sm border rounded-lg px-3 py-2 bg-background"
        >
          <option value="Høj">Høj prioritet</option>
          <option value="Medium">Medium prioritet</option>
          <option value="Lav">Lav prioritet</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-sm border rounded-lg px-3 py-2 bg-background"
        />
        <input
          type="text"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Ansvarlig (valgfri)"
          className="text-sm border rounded-lg px-3 py-2 bg-background"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Opretter…" : "Opret handling"}
        </button>
      </div>
    </form>
  );
}

// ─── GeometryRequiredBanner ──────────────────────────────────────────────────
// Shown when a project has no polygon defined. All area-based analyses
// (NDVI, biodiversity, environmental) require this before running.

function GeometryRequiredBanner({
  slug,
  variant = "compact",
}: {
  slug: string;
  variant?: "compact" | "detailed";
}) {
  return (
    <Card
      className={`border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/5 ${
        variant === "detailed" ? "p-6" : "p-4"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Projektområde mangler</div>
          <p className="text-sm text-muted-foreground mt-1">
            {variant === "detailed"
              ? "For at beregne NDVI, biodiversitet og miljøpåvirkning skal projektets afgrænsning defineres. Tegn polygonen på kortet, eller upload en GeoJSON-fil — beregningerne aktiveres straks efter."
              : "Definér projektets afgrænsning før beregninger kan køre."}
          </p>
          <div className="mt-3">
            <Link
              to="/app/projects/geometry/$slug"
              params={{ slug }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
            >
              <MapPin className="h-3.5 w-3.5" />
              Definér projektområde
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
