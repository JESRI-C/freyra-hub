import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";
import { Card, Pill } from "@/components/ui-bits";

export function ReportStatusBadge({ status }: { status: string }) {
  const map: Record<string, any> = {
    "Kladde": { tone: "default", label: "Kladde" },
    "Klar til review": { tone: "info", label: "Klar til review" },
    "Kræver data": { tone: "danger", label: "Kræver data" },
    "Godkendt": { tone: "success", label: "Godkendt" },
    "Eksporteret": { tone: "success", label: "Eksporteret" },
    "Arkiveret": { tone: "default", label: "Arkiveret" },
  };
  const m = map[status] ?? map["Kladde"];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

export function ReadinessScore({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const tone = value >= 90 ? "text-success" : value >= 75 ? "text-warning-foreground" : "text-destructive";
  const stroke = value >= 90 ? "hsl(var(--success))" : value >= 75 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  const r = size === "lg" ? 52 : size === "md" ? 30 : 22;
  const sw = size === "lg" ? 8 : size === "md" ? 5 : 4;
  const C = 2 * Math.PI * r;
  const offset = C - (value / 100) * C;
  const wh = (r + sw) * 2;
  return (
    <div className="inline-flex items-center gap-2">
      <svg width={wh} height={wh} className="-rotate-90">
        <circle cx={wh / 2} cy={wh / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={sw} fill="none" />
        <circle cx={wh / 2} cy={wh / 2} r={r} stroke={stroke} strokeWidth={sw} fill="none" strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className={`${size === "lg" ? "text-3xl" : "text-base"} font-semibold tabular-nums ${tone}`}>{value}%</div>
    </div>
  );
}

export function ReadinessBar({ value, label }: { value: number; label?: string }) {
  const color = value >= 90 ? "bg-success" : value >= 75 ? "bg-warning" : "bg-destructive";
  return (
    <div>
      {label && <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}%</span></div>}
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-xl" }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Luk" onClick={onClose} className="flex-1 bg-foreground/30 backdrop-blur-sm" />
      <aside className={`w-full ${width} bg-card border-l shadow-2xl flex flex-col`}>
        <header className="flex items-start justify-between p-5 border-b">
          <div>
            <div className="text-base font-semibold">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
        {footer && <footer className="p-4 border-t bg-muted/30 flex flex-wrap gap-2">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "primary" | "muted" | "warning" | "success" }) {
  const tones = {
    default: "bg-muted text-foreground border",
    primary: "bg-leaf/20 text-foreground border border-primary/20",
    muted: "bg-muted/60 text-muted-foreground border",
    warning: "bg-warning/20 text-warning-foreground border border-warning/30",
    success: "bg-success/15 text-success border border-success/20",
  };
  return <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-md ${tones[tone]}`}>{children}</span>;
}

export function WizardSteps({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (i: number) => void }) {
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s}>
            <button onClick={() => onSelect(i)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${active ? "bg-leaf/20 text-foreground font-medium" : done ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted"}`}>
              <span className={`h-6 w-6 rounded-full grid place-items-center text-xs ${done ? "bg-success text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="flex-1 truncate">{s}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function ApprovalStepper({ current, steps }: { current: number; steps: string[] }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${done ? "bg-success/15 text-success" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <span className={`h-5 w-5 rounded-full grid place-items-center text-[10px] ${done ? "bg-success text-white" : active ? "bg-white/20" : "bg-card"}`}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              {s}
            </div>
            {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

export function MissingDataItem({ issue, why, fix, target, onAction }: { issue: string; why: string; fix: string; target: string; onAction?: () => void }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-warning/5">
      <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{issue}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{why}</div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Chip tone="muted">→ {target}</Chip>
          <span className="text-xs text-foreground/80">{fix}</span>
        </div>
      </div>
      {onAction && <button onClick={onAction} className="text-xs rounded-lg border bg-card px-2.5 py-1 self-start">Send</button>}
    </div>
  );
}

export function useToggle<T extends string>(initial: T[]) {
  const [v, setV] = useState<T[]>(initial);
  const toggle = (x: T) => setV((prev) => prev.includes(x) ? prev.filter((y) => y !== x) : [...prev, x]);
  return [v, toggle, setV] as const;
}

export { CheckCircle2, AlertTriangle };
