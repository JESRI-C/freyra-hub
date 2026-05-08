import { createFileRoute } from "@tanstack/react-router";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, StatusPill } from "@/components/settings/Primitives";
import { MODULES } from "@/lib/settings-data";
import { Boxes, Settings as SettingsIcon, Users, Database, ArrowUpRight, Zap, Brain, Repeat2, BookCheck, Cable, FileText, KeyRound, ShieldCheck, Briefcase } from "lucide-react";

export const Route = createFileRoute("/app/settings/modules")({
  head: () => ({ meta: [{ title: "Moduler — GoFreyra" }] }),
  component: ModulesPage,
});

const ICONS: Record<string, any> = {
  decisions: Brain, impact: Repeat2, ledger: BookCheck, connect: Cable,
  reports: FileText, api: KeyRound, verify: ShieldCheck, portfolio: Briefcase,
};

function ModulesPage() {
  const active = MODULES.filter((m) => m.status === "Aktiv").length;
  const limited = MODULES.filter((m) => m.status === "Begrænset").length;
  const inactive = MODULES.filter((m) => m.status === "Ikke aktiv").length;

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary"><Boxes className="h-5 w-5" /></div>
        <div><h1 className="text-xl font-semibold">Moduler</h1><p className="text-xs text-muted-foreground">Aktive funktioner og adgang i din organisation</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Aktive moduler" value={String(active)} icon={<Boxes className="h-5 w-5" />} accent="bg-success/15 text-success" />
        <StatCard label="Begrænsede" value={String(limited)} icon={<Boxes className="h-5 w-5" />} accent="bg-warning/20 text-warning-foreground" />
        <StatCard label="Ikke aktive" value={String(inactive)} icon={<Boxes className="h-5 w-5" />} />
        <StatCard label="Plan" value="Professional" icon={<Zap className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {MODULES.map((m) => {
          const Icon = ICONS[m.key] ?? Boxes;
          const offline = m.status === "Ikke aktiv";
          return (
            <Card key={m.key} className={`p-5 ${offline ? "opacity-80" : ""}`}>
              <div className="flex items-start justify-between">
                <div className={`h-11 w-11 rounded-2xl grid place-items-center ${offline ? "bg-muted text-muted-foreground" : "bg-leaf/30 text-primary"}`}><Icon className="h-5 w-5" /></div>
                <StatusPill status={m.status} />
              </div>
              <div className="mt-3 text-base font-semibold">{m.name}</div>
              <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{m.desc}</p>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg border p-2"><div className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Brugere</div><div className="mt-0.5 font-medium tabular-nums">{m.users}</div></div>
                <div className="rounded-lg border p-2"><div className="text-muted-foreground flex items-center gap-1"><Database className="h-3 w-3" /> Data</div><div className="mt-0.5 font-medium truncate" title={m.data}>{m.data}</div></div>
                <div className="rounded-lg border p-2"><div className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Forbrug</div><div className="mt-0.5 font-medium truncate" title={m.usage}>{m.usage}</div></div>
              </div>

              {m.deps && (
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Afhænger af: {m.deps.map((d) => <span key={d} className="inline-block mr-1 px-1.5 py-0.5 rounded bg-muted">{d}</span>)}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                {offline ? (
                  <button className="flex-1 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs inline-flex items-center justify-center gap-1.5"><ArrowUpRight className="h-3.5 w-3.5" /> Opgradér</button>
                ) : (
                  <>
                    <button className="flex-1 rounded-lg border bg-card px-3 py-1.5 text-xs inline-flex items-center justify-center gap-1.5"><SettingsIcon className="h-3.5 w-3.5" /> Konfigurér</button>
                    <button className="flex-1 rounded-lg border bg-card px-3 py-1.5 text-xs inline-flex items-center justify-center gap-1.5"><Users className="h-3.5 w-3.5" /> Adgang</button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-5 bg-leaf/5 border-leaf/20">
        <div className="flex items-start gap-3">
          <ArrowUpRight className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold">Lås Portfolio Management op</div>
            <p className="text-xs text-muted-foreground mt-1">Aggregér performance på tværs af alle dine projekter, sammenlign porteføljer og generér samlede investorrapporter. Inkluderet i Enterprise-planen.</p>
          </div>
          <button className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm">Se Enterprise</button>
        </div>
      </Card>
    </main>
  );
}
