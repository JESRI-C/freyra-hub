import { ShieldCheck, RefreshCw, Eye, FileText, AlertTriangle, Activity } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import type { AuditEvent } from "@/lib/supabase/types";

function AuditIcon({ eventType }: { eventType: string | null }) {
  switch (eventType) {
    case "verification":
      return <ShieldCheck className="h-4 w-4" />;
    case "data_update":
      return <RefreshCw className="h-4 w-4" />;
    case "observation":
      return <Eye className="h-4 w-4" />;
    case "report":
      return <FileText className="h-4 w-4" />;
    case "risk":
      return <AlertTriangle className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

interface Props {
  events: AuditEvent[];
}

export function ConstructionAuditTrail({ events }: Props) {
  return (
    <Card>
      <CardHeader
        title="Audit trail"
        subtitle="Kronologisk log over hændelser for projektet"
        action={<Pill tone="info">{events.length}</Pill>}
      />
      {events.length === 0 ? (
        <div className="px-5 pb-5 text-sm text-muted-foreground">
          Ingen auditbegivenheder registreret
        </div>
      ) : (
        <div className="px-5 pb-4 divide-y">
          {events.map((ev) => (
            <div key={ev.id} className="py-3 flex items-start gap-3 text-sm">
              <span className="mt-0.5 text-muted-foreground shrink-0">
                <AuditIcon eventType={ev.event_type} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{ev.title}</div>
                {ev.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
                )}
                <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                  {ev.actor && <span>{ev.actor}</span>}
                  {ev.source && <span>· {ev.source}</span>}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(ev.created_at).toLocaleDateString("da-DK")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
