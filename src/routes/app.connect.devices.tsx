import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Cpu,
  Wifi,
  BatteryLow,
  WifiOff,
  Network,
  Wrench,
  Sparkles,
  RefreshCw,
  Activity,
  Power,
  Send,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import {
  ConnectionHealthCard,
  DeviceStatusBadge,
  SignalStrengthIndicator,
  BatteryIndicator,
  DataQualityScore,
  Drawer,
  MiniLine,
  Section,
  Chip,
} from "@/components/connect/Primitives";
import { DEVICES } from "@/lib/connect-data";

export const Route = createFileRoute("/app/connect/devices")({
  component: Page,
});

function Page() {
  const [selected, setSelected] = useState<(typeof DEVICES)[0] | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? DEVICES : DEVICES.filter((d) => d.status === filter);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <PageHeader
        title="Enheder"
        description="Sensorer, gateways, kameraer, vejrstationer og akustiske monitorer."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ConnectionHealthCard label="Enheder" value="28" icon={<Cpu className="h-5 w-5" />} />
        <ConnectionHealthCard
          label="Online"
          value="23"
          tone="success"
          icon={<Wifi className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Lavt batteri"
          value="3"
          tone="warning"
          icon={<BatteryLow className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Offline"
          value="2"
          tone="danger"
          icon={<WifiOff className="h-5 w-5" />}
        />
        <ConnectionHealthCard label="Gateways" value="5" icon={<Network className="h-5 w-5" />} />
        <ConnectionHealthCard
          label="Firmware-opd."
          value="4"
          tone="warning"
          icon={<Wrench className="h-5 w-5" />}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-2">Filter:</span>
          {[
            ["all", "Alle"],
            ["online", "Online"],
            ["partial", "Delvist"],
            ["attention", "Kræver handling"],
            ["offline", "Offline"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Enhed</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Batteri</th>
                <th className="px-4 py-3">Signal</th>
                <th className="px-4 py-3">Sidste kontakt</th>
                <th className="px-4 py-3">Firmware</th>
                <th className="px-4 py-3">Aflæsning</th>
                <th className="px-4 py-3">Kvalitet</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => setSelected(d)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.id}</div>
                    <div className="text-xs text-muted-foreground">{d.name}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{d.type}</td>
                  <td className="px-4 py-3 text-xs">{d.project}</td>
                  <td className="px-4 py-3 text-xs">{d.zone}</td>
                  <td className="px-4 py-3">
                    <DeviceStatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    <BatteryIndicator level={d.battery} />
                  </td>
                  <td className="px-4 py-3">
                    <SignalStrengthIndicator level={d.signal} />
                  </td>
                  <td className="px-4 py-3 text-xs">{d.lastContact}</td>
                  <td className="px-4 py-3 text-xs">
                    <Chip>{d.firmware}</Chip>
                  </td>
                  <td className="px-4 py-3 text-xs">{d.lastReading}</td>
                  <td className="px-4 py-3">
                    <DataQualityScore score={d.quality} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Section title="AI vedligeholdelsesanbefalinger" subtitle="Prioritér service og kalibrering">
        <ul className="space-y-2 text-sm">
          <li className="flex gap-3 p-3 rounded-lg border bg-muted/30">
            <Sparkles className="h-4 w-4 text-primary mt-0.5" />
            <div>
              <strong>SKB-GW-03</strong> — Kontrollér strømforsyning og LoRaWAN backhaul. Offline i
              3 timer påvirker 6 underliggende sensorer.
            </div>
          </li>
          <li className="flex gap-3 p-3 rounded-lg border bg-muted/30">
            <Sparkles className="h-4 w-4 text-primary mt-0.5" />
            <div>
              <strong>WET-CAM-02</strong> — Batteri 18%. Planlæg fysisk besøg inden for 5 dage for
              at undgå datatab i Zone D.
            </div>
          </li>
          <li className="flex gap-3 p-3 rounded-lg border bg-muted/30">
            <Sparkles className="h-4 w-4 text-primary mt-0.5" />
            <div>
              <strong>SKB-WQ-01</strong> — 6-måneders kalibreringsvindue nås om 14 dage. Bestil
              kalibreringskit nu.
            </div>
          </li>
        </ul>
      </Section>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.id ?? ""}
        subtitle={selected?.name}
        footer={
          <>
            <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Test forbindelse
            </button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Se live data
            </button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Planlæg service
            </button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" /> Send til ESG Ledger
            </button>
            <button className="text-xs rounded-lg border bg-card text-destructive px-3 py-1.5 inline-flex items-center gap-1.5">
              <Power className="h-3.5 w-3.5" /> Deaktiver
            </button>
          </>
        }
      >
        {selected && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <KV label="Status" v={<DeviceStatusBadge status={selected.status} />} />
              <KV label="Datakvalitet" v={<DataQualityScore score={selected.quality} />} />
              <KV label="Projekt" v={selected.project} />
              <KV label="Zone" v={selected.zone} />
              <KV label="Forbindelse" v={selected.conn} />
              <KV label="Firmware" v={selected.firmware} />
              <KV label="Batteri" v={<BatteryIndicator level={selected.battery} />} />
              <KV label="Signal" v={<SignalStrengthIndicator level={selected.signal} />} />
              <KV label="Sidste kontakt" v={selected.lastContact} />
              <KV label="Sidste aflæsning" v={selected.lastReading} />
            </div>
            <Section title="Batteri & signal trend" subtitle="Sidste 14 dage">
              <MiniLine
                values={[80, 78, 75, 73, 71, 70, 68, 66, 65, 63, 60, 58, 56, selected.battery]}
              />
            </Section>
            <Section title="Linkede datastreams">
              <ul className="text-sm space-y-1.5">
                <li className="flex justify-between">
                  <span>Datastream — pH</span>
                  <Chip tone="primary">aktiv</Chip>
                </li>
                <li className="flex justify-between">
                  <span>Datastream — Temperatur</span>
                  <Chip tone="primary">aktiv</Chip>
                </li>
                <li className="flex justify-between">
                  <span>Datastream — Turbiditet</span>
                  <Chip>pauset</Chip>
                </li>
              </ul>
            </Section>
            <Section title="Audit historie">
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>11:52 — Aflæsning modtaget · pH 7,4</li>
                <li>09:14 — Firmware-status synkroniseret</li>
                <li>I går — Forbindelsestest gennemført</li>
                <li>For 3 dage siden — Routet til ESG Ledger</li>
              </ul>
            </Section>
          </>
        )}
      </Drawer>
    </main>
  );
}

function KV({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
}
