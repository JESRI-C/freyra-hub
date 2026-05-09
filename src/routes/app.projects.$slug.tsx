import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, RefreshCw, Eye, FileText, AlertTriangle, Activity } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { IndicatorCard } from "@/components/project/IndicatorCard";
import { ActionItem } from "@/components/project/ActionItem";
import { EvidenceList } from "@/components/project/EvidenceList";
import { EvidenceUploadForm } from "@/components/project/EvidenceUploadForm";
import { ReportPreviewCard } from "@/components/project/ReportPreviewCard";
import {
  getProjectBySlug,
  getSitesByProject,
  getDataSourcesByProject,
} from "@/services/projects-service";
import { getIndicatorsByProject } from "@/services/indicators-service";
import { getReportsByProject, reportStatusTone } from "@/services/reports-service";
import { getAuditEventsByProject, auditEventIcon } from "@/services/audit-service";
import { getOpenActionsByProject, actionPriorityTone } from "@/services/actions-service";
import { getEvidenceFilesByProject } from "@/services/evidence-service";
import { getObservationsByProject, observationTypeLabel } from "@/services/observations-service";
import { generateProjectReportPreview, getRecommendedNextAction } from "@/lib/report-engine";
import { getProjectMedia } from "@/data/project-media";
import { ProjectMediaGallery } from "@/components/project-workspace/ProjectMediaGallery";
import { ProjectMediaUploadPanel } from "@/components/project-workspace/ProjectMediaUploadPanel";
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
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProjectDetailPage() {
  const { slug } = Route.useParams();

  const { data: project } = useSuspenseQuery({
    queryKey: ["project-by-slug", slug],
    queryFn: () => getProjectBySlug(slug),
  });

  if (!project) {
    return <div className="p-6 text-center text-muted-foreground">Projekt ikke fundet.</div>;
  }

  const projectId = project.id;

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
        project.name,
        project.location_name ?? project.municipality ?? "Danmark",
        project.municipality ?? "Danmark",
        geometry,
      );
    },
  });

  // Sync helpers (seed data)
  const sites = getSitesByProject(projectId);
  const dataSources = getDataSourcesByProject(projectId);
  const mediaItems = getProjectMedia(projectId);
  const geometry = getProjectGeometrySeed(projectId);

  const activeDataSourcesCount = dataSources.filter(
    (d) => d.status === "online" || d.status === "partial",
  ).length;

  // Local action state (optimistic UI)
  const [localActions, setLocalActions] = useState<Action[]>(actions);
  const syncActions = (ids: string[], newStatus: string) => {
    setLocalActions((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, status: newStatus } : a)),
    );
  };

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
  });

  const nextAction = getRecommendedNextAction(project, indicators, localActions, mediaItems);

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
            {active === "sites" && (
              <Card>
                <CardHeader
                  title="Sites"
                  subtitle="Alle registrerede sites tilknyttet projektet"
                  action={<Pill tone="info">{sites.length}</Pill>}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground border-y bg-muted/30">
                      <tr>
                        <th className="px-5 py-2">Navn</th>
                        <th className="py-2">Type</th>
                        <th className="py-2 text-right">Areal (ha)</th>
                        <th className="py-2">Baseline-status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sites.map((site) => (
                        <tr key={site.id} className="hover:bg-muted/20">
                          <td className="px-5 py-3 font-medium">{site.name}</td>
                          <td className="py-3">{site.site_type ?? "—"}</td>
                          <td className="py-3 text-right tabular-nums">{site.area_ha ?? "—"}</td>
                          <td className="py-3">
                            <span
                              className={`text-xs ${
                                site.baseline_status === "Dokumenteret"
                                  ? "text-emerald-600"
                                  : site.baseline_status === "Delvist dokumenteret"
                                    ? "text-amber-600"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {site.baseline_status ?? "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── Datakilder ─────────────────────────────────────────────── */}
            {active === "datakilder" && (
              <Card>
                <CardHeader
                  title="Datakilder"
                  subtitle="Tilknyttede datafeeds og integrationer"
                  action={<Pill tone="info">{dataSources.length}</Pill>}
                />
                <div className="px-5 pb-4 divide-y">
                  {dataSources.map((ds) => {
                    const tone = dataSourceStatusTone(ds.status ?? "offline");
                    return (
                      <div key={ds.id} className="py-3 flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            tone === "success"
                              ? "bg-emerald-500"
                              : tone === "warning"
                                ? "bg-amber-500"
                                : tone === "danger"
                                  ? "bg-red-500"
                                  : "bg-muted-foreground"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{ds.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {ds.source_type}
                            {ds.provider ? ` · ${ds.provider}` : ""}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium">
                            {dataSourceStatusLabel(ds.status ?? "offline")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatLastSync(ds.last_sync_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* ── Indikatorer ────────────────────────────────────────────── */}
            {active === "indikatorer" && (
              <div>
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
              </Card>
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
                  <ProjectMediaGallery items={mediaItems} />
                  <ProjectMediaUploadPanel
                    projectId={projectId}
                    projectCentroid={geometry.centroid ?? undefined}
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
          </>
        )}
      </ProjectTabs>
    </main>
  );
}
