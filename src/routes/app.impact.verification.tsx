import { createFileRoute } from "@tanstack/react-router";
import {
  ShieldCheck,
  Loader2,
  CalendarClock,
  Database,
  ClipboardCheck,
  Layers3,
  FileSearch,
  ScrollText,
  Award,
  ShieldAlert,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ImpactMetricCard,
  VerificationBadge,
  DataQualityScore,
} from "@/components/impact/Primitives";
import { PROJECTS, AUDIT_EVENTS } from "@/lib/impact-data";

export const Route = createFileRoute("/app/impact/verification")({
  head: () => ({ meta: [{ title: "Verifikation — Impact Exchange" }] }),
  component: VerificationPage,
});

const STEPS = [
  { label: "Data indsamlet", icon: Database },
  { label: "Datakvalitet kontrolleret", icon: ClipboardCheck },
  { label: "Metodegrundlag vurderet", icon: Layers3 },
  { label: "Tredjepartsreview", icon: FileSearch },
  { label: "Audit trail oprettet", icon: ScrollText },
  { label: "Rapportklar", icon: Award },
];

function VerificationPage() {
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <ImpactMetricCard label="Verificerede projekter" value="20" icon={<ShieldCheck className="h-4 w-4" />} />
        <ImpactMetricCard label="Under verifikation" value="6" icon={<Loader2 className="h-4 w-4" />} />
        <ImpactMetricCard label="Planlagt" value="2" icon={<CalendarClock className="h-4 w-4" />} />
        <ImpactMetricCard label="Gennemsnitlig datakvalitet" value="92" unit="%" icon={<Database className="h-4 w-4" />} />
      </div>

      {/* Stepper */}
      <Card className="p-5">
        <div className="font-semibold mb-4">Verifikationsproces</div>
        <ol className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.label} className="rounded-xl border p-3 flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-leaf/20 text-primary grid place-items-center shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trin {i + 1}</div>
                  <div className="text-sm font-medium leading-tight">{s.label}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Verification table */}
      <Card className="overflow-hidden">
        <CardHeader title="Verifikationsstatus pr. projekt" subtitle="Reviews, frister og dokumentation" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Projekt</th>
              <th className="py-2">Status</th>
              <th className="py-2">Verifier</th>
              <th className="py-2 w-32">Datakvalitet</th>
              <th className="py-2">Sidste review</th>
              <th className="py-2">Næste review</th>
              <th className="py-2">Metode</th>
              <th className="py-2">Dokumenter</th>
              <th className="py-2">Ledger</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {PROJECTS.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 font-medium">{p.title}</td>
                <td><VerificationBadge status={p.verification} /></td>
                <td className="text-xs">{p.verifier}</td>
                <td className="pr-3"><DataQualityScore value={p.dataQuality} label="" /></td>
                <td className="text-xs text-muted-foreground">{p.lastReview}</td>
                <td className="text-xs text-muted-foreground">{p.nextReview}</td>
                <td className="text-xs">{p.standard}</td>
                <td><Pill>3 doc</Pill></td>
                <td className="text-xs text-muted-foreground">{p.ledgerId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Audit trail */}
        <Card className="lg:col-span-2">
          <CardHeader title="Audit trail · seneste hændelser" subtitle="Sporbart i ESG Ledger" />
          <ul className="px-5 pb-5 divide-y text-sm">
            {AUDIT_EVENTS.map((e, i) => (
              <li key={i} className="py-2.5 flex items-start gap-3">
                <div className="text-xs text-muted-foreground w-24 pt-0.5 tabular-nums">{e.date}</div>
                <ScrollText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">{e.what}</div>
                  <div className="text-xs text-muted-foreground">{e.project} · {e.who}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Standards */}
        <Card>
          <CardHeader title="Standarder & rammeværk" />
          <ul className="px-5 pb-5 grid gap-2 text-sm">
            {[
              ["CSRD / ESRS support", "E1 · E4"],
              ["GHG Protocol", "Scope 1 · 3"],
              ["Biodiversitetsindikatorer", "EU + Freyra"],
              ["Freyra-verifikationsmetode", "Intern v2"],
              ["Tredjepartsreview", "DNV · BV · Verra"],
              ["Ledger-baseret audit trail", "Aktiv"],
            ].map(([k, v]) => (
              <li key={k} className="rounded-lg border p-2.5 flex justify-between"><span>{k}</span><span className="text-muted-foreground text-xs">{v}</span></li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Risk and trust */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-warning/20 text-warning-foreground grid place-items-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Risiko og tillid</div>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Freyra skelner tydeligt mellem verificerede, estimerede og endnu ikke gennemgåede datapunkter.
              Konfidensniveauet på porteføljen er aktuelt 87%, baseret på datadækning, kildebredde og overensstemmelse
              mellem signaler.
            </p>
            <div className="grid sm:grid-cols-4 gap-3 mt-4 text-xs">
              <Cell label="Verificeret" value="74%" tone="success" />
              <Cell label="Estimeret" value="18%" tone="warning" />
              <Cell label="Mangler review" value="6%" tone="danger" />
              <Cell label="Datakonfidens" value="87%" tone="info" />
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "info" }) {
  const m = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-leaf/20 text-primary",
  };
  return (
    <div className={`rounded-lg p-3 ${m[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
