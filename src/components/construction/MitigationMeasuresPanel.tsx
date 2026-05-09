import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { MitigationMeasure } from "@/lib/supabase/types";

function statusTone(status: string | null): "success" | "warning" | "info" | "default" {
  switch (status) {
    case "Verificeret":
      return "success";
    case "Aktiv":
      return "warning";
    case "Planlagt":
      return "info";
    default:
      return "default";
  }
}

interface Props {
  measures: MitigationMeasure[];
}

export function MitigationMeasuresPanel({ measures }: Props) {
  const [localMeasures, setLocalMeasures] = useState<MitigationMeasure[]>(measures);

  function markVerified(id: string) {
    setLocalMeasures((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "Verificeret" } : m)),
    );
  }

  const verifiedCount = localMeasures.filter((m) => m.status === "Verificeret").length;
  const completionPct =
    localMeasures.length > 0 ? Math.round((verifiedCount / localMeasures.length) * 100) : 0;

  return (
    <Card>
      <CardHeader
        title="Afværgetiltag"
        subtitle={`${localMeasures.length} tiltag registreret`}
        action={
          <Pill
            tone={
              verifiedCount === localMeasures.length && localMeasures.length > 0
                ? "success"
                : "info"
            }
          >
            {verifiedCount}/{localMeasures.length} verificeret
          </Pill>
        }
      />

      {/* Completion bar */}
      {localMeasures.length > 0 && (
        <div className="px-5 pb-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Fremgang</span>
            <span className="tabular-nums">{completionPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      )}

      {localMeasures.length === 0 ? (
        <div className="px-5 pb-5 text-sm text-muted-foreground">
          Ingen afværgetiltag registreret
        </div>
      ) : (
        <div className="px-5 pb-4 divide-y">
          {localMeasures.map((m) => (
            <div key={m.id} className="py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {m.status === "Verificeret" && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium">{m.title}</span>
                    <Pill tone={statusTone(m.status)}>{m.status ?? "Ukendt"}</Pill>
                  </div>
                  {m.measure_type && (
                    <span className="text-xs text-muted-foreground">{m.measure_type}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.status !== "Verificeret" && (
                    <button
                      onClick={() => markVerified(m.id)}
                      className="text-xs px-2 py-0.5 rounded border hover:bg-muted transition-colors"
                    >
                      Markér verificeret
                    </button>
                  )}
                </div>
              </div>
              {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {m.due_date && (
                  <span>Frist: {new Date(m.due_date).toLocaleDateString("da-DK")}</span>
                )}
                {m.responsible_party && <span>Ansvarlig: {m.responsible_party}</span>}
                {m.verification_method && <span>Verifikation: {m.verification_method}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
