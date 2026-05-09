import { CheckCircle2, AlertTriangle, Clock, XCircle } from "lucide-react";
import { DataQualityBar } from "./Primitives";

export function DataSourceStatus({
  source,
}: {
  source: {
    name: string;
    status: string;
    lastSync: string;
    quality: number;
    verification: string;
    missing: string;
    improvement: string;
  };
}) {
  const tone =
    source.status === "Aktiv"
      ? "success"
      : source.status === "Forsinket"
        ? "warning"
        : source.status === "Inaktiv"
          ? "muted"
          : "danger";
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? Clock
        : tone === "danger"
          ? AlertTriangle
          : XCircle;
  const colorClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning-foreground"
        : tone === "danger"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className="rounded-2xl bg-card border shadow-soft p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{source.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Sidst synket: {source.lastSync}
          </div>
        </div>
        <div
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${colorClass} bg-current/10`}
        >
          <Icon className="h-3 w-3" /> {source.status}
        </div>
      </div>
      <div className="mt-4">
        <DataQualityBar value={source.quality} label="Kvalitetsscore" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Verifikation</div>
          <div className="font-medium mt-0.5">Niveau {source.verification}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Manglende data</div>
          <div className="font-medium mt-0.5">{source.missing}</div>
        </div>
      </div>
      {source.improvement !== "—" && (
        <div className="mt-3 text-xs rounded-lg bg-leaf/10 text-primary px-3 py-2">
          Anbefalet: {source.improvement}
        </div>
      )}
    </div>
  );
}
