import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Database, Cog, User, Layers, ShieldCheck, AlertTriangle, RefreshCw, Send, FileSearch, History } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import {
  ConnectionHealthCard, DataQualityScore, DeviceStatusBadge, Drawer, Section, Chip,
} from "@/components/connect/Primitives";
import { DATA_SOURCES } from "@/lib/connect-data";

export const Route = createFileRoute("/app/connect/sources")({
  component: Page,
});

const CATS = [
  { name: "Sensorer", count: 14, q: 94, last: "2 min", status: "online" },
  { name: "Satellit", count: 6, q: 88, last: "6 t", status: "online" },
  { name: "Drone", count: 3, q: 71, last: "2 d", status: "attention" },
  { name: "Feltdata", count: 5, q: 82, last: "1 t", status: "partial" },
  { name: "API", count: 7, q: 96, last: "12 min", status: "online" },
  { name: "CSV", count: 3, q: 60, last: "Fejlet", status: "attention" },
  { name: "ERP", count: 2, q: 94, last: "30 min", status: "online" },
  { name: "ESG-system", count: 1, q: 92, last: "1 t", status: "online" },
  { name: "Tredjepartsverifikation", count: 1, q: 97, last: "1 d", status: "online" },
];

function Page() {
  const [selected, setSelected] = useState<typeof DATA_SOURCES[0] | null>(null);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader title="Datakilder" description="Alle fysiske og digitale kilder der fodrer platformen." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ConnectionHealthCard label="Datakilder" value="42" icon={<Database className="h-5 w-5" />} />
        <ConnectionHealthCard label="Automatiske" value="31" tone="success" icon={<Cog className="h-5 w-5" />} />
        <ConnectionHealthCard label="Manuelle" value="7" icon={<User className="h-5 w-5" />} />
        <ConnectionHealthCard label="Tredjeparts" value="4" icon={<Layers className="h-5 w-5" />} />
        <ConnectionHealthCard label="Datakvalitet" value="91%" tone="success" icon={<ShieldCheck className="h-5 w-5" />} />
        <ConnectionHealthCard label="Kræver validering" value="8" tone="warning" icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <Section title="Kategorier" subtitle="Distribution og sundhed på tværs af kildetyper">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {CATS.map((c) => (
            <div key={c.name} className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{c.name}</div>
                <DeviceStatusBadge status={c.status} />
              </div>
              <div className="mt-2 text-2xl font-semibold">{c.count}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Sidste sync {c.last}</span>
                <DataQualityScore score={c.q} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Kilde</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Metrics</th>
                <th className="px-4 py-3">Sidste sync</th>
                <th className="px-4 py-3">Frekvens</th>
                <th className="px-4 py-3">Kvalitet</th>
                <th className="px-4 py-3">Verifikation</th>
                <th className="px-4 py-3">Brugt af</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {DATA_SOURCES.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setSelected(s)}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-xs">{s.type}</td>
                  <td className="px-4 py-3 text-xs">{s.project}</td>
                  <td className="px-4 py-3 text-xs">{s.category}</td>
                  <td className="px-4 py-3 text-xs"><div className="flex flex-wrap gap-1">{s.metrics.map((m) => <Chip key={m}>{m}</Chip>)}</div></td>
                  <td className="px-4 py-3 text-xs">{s.lastSync}</td>
                  <td className="px-4 py-3 text-xs">{s.freq}</td>
                  <td className="px-4 py-3"><DataQualityScore score={s.quality} /></td>
                  <td className="px-4 py-3">{s.verified ? <Chip tone="primary">Verificeret</Chip> : <Chip>Ikke verificeret</Chip>}</td>
                  <td className="px-4 py-3 text-xs"><div className="flex flex-wrap gap-1">{s.usedBy.map((u) => <Chip key={u} tone="muted">{u}</Chip>)}</div></td>
                  <td className="px-4 py-3"><DeviceStatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-xs">{s.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Section title="Routing matrix" subtitle="Hvor data fra hver kilde lander">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-2">Kilde</th>
                <th className="px-4 py-2">DecisionsIQ</th>
                <th className="px-4 py-2">ESG Ledger</th>
                <th className="px-4 py-2">Impact Exchange</th>
                <th className="px-4 py-2">Reports</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {DATA_SOURCES.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-xs font-medium">{s.name}</td>
                  {["DecisionsIQ", "ESG Ledger", "Impact Exchange", "Reports"].map((m) => {
                    const used = s.usedBy.includes(m);
                    const blocked = !s.verified && (m === "ESG Ledger" || m === "Reports");
                    return (
                      <td key={m} className="px-4 py-2">
                        {used ? <Chip tone="primary">Connected</Chip> : blocked ? <Chip tone="muted">Blocked</Chip> : <Chip>Pending</Chip>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected?.type}
        footer={
          <>
            <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Validér datakilde</button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"><FileSearch className="h-3.5 w-3.5" /> Se feltmapping</button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Audit trail</button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send testdata</button>
          </>
        }
      >
        {selected && (
          <>
            <p className="text-sm text-muted-foreground">
              Kilden leverer {selected.metrics.join(", ").toLowerCase()} til projekt <strong>{selected.project}</strong> via {selected.type.toLowerCase()}.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV label="Owner" v={selected.owner} />
              <KV label="Frekvens" v={selected.freq} />
              <KV label="Sidste sync" v={selected.lastSync} />
              <KV label="Kvalitet" v={<DataQualityScore score={selected.quality} />} />
              <KV label="Status" v={<DeviceStatusBadge status={selected.status} />} />
              <KV label="Verifikation" v={selected.verified ? "Verificeret" : "Ikke verificeret"} />
            </div>
            <Section title="Feltmapping">
              <ul className="text-xs space-y-1.5">
                <li className="flex justify-between"><span>timestamp</span><Chip tone="primary">ISO-8601</Chip></li>
                <li className="flex justify-between"><span>location.lat / lon</span><Chip tone="primary">EPSG:4326</Chip></li>
                <li className="flex justify-between"><span>measurement</span><Chip tone="primary">enum</Chip></li>
                <li className="flex justify-between"><span>value</span><Chip tone="primary">float</Chip></li>
                <li className="flex justify-between"><span>unit</span><Chip>SI</Chip></li>
              </ul>
            </Section>
            <Section title="Brugt af moduler">
              <div className="flex flex-wrap gap-1.5">{selected.usedBy.map((u) => <Chip key={u} tone="primary">{u}</Chip>)}</div>
            </Section>
            <Section title="Seneste fejl">
              {selected.quality === 0 ? (
                <div className="text-xs text-destructive">Sidste import fejlede: kolonne <code>vendor_category</code> mangler.</div>
              ) : (
                <div className="text-xs text-muted-foreground">Ingen aktive fejl.</div>
              )}
            </Section>
          </>
        )}
      </Drawer>
    </main>
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
