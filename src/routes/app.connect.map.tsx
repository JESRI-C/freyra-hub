import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, AlertTriangle, Layers as LayersIcon } from "lucide-react";
import { Card, PageHeader, Bars } from "@/components/ui-bits";
import { Drawer, Section, Chip, DataQualityScore } from "@/components/connect/Primitives";
import { ZONES_DETAIL } from "@/lib/connect-data";

export const Route = createFileRoute("/app/connect/map")({
  component: Page,
});

const LAYERS = [
  "Sensorer", "Gateways", "Satellit NDVI", "Drone coverage",
  "Feltobservationer", "Vandmålinger", "Jordmålinger", "Habitat score", "Data gaps", "Alerts",
];

function Page() {
  const [active, setActive] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map((l) => [l, ["Sensorer", "Gateways", "Satellit NDVI", "Data gaps"].includes(l)]))
  );
  const [zone, setZone] = useState<typeof ZONES_DETAIL[0] | null>(null);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader
        title="Kort & zoner"
        description="Geospatial dækning, devices, zoner og data-huller — Skallebæk Biodiversity Pilot."
      />

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="relative h-[420px] bg-gradient-to-br from-leaf/30 via-card to-leaf/10">
            {/* Pseudo-map */}
            <svg viewBox="0 0 600 400" className="w-full h-full">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.06" />
                </pattern>
              </defs>
              <rect width="600" height="400" fill="url(#grid)" />
              {/* Project boundary */}
              <path d="M60,60 L520,80 L540,300 L80,340 Z" fill="hsl(var(--primary)/0.05)" stroke="hsl(var(--primary))" strokeDasharray="6 4" strokeWidth="2" />
              {/* Zones */}
              <path d="M60,60 L260,70 L240,200 L80,210 Z" fill="hsl(var(--primary)/0.12)" />
              <text x="120" y="130" className="fill-foreground" fontSize="11">Zone A — Vandløb</text>
              <path d="M260,70 L520,80 L500,210 L240,200 Z" fill="hsl(var(--primary)/0.08)" />
              <text x="340" y="140" className="fill-foreground" fontSize="11">Zone B — Eng & vådområde</text>
              <path d="M80,210 L300,205 L280,340 L100,335 Z" fill="hsl(var(--primary)/0.06)" />
              <text x="140" y="280" className="fill-foreground" fontSize="11">Zone C — Skovkant</text>
              <path d="M300,205 L500,210 L520,300 L290,330 Z" fill="hsl(var(--primary)/0.04)" />
              <text x="370" y="270" className="fill-foreground" fontSize="11">Zone D — Buffer</text>

              {/* Sensors */}
              {active["Sensorer"] && [[140, 110], [200, 160], [380, 130], [420, 180], [180, 250], [340, 280]].map(([x, y], i) => (
                <g key={`s${i}`}><circle cx={x} cy={y} r="6" fill="hsl(var(--primary))" /><circle cx={x} cy={y} r="10" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.3" /></g>
              ))}
              {/* Gateway */}
              {active["Gateways"] && (
                <g><rect x={290} y={170} width="14" height="14" fill="hsl(var(--destructive))" /><text x={310} y={182} fontSize="10" className="fill-destructive">GW-03 offline</text></g>
              )}
              {/* Field obs */}
              {active["Feltobservationer"] && [[160, 290], [220, 310]].map(([x, y], i) => <polygon key={`f${i}`} points={`${x},${y - 7} ${x + 6},${y + 5} ${x - 6},${y + 5}`} fill="hsl(var(--leaf))" />)}
              {/* Data gaps */}
              {active["Data gaps"] && (
                <g><rect x={420} y={235} width="80" height="60" fill="hsl(var(--destructive)/0.15)" stroke="hsl(var(--destructive))" strokeDasharray="4 3" /><text x={428} y={270} fontSize="10" className="fill-destructive">Data gap</text></g>
              )}
            </svg>
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-xs bg-card/90 border rounded-full px-2.5 py-1">
              <MapPin className="h-3 w-3 text-primary" /> Skallebæk Biodiversity Pilot · 7,3 ha
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><LayersIcon className="h-4 w-4" /> Lag</div>
          <ul className="space-y-1.5">
            {LAYERS.map((l) => (
              <li key={l}>
                <label className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-muted cursor-pointer">
                  <input type="checkbox" checked={active[l]} onChange={(e) => setActive({ ...active, [l]: e.target.checked })} />
                  <span className="flex-1">{l}</span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Section title="Zoner" subtitle="Klik for detaljer">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ZONES_DETAIL.map((z) => (
            <button key={z.name} onClick={() => setZone(z)} className="text-left rounded-xl border bg-card p-4 hover:shadow-soft transition">
              <div className="text-sm font-semibold">{z.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{z.area} · {z.sources} kilder</div>
              <div className="mt-3 flex items-center justify-between">
                <DataQualityScore score={z.quality} />
                <Chip tone={z.risk === "Lav" ? "primary" : "muted"}>Risiko: {z.risk}</Chip>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">Sidste obs.: {z.lastObs} · Biodiversitet: {z.biodiv}</div>
            </button>
          ))}
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Dækningsanalyse" subtitle="Procent af projektareal med data">
          <Bars data={[
            { label: "Sensorer", value: 78 },
            { label: "Satellit", value: 96 },
            { label: "Drone", value: 64 },
            { label: "Feltdata", value: 52 },
            { label: "Manglende", value: 14 },
          ]} />
        </Section>

        <Section title="Geospatiale alerts">
          <ul className="text-sm space-y-2">
            {[
              "Zone C mangler feltobservationer i 8 dage",
              "Drone coverage mangler i nordøstligt hjørne",
              "Vandmåler tæt på projektgrænse sender ustabile værdier",
              "Satellitlag viser ændring i vegetationsindeks i Zone B",
            ].map((t, i) => (
              <li key={i} className="flex gap-2 p-2.5 rounded-lg border bg-muted/30">
                <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5" /> {t}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Drawer open={!!zone} onClose={() => setZone(null)} title={zone?.name ?? ""} subtitle={zone?.area}>
        {zone && (
          <>
            <p className="text-sm text-muted-foreground">Zonen er en del af Skallebæk Biodiversity Pilot og dækker {zone.area} med {zone.sources} aktive datakilder.</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV label="Datakvalitet" v={<DataQualityScore score={zone.quality} />} />
              <KV label="Sidste observation" v={zone.lastObs} />
              <KV label="Biodiversitet" v={zone.biodiv} />
              <KV label="Risikostatus" v={zone.risk} />
            </div>
            <Section title="Linkede kilder">
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="primary">SKB-WQ-01</Chip>
                <Chip tone="primary">SKB-SOIL-02</Chip>
                <Chip tone="primary">Sentinel-2 NDVI</Chip>
                <Chip>Field App</Chip>
              </div>
            </Section>
            <Section title="Relateret">
              <ul className="text-xs space-y-1">
                <li>ESG-metric: Habitat condition score</li>
                <li>Impact Exchange: Skallebæk Biodiversity Pilot</li>
                <li>DecisionsIQ anbefaling: "Øg overvågning i Zone C"</li>
              </ul>
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
