import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui-bits";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";
import { ConstructionProjectHeader } from "@/components/construction/ConstructionProjectHeader";
import { ConstructionProjectTabs } from "@/components/construction/ConstructionProjectTabs";
import { NatureContextPanel } from "@/components/construction/NatureContextPanel";
import { RunoffProfilePanel } from "@/components/construction/RunoffProfilePanel";
import { EnvironmentalRiskTable } from "@/components/construction/EnvironmentalRiskTable";
import { MitigationMeasuresPanel } from "@/components/construction/MitigationMeasuresPanel";
import { AuthorityReportPreview } from "@/components/construction/AuthorityReportPreview";
import { ComplianceMappingCard } from "@/components/construction/ComplianceMappingCard";
import { ConstructionAuditTrail } from "@/components/construction/ConstructionAuditTrail";
import { getConstructionProjectBySlug } from "@/services/construction-service";
import { generateConstructionAuthorityReport } from "@/services/authority-report-service";
import { EvidenceList } from "@/components/project/EvidenceList";
import { EvidenceUploadForm } from "@/components/project/EvidenceUploadForm";

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overblik", label: "Overblik" },
  { id: "natur", label: "Site & Natur" },
  { id: "vand", label: "Vand & Afstrømning" },
  { id: "risici", label: "Risici" },
  { id: "afvaerge", label: "Afværge" },
  { id: "dokumentation", label: "Dokumentation" },
  { id: "rapport", label: "Myndighedsrapport" },
  { id: "audit", label: "Audit trail" },
];

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/app/construction/projects/$slug")({
  head: () => ({ meta: [{ title: "Byggeprojekt — GoFreyra" }] }),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    const summary = await queryClient.ensureQueryData({
      queryKey: ["construction-project", slug],
      queryFn: () => getConstructionProjectBySlug(slug),
    });
    if (!summary) throw notFound();
    return summary;
  },
  component: ConstructionProjectDetailPage,
  notFoundComponent: () => (
    <div className="p-6 text-center text-muted-foreground">Byggeprojekt ikke fundet.</div>
  ),
});

// ─── Overview next action ──────────────────────────────────────────────────────

function getOverviewNextAction(
  summary: NonNullable<Awaited<ReturnType<typeof getConstructionProjectBySlug>>>,
): string {
  if (!summary.natureContext) return "Udfyld naturbeskrivelse for projektområdet";
  if (!summary.runoffProfile) return "Udfyld afstrømningsprofil";
  const criticalOpenRisks = summary.risks.filter(
    (r) => (r.severity === "Kritisk" || r.severity === "Høj") && r.status === "Åben",
  );
  if (criticalOpenRisks.length > 0 && summary.mitigations.length === 0) {
    return "Tilknyt afværgetiltag til kritiske risici";
  }
  if (summary.evidenceFiles.length === 0) return "Upload basisdokumentation";
  if (!summary.submissions.some((s) => s.status === "Klar" || s.status === "Indsendt")) {
    return "Forbered myndighedspakke";
  }
  return "Projektdokumentationen er klar til myndighedsreview";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ConstructionProjectDetailPage() {
  const { slug } = Route.useParams();

  const { data: summary } = useSuspenseQuery({
    queryKey: ["construction-project", slug],
    queryFn: () => getConstructionProjectBySlug(slug),
  });

  if (!summary) {
    return <div className="p-6 text-center text-muted-foreground">Byggeprojekt ikke fundet.</div>;
  }

  const nextAction = getOverviewNextAction(summary);
  const authorityReport = generateConstructionAuthorityReport(summary);

  return (
    <main className="p-6 max-w-[1200px] w-full mx-auto space-y-5 pb-16">
      <ConstructionProjectHeader summary={summary} />

      <ConstructionProjectTabs tabs={TABS}>
        {(active) => (
          <>
            {/* ── Overblik ──────────────────────────────────────────────── */}
            {active === "overblik" && (
              <div className="space-y-5">
                <AiInsightBanner
                  module={`Byggeprojekt: ${summary.project.name}`}
                  tone="action"
                  cacheKey={`construction-detail:${summary.project.id}:${summary.risks.length}:${summary.mitigations.length}`}
                  context={`Projekt: ${summary.project.name}. Type: ${summary.project.project_type ?? "—"}. Status: ${summary.project.status}. Lokation: ${summary.project.location_name ?? "—"}, ${summary.project.municipality ?? "—"}. Readiness: ${summary.readinessScore}%. Risici: ${summary.risks.length} (${summary.risks.filter((r) => r.status === "Åben").length} åbne, ${summary.risks.filter((r) => r.severity === "Kritisk" || r.severity === "Høj").length} kritiske/høje). Afværgetiltag: ${summary.mitigations.length} (${summary.mitigations.filter((m) => m.status === "Verificeret").length} verificeret). Dokumentation: ${summary.evidenceFiles.length} filer. Myndighedsindsendelser: ${summary.submissions.length}. Vandløb: ${summary.natureContext?.watercourse_present ? "ja" : "nej"}. Anbefalet næste skridt: ${nextAction}.`}
                />

                {/* Recommended next action */}
                <Card className="p-4 flex items-center gap-4 bg-primary/5 border-primary/20">
                  <Activity className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Anbefalet næste skridt</div>
                    <div className="text-sm font-medium">{nextAction}</div>
                  </div>
                </Card>


                {/* Compliance mapping */}
                <ComplianceMappingCard summary={summary} />

                {/* KPI grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border bg-card p-4">
                    <div className="text-xs text-muted-foreground">Risici</div>
                    <div className="text-2xl font-semibold mt-1">{summary.risks.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {summary.risks.filter((r) => r.status === "Åben").length} åbne
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <div className="text-xs text-muted-foreground">Afværgetiltag</div>
                    <div className="text-2xl font-semibold mt-1">{summary.mitigations.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {summary.mitigations.filter((m) => m.status === "Verificeret").length}{" "}
                      verificeret
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <div className="text-xs text-muted-foreground">Dokumenter</div>
                    <div className="text-2xl font-semibold mt-1">
                      {summary.evidenceFiles.length}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">uploadet</div>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <div className="text-xs text-muted-foreground">Myndighedspakker</div>
                    <div className="text-2xl font-semibold mt-1">{summary.submissions.length}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {summary.submissions.filter((s) => s.status === "Indsendt").length} indsendt
                    </div>
                  </div>
                </div>

                {/* Authority submissions overview */}
                {summary.submissions.length > 0 && (
                  <Card>
                    <div className="p-5 pb-3">
                      <div className="text-sm font-semibold">Myndighedspakker</div>
                    </div>
                    <div className="px-5 pb-4 divide-y">
                      {summary.submissions.map((sub) => (
                        <div key={sub.id} className="py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">{sub.title}</div>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                sub.status === "Indsendt"
                                  ? "bg-blue-100 text-blue-700"
                                  : sub.status === "Klar"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {sub.status}
                            </span>
                          </div>
                          {sub.authority_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {sub.authority_name}
                            </p>
                          )}
                          {sub.summary && (
                            <p className="text-xs text-muted-foreground mt-1">{sub.summary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ── Site & Natur ───────────────────────────────────────────── */}
            {active === "natur" && <NatureContextPanel ctx={summary.natureContext} />}

            {/* ── Vand & Afstrømning ─────────────────────────────────────── */}
            {active === "vand" && (
              <RunoffProfilePanel
                profile={summary.runoffProfile}
                runoffRiskScore={summary.runoffRiskScore}
              />
            )}

            {/* ── Risici ────────────────────────────────────────────────── */}
            {active === "risici" && <EnvironmentalRiskTable risks={summary.risks} />}

            {/* ── Afværge ───────────────────────────────────────────────── */}
            {active === "afvaerge" && <MitigationMeasuresPanel measures={summary.mitigations} />}

            {/* ── Dokumentation ─────────────────────────────────────────── */}
            {active === "dokumentation" && (
              <div className="space-y-4">
                <Card>
                  <div className="p-5 pb-3">
                    <div className="text-sm font-semibold">Dokumentation</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Evidensfiler tilknyttet projektet
                    </div>
                  </div>
                  <div className="px-5 pb-4">
                    <EvidenceList files={summary.evidenceFiles} />
                  </div>
                </Card>
                <Card className="p-5">
                  <EvidenceUploadForm projectId={summary.project.id} />
                </Card>
              </div>
            )}

            {/* ── Myndighedsrapport ─────────────────────────────────────── */}
            {active === "rapport" && <AuthorityReportPreview report={authorityReport} />}

            {/* ── Audit trail ───────────────────────────────────────────── */}
            {active === "audit" && <ConstructionAuditTrail events={summary.auditEvents} />}
          </>
        )}
      </ConstructionProjectTabs>
    </main>
  );
}
