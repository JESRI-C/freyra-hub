import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Leaf,
  MapPin,
  Trees,
  Droplets,
  Sprout,
  Waves,
  Building2,
  Wind,
  Mountain,
  Plus,
  ArrowRightLeft,
} from "lucide-react";
import type {
  Category,
  ImpactProject,
  ReportingStatus,
  RiskLevel,
  VerificationStatus,
} from "@/lib/impact-data";

export const CATEGORY_ICON: Record<Category, typeof Leaf> = {
  "Skov & natur": Trees,
  Biodiversitet: Sprout,
  Klimaprojekter: Leaf,
  "Jord & landbrug": Sprout,
  "Vand & hav": Waves,
  Bynatur: Building2,
  Vådområder: Droplets,
  Energiomstilling: Wind,
};

import { StatusBadge as PlatformStatusBadge } from "@/components/platform/Primitives";
import type { PlatformStatus } from "@/lib/platform-data";

const VERIFICATION_MAP: Record<VerificationStatus, PlatformStatus> = {
  Verificeret: "Verificeret",
  "Under verifikation": "Under verifikation",
  Planlagt: "Kladde",
};
const RISK_MAP: Record<RiskLevel, PlatformStatus> = {
  Lav: "Lav risiko",
  Medium: "Medium risiko",
  Høj: "Høj risiko",
};
const REPORTING_MAP: Record<ReportingStatus, PlatformStatus> = {
  Rapportklar: "Rapportklar",
  "Delvist klar": "Under verifikation",
  "Ikke klar": "Ikke rapportklar",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <PlatformStatusBadge status={VERIFICATION_MAP[status]} />;
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <PlatformStatusBadge status={RISK_MAP[level]} />;
}

export function ReportingPill({ status }: { status: ReportingStatus }) {
  return <PlatformStatusBadge status={REPORTING_MAP[status]} />;
}

export function CategoryBadge({ category }: { category: Category }) {
  const Icon = CATEGORY_ICON[category] ?? Leaf;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-leaf/20 text-primary">
      <Icon className="h-3 w-3" /> {category}
    </span>
  );
}

export function DataQualityScore({ value, label = "Datakvalitet" }: { value: number; label?: string }) {
  const tone =
    value >= 90 ? "bg-success" : value >= 75 ? "bg-leaf" : value >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export function ImpactMetricCard({
  label,
  value,
  unit,
  icon,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border shadow-soft p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="h-7 w-7 rounded-lg bg-leaf/20 text-primary grid place-items-center">{icon}</span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        {value}
        {unit && <span className="text-sm font-medium text-muted-foreground ml-1">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}

export function ProjectCard({
  project,
  selected,
  inPortfolio,
  onSelect,
  onAddToPortfolio,
}: {
  project: ImpactProject;
  selected?: boolean;
  inPortfolio?: boolean;
  onSelect?: () => void;
  onAddToPortfolio?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card border shadow-soft overflow-hidden flex flex-col">
      <div className="h-32 relative" style={{ background: project.image }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="absolute top-3 left-3 flex gap-2">
          <CategoryBadge category={project.category} />
        </div>
        <div className="absolute top-3 right-3">
          <VerificationBadge status={project.verification} />
        </div>
        <div className="absolute bottom-3 left-3 text-white">
          <div className="font-semibold leading-tight">{project.title}</div>
          <div className="text-xs opacity-90 inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {project.location}, {project.country}
          </div>
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{project.description}</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Metric label="CO₂e pot." value={fmt(project.co2ePotential)} unit="t" />
          <Metric label="Bio.indeks" value={`${project.biodiversityIndex}`} unit="/100" />
          <Metric label="Areal" value={fmt(project.hectares)} unit="ha" />
        </div>
        <DataQualityScore value={project.dataQuality} />
        <div className="flex items-center justify-between text-xs">
          <RiskBadge level={project.risk} />
          <span className="text-muted-foreground">
            ~<span className="font-medium text-foreground tabular-nums">{project.pricePerUnit}</span> DKK / enhed
          </span>
        </div>
        <div className="mt-auto pt-2 grid grid-cols-3 gap-1.5">
          <Link
            to="/app/impact/project"
            className="text-xs text-center rounded-lg bg-primary text-primary-foreground py-2 hover:opacity-95"
          >
            Se projekt
          </Link>
          {onSelect && (
            <button
              onClick={onSelect}
              className={`text-xs rounded-lg py-2 inline-flex items-center justify-center gap-1 border ${
                selected ? "bg-leaf/20 border-leaf text-primary" : "hover:bg-muted"
              }`}
            >
              <ArrowRightLeft className="h-3 w-3" /> Sammenlign
            </button>
          )}
          {onAddToPortfolio && (
            <button
              onClick={onAddToPortfolio}
              disabled={inPortfolio}
              className={`text-xs rounded-lg py-2 inline-flex items-center justify-center gap-1 border ${
                inPortfolio
                  ? "bg-success/10 border-success/30 text-success cursor-default"
                  : "hover:bg-muted"
              }`}
            >
              {inPortfolio ? <ShieldCheck className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {inPortfolio ? "I portefølje" : "Tilføj"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums text-sm leading-tight">
        {value}
        {unit && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}

export function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return n.toLocaleString("da-DK");
}

// World map illustration with project pins
export function ProjectMap({
  projects,
  highlight,
  compact = false,
}: {
  projects: ImpactProject[];
  highlight?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative w-full ${compact ? "h-56" : "h-80"} rounded-xl overflow-hidden border`}
      style={{
        background:
          "radial-gradient(ellipse at 30% 30%, oklch(0.92 0.05 200 / 0.6), transparent 60%), radial-gradient(ellipse at 70% 70%, oklch(0.92 0.07 150 / 0.6), transparent 60%), oklch(0.96 0.02 200)",
      }}
    >
      {/* fake continent shapes */}
      <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <g fill="oklch(0.9 0.04 150 / 0.7)" stroke="oklch(0.7 0.05 150 / 0.4)" strokeWidth="0.2">
          <path d="M10,20 Q22,12 35,18 Q44,28 38,38 Q24,42 14,34 Z" />
          <path d="M48,18 Q60,12 72,16 Q80,28 70,40 Q58,42 50,34 Z" />
          <path d="M30,42 Q40,46 38,55 Q26,57 22,50 Z" />
          <path d="M75,40 Q88,38 92,48 Q86,55 74,52 Z" />
        </g>
      </svg>
      {projects.map((p) => {
        const active = highlight === p.id;
        return (
          <div
            key={p.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 group`}
            style={{ left: `${p.coords.x}%`, top: `${p.coords.y}%` }}
          >
            <div
              className={`h-3 w-3 rounded-full ring-4 ${
                active ? "bg-primary ring-primary/30" : "bg-leaf ring-leaf/30"
              } shadow`}
            />
            <div className="absolute left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap text-[10px] font-medium bg-card border rounded-md px-1.5 py-0.5 shadow-soft opacity-0 group-hover:opacity-100 transition pointer-events-none">
              {p.title}
            </div>
          </div>
        );
      })}
      <div className="absolute top-3 right-3 flex gap-1">
        <button className="h-7 w-7 rounded-md bg-card border shadow-soft text-sm">+</button>
        <button className="h-7 w-7 rounded-md bg-card border shadow-soft text-sm">−</button>
      </div>
      <div className="absolute bottom-3 left-3 text-[10px] text-muted-foreground bg-card/80 backdrop-blur rounded px-2 py-1">
        {projects.length} projekter · global oversigt
      </div>
    </div>
  );
}

// Local site map for project profile
export function LocalSiteMap() {
  return (
    <div className="relative h-72 rounded-xl border overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 60% 40%, oklch(0.92 0.07 150 / 0.7), transparent 70%), oklch(0.96 0.03 150)",
      }}
    >
      <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <path d="M5,30 Q25,10 50,28 T95,32" stroke="oklch(0.6 0.1 220)" strokeWidth="1.5" fill="none" />
        <path d="M5,30 Q25,10 50,28 T95,32" stroke="oklch(0.7 0.05 220)" strokeWidth="0.4" fill="none" />
        <ellipse cx="35" cy="38" rx="18" ry="8" fill="oklch(0.85 0.08 150 / 0.7)" />
        <ellipse cx="70" cy="22" rx="14" ry="6" fill="oklch(0.78 0.12 150 / 0.6)" />
      </svg>
      <Pin x="22" y="50" label="Zone A — Vandløb" tone="info" />
      <Pin x="50" y="30" label="Zone B — Eng & vådområde" tone="leaf" />
      <Pin x="78" y="20" label="Zone C — Skovkant" tone="success" />
      <SensorDot x="30" y="46" />
      <SensorDot x="44" y="34" />
      <SensorDot x="62" y="26" />
      <SensorDot x="74" y="18" />
      <div className="absolute top-3 right-3 text-[10px] text-muted-foreground bg-card/80 backdrop-blur rounded px-2 py-1">
        Sensorer · feltobservationer · droneflyvning
      </div>
    </div>
  );
}

function Pin({ x, y, label, tone }: { x: string; y: string; label: string; tone: "info" | "leaf" | "success" }) {
  const map = {
    info: "bg-accent text-accent-foreground",
    leaf: "bg-leaf/30 text-primary",
    success: "bg-success/20 text-success",
  } as const;
  return (
    <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className={`text-[10px] font-medium px-2 py-1 rounded-md shadow-soft ${map[tone]}`}>{label}</div>
      <div className="h-2 w-2 rounded-full bg-foreground mx-auto mt-0.5" />
    </div>
  );
}
function SensorDot({ x, y }: { x: string; y: string }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="h-2 w-2 rounded-full bg-primary ring-2 ring-primary/30" />
    </div>
  );
}

export function VerificationTimeline({
  steps,
}: {
  steps: { label: string; date: string; state: "done" | "current" | "todo" }[];
}) {
  return (
    <ol className="relative pl-6">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
      {steps.map((s, i) => (
        <li key={i} className="relative pb-5 last:pb-0">
          <div
            className={`absolute -left-[2px] top-1 h-4 w-4 rounded-full border-2 ${
              s.state === "done"
                ? "bg-success border-success"
                : s.state === "current"
                  ? "bg-primary border-primary animate-pulse"
                  : "bg-card border-border"
            }`}
          />
          <div className="text-sm font-medium">{s.label}</div>
          <div className="text-xs text-muted-foreground">{s.date}</div>
        </li>
      ))}
    </ol>
  );
}

export function ImpactChart({
  series,
}: {
  series: { label: string; values: number[]; color: string }[];
}) {
  const w = 600,
    h = 180,
    pad = 24;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all),
    min = Math.min(...all);
  const span = max - min || 1;
  const len = series[0]?.values.length ?? 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={pad} x2={w - pad} y1={pad + (i * (h - pad * 2)) / 3} y2={pad + (i * (h - pad * 2)) / 3}
              stroke="oklch(0.92 0.01 150)" strokeWidth="1" />
      ))}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => {
          const x = pad + (i * (w - pad * 2)) / (len - 1);
          const y = h - pad - ((v - min) / span) * (h - pad * 2);
          return `${x},${y}`;
        });
        return (
          <g key={si}>
            <path d={`M ${pts.join(" L ")}`} fill="none" stroke={s.color} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
      {["Jan", "Feb", "Mar", "Apr", "Maj", "Jun"].map((m, i) => (
        <text key={m} x={pad + (i * (w - pad * 2)) / 5} y={h - 6} fontSize="10"
              textAnchor="middle" fill="oklch(0.5 0.02 160)">{m}</text>
      ))}
    </svg>
  );
}

export function Donut({
  segments,
  size = 160,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(0.94 0.01 150)" strokeWidth="14" />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const dasharray = `${len} ${c - len}`;
          const dashoffset = -acc;
          acc += len;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="14"
                    strokeDasharray={dasharray} strokeDashoffset={dashoffset} strokeLinecap="butt" />
          );
        })}
      </svg>
      <ul className="text-sm space-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-foreground">{s.label}</span>
            <span className="text-muted-foreground tabular-nums ml-1">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Topographic icon helper for category sections
export function TopoIcon({ category }: { category: Category }) {
  const Icon = CATEGORY_ICON[category] ?? Mountain;
  return <Icon className="h-4 w-4" />;
}
