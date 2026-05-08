import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, StatusPill, Toggle } from "@/components/settings/Primitives";
import { API_KEYS, WEBHOOKS, SECURITY_EVENTS } from "@/lib/settings-data";
import { KeyRound, ShieldCheck, Plus, Copy, AlertTriangle, CheckCircle2, Webhook, Clock, RefreshCcw, Trash2, Lock } from "lucide-react";

export const Route = createFileRoute("/app/settings/security")({
  head: () => ({ meta: [{ title: "API & sikkerhed — GoFreyra" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const [retention, setRetention] = useState("365");
  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary"><KeyRound className="h-5 w-5" /></div>
        <div><h1 className="text-xl font-semibold">API & sikkerhed</h1><p className="text-xs text-muted-foreground">Nøgler, webhooks, sessioner og governance</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="2FA-dækning" value="6 / 8" icon={<ShieldCheck className="h-5 w-5" />} accent="bg-success/15 text-success" />
        <StatCard label="Aktive brugere" value="8" icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Mislykket login (30d)" value="3" icon={<AlertTriangle className="h-5 w-5" />} accent="bg-warning/20 text-warning-foreground" />
        <StatCard label="API-nøgler aktive" value="3" icon={<KeyRound className="h-5 w-5" />} />
        <StatCard label="Tokens udløber <30d" value="1" icon={<Clock className="h-5 w-5" />} accent="bg-warning/20 text-warning-foreground" />
        <StatCard label="Sikkerheds-alerts" value="1" icon={<AlertTriangle className="h-5 w-5" />} accent="bg-destructive/15 text-destructive" />
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div><div className="text-sm font-semibold">API-nøgler</div><div className="text-xs text-muted-foreground">Brug nøgler til at sende data ind eller hente rapporter ud</div></div>
          <button className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Generér nøgle</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>{["Navn", "Oprettet af", "Oprettet", "Senest brugt", "Scope", "Status", "Handlinger"].map((h) => <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {API_KEYS.map((k) => (
                <tr key={k.name} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{k.name}<div className="text-[11px] text-muted-foreground font-mono">sk_live_••••{k.name.length}3a9f</div></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{k.createdBy}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{k.created}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{k.lastUsed}</td>
                  <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded bg-muted font-mono">{k.scope}</span></td>
                  <td className="px-4 py-2.5"><StatusPill status={k.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button className="text-xs rounded-lg border bg-card p-1.5 hover:bg-muted"><Copy className="h-3 w-3" /></button>
                      <button className="text-xs rounded-lg border bg-card p-1.5 hover:bg-muted"><RefreshCcw className="h-3 w-3" /></button>
                      <button className="text-xs rounded-lg border bg-card p-1.5 hover:bg-muted text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div><div className="text-sm font-semibold">Webhooks</div><div className="text-xs text-muted-foreground">Send hændelser til eksterne systemer</div></div>
          <button className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Tilføj webhook</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>{["Navn", "Endpoint", "Event", "Status", "Senest leveret", "Fejl", ""].map((h) => <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {WEBHOOKS.map((w) => (
                <tr key={w.name} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium"><Webhook className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />{w.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground truncate max-w-[280px]">{w.endpoint}</td>
                  <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded bg-muted font-mono">{w.event}</span></td>
                  <td className="px-4 py-2.5"><StatusPill status={w.status} /></td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{w.lastDelivery}</td>
                  <td className="px-4 py-2.5"><span className={`text-xs tabular-nums ${w.errors > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>{w.errors}</span></td>
                  <td className="px-4 py-2.5"><button className="text-xs rounded-lg border bg-card px-2 py-1">Genprøv</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Sikkerhedshændelser" subtitle="Login og governance" className="lg:col-span-2">
          <ol className="space-y-2">
            {SECURITY_EVENTS.map((e, i) => (
              <li key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className={`h-8 w-8 rounded-lg grid place-items-center flex-shrink-0 ${e.tone === "warn" ? "bg-warning/20 text-warning-foreground" : "bg-success/15 text-success"}`}>
                  {e.tone === "warn" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm"><span className="font-medium">{e.who}</span> · {e.what}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{e.where}</div>
                </div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">{e.when}</div>
              </li>
            ))}
          </ol>
        </Section>

        <div className="space-y-6">
          <Section title="Sikkerhedsindstillinger">
            <div className="space-y-3">
              <div className="flex items-center justify-between"><div className="text-sm">Tving 2FA for alle</div><Toggle checked={true} /></div>
              <div className="flex items-center justify-between"><div className="text-sm">SSO (Microsoft / Google)</div><Toggle checked={false} /></div>
              <div className="flex items-center justify-between"><div className="text-sm">Bloker login uden for EU</div><Toggle checked={false} /></div>
              <div className="flex items-center justify-between"><div className="text-sm">Auto-logout efter 30 min</div><Toggle checked={true} /></div>
              <div className="flex items-center justify-between"><div className="text-sm">IP-allowlist for API</div><Toggle checked={true} /></div>
            </div>
          </Section>

          <Section title="Datalagring" subtitle="Hvor længe gemmes rådata">
            <label className="block">
              <div className="text-xs text-muted-foreground mb-1">Retention (dage)</div>
              <select value={retention} onChange={(e) => setRetention(e.target.value)} className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
                <option value="90">90 dage</option>
                <option value="365">365 dage</option>
                <option value="1825">5 år (CSRD)</option>
                <option value="3650">10 år (revision)</option>
              </select>
            </label>
            <div className="mt-3 rounded-lg border p-3 text-xs flex gap-2"><Lock className="h-3.5 w-3.5 text-primary mt-0.5" /><span>Audit trail og rapporter gemmes altid mindst 5 år iht. CSRD-krav.</span></div>
          </Section>
        </div>
      </div>
    </main>
  );
}
