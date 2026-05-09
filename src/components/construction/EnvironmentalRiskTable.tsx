import { useState } from "react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { EnvironmentalRisk } from "@/lib/supabase/types";

function severityTone(severity: string | null): "danger" | "warning" | "info" | "default" {
  switch (severity) {
    case "Kritisk":
      return "danger";
    case "Høj":
      return "warning";
    case "Medium":
      return "info";
    default:
      return "default";
  }
}

function statusColor(status: string | null): string {
  switch (status) {
    case "Kontrolleret":
      return "text-emerald-600";
    case "Åben":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

interface Props {
  risks: EnvironmentalRisk[];
}

export function EnvironmentalRiskTable({ risks }: Props) {
  const [localRisks, setLocalRisks] = useState<EnvironmentalRisk[]>(risks);

  function markControlled(id: string) {
    setLocalRisks((prev) => prev.map((r) => (r.id === id ? { ...r, status: "Kontrolleret" } : r)));
  }

  const openCount = localRisks.filter((r) => r.status === "Åben").length;
  const criticalCount = localRisks.filter(
    (r) => r.status === "Åben" && (r.severity === "Kritisk" || r.severity === "Høj"),
  ).length;

  return (
    <Card>
      <CardHeader
        title="Miljørisici"
        subtitle={`${localRisks.length} risici registreret`}
        action={
          <div className="flex gap-1.5">
            {criticalCount > 0 && <Pill tone="danger">{criticalCount} kritiske/høje åbne</Pill>}
            <Pill tone={openCount > 0 ? "warning" : "success"}>{openCount} åbne</Pill>
          </div>
        }
      />
      {localRisks.length === 0 ? (
        <div className="px-5 pb-5 text-sm text-muted-foreground">Ingen risici registreret</div>
      ) : (
        <div className="px-5 pb-4 divide-y">
          {localRisks.map((risk) => (
            <div key={risk.id} className="py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{risk.title}</span>
                    {risk.severity && (
                      <Pill tone={severityTone(risk.severity)}>{risk.severity}</Pill>
                    )}
                  </div>
                  {risk.risk_type && (
                    <span className="text-xs text-muted-foreground">{risk.risk_type}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium ${statusColor(risk.status)}`}>
                    {risk.status ?? "—"}
                  </span>
                  {risk.status === "Åben" && (
                    <button
                      onClick={() => markControlled(risk.id)}
                      className="text-xs px-2 py-0.5 rounded border hover:bg-muted transition-colors"
                    >
                      Markér kontrolleret
                    </button>
                  )}
                </div>
              </div>
              {risk.description && (
                <p className="text-xs text-muted-foreground">{risk.description}</p>
              )}
              {risk.mitigation_summary && (
                <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                  Afværge: {risk.mitigation_summary}
                </p>
              )}
              {risk.responsible_party && (
                <p className="text-xs text-muted-foreground">Ansvarlig: {risk.responsible_party}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
