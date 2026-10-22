/**
 * ReportDoc — fælles designsystem for GoFreyras rapport-DOKUMENTER
 * (verifikationsrapporter, kunde-/ESG-rapporter). Ét visuelt sprog:
 * markant masthead, nummererede sektioner med ghost-tal, hero-nøgletal,
 * stat-tiles, hairline-tabeller og dokument-bjælker (CSS-barer der printer
 * skarpt). A4-printklar: sektioner bryder ikke midt over, skærm-chrome
 * skjules.
 *
 * Dataviz-regler (valideret palette #2563eb/#b45309/#059669 mod lys flade):
 * tynde marks (≤12px), afrundet dataende/kvadratisk baseline, tekst bærer
 * ALDRIG seriefarven — identitet kommer fra swatch/mark ved siden af.
 */
import type { ReactNode } from "react";

// Valideret dokument-palette (lys flade): serie 1/2/3.
export const DOC_BLAA = "#2563eb";
export const DOC_RAV = "#b45309";
export const DOC_GROEN = "#059669";

/* ── Dokumentflade ─────────────────────────────────────────────────────── */

export function ReportDoc({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          aside, header.app-topbar, nav { display: none !important; }
          .report-doc { max-width: none !important; box-shadow: none !important;
            border: none !important; padding: 0 !important; }
          .report-section { break-inside: avoid; }
          .report-pagebreak { break-before: page; }
        }
      `}</style>
      <article className="report-doc bg-card border rounded-2xl shadow-sm px-8 sm:px-12 py-10 space-y-9">
        {children}
      </article>
    </>
  );
}

/* ── Masthead ──────────────────────────────────────────────────────────── */

export function ReportMasthead({
  kicker,
  title,
  subtitle,
  meta,
  badge,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  badge?: ReactNode;
}) {
  return (
    <header className="report-section">
      <div className="h-1 w-16 rounded-full bg-primary" />
      <div className="mt-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold">
          {kicker}
        </div>
        {badge}
      </div>
      <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 text-base text-muted-foreground">{subtitle}</p>}
      {meta && meta.length > 0 && (
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-y py-3">
          {meta.map((m) => (
            <div key={m.label}>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {m.label}
              </dt>
              <dd className="text-sm font-medium mt-0.5">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/* ── Sektioner ─────────────────────────────────────────────────────────── */

export function ReportSection({
  title,
  intro,
  nr = null,
  children,
}: {
  title: string;
  intro?: string;
  /** Sektionsnummer ("01", "02" …) — udelades for unummererede afsnit. */
  nr?: number | null;
  children: ReactNode;
}) {
  return (
    <section className="report-section">
      <div className="flex items-baseline gap-3 border-b pb-2">
        {nr !== null && (
          <span
            aria-hidden
            className="text-3xl font-semibold leading-none text-primary/25 tabular-nums select-none"
          >
            {String(nr).padStart(2, "0")}
          </span>
        )}
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]">{title}</h2>
      </div>
      {intro && <p className="mt-2.5 text-xs text-muted-foreground max-w-2xl">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ── Figurer ───────────────────────────────────────────────────────────── */

/** Hero-tal — præcis ét pr. dokument (≥48px, samme sans som alt andet). */
export function ReportHero({
  label,
  value,
  unit,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  const toneCls = {
    default: "text-foreground",
    positive: "text-primary",
    warning: "text-amber-600",
    negative: "text-destructive",
  }[tone];
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-5xl font-semibold tracking-tight leading-none ${toneCls}`}>
          {value}
        </span>
        {unit && <span className="text-lg text-muted-foreground font-medium">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Stat-tile: label · værdi · under-linje. Værdien i proportionale cifre. */
export function ReportKpi({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tracking-tight ${accent ? "text-primary" : ""}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Meter: fyldet bærer tonen; sporet er et lysere trin af samme farve. */
export function ReportMeter({
  procent,
  tone = "default",
}: {
  procent: number;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  const fill = {
    default: "bg-foreground/70",
    positive: "bg-primary",
    warning: "bg-amber-500",
    negative: "bg-destructive",
  }[tone];
  const track = {
    default: "bg-foreground/10",
    positive: "bg-primary/15",
    warning: "bg-amber-500/15",
    negative: "bg-destructive/15",
  }[tone];
  return (
    <div className={`h-2 rounded-full overflow-hidden ${track}`}>
      <div
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${Math.max(0, Math.min(100, procent))}%` }}
      />
    </div>
  );
}

/* ── Dokument-bjælker (CSS — printer skarpt, ingen SVG-reflow) ─────────── */

export interface DocBarRow {
  label: string;
  /** 0–1 andel af bjælkens fulde bredde. */
  andel: number;
  /** Vist værdi ved dataenden (tekst-token, aldrig seriefarve). */
  vaerdi: string;
  farve: string;
  sub?: string;
}

/**
 * Vandrette dokument-bjælker: 12px tykke, afrundet dataende, kvadratisk
 * baseline, fælles nulpunkt. Identitet = swatch + label (aldrig farve alene).
 */
export function ReportBars({ rows }: { rows: DocBarRow[] }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label + r.sub} className="grid grid-cols-[minmax(7rem,12rem)_1fr] gap-3 items-center">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px] shrink-0"
              style={{ backgroundColor: r.farve }}
            />
            <span className="text-xs truncate" title={r.label}>
              {r.label}
              {r.sub && <span className="text-muted-foreground"> · {r.sub}</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 flex-1 rounded-r-[4px] bg-muted/60 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-r-[4px]"
                style={{
                  width: `${Math.max(0, Math.min(1, r.andel)) * 100}%`,
                  backgroundColor: r.farve,
                }}
              />
            </div>
            <span className="text-xs tabular-nums w-16 text-right shrink-0">{r.vaerdi}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tabel & nøgle/værdi ───────────────────────────────────────────────── */

export function ReportTable({
  head,
  rows,
  numericFra = 1,
}: {
  head: string[];
  rows: ReactNode[][];
  /** Kolonneindeks hvorfra celler er numeriske (højrestillet, tabular). */
  numericFra?: number;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          {head.map((h, i) => (
            <th
              key={h}
              className={`py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium ${
                i >= numericFra ? "text-right" : "text-left"
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/70">
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => (
              <td
                key={ci}
                className={`py-2 ${ci >= numericFra ? "text-right tabular-nums" : ""}`}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportKV({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid sm:grid-cols-2 gap-x-10">
      {items.map((it) => (
        <div key={it.label} className="flex justify-between gap-4 border-b border-border/70 py-2">
          <dt className="text-sm text-muted-foreground">{it.label}</dt>
          <dd className="text-sm font-medium text-right">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Note & footer ─────────────────────────────────────────────────────── */

export function ReportNote({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="report-section rounded-xl border-l-2 border-primary/50 bg-muted/25 px-5 py-4">
      {title && (
        <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1.5">
          {title}
        </div>
      )}
      <div className="text-xs leading-relaxed text-muted-foreground">{children}</div>
    </aside>
  );
}

export function ReportFooter({ children, brand }: { children: ReactNode; brand?: string }) {
  return (
    <footer className="report-section border-t pt-4 flex items-start justify-between gap-6">
      <p className="text-[11px] leading-relaxed text-muted-foreground italic max-w-2xl">
        {children}
      </p>
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold shrink-0">
        {brand ?? "GoFreyra"}
      </div>
    </footer>
  );
}
