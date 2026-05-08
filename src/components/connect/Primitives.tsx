import type { ReactNode } from "react";
import { useState } from "react";
import {
  Wifi, WifiOff, Battery, BatteryLow, BatteryFull, Signal, X, CheckCircle2,
  AlertTriangle, AlertCircle, Circle, Info, ArrowRight,
} from "lucide-react";
import { Card, Pill } from "@/components/ui-bits";

// ---------- Status ----------
export function DeviceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: any; label: string; icon: any }> = {
    online: { tone: "success", label: "Online", icon: CheckCircle2 },
    partial: { tone: "warning", label: "Delvist aktiv", icon: AlertCircle },
    attention: { tone: "danger", label: "Kræver handling", icon: AlertTriangle },
    offline: { tone: "danger", label: "Offline", icon: WifiOff },
    setup: { tone: "info", label: "Under opsætning", icon: Info },
  };
  const m = map[status] ?? map.online;
  const Icon = m.icon;
  return (
    <Pill tone={m.tone}>
      <Icon className="h-3 w-3" /> {m.label}
    </Pill>
  );
}

// ---------- Signal ----------
export function SignalStrengthIndicator({ level }: { level: number }) {
  return (
    <div className="inline-flex items-end gap-0.5" title={`Signal ${level}/5`}>
      {[1, 2, 3, 4, 5].map((b) => (
        <div
          key={b}
          className={`w-1 rounded-sm ${b <= level ? "bg-primary" : "bg-muted"}`}
          style={{ height: `${4 + b * 2}px` }}
        />
      ))}
    </div>
  );
}

// ---------- Battery ----------
export function BatteryIndicator({ level }: { level: number }) {
  const tone = level >= 50 ? "text-success" : level >= 20 ? "text-warning-foreground" : "text-destructive";
  const Icon = level >= 50 ? BatteryFull : level >= 20 ? Battery : BatteryLow;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      <Icon className="h-4 w-4" /> {level}%
    </span>
  );
}

// ---------- Quality ----------
export function DataQualityScore({ score, size = "sm" }: { score: number; size?: "sm" | "md" }) {
  const tone = score >= 90 ? "bg-success/15 text-success" : score >= 70 ? "bg-warning/20 text-warning-foreground" : "bg-destructive/15 text-destructive";
  const cls = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return <span className={`inline-flex items-center rounded-full font-medium tabular-nums ${tone} ${cls}`}>{score}%</span>;
}

// ---------- Connection health card ----------
export function ConnectionHealthCard({
  label, value, sub, icon, tone = "default",
}: { label: string; value: string; sub?: string; icon: ReactNode; tone?: "default" | "success" | "warning" | "danger" }) {
  const accents: Record<string, string> = {
    default: "bg-leaf/20 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1.5 tracking-tight">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        <div className={`h-9 w-9 rounded-xl grid place-items-center ${accents[tone]}`}>{icon}</div>
      </div>
    </Card>
  );
}

// ---------- Drawer ----------
export function Drawer({
  open, onClose, title, subtitle, children, footer,
}: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Luk" onClick={onClose} className="flex-1 bg-foreground/30 backdrop-blur-sm" />
      <aside className="w-full max-w-xl bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right">
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

// ---------- Section ----------
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

// ---------- Severity badge (delegates to shared StatusBadge) ----------
import { StatusBadge as PlatformStatusBadge } from "@/components/platform/Primitives";
export function SeverityBadge({ severity }: { severity: "critical" | "medium" | "low" }) {
  const map = {
    critical: "Høj risiko" as const,
    medium: "Medium risiko" as const,
    low: "Lav risiko" as const,
  };
  return <PlatformStatusBadge status={map[severity]} />;
}

// ---------- Progress bar ----------
export function ProgressBar({ value, label, hint }: { value: number; label?: string; hint?: string }) {
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium tabular-nums">{value}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${value}%` }} />
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

// ---------- Wizard step indicator ----------
export function WizardSteps({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (i: number) => void }) {
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s}>
            <button
              onClick={() => onSelect(i)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                active ? "bg-leaf/20 text-foreground font-medium" : done ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted"
              }`}
            >
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

// ---------- Hook for drawer state ----------
export function useDrawer<T>() {
  const [item, setItem] = useState<T | null>(null);
  return { item, open: (x: T) => setItem(x), close: () => setItem(null) };
}

// ---------- Inline chip ----------
export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "primary" | "muted" }) {
  const tones = {
    default: "bg-muted text-foreground border",
    primary: "bg-leaf/20 text-foreground border border-primary/20",
    muted: "bg-muted/60 text-muted-foreground border",
  };
  return <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-md ${tones[tone]}`}>{children}</span>;
}

// ---------- Mini chart (line) ----------
export function MiniLine({ values, color = "var(--primary)" }: { values: number[]; color?: string }) {
  const w = 280, h = 80, pad = 6;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export { CheckCircle2, AlertTriangle, Wifi, ArrowRight, Circle };
