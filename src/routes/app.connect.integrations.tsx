import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plug, CheckCircle2, AlertTriangle, KeyRound, AlertCircle, Activity, RefreshCw, FileText, Pause, Lock } from "lucide-react";
import { Card, PageHeader, Pill, Bars } from "@/components/ui-bits";
import { ConnectionHealthCard, Drawer, Section, Chip } from "@/components/connect/Primitives";
import { INTEGRATIONS } from "@/lib/connect-data";

export const Route = createFileRoute("/app/connect/integrations")({
  component: Page,
});

const ACTIVE = [
  { name: "MQTT Broker", type: "MQTT", project: "Skallebæk Biodiversity Pilot", status: "Aktiv", lastSync: "12 sek", auth: "TLS + token", volume: "12.4k msg/d", errors: 0, owner: "Mikkel Holm" },
  { name: "DMI Klima API", type: "REST API", project: "Nordic Coastal Restoration", status: "Aktiv", lastSync: "12 min", auth: "API key", volume: "248 req/d", errors: 0, owner: "Jesper Riel" },
  { name: "Sentinel Hub", type: "Satellite", project: "Urban Biodiversity Corridor", status: "Aktiv", lastSync: "6 t", auth: "OAuth 2.0", volume: "12 layers", errors: 0, owner: "Emma Larsen" },
  { name: "Airtable Bases", type: "Webhook", project: "Skallebæk Biodiversity Pilot", status: "Token udløber", lastSync: "1 t", auth: "OAuth (4 dage)", volume: "120 rows/d", errors: 0, owner: "Jesper Riel" },
  { name: "Chirpstack LNS", type: "LoRaWAN", project: "Skallebæk Biodiversity Pilot", status: "Aktiv", lastSync: "2 min", auth: "TLS cert", volume: "8 enheder", errors: 0, owner: "Mikkel Holm" },
  { name: "ERP — Microsoft Dynamics", type: "ERP", project: "Urban Water Quality Program", status: "Aktiv", lastSync: "30 min", auth: "Service principal", volume: "612 rows/d", errors: 0, owner: "Jesper Riel" },
  { name: "NB-IoT operatør", type: "NB-IoT", project: "Mangrove Restoration Indonesia", status: "Fejlet sync", lastSync: "2 t", auth: "API key", volume: "—", errors: 14, owner: "Mikkel Holm" },
  { name: "DNV verifier feed", type: "Tredjepart", project: "Mangrove Restoration Indonesia", status: "Aktiv", lastSync: "1 d", auth: "Signed JWT", volume: "1 doc/uge", errors: 0, owner: "Jesper Riel" },
];

function Page() {
  const [selected, setSelected] = useState<any>(null);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader title="Integrationer" description="Eksterne systemer, protokoller og API-forbindelser." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <ConnectionHealthCard label="Integrationer" value="18" icon={<Plug className="h-5 w-5" />} />
        <ConnectionHealthCard label="Aktive" value="14" tone="success" icon={<CheckCircle2 className="h-5 w-5" />} />
        <ConnectionHealthCard label="Kræver handling" value="2" tone="warning" icon={<AlertTriangle className="h-5 w-5" />} />
        <ConnectionHealthCard label="Token udløber" value="1" tone="warning" icon={<KeyRound className="h-5 w-5" />} />
        <ConnectionHealthCard label="Fejlet sync" value="1" tone="danger" icon={<AlertCircle className="h-5 w-5" />} />
      </div>

      <Section title="Integration marketplace" subtitle="Tilgængelige konnektorer og protokoller">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {INTEGRATIONS.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold">{i.id}</div>
                <Pill tone={i.status === "Aktiv" ? "success" : i.status === "Fejlet sync" ? "danger" : "warning"}>{i.status}</Pill>
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 min-h-[32px]">{i.desc}</div>
              <div className="mt-3 flex flex-wrap gap-1">{i.types.map((t) => <Chip key={t}>{t}</Chip>)}</div>
              <div className="mt-2 text-[11px] text-muted-foreground">Setup: {i.complexity}</div>
              <div className="mt-3 flex gap-1.5">
                <button className="flex-1 text-xs rounded-lg bg-primary text-primary-foreground py-1.5">Konfigurér</button>
                <button className="flex-1 text-xs rounded-lg border bg-card py-1.5">Test</button>
                <button className="flex-1 text-xs rounded-lg border bg-card py-1.5">Logs</button>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Integration</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sidste sync</th>
                <th className="px-4 py-3">Auth</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Fejl</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ACTIVE.map((a) => (
                <tr key={a.name} className="hover:bg-muted/40 cursor-pointer" onClick={() => setSelected(a)}>
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-xs"><Chip>{a.type}</Chip></td>
                  <td className="px-4 py-3 text-xs">{a.project}</td>
                  <td className="px-4 py-3"><Pill tone={a.status === "Aktiv" ? "success" : a.status === "Fejlet sync" ? "danger" : "warning"}>{a.status}</Pill></td>
                  <td className="px-4 py-3 text-xs">{a.lastSync}</td>
                  <td className="px-4 py-3 text-xs">{a.auth}</td>
                  <td className="px-4 py-3 text-xs">{a.volume}</td>
                  <td className="px-4 py-3 text-xs">{a.errors > 0 ? <span className="text-destructive">{a.errors}</span> : "0"}</td>
                  <td className="px-4 py-3 text-xs">{a.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="API health" subtitle="Uptime og latency sidste 24 t">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Uptime" value="99,98%" tone="success" />
            <Stat label="Latency p95" value="142 ms" />
            <Stat label="Fejlede req." value="14" tone="danger" />
          </div>
          <Bars data={[
            { label: "MQTT Broker", value: 100 },
            { label: "DMI Klima", value: 100 },
            { label: "Sentinel Hub", value: 99 },
            { label: "Chirpstack", value: 100 },
            { label: "NB-IoT operatør", value: 88 },
          ]} />
        </Section>

        <Card className="p-5 bg-leaf/10 border-primary/20">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Lock className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-semibold">Sikkerhed</div>
              <p className="text-sm text-foreground/90 mt-2">
                Smart Connect gemmer adgangsdata sikkert og viser kun forbindelsesstatus, mapping og audit-events i brugerfladen. Hemmelige nøgler, tokens og certifikater er aldrig synlige for brugere.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected?.type}
        footer={
          <>
            <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Test forbindelse</button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Opdater credentials</button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Se logs</button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"><Pause className="h-3.5 w-3.5" /> Pause</button>
          </>
        }
      >
        {selected && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV label="Endpoint" v={`mqtt://broker.freyra.io:8883`} />
              <KV label="Auth-metode" v={selected.auth} />
              <KV label="Sidste respons" v="200 OK" />
              <KV label="Sync-frekvens" v="Realtid" />
              <KV label="Volume" v={selected.volume} />
              <KV label="Fejl" v={selected.errors > 0 ? `${selected.errors} sidste 24 t` : "Ingen"} />
            </div>
            <Section title="Mappede felter">
              <ul className="text-xs space-y-1">
                <li>device_id → source_id</li>
                <li>ts → timestamp</li>
                <li>payload.value → value</li>
                <li>payload.unit → unit</li>
              </ul>
            </Section>
            <Section title="Destination">
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="primary">DecisionsIQ</Chip>
                <Chip tone="primary">ESG Ledger</Chip>
                <Chip>Reports</Chip>
              </div>
            </Section>
            <Section title="Sikkerhedsstatus">
              <ul className="text-xs space-y-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> TLS 1.3</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Token rotation aktiv</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Audit log aktiveret</li>
              </ul>
            </Section>
          </>
        )}
      </Drawer>
    </main>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "danger" }) {
  const c = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "";
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${c}`}>{value}</div>
    </div>
  );
}

function KV({ label, v }: { label: string; v: any }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
}
