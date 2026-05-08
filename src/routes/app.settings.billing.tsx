import { createFileRoute } from "@tanstack/react-router";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, StatusPill } from "@/components/settings/Primitives";
import { PLAN, USAGE, PLANS, INVOICES } from "@/lib/settings-data";
import { CreditCard, Zap, ArrowUpRight, Mail, FileText, Info, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/settings/billing")({
  head: () => ({ meta: [{ title: "Abonnement — GoFreyra" }] }),
  component: BillingPage,
});

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString("da-DK") : String(n);
}

function BillingPage() {
  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary"><CreditCard className="h-5 w-5" /></div>
        <div><h1 className="text-xl font-semibold">Abonnement</h1><p className="text-xs text-muted-foreground">Plan, forbrug og fremtidig fakturering</p></div>
      </div>

      <div className="rounded-xl border bg-leaf/5 p-3 text-xs flex gap-2 items-start">
        <Info className="h-4 w-4 text-primary mt-0.5" />
        <div>Betaling og fakturering aktiveres senere. Denne side viser den planlagte abonnementsstruktur og dit aktuelle forbrug.</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2 bg-gradient-to-br from-leaf/10 to-card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Aktuel plan</div>
              <div className="mt-1 text-2xl font-semibold">{PLAN.current}</div>
              <div className="text-sm text-muted-foreground mt-1">{PLAN.price} · Fornys {PLAN.renewal}</div>
            </div>
            <button className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm inline-flex items-center gap-2"><ArrowUpRight className="h-4 w-4" /> Opgradér</button>
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Mini label="Brugere" v="8 / 25" />
            <Mini label="Projekter" v="7 / 15" />
            <Mini label="Datakilder" v="42 / 100" />
            <Mini label="AI-credits" v="64 / 200" />
          </div>
        </Card>

        <Section title="Faktureringskontakt">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {PLAN.contact}</div>
            <div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" /> Faktura sendes som PDF</div>
            <div className="flex items-center gap-2"><CreditCard className="h-3.5 w-3.5 text-muted-foreground" /> Aktiveres senere — ingen kortdata påkrævet</div>
          </div>
          <div className="mt-3 flex gap-2"><button className="text-xs rounded-lg border bg-card px-3 py-1.5">Skift kontakt</button><button className="text-xs rounded-lg border bg-card px-3 py-1.5">Hent kontrakt</button></div>
        </Section>
      </div>

      <Section title="Forbrug denne måned" subtitle="Inkluderede limits og nuværende træk">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {USAGE.map((u) => {
            const pct = Math.round((u.used / u.limit) * 100);
            const tone = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-primary";
            return (
              <div key={u.label} className="rounded-2xl border p-4 bg-card">
                <div className="text-xs text-muted-foreground">{u.label}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <div className="text-xl font-semibold tabular-nums">{fmt(u.used)}{u.unit}</div>
                  <div className="text-xs text-muted-foreground">/ {fmt(u.limit)}{u.unit}</div>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${tone} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                <div className="mt-1.5 text-[11px] text-muted-foreground">{pct}% brugt</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Tilgængelige planer" subtitle="Sammenlign og vælg den rigtige plan">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((p) => (
            <div key={p.name} className={`rounded-2xl border p-5 flex flex-col ${p.current ? "border-primary bg-leaf/5 shadow-soft" : "bg-card"}`}>
              <div className="flex items-start justify-between">
                <div className="text-base font-semibold">{p.name}</div>
                {p.current && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground">Aktiv</span>}
              </div>
              <div className="mt-1 text-sm">{p.price}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{p.best}</div>
              <ul className="mt-3 space-y-1.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs"><CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 flex-shrink-0" /><span>{f}</span></li>
                ))}
              </ul>
              <button className={`mt-4 rounded-xl px-3 py-1.5 text-sm ${p.current ? "border bg-card" : "bg-primary text-primary-foreground"}`} disabled={p.current}>
                {p.current ? "Nuværende plan" : `Vælg ${p.name}`}
              </button>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Add-ons" subtitle="Udvid platformen efter behov" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { n: "Ekstra AI-credits", d: "100 ekstra AI-rapport credits / md.", p: "1.500 DKK" },
              { n: "Verifier-add-on", d: "Tredjepartsverifikation via DNV", p: "Pr. rapport" },
              { n: "Audit-pakke", d: "Komplet revisor-eksport", p: "Inkluderet i Enterprise" },
              { n: "Ekstra storage", d: "100 GB ekstra datalagring", p: "800 DKK / md." },
              { n: "White-label", d: "Egen branding på rapporter", p: "2.500 DKK / md." },
              { n: "SLA & support", d: "24/7 dedikeret support", p: "Tilpasset" },
            ].map((a) => (
              <div key={a.n} className="rounded-xl border p-3 flex flex-col">
                <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><div className="text-sm font-medium">{a.n}</div></div>
                <p className="text-xs text-muted-foreground mt-1 flex-1">{a.d}</p>
                <div className="mt-2 flex items-center justify-between"><span className="text-xs font-medium">{a.p}</span><button className="text-xs rounded-lg border bg-card px-2 py-1">Tilføj</button></div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Fakturahistorik" subtitle="Placeholder — fakturering aktiveres senere">
          <ul className="space-y-2">
            {INVOICES.map((i) => (
              <li key={i.no} className="flex items-center justify-between p-2.5 rounded-lg border">
                <div>
                  <div className="text-sm font-medium">{i.no}</div>
                  <div className="text-[11px] text-muted-foreground">{i.date} · {i.amount}</div>
                </div>
                <StatusPill status={i.status} />
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Mini({ label, v }: { label: string; v: string }) {
  return <div className="rounded-xl bg-card border p-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-semibold tabular-nums">{v}</div></div>;
}
