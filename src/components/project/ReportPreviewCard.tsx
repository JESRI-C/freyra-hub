import {
  FileText,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { ProjectReportPreview } from "@/lib/report-engine";

function ReadinessMeter({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  const tone: "success" | "warning" | "danger" =
    score >= 80 ? "success" : score >= 60 ? "warning" : "danger";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Rapportklarhed</span>
        <Pill tone={tone}>{score}%</Pill>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

interface ReportPreviewCardProps {
  preview: ProjectReportPreview;
}

export function ReportPreviewCard({ preview }: ReportPreviewCardProps) {
  return (
    <Card>
      <CardHeader
        title={preview.title}
        subtitle={`Rapporteringsperiode: ${preview.reportingPeriod}`}
        action={<Pill tone="info">Forhåndsvisning</Pill>}
      />
      <div className="px-5 pb-5 space-y-5">
        {/* Readiness */}
        <ReadinessMeter score={preview.readinessScore} />

        {/* Project summary */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Projektbeskrivelse
          </div>
          <p className="text-sm text-foreground">{preview.projectSummary}</p>
        </div>

        {/* Key findings */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" /> Nøglefund
          </div>
          <ul className="space-y-1">
            {preview.keyFindings.map((f, i) => (
              <li key={i} className="text-sm flex items-start gap-1.5">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Indicator summary */}
        {preview.indicatorSummary.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Indikatorer
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {preview.indicatorSummary.map((row) => (
                <div key={row.label} className="rounded-lg bg-muted/40 px-3 py-2">
                  <div className="text-[10px] text-muted-foreground truncate">{row.label}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-sm font-semibold tabular-nums">
                      {row.value !== null ? `${row.value}${row.unit ?? ""}` : "—"}
                    </span>
                    <TrendIcon trend={row.trend} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open risks */}
        {preview.openRisks.some((r) => !r.includes("Ingen")) && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Åbne risici
            </div>
            <ul className="space-y-1">
              {preview.openRisks.map((r, i) => (
                <li key={i} className="text-sm text-amber-700 flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended actions */}
        {preview.recommendedActions.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Anbefalede handlinger
            </div>
            <ul className="space-y-1">
              {preview.recommendedActions.map((a, i) => (
                <li key={i} className="text-sm flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Data sources */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Datakilder
            </div>
            <ul className="space-y-0.5">
              {preview.dataSourcesSummary.map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Dokumentation
            </div>
            <ul className="space-y-0.5">
              {preview.evidenceSummary.map((e, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Audit summary */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Seneste hændelser
          </div>
          <ul className="space-y-0.5">
            {preview.auditSummary.map((a, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
