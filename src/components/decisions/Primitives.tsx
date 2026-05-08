import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { RiskLevel, Priority } from "@/lib/decisions-data";
import { StatusBadge } from "@/components/platform/Primitives";
import type { PlatformStatus } from "@/lib/platform-data";

const RISK_TO_STATUS: Record<RiskLevel, PlatformStatus> = {
  Lav: "Lav risiko",
  Medium: "Medium risiko",
  Høj: "Høj risiko",
  Kritisk: "Høj risiko",
};
const PRIORITY_TO_STATUS: Record<Priority, PlatformStatus> = {
  Høj: "Høj risiko",
  Medium: "Medium risiko",
  Lav: "Lav risiko",
};

export function ConfidenceScore({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.85 ? "text-success" : value >= 0.7 ? "text-primary" : "text-warning-foreground";
  return (
    <div className={`inline-flex items-center gap-1.5 ${size === "sm" ? "text-xs" : "text-sm"}`}>
      <span className={`font-semibold tabular-nums ${tone}`}>{pct}%</span>
      <span className="text-muted-foreground text-xs">konfidens</span>
    </div>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <StatusBadge status={RISK_TO_STATUS[level]} />;
}

export function PriorityBadge({ p }: { p: Priority }) {
  return <StatusBadge status={PRIORITY_TO_STATUS[p]} />;
}

export function DataQualityBar({ value, label }: { value: number; label?: string }) {
  const tone = value >= 85 ? "bg-success" : value >= 70 ? "bg-leaf" : value >= 55 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium tabular-nums">{value}</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export function InsightCard({
  label, value, delta, tone, description, icon,
}: {
  label: string; value: string; delta?: string; tone: "success" | "warning" | "danger" | "info"; description: string; icon: ReactNode;
}) {
  const accents: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-leaf/20 text-primary",
  };
  const up = delta?.startsWith("+");
  return (
    <div className="rounded-2xl bg-card border shadow-soft p-5 flex flex-col h-full">
      <div className="flex items-start justify-between">
        <div className={`h-9 w-9 rounded-xl grid place-items-center ${accents[tone]}`}>{icon}</div>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${tone === "danger" || tone === "warning" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold leading-tight">{value}</div>
      <div className="mt-2 text-xs text-muted-foreground leading-relaxed">{description}</div>
    </div>
  );
}
