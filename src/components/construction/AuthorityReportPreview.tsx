import { CheckCircle2, XCircle, FileText, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import type { ConstructionAuthorityReport } from "@/services/authority-report-service";

interface Props {
  report: ConstructionAuthorityReport;
}

export function AuthorityReportPreview({ report }: Props) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">{report.title}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span>
                Myndighedsstatus:{" "}
                <span className="font-medium text-foreground">
                  {report.authoritySubmissionStatus}
                </span>
              </span>
              <span>
                Klarhed:{" "}
                <span className="font-medium text-foreground">{report.readinessScore}%</span>
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  report.readinessScore >= 80
                    ? "bg-emerald-500"
                    : report.readinessScore >= 50
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${report.readinessScore}%` }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Project description */}
      <Card>
        <CardHeader title="Projektbeskrivelse" />
        <div className="px-5 pb-4">
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {report.projectDescription}
          </p>
        </div>
      </Card>

      {/* Site and nature context */}
      <Card>
        <CardHeader title="Lokation og naturkontekst" />
        <div className="px-5 pb-4">
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {report.siteAndNatureContext}
          </p>
        </div>
      </Card>

      {/* Runoff summary */}
      <Card>
        <CardHeader title="Afstrømning og regnvandshåndtering" />
        <div className="px-5 pb-4">
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {report.runoffSummary}
          </p>
        </div>
      </Card>

      {/* Risks */}
      {report.riskSummary.length > 0 && (
        <Card>
          <CardHeader title="Miljørisici" subtitle={`${report.riskSummary.length} risici`} />
          <div className="px-5 pb-4 divide-y">
            {report.riskSummary.map((r, i) => (
              <div key={i} className="py-2 text-sm text-muted-foreground">
                {r}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Mitigations */}
      {report.mitigationSummary.length > 0 && (
        <Card>
          <CardHeader
            title="Afværgetiltag"
            subtitle={`${report.mitigationSummary.length} tiltag`}
          />
          <div className="px-5 pb-4 divide-y">
            {report.mitigationSummary.map((m, i) => (
              <div key={i} className="py-2 text-sm text-muted-foreground">
                {m}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Evidence checklist */}
      <Card>
        <CardHeader title="Dokumentationstjekliste" />
        <div className="px-5 pb-4 divide-y">
          {report.evidenceChecklist.map((item) => (
            <div key={item.label} className="py-2.5 flex items-center gap-3">
              {item.status === "complete" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              )}
              <span className="text-sm">{item.label}</span>
              <span
                className={`ml-auto text-xs font-medium ${
                  item.status === "complete" ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {item.status === "complete" ? "Tilgængelig" : "Mangler"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Recommended next steps */}
      <Card>
        <CardHeader title="Anbefalede næste skridt" />
        <div className="px-5 pb-4 space-y-2">
          {report.recommendedNextSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
