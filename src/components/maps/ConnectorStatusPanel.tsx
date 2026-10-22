import { CheckCircle2, AlertCircle, Clock, KeyRound } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";

export interface ConnectorStatusItem {
  name: string;
  slug: string;
  status: "live" | "preview" | "unavailable" | "missing_key";
  provider: string;
  lastChecked?: string;
  note?: string;
}

interface ConnectorStatusPanelProps {
  connectors: ConnectorStatusItem[];
  className?: string;
}

function StatusIcon({ status }: { status: ConnectorStatusItem["status"] }) {
  switch (status) {
    case "live":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "preview":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "missing_key":
      return <KeyRound className="h-4 w-4 text-amber-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-red-500" />;
  }
}

const STATUS_LABEL: Record<ConnectorStatusItem["status"], string> = {
  live: "Live",
  preview: "Preview",
  unavailable: "Utilgængelig",
  missing_key: "Mangler nøgle",
};

const STATUS_BADGE: Record<ConnectorStatusItem["status"], string> = {
  live: "bg-emerald-100 text-emerald-700",
  preview: "bg-amber-100 text-amber-700",
  unavailable: "bg-red-100 text-red-700",
  missing_key: "bg-amber-100 text-amber-700",
};

export function ConnectorStatusPanel({ connectors, className }: ConnectorStatusPanelProps) {
  const liveCount = connectors.filter((c) => c.status === "live").length;

  return (
    <Card className={className}>
      <CardHeader
        title="Connector-status"
        subtitle={`${liveCount} af ${connectors.length} live`}
      />
      <div className="px-5 pb-4 divide-y">
        {connectors.map((c) => (
          <div key={c.slug} className="py-3 flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <StatusIcon status={c.status} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.provider}</div>
              {c.note && <div className="text-xs text-muted-foreground italic mt-0.5">{c.note}</div>}
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[c.status]}`}
            >
              {STATUS_LABEL[c.status]}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
