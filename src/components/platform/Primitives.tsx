import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  Cable,
  Brain,
  Repeat2,
  BookCheck,
  FileText,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformStatus } from "@/lib/platform-data";

/* ---------- Status badge: one source of truth platform-wide ---------- */

const STATUS_TONES: Record<PlatformStatus, string> = {
  Online: "bg-success/15 text-success",
  Offline: "bg-muted text-muted-foreground",
  "Kræver handling": "bg-destructive/15 text-destructive",
  "Under verifikation": "bg-warning/20 text-warning-foreground",
  Verificeret: "bg-success/15 text-success",
  Rapportklar: "bg-leaf/30 text-primary",
  "Ikke rapportklar": "bg-muted text-muted-foreground",
  "Høj risiko": "bg-destructive/15 text-destructive",
  "Medium risiko": "bg-warning/20 text-warning-foreground",
  "Lav risiko": "bg-success/15 text-success",
  Kladde: "bg-muted text-muted-foreground",
  "Klar til review": "bg-leaf/30 text-primary",
  Godkendt: "bg-success/15 text-success",
  Eksporteret: "bg-accent text-accent-foreground",
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: PlatformStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium",
        STATUS_TONES[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function ReadinessScore({
  value,
  label = "Rapportklarhed",
}: {
  value: number;
  label?: string;
}) {
  const tone =
    value >= 80
      ? "bg-success"
      : value >= 60
        ? "bg-leaf"
        : value >= 40
          ? "bg-warning"
          : "bg-destructive";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ReportReadinessBadge({ value }: { value: number }) {
  const ready = value >= 80;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
        ready ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground",
      )}
    >
      <CheckCircle2 className="h-3 w-3" /> {value}% rapportklar
    </span>
  );
}

/* ---------- Module status card on Overview ---------- */

const MODULE_ICONS: Record<string, ReactNode> = {
  connect: <Cable className="h-4 w-4" />,
  decisions: <Brain className="h-4 w-4" />,
  impact: <Repeat2 className="h-4 w-4" />,
  ledger: <BookCheck className="h-4 w-4" />,
  reports: <FileText className="h-4 w-4" />,
};

export function ModuleStatusCard({
  id,
  name,
  href,
  metric,
  sub,
  status,
  updated,
  cta,
}: {
  id: string;
  name: string;
  href: string;
  metric: string;
  sub: string;
  status: PlatformStatus;
  updated: string;
  cta: string;
}) {
  return (
    <Link
      to={href}
      className="group block rounded-2xl bg-card border shadow-soft p-4 hover:shadow-card transition"
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-leaf/20 text-primary grid place-items-center">
          {MODULE_ICONS[id] ?? <Sparkles className="h-4 w-4" />}
        </div>
        <div className="text-sm font-semibold">{name}</div>
        <div className="ml-auto">
          <StatusBadge status={status} />
        </div>
      </div>
      <div className="mt-3">
        <div className="text-xl font-semibold tracking-tight">{metric}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </div>
      <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
        <span>Opdateret {updated}</span>
        <span className="text-primary inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
          {cta} <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

/* ---------- Data flow diagram: Connect → DecisionsIQ → Impact → Ledger → Reports ---------- */

export function DataFlowDiagram({
  steps,
}: {
  steps: {
    id: string;
    name: string;
    href: string;
    metric: string;
    updated: string;
    status: PlatformStatus;
  }[];
}) {
  return (
    <div className="rounded-2xl bg-card border shadow-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold">Data-flow på platformen</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Fra rådata til verificeret rapport
          </div>
        </div>
        <span className="text-xs text-muted-foreground">Live</span>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        {steps.map((s, i) => (
          <div key={s.id} className="relative">
            <Link
              to={s.href}
              className="block rounded-xl border bg-background hover:bg-muted/40 transition p-3 h-full"
            >
              <div className="flex items-center gap-2 text-primary">
                {MODULE_ICONS[s.id]}
                <div className="text-xs font-semibold text-foreground">{s.name}</div>
              </div>
              <div className="mt-2 text-sm font-semibold">{s.metric}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Opdateret {s.updated}</div>
              <div className="mt-2">
                <StatusBadge status={s.status} />
              </div>
            </Link>
            {i < steps.length - 1 && (
              <ChevronRight className="hidden md:block absolute -right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Activity feed (cross-module) ---------- */

export function ActivityFeed({
  items,
}: {
  items: { module: string; text: string; at: string; tone: "info" | "success" | "warning" }[];
}) {
  return (
    <ul className="divide-y">
      {items.map((it, i) => {
        const Icon =
          it.tone === "warning" ? AlertTriangle : it.tone === "success" ? CheckCircle2 : Sparkles;
        const tone =
          it.tone === "warning"
            ? "text-warning-foreground bg-warning/20"
            : it.tone === "success"
              ? "text-success bg-success/15"
              : "text-primary bg-leaf/20";
        return (
          <li key={i} className="flex items-start gap-3 px-5 py-3">
            <div className={cn("h-7 w-7 rounded-lg grid place-items-center shrink-0", tone)}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">{it.text}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {it.module} · {it.at}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Critical actions panel ---------- */

export function CriticalActionsPanel({
  items,
}: {
  items: {
    module: string;
    title: string;
    priority: string;
    owner: string;
    deadline: string;
    href: string;
  }[];
}) {
  return (
    <ul className="divide-y">
      {items.map((a, i) => {
        const tone =
          a.priority === "Høj"
            ? "bg-destructive/15 text-destructive"
            : a.priority === "Medium"
              ? "bg-warning/20 text-warning-foreground"
              : "bg-muted text-muted-foreground";
        return (
          <li key={i} className="px-5 py-3 flex items-center gap-3">
            <div className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", tone)}>
              {a.priority}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{a.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {a.module} · {a.owner} · frist {a.deadline}
              </div>
            </div>
            <Link
              to={a.href}
              className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
            >
              Åbn <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Onboarding checklist ---------- */

export function OnboardingChecklist({
  steps,
}: {
  steps: { id: number; label: string; done: boolean; href: string }[];
}) {
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <div className="rounded-2xl bg-card border shadow-soft p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Kom i gang</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {done} af {steps.length} trin gennemført
          </div>
        </div>
        <div className="text-sm font-semibold tabular-nums">{pct}%</div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-leaf" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 space-y-1.5">
        {steps.map((s) => (
          <li key={s.id}>
            <Link
              to={s.href}
              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/60 transition text-sm"
            >
              {s.done ? (
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
              <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Empty state, demo badge, cross-module link ---------- */

export function EmptyStateCard({
  title,
  description,
  ctaLabel,
  ctaHref,
  icon,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
      {icon && (
        <div className="h-10 w-10 mx-auto rounded-xl bg-leaf/20 text-primary grid place-items-center mb-3">
          {icon}
        </div>
      )}
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">{description}</p>
      {ctaLabel && ctaHref && (
        <Link
          to={ctaHref}
          className="inline-flex items-center gap-2 mt-4 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-soft hover:opacity-95"
        >
          {ctaLabel} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export function DemoModeBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-warning/20 text-warning-foreground border border-warning/40">
      <span className="h-1.5 w-1.5 rounded-full bg-warning-foreground" />
      Demo data aktiv
    </span>
  );
}

export function CrossModuleLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted text-foreground transition"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

/* ---------- Module header: shared pattern across all module index pages ---------- */

import { toast } from "sonner";

export function ModuleHeader({
  eyebrow,
  title,
  subtitle,
  projectName,
  freshness,
  status,
  readiness,
  primaryCta,
  secondaryCta,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  projectName?: string;
  freshness?: string;
  status?: PlatformStatus;
  readiness?: number;
  primaryCta?: { label: string; to: string; icon?: ReactNode };
  secondaryCta?: { label: string; to: string; icon?: ReactNode };
}) {
  return (
    <div className="rounded-2xl bg-card border shadow-soft overflow-hidden">
      <div
        className="p-6 grid lg:grid-cols-[1fr_auto] gap-6 items-start"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.95 0.04 150 / 0.5), oklch(0.97 0.02 150 / 0.25))",
        }}
      >
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[11px] uppercase tracking-wider text-primary mb-1.5 font-semibold">
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-foreground/80 max-w-2xl">{subtitle}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {projectName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background border px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {projectName}
              </span>
            )}
            {status && <StatusBadge status={status} />}
            {freshness && (
              <span>
                Datafriskhed <span className="text-foreground font-medium">{freshness}</span>
              </span>
            )}
            {typeof readiness === "number" && (
              <span>
                Rapportklarhed <span className="text-foreground font-medium">{readiness}%</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {secondaryCta && (
            <Link
              to={secondaryCta.to}
              className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted whitespace-nowrap"
            >
              {secondaryCta.icon} {secondaryCta.label}
            </Link>
          )}
          {primaryCta && (
            <Link
              to={primaryCta.to}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-soft hover:opacity-95 whitespace-nowrap"
            >
              {primaryCta.icon} {primaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* Cross-module mock action helper — gives users instant feedback */
export function actionToast(message: string, description?: string) {
  toast.success(message, { description });
}
