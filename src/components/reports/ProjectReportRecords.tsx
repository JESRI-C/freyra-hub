import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { Report } from "@/lib/supabase/types";

export function ProjectReportRecords({
  projectId,
  reports,
}: {
  projectId: string;
  reports: Report[];
}) {
  const records = reports.filter((report) => !!projectId && report.project_id === projectId);
  return (
    <Card>
      <CardHeader
        title="Projektets rapportregistreringer"
        subtitle="Eksisterende registreringer; fagligt review og rapportfil er ikke verificeret her"
        action={<Pill>{records.length}</Pill>}
      />
      <div className="px-5 pb-4 divide-y">
        {records.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">
            Ingen rapportregistreringer for dette projekt. Start i Grundlag med de daterede kilder
            og den gemte fototilknytning. Den samlede kommunale rapport er endnu ikke klar.
          </p>
        )}
        {records.map((report) => (
          <div key={report.id} className="py-3 space-y-1">
            <div className="text-sm font-medium">{report.title}</div>
            <p className="text-xs text-muted-foreground">
              Registreret status: {report.status || "ukendt"}
            </p>
            {report.summary && (
              <p className="text-xs text-muted-foreground">Registreret resumé: {report.summary}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Registreret periode: {report.period_start || "ukendt start"} til{" "}
              {report.period_end || "ukendt slut"}
              {report.report_type ? ` · ${report.report_type}` : ""}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
