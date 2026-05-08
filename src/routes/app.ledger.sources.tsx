import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plug,
  ShieldCheck,
  AlertTriangle,
  WifiOff,
  Database,
  Cpu,
  Cloud,
  FileSpreadsheet,
  ClipboardEdit,
  Satellite,
  Camera,
  Building2,
  ArrowRightLeft,
  Zap,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ESGMetricCard,
  VerificationStatusBadge,
  ReadinessScore,
  Drawer,
} from "@/components/ledger/Primitives";
import { DATA_SOURCES, getSource, type DataSource } from "@/lib/ledger-data";

export const Route = createFileRoute("/app/ledger/sources")({
  head: () => ({ meta: [{ title: "Datakilder — ESG Ledger" }] }),
  component: SourcesPage,
});

const TYPE_ICON: Record<DataSource["type"], typeof Plug> = {
  Sensor: Cpu,
  API: Cloud,
  "CSV upload": FileSpreadsheet,
  "Manual entry": ClipboardEdit,
  Satellit: Satellite,
  Drone: Camera,
  ERP: Building2,
  "Impact Exchange": ArrowRightLeft,
  "Smart Connect": Zap,
  Tredjepartsverifikation: ShieldCheck,
};

function SourcesPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("Alle");
  const open = openId ? getSource(openId) : null;

  const filtered = DATA_SOURCES.filter((s) => {
    if (filter === "Alle") return true;
    if (filter === "Aktiv") return s.status === "Aktiv";
    if (filter === "Kræver handling") return s.status === "Kræver handling";
    if (filter === "Offline") return s.status === "Offline";
    return true;
  });

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <ESGMetricCard label="Datakilder" value="24" icon={<Plug className="h-4 w-4" />} />
        <ESGMetricCard label="Verificerede" value="18" icon={<ShieldCheck className="h-4 w-4" />} tone="success" />
        <ESGMetricCard label="Kræver handling" value="4" icon={<AlertTriangle className="h-4 w-4" />} tone="warning" />
        <ESGMetricCard label="Offline" value="2" icon={<WifiOff className="h-4 w-4" />} tone="danger" />
        <ESGMetricCard label="Gns. datakvalitet" value="91" unit="%" icon={<Database className="h-4 w-4" />} />
      </div>

      {/* Quality checks */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ["Completeness", 92],
          ["Freshness", 88],
          ["Consistency", 90],
          ["Verification", 76],
          ["Traceability", 94],
        ].map(([l, v]) => (
          <Card key={l as string} className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{v}%</div>
            <div className="mt-2"><ReadinessScore label="" value={v as number} size="sm" /></div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {["Alle", "Aktiv", "Kræver handling", "Offline"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded-full border ${filter === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Datakilder" subtitle="Klik på en kilde for detaljer og audit" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Kilde</th>
              <th className="py-2">Type</th>
              <th className="py-2">Kategori</th>
              <th className="py-2">Projekt</th>
              <th className="py-2">Sidst sync</th>
              <th className="py-2">Status</th>
              <th className="py-2 w-28">Datakvalitet</th>
              <th className="py-2">Verifikation</th>
              <th className="py-2">Ansvarlig</th>
              <th className="py-2">Tilknyttet metrik</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => {
              const Icon = TYPE_ICON[s.type] ?? Plug;
              return (
                <tr key={s.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(s.id)}>
                  <td className="px-5 py-3 font-medium inline-flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" /> {s.name}
                  </td>
                  <td className="text-xs">{s.type}</td>
                  <td className="text-xs"><Pill>{s.category}</Pill></td>
                  <td className="text-xs">{s.project}</td>
                  <td className="text-xs text-muted-foreground">{s.lastSync}</td>
                  <td>
                    <Pill tone={s.status === "Aktiv" ? "success" : s.status === "Kræver handling" ? "warning" : "danger"}>
                      {s.status}
                    </Pill>
                  </td>
                  <td className="pr-3"><ReadinessScore label="" value={s.quality} size="sm" /></td>
                  <td><VerificationStatusBadge status={s.verification} /></td>
                  <td className="text-xs">{s.owner}</td>
                  <td className="text-xs text-muted-foreground">{s.metric}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* AI recommendation */}
      <Card className="p-5 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="font-semibold">Anbefalede nye datakilder</div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            For at hæve datadækningen til over 95% anbefales: tilføj <span className="text-foreground font-medium">leverandør-EPD-feed</span> (Scope 3),
            integrér <span className="text-foreground font-medium">spildevandstællere</span> i Vand-kategorien og aktivér
            <span className="text-foreground font-medium"> Smart Connect for affaldstransportør</span> for at erstatte CSV-uploads.
          </p>
        </div>
      </Card>

      {/* Drawer */}
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        subtitle={open ? `${open.type} · ${open.project}` : ""}
        footer={
          <div className="flex gap-2 flex-wrap justify-end">
            <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted">Test forbindelse</button>
            <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted">Validér datakilde</button>
            <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted">Se audit trail</button>
            <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted text-destructive">Deaktiver</button>
          </div>
        }
      >
        {open && (
          <div className="space-y-4 text-sm">
            <p className="text-foreground/85 leading-relaxed">{open.description}</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Tilknyttet metrik" value={open.metric} />
              <Stat label="Frekvens" value={open.frequency} />
              <Stat label="Sidst sync" value={open.lastSync} />
              <Stat label="Status" value={open.status} />
              <Stat label="Datakvalitet" value={`${open.quality}%`} />
              <Stat label="Verifikation" value={open.verification} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Kvalitetstjek</div>
              <ul className="rounded-xl border divide-y text-xs">
                <li className="px-3 py-2 flex justify-between"><span>Completeness</span><span className="text-success">OK</span></li>
                <li className="px-3 py-2 flex justify-between"><span>Freshness</span><span className={open.lastSync.includes("dage") ? "text-warning-foreground" : "text-success"}>{open.lastSync.includes("dage") ? "Forsinket" : "OK"}</span></li>
                <li className="px-3 py-2 flex justify-between"><span>Consistency</span><span className="text-success">OK</span></li>
                <li className="px-3 py-2 flex justify-between"><span>Traceability</span><span className="text-success">OK</span></li>
              </ul>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Audit-historik</div>
              <ul className="rounded-xl border divide-y text-xs">
                <li className="px-3 py-2 flex justify-between"><span>2026-05-06 · Synkroniseret</span><span className="text-muted-foreground">System</span></li>
                <li className="px-3 py-2 flex justify-between"><span>2026-04-12 · Validering</span><span className="text-muted-foreground">{open.owner}</span></li>
                <li className="px-3 py-2 flex justify-between"><span>2026-03-08 · Tilføjet</span><span className="text-muted-foreground">Jesper Riel</span></li>
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5 text-sm">{value}</div>
    </div>
  );
}
