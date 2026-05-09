import { CheckCircle2, XCircle, Info } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import type { ConstructionProjectSummary } from "@/lib/supabase/types";

interface Props {
  summary: ConstructionProjectSummary;
}

interface ComplianceArea {
  label: string;
  complete: boolean;
  note?: string;
}

export function ComplianceMappingCard({ summary }: Props) {
  const { constructionExt, natureContext, runoffProfile, mitigations, evidenceFiles, submissions } = summary;

  const areas: ComplianceArea[] = [
    {
      label: "Vanddokumentation",
      complete: !!runoffProfile,
      note: runoffProfile ? "Afstrømningsprofil registreret" : "Afstrømningsprofil mangler",
    },
    {
      label: "Naturkontekst",
      complete: !!natureContext,
      note: natureContext ? "Naturkontekst registreret" : "Naturbeskrivelse mangler",
    },
    {
      label: "Afværgetiltag",
      complete: mitigations.length > 0,
      note:
        mitigations.length > 0
          ? `${mitigations.length} tiltag registreret`
          : "Ingen afværgetiltag",
    },
    {
      label: "Evidensdokumentation",
      complete: evidenceFiles.length > 0,
      note:
        evidenceFiles.length > 0
          ? `${evidenceFiles.length} filer uploadet`
          : "Ingen filer uploadet",
    },
    {
      label: "Myndighedspakke",
      complete: submissions.some((s) => s.status === "Klar" || s.status === "Indsendt"),
      note: submissions.length > 0
        ? `Seneste: ${submissions[0]?.status}`
        : "Ingen myndighedspakke registreret",
    },
  ];

  const completeCount = areas.filter((a) => a.complete).length;

  return (
    <Card>
      <CardHeader
        title="Compliance-overblik"
        subtitle={`${completeCount}/${areas.length} komplianceområder dækket`}
      />
      <div className="px-5 pb-4 divide-y">
        {areas.map((area) => (
          <div key={area.label} className="py-2.5 flex items-center gap-3">
            {area.complete ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{area.label}</span>
              {area.note && (
                <p className="text-xs text-muted-foreground">{area.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-4">
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            Dette komplianceoverblik er vejledende og erstatter ikke en egentlig juridisk vurdering.
            Kontakt altid relevant myndighed for at bekræfte kravene for dit specifikke projekt.
          </p>
        </div>
      </div>
    </Card>
  );
}
