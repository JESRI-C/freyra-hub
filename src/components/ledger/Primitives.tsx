import type { ReactNode } from "react";
import { ShieldCheck, Loader2, ShieldAlert, ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReportingStatus, VerificationLevel } from "@/lib/ledger-data";

export function ESGMetricCard({
  label,
  value,
  unit,
  trend,
  icon,
  hint,
  tone = "leaf",
}: {
  label: string;
  value: string;
  unit?: string;
  trend?: number;
  icon: ReactNode;
  hint?: string;
  tone?: "leaf" | "success" | "warning" | "danger" | "info";
}) {
  const accents: Record<string, string> = {
    leaf: "bg-leaf/20 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-accent text-accent-foreground",
  };
  const up = (trend ?? 0) >= 0;
  return (
    <div className="rounded-2xl bg-card border shadow-soft p-5">
      <div className="flex items-start justify-between">
        <div className={`h-9 w-9 rounded-xl grid place-items-center ${accents[tone]}`}>{icon}</div>
        {trend !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
            }`}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">
        {value}
        {unit && <span className="text-sm font-medium text-muted-foreground ml-1">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function VerificationStatusBadge({ status }: { status: VerificationLevel }) {
  const m: Record<VerificationLevel, { bg: string; icon: ReactNode }> = {
    Verificeret: { bg: "bg-success/15 text-success", icon: <ShieldCheck className="h-3 w-3" /> },
    "Under verifikation": {
      bg: "bg-warning/20 text-warning-foreground",
      icon: <Loader2 className="h-3 w-3" />,
    },
    "Ikke verificeret": {
      bg: "bg-destructive/15 text-destructive",
      icon: <ShieldAlert className="h-3 w-3" />,
    },
  };
  const t = m[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${t.bg}`}
    >
      {t.icon} {status}
    </span>
  );
}

export function ReportingStatusPill({ status }: { status: ReportingStatus }) {
  const m: Record<ReportingStatus, string> = {
    Rapportklar: "bg-success/15 text-success",
    "Delvist klar": "bg-warning/20 text-warning-foreground",
    "Mangler data": "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m[status]}`}>{status}</span>
  );
}

export function ReadinessScore({
  label,
  value,
  size = "md",
}: {
  label: string;
  value: number;
  size?: "sm" | "md";
}) {
  const tone =
    value >= 85 ? "bg-success" : value >= 70 ? "bg-leaf" : value >= 55 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <div className={`${size === "sm" ? "h-1" : "h-1.5"} rounded-full bg-muted overflow-hidden`}>
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export function ApprovalStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    "Intern review": "bg-warning/20 text-warning-foreground",
    "Klar til godkendelse": "bg-accent text-accent-foreground",
    Godkendt: "bg-success/15 text-success",
    "Sendt til rapport": "bg-leaf/20 text-primary",
    Arkiveret: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}

export function MiniSpark({ values, color = "var(--leaf)" }: { values: number[]; color?: string }) {
  const w = 100,
    h = 28,
    pad = 2;
  const min = Math.min(...values),
    max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-7">
      <path d={`M ${pts.join(" L ")}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LineChart({
  series,
  height = 180,
}: {
  series: { label: string; values: number[]; color: string }[];
  height?: number;
}) {
  const w = 600,
    h = height,
    pad = 24;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all),
    min = Math.min(...all);
  const span = max - min || 1;
  const len = series[0]?.values.length ?? 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1={pad}
          x2={w - pad}
          y1={pad + (i * (h - pad * 2)) / 3}
          y2={pad + (i * (h - pad * 2)) / 3}
          stroke="oklch(0.92 0.01 150)"
          strokeWidth="1"
        />
      ))}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => {
          const x = pad + (i * (w - pad * 2)) / (len - 1);
          const y = h - pad - ((v - min) / span) * (h - pad * 2);
          return `${x},${y}`;
        });
        return (
          <path
            key={si}
            d={`M ${pts.join(" L ")}`}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {["Jan", "Feb", "Mar", "Apr", "Maj", "Jun"].map((m, i) => (
        <text
          key={m}
          x={pad + (i * (w - pad * 2)) / 5}
          y={h - 6}
          fontSize="10"
          textAnchor="middle"
          fill="oklch(0.5 0.02 160)"
        >
          {m}
        </text>
      ))}
    </svg>
  );
}

export function StackedBars({
  rows,
  total,
}: {
  rows: { label: string; segments: { value: number; color: string; label: string }[] }[];
  total: number;
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const sum = r.segments.reduce((s, x) => s + x.value, 0);
        return (
          <div key={r.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium tabular-nums">{sum.toLocaleString("da-DK")} t</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              {r.segments.map((s, i) => (
                <div
                  key={i}
                  style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.value}`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Donut({
  segments,
  size = 160,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(0.94 0.01 150)" strokeWidth="14" />
          {segments.map((s, i) => {
            const len = (s.value / total) * c;
            const dasharray = `${len} ${c - len}`;
            const dashoffset = -acc;
            acc += len;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
              />
            );
          })}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{centerLabel}</div>
              <div className="text-xl font-semibold tabular-nums">{centerValue}</div>
            </div>
          </div>
        )}
      </div>
      <ul className="text-sm space-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-foreground">{s.label}</span>
            <span className="text-muted-foreground tabular-nums ml-1">
              {s.value.toLocaleString("da-DK")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-foreground/30 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-card border-l shadow-card overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-start justify-between">
          <div className="min-w-0">
            <div className="font-semibold truncate">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-5 flex-1">{children}</div>
        {footer && <div className="p-4 border-t bg-muted/30">{footer}</div>}
      </div>
    </div>
  );
}

export function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1) + "k";
  return n.toLocaleString("da-DK");
}
