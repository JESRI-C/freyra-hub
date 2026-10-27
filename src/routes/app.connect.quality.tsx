import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Plus,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";
import {
  ConnectionHealthCard,
  DataQualityScore,
  ProgressBar,
  Section,
  Chip,
} from "@/components/connect/Primitives";
import { QUALITY_DIMENSIONS, VALIDATION_RULES, DATA_SOURCES } from "@/lib/connect-data";
import { RuleDrawer } from "@/components/monitoring/RuleDrawer";
import { useConnectContext } from "@/lib/connect-context";
import {
  listRules,
  toggleRule,
  listIssues,
  resolveIssue,
  summarizeIssues,
} from "@/services/monitoring/quality-rules-service";
import { runQualityEvaluation } from "@/services/monitoring/quality-engine";

export const Route = createFileRoute("/app/connect/quality")({
  component: Page,
});

function Page() {
  const { projectId } = useConnectContext();
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{
    inserted: number;
    detected: number;
    ranAt: string;
  } | null>(null);
  const rulesQuery = useQuery({
    queryKey: ["quality-rules", projectId],
    queryFn: () => listRules(projectId),
  });
  const issuesQuery = useQuery({
    queryKey: ["quality-issues", projectId],
    queryFn: () => (projectId ? listIssues({ projectId, limit: 50 }) : Promise.resolve([])),
    enabled: !!projectId,
  });
  const issueSummary = summarizeIssues(issuesQuery.data ?? []);

  async function handleRunNow() {
    if (!projectId) {
      toast.error("Vælg et projekt først");
      return;
    }
    setRunning(true);
    try {
      const res = await runQualityEvaluation(projectId);
      setLastRun({ inserted: res.inserted, detected: res.detected, ranAt: res.ranAt });
      toast.success(
        `Regler kørt: ${res.detected} fund, ${res.inserted} nye issues, ${res.skippedDuplicates} eksisterende`,
      );
      await issuesQuery.refetch();
    } catch (e) {
      toast.error(`Fejl under kørsel: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Datakvalitet"
          description="Er data pålideligt nok til analyse, dokumentation og rapportering?"
        />
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="text-xs rounded-lg border px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            Kør regler nu
          </button>
          <button
            onClick={() => setRuleDrawerOpen(true)}
            className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Ny kvalitetsregel
          </button>
        </div>
      </div>

      {lastRun && (
        <div className="text-xs text-muted-foreground">
          Senest kørt {new Date(lastRun.ranAt).toLocaleTimeString()} — {lastRun.detected} fund,{" "}
          {lastRun.inserted} nye issues.
        </div>
      )}

      <Section
        title="Aktive kvalitetsregler"
        subtitle={
          rulesQuery.isLoading ? "Henter…" : `${rulesQuery.data?.length ?? 0} regler kører nu`
        }
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-3">Navn</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Aktiv</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(rulesQuery.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-xs">
                      <Chip>{r.rule_type}</Chip>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.severity}</td>
                    <td className="px-4 py-3 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={r.is_active}
                          onChange={(e) => {
                            void toggleRule(r.id, e.target.checked).then(() =>
                              rulesQuery.refetch(),
                            );
                          }}
                        />
                        {r.is_active ? "Aktiv" : "Inaktiv"}
                      </label>
                    </td>
                  </tr>
                ))}
                {!rulesQuery.isLoading && (rulesQuery.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Ingen kvalitetsregler endnu — opret én for at aktivere kontrolrummet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <RuleDrawer
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        variant="quality"
        projectId={projectId}
        onCreated={() => rulesQuery.refetch()}
      />

      <Section
        title="Åbne datakvalitets-issues"
        subtitle={
          issuesQuery.isLoading
            ? "Henter…"
            : `${issueSummary.open} åbne · ${issueSummary.resolved} løst · ${issueSummary.rejected} afvist`
        }
      >
        <ul className="text-sm space-y-2">
          {(issuesQuery.data ?? [])
            .filter((i) => i.status === "open")
            .slice(0, 8)
            .map((i) => (
              <li key={i.id} className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/30">
                <span
                  className={
                    i.severity === "critical" || i.severity === "high"
                      ? "text-destructive"
                      : "text-amber-500"
                  }
                >
                  ●
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{i.description ?? i.issue_type}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {i.issue_type} · {new Date(i.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  className="text-[11px] rounded border px-2 py-0.5 hover:bg-muted"
                  onClick={async () => {
                    try {
                      await resolveIssue(i.id, {
                        status: "resolved",
                        note: "Løst fra kvalitetsoversigt",
                      });
                      await issuesQuery.refetch();
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  Løs
                </button>
              </li>
            ))}
          {!issuesQuery.isLoading &&
            (issuesQuery.data ?? []).filter((i) => i.status === "open").length === 0 && (
              <li className="p-3 text-center text-xs text-muted-foreground rounded-lg border border-dashed">
                Ingen åbne issues — kør reglerne for at scanne data.
              </li>
            )}
        </ul>
      </Section>
    </main>
  );
}
