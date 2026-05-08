import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card border shadow-soft ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between p-5 pb-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label, value, delta, icon, accent = "bg-leaf/20 text-primary",
}: {
  label: string; value: string; delta?: number; icon: ReactNode; accent?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-2 tracking-tight">{value}</div>
          {delta !== undefined && (
            <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {up ? "+" : ""}{delta}% vs. forrige periode
            </div>
          )}
        </div>
        <div className={`h-10 w-10 rounded-xl grid place-items-center ${accent}`}>{icon}</div>
      </div>
    </Card>
  );
}

export function Sparkline({ values, color = "var(--leaf)" }: { values: number[]; color?: string }) {
  const w = 240, h = 60, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });
  const d = `M ${pts.join(" L ")}`;
  const area = `${d} L ${w - pad},${h - pad} L ${pad},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
      <defs>
        <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Bars({ data, color = "var(--primary)" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground w-28 truncate">{d.label}</div>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <div className="text-xs font-medium w-12 text-right tabular-nums">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-accent text-accent-foreground",
  };
  return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
