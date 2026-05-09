import { Droplets, AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import type { RunoffProfile } from "@/lib/supabase/types";

interface Props {
  profile: RunoffProfile | null;
  runoffRiskScore: "low" | "medium" | "high" | "critical";
}

function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display =
    value === null || value === undefined
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "Ja"
          : "Nej"
        : String(value);

  return (
    <div className="flex items-start justify-between py-2 border-b last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0 w-52">{label}</span>
      <span className="text-sm font-medium text-right">{display}</span>
    </div>
  );
}

function riskColors(score: "low" | "medium" | "high" | "critical") {
  switch (score) {
    case "critical":
      return { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Kritisk" };
    case "high":
      return { bg: "bg-orange-50 border-orange-200", text: "text-orange-700", label: "Høj" };
    case "medium":
      return { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", label: "Medium" };
    default:
      return { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Lav" };
  }
}

export function RunoffProfilePanel({ profile, runoffRiskScore }: Props) {
  const colors = riskColors(runoffRiskScore);

  return (
    <div className="space-y-4">
      {/* Risk card */}
      <div className={`rounded-xl border p-4 flex items-start gap-3 ${colors.bg}`}>
        <Droplets className={`h-5 w-5 shrink-0 mt-0.5 ${colors.text}`} />
        <div>
          <div className={`text-sm font-semibold ${colors.text}`}>
            Afstrømningsrisiko: {colors.label}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {runoffRiskScore === "critical" &&
              "Stor befæstet areal, direkte udledning og manglende rensning. Straks-handling påkrævet."}
            {runoffRiskScore === "high" &&
              "Kombinationen af faktorerne udgør en høj risiko for vandmiljøet."}
            {runoffRiskScore === "medium" &&
              "Ét eller flere risikofaktorer er til stede — overvej yderligere afværgetiltag."}
            {runoffRiskScore === "low" &&
              "Ingen væsentlige afstrømningsrisikofaktorer identificeret."}
          </div>
        </div>
      </div>

      {profile ? (
        <Card>
          <CardHeader title="Afstrømningsprofil" subtitle="Regnvandshåndtering og rensning" />
          <div className="px-5 pb-4">
            <Row label="Afstrømningsdestination" value={profile.runoff_destination} />
            <Row label="Drænprincip" value={profile.drainage_principle} />
            <Row label="Forsinkelse/tilbageholdelse" value={profile.retention_solution} />
            <Row label="Rensningsløsning" value={profile.treatment_solution} />
            <Row label="Olieudskiller" value={profile.oil_separator_present} />
            <Row label="Sedimentkontrol" value={profile.sediment_control_present} />
            <Row
              label="Estimeret volumen"
              value={profile.estimated_runoff_volume_m3 != null ? `${profile.estimated_runoff_volume_m3} m³` : null}
            />
            <Row label="Dimensioneringshændelse" value={profile.design_rain_event} />
            <Row label="Udledningspunkt" value={profile.discharge_point_description} />
            <Row label="Driftsansvar" value={profile.maintenance_responsibility} />
          </div>
        </Card>
      ) : (
        <Card className="py-10 text-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm">Ingen afstrømningsprofil registreret</p>
            <p className="text-xs">Udfyld afstrømningsprofil for at dokumentere regnvandshåndtering</p>
          </div>
        </Card>
      )}
    </div>
  );
}
