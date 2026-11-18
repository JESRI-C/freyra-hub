import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { ProjectReportPreview } from "@/lib/report-engine";

interface ReportPreviewCardProps {
  preview: ProjectReportPreview;
}

export function ReportPreviewCard({ preview }: ReportPreviewCardProps) {
  return (
    <Card>
      <CardHeader
        title="Foreløbigt projektgrundlag"
        subtitle="Rapporteringsperiode: ikke fastlagt"
        action={<Pill>Kladde</Pill>}
      />
      <div className="px-5 pb-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Oversigt over de aktuelle projektregistreringer. Grundlaget er ikke låst til en
          rapportversion, og fagligt review er ikke dokumenteret i denne oversigt.
          Droneobservationer og deres kilde-/fotoreferencer indgår endnu ikke her.
        </p>
        <section>
          <h3 className="text-xs font-semibold mb-1">Registreret projektbeskrivelse</h3>
          <p className="text-sm">{preview.projectSummary}</p>
        </section>
        <section>
          <h3 className="text-xs font-semibold mb-2">Registrerede indikatorværdier</h3>
          {preview.indicatorSummary.length ? (
            <ul className="space-y-1 text-sm">
              {preview.indicatorSummary.map((row, index) => (
                <li key={index}>
                  {row.label}: {row.value !== null ? `${row.value}${row.unit ?? ""}` : "ukendt"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen indikatorværdier registreret.</p>
          )}
        </section>
        <section>
          <h3 className="text-xs font-semibold mb-2">Registrerede åbne handlinger</h3>
          {preview.recommendedActions.length ? (
            <ul className="space-y-1 text-sm">
              {preview.recommendedActions.map((action, index) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen åbne handlinger i oversigten.</p>
          )}
        </section>
        <div className="grid sm:grid-cols-2 gap-4">
          <section>
            <h3 className="text-xs font-semibold mb-2">Registrerede datakilder</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              {preview.dataSourcesSummary.map((source, index) => (
                <li key={index}>{source}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold mb-2">Registreret dokumentation</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              {preview.evidenceSummary.map((evidence, index) => (
                <li key={index}>{evidence}</li>
              ))}
            </ul>
          </section>
        </div>
        <section>
          <h3 className="text-xs font-semibold mb-2">Registrerede hændelser</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            {preview.auditSummary.map((event, index) => (
              <li key={index}>{event}</li>
            ))}
          </ul>
        </section>
      </div>
    </Card>
  );
}
