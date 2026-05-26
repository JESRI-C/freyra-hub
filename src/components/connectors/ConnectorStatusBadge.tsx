import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Eye, KeyRound, AlertTriangle } from "lucide-react";
import type { ConnectorResponse } from "@/services/live-data/live-data-client";

interface Props {
  label: string;
  response: Pick<ConnectorResponse<unknown>, "mode" | "status" | "error" | "fetchedAt" | "latencyMs"> | undefined | null;
  className?: string;
}

type Variant = {
  label: string;
  Icon: typeof Activity;
  className: string;
};

export function ConnectorStatusBadge({ label, response, className }: Props) {
  const variant: Variant = (() => {
    if (!response) {
      return { label: "Preview", Icon: Eye, className: "bg-muted text-muted-foreground border-border" };
    }
    if (response.status === "missing_key") {
      return { label: "Key missing", Icon: KeyRound, className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
    }
    if (response.mode === "error" || response.status === "error" || response.status === "timeout") {
      return { label: "Error", Icon: AlertTriangle, className: "bg-destructive/15 text-destructive border-destructive/30" };
    }
    if (response.mode === "live") {
      return { label: "Active", Icon: Activity, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
    }
    return { label: "Preview", Icon: Eye, className: "bg-muted text-muted-foreground border-border" };
  })();

  const Icon = variant.Icon;
  const tooltip = response
    ? `${label}: ${variant.label}${response.error ? ` — ${response.error}` : ""} · ${response.latencyMs}ms`
    : `${label}: Preview (no data fetched)`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 ${variant.className} ${className ?? ""}`}>
            <Icon className="h-3 w-3" />
            <span className="text-xs font-medium">{label}</span>
            <span className="text-[10px] opacity-80">· {variant.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface BundleProps {
  weather?: Props["response"];
  nature?: Props["response"];
  places?: Props["response"];
  satellite?: Props["response"];
  className?: string;
}

export function ConnectorStatusBar({ weather, nature, places, satellite, className }: BundleProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <ConnectorStatusBadge label="DMI" response={weather} />
      <ConnectorStatusBadge label="Miljøportal" response={nature} />
      <ConnectorStatusBadge label="Dataforsyningen" response={places} />
      <ConnectorStatusBadge label="Sentinel-2" response={satellite} />
    </div>
  );
}
