import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, Radio, AlertTriangle, ShieldCheck, Ban, Send } from "lucide-react";
import { Card, PageHeader, Pill } from "@/components/ui-bits";
import { ConnectionHealthCard, DataQualityScore, Drawer, MiniLine, Section, Chip } from "@/components/connect/Primitives";
import { LIVE_OBSERVATIONS, PROJECTS, MEASUREMENTS } from "@/lib/connect-data";

export const Route = createFileRoute("/app/connect/live")({
  component: Page,
});

function Page() {
  const [project, setProject] = useState<string>("Alle");
  const [measurement, setMeasurement] = useState<string>("Alle");
  const [status, setStatus] = useState<string>("Alle");
  const [selected, setSelected] = useState<any>(null);

  const filtered = useMemo(() => LIVE_OBSERVATIONS.filter((o) =>
    (project === "Alle" || o.project === project) &&
    (measurement === "Alle" || o.measurement === measurement) &&
    (status === "Alle" || o.status === status)
  ), [project, measurement, status]);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader title="Live data" description="Realtidsfeed af observationer fra alle kilder." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <ConnectionHealthCard label="Observationer i dag" value="1.284" icon={<Activity className="h-5 w-5" />} />
        <ConnectionHealthCard label="Aktive datastreams" value="42" tone="success" icon={<Radio className="h-5 w-5" />} />
        <ConnectionHealthCard label="Anomalier" value="6" tone="warning" icon={<AlertTriangle className="h-5 w-5" />} />
        <ConnectionHealthCard label="Valid data" value="91%" tone="success" icon={<ShieldCheck className="h-5 w-5" />} />
        <ConnectionHealthCard label="Blokeret" value="4" tone="danger" icon={<Ban className="h-5 w-5" />} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select label="Projekt" value={project} onChange={setProject} options={["Alle", ...PROJECTS]} />
          <Select label="Måling" value={measurement} onChange={setMeasurement} options={["Alle", ...MEASUREMENTS]} />
          <Select label="Status" value={status} onChange={setStatus} options={["Alle", "valid", "review", "blocked"]} />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Tid</th>
                <th className="px-4 py-3">Kilde</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Måling</th>
                <th className="px-4 py-3">Værdi</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Kvalitet</th>
                <th className="px-4 py-3">Routet til</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((o, i) => (
                <tr key={i} className="hover:bg-muted/40 cursor-pointer" onClick={() => setSelected(o)}>
                  <td className="px-4 py-3 text-xs tabular-nums">{o.ts}</td>
                  <td className="px-4 py-3 font-medium">{o.source}</td>
                  <td className="px-4 py-3 text-xs">{o.project}</td>
                  <td className="px-4 py-3 text-xs">{o.zone}</td>
                  <td className="px-4 py-3 text-xs">{o.measurement}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">{o.value} <span className="text-xs text-muted-foreground">{o.unit}</span></td>
                  <td className="px-4 py-3">
                    <Pill tone={o.status === "valid" ? "success" : o.status === "review" ? "warning" : "danger"}>
                      {o.status === "valid" ? "Valid" : o.status === "review" ? "Til review" : "Blokeret"}
                    </Pill>
                  </td>
                  <td className="px-4 py-3"><DataQualityScore score={o.quality} /></td>
                  <td className="px-4 py-3 text-xs"><div className="flex flex-wrap gap-1">{o.routedTo.length === 0 ? <Chip>—</Chip> : o.routedTo.map((r) => <Chip key={r} tone="primary">{r}</Chip>)}</div></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">Ingen observationer matcher filteret.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Anomalidetektion" subtitle="Automatisk fundne afvigelser">
          <ul className="text-sm space-y-2">
            {[
              "Usædvanlig vandstandsstigning på MNG-WATER-07",
              "Mangler data fra SKB-SOIL-02 i 25 min",
              "Turbiditet-spike i Zone A — 3× normalværdi",
              "Satellitlag forsinket — ny pass om 36 t",
              "Feltobservation 'Sumphøne' kræver review",
              "Drone overflight Q2 mangler EXIF GPS",
            ].map((t, i) => (
              <li key={i} className="flex gap-2 p-2.5 rounded-lg border bg-muted/30">
                <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5 flex-shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Måling over tid" subtitle="pH — SKB-WQ-01 sidste 24 t">
          <MiniLine values={[7.1, 7.2, 7.2, 7.3, 7.3, 7.4, 7.4, 7.4, 7.5, 7.4, 7.4, 7.3, 7.3, 7.4]} />
          <div className="mt-3 grid grid-cols-3 text-xs">
            <div><div className="text-muted-foreground">Min</div><div className="font-medium">7,1</div></div>
            <div><div className="text-muted-foreground">Maks</div><div className="font-medium">7,5</div></div>
            <div><div className="text-muted-foreground">Snit</div><div className="font-medium">7,3</div></div>
          </div>
        </Section>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.measurement} — ${selected.source}` : ""}
        subtitle={selected ? `${selected.ts} · ${selected.project}` : ""}
        footer={<>
          <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send til ESG Ledger</button>
          <button className="text-xs rounded-lg border bg-card px-3 py-1.5">Marker som valideret</button>
        </>}
      >
        {selected && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV label="Rå værdi" v={`${selected.value} ${selected.unit}`} />
              <KV label="Normaliseret" v={`${selected.value} ${selected.unit || "(SI)"}`} />
              <KV label="Datakilde" v={selected.source} />
              <KV label="Tid" v={selected.ts} />
              <KV label="Lokation" v={`${selected.project} · ${selected.zone}`} />
              <KV label="Datastream" v={`ds-${selected.measurement.toLowerCase()}`} />
              <KV label="Validering" v={selected.status === "valid" ? "OK" : selected.status === "review" ? "Manuelt review" : "Blokeret"} />
              <KV label="Konfidens" v={`${selected.quality}%`} />
            </div>
            <Section title="Routing">
              <div className="flex flex-wrap gap-1.5">
                {selected.routedTo.length === 0 ? <Chip>Ikke routet</Chip> : selected.routedTo.map((r: string) => <Chip key={r} tone="primary">{r}</Chip>)}
              </div>
            </Section>
            <Section title="Ledger event">
              <div className="text-xs font-mono bg-muted rounded-lg p-3">ledger://obs/{selected.source.toLowerCase()}/{selected.ts.replace(/:/g, "")}</div>
            </Section>
          </>
        )}
      </Drawer>
    </main>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="text-xs flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border bg-card px-2 py-1.5 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
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
