import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, Toggle, StatusPill, Drawer, Field, Select } from "@/components/settings/Primitives";
import { ALERT_RULES, type AlertRule } from "@/lib/settings-data";
import { Bell, Mail, MonitorSmartphone, Settings as SettingsIcon, Users } from "lucide-react";

export const Route = createFileRoute("/app/settings/notifications")({
  head: () => ({ meta: [{ title: "Notifikationer — GoFreyra" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const [rules, setRules] = useState(ALERT_RULES);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const setRule = (i: number, patch: Partial<AlertRule>) => setRules((rs) => rs.map((r, j) => j === i ? { ...r, ...patch } : r));

  const open = openIdx !== null ? rules[openIdx] : null;

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary"><Bell className="h-5 w-5" /></div>
        <div><h1 className="text-xl font-semibold">Notifikationer</h1><p className="text-xs text-muted-foreground">Administrér alarmer, rapporter og eskaleringer</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Aktive regler" value={String(rules.filter((r) => r.email || r.inApp).length)} icon={<Bell className="h-5 w-5" />} />
        <StatCard label="E-mail aktiveret" value={String(rules.filter((r) => r.email).length)} icon={<Mail className="h-5 w-5" />} />
        <StatCard label="In-app aktiveret" value={String(rules.filter((r) => r.inApp).length)} icon={<MonitorSmartphone className="h-5 w-5" />} />
        <StatCard label="Høj-prioritet regler" value={String(rules.filter((r) => r.severity === "Høj").length)} icon={<Bell className="h-5 w-5" />} accent="bg-destructive/15 text-destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Globale indstillinger" subtitle="Gælder for alle nye regler">
          <div className="space-y-3">
            <div className="flex items-center justify-between"><div className="text-sm">E-mail notifikationer</div><Toggle checked={true} /></div>
            <div className="flex items-center justify-between"><div className="text-sm">In-app notifikationer</div><Toggle checked={true} /></div>
            <div className="flex items-center justify-between"><div className="text-sm">Push på mobil</div><Toggle checked={false} /></div>
            <div className="flex items-center justify-between"><div className="text-sm">Daglig sammenfatning</div><Toggle checked={true} /></div>
            <div className="flex items-center justify-between"><div className="text-sm">Stille timer (22–07)</div><Toggle checked={true} /></div>
          </div>
        </Section>

        <Section title="Eskaleringsregler" subtitle="Når en alarm ikke håndteres" className="lg:col-span-2">
          <ol className="space-y-2">
            {[
              { t: 0, w: "Notificér ansvarlig (rolle-baseret)" },
              { t: 30, w: "Notificér Sustainability Manager" },
              { t: 60, w: "Notificér Admin og opret opgave i DecisionsIQ" },
              { t: 240, w: "Eskalér til organisationens hovedkontakt" },
            ].map((s) => (
              <li key={s.t} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="h-8 w-12 rounded-lg bg-leaf/20 text-primary grid place-items-center text-xs font-semibold">{s.t === 0 ? "0 min" : s.t < 60 ? `${s.t}m` : `${s.t / 60}t`}</div>
                <div className="text-sm flex-1">{s.w}</div>
                <Toggle checked={true} />
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b text-sm font-semibold">Alarm-regler</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>{["Alarm", "Modul", "Severity", "E-mail", "In-app", "Frekvens", "Modtagere", ""].map((h) => <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.key} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{r.label}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-xs px-2 py-0.5 rounded bg-muted">{r.module}</span></td>
                  <td className="px-4 py-2.5"><StatusPill status={r.severity} /></td>
                  <td className="px-4 py-2.5"><Toggle checked={r.email} onChange={(v) => setRule(i, { email: v })} /></td>
                  <td className="px-4 py-2.5"><Toggle checked={r.inApp} onChange={(v) => setRule(i, { inApp: v })} /></td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{r.frequency}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground"><Users className="h-3 w-3 inline mr-1" />{r.recipients}</td>
                  <td className="px-4 py-2.5"><button onClick={() => setOpenIdx(i)} className="text-xs rounded-lg border bg-card px-2 py-1 inline-flex items-center gap-1"><SettingsIcon className="h-3 w-3" /> Redigér</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer open={openIdx !== null} onClose={() => setOpenIdx(null)} title={open?.label ?? ""} subtitle={open ? `Modul: ${open.module}` : ""}
        footer={<><button onClick={() => setOpenIdx(null)} className="rounded-lg border bg-card px-3 py-1.5 text-sm">Annullér</button><button onClick={() => setOpenIdx(null)} className="ml-auto rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm">Gem regel</button></>}>
        {open && openIdx !== null && (
          <>
            <Field label="Navn" value={open.label} onChange={(v) => setRule(openIdx, { label: v })} />
            <Select label="Severity-tærskel" value={open.severity} options={["Lav", "Middel", "Høj"]} onChange={(v) => setRule(openIdx, { severity: v as any })} />
            <Select label="Frekvens" value={open.frequency} options={["Realtid", "Time", "Dag"]} onChange={(v) => setRule(openIdx, { frequency: v as any })} />
            <Field label="Modtagere (rolle eller e-mail)" value={open.recipients} onChange={(v) => setRule(openIdx, { recipients: v })} />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">E-mail</div><div className="text-sm">Send via mail</div></div><Toggle checked={open.email} onChange={(v) => setRule(openIdx, { email: v })} /></div>
              <div className="rounded-xl border p-3 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">In-app</div><div className="text-sm">Vis i platformen</div></div><Toggle checked={open.inApp} onChange={(v) => setRule(openIdx, { inApp: v })} /></div>
            </div>
            <div className="rounded-xl border bg-leaf/5 p-3 text-xs">Når denne regel udløses, registreres en hændelse i ESG Ledger og kan trigge eskalering jf. globale regler.</div>
          </>
        )}
      </Drawer>
    </main>
  );
}
