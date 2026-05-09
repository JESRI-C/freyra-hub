import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Cloud, Plug, Droplets, Trash2, Sprout, Sparkles, FileText, Database } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ESGMetricCard,
  LineChart,
  Donut,
  MiniSpark,
  VerificationStatusBadge,
  ReportingStatusPill,
  ReadinessScore,
  Drawer,
} from "@/components/ledger/Primitives";
import { METRICS, getMetric } from "@/lib/ledger-data";

export const Route = createFileRoute("/app/ledger/metrics")({
  head: () => ({ meta: [{ title: "ESG-metrics — ESG Ledger" }] }),
  component: MetricsPage,
});

function MetricsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? getMetric(openId) : null;

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      {/* Dashboard cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ESGMetricCard
          label="Total CO₂e"
          value="41.200"
          unit="t"
          trend={-8}
          icon={<Cloud className="h-4 w-4" />}
        />
        <ESGMetricCard
          label="Energiforbrug"
          value="14.820"
          unit="MWh"
          trend={-7}
          icon={<Plug className="h-4 w-4" />}
        />
        <ESGMetricCard
          label="Vandforbrug"
          value="38.400"
          unit="m³"
          trend={2}
          icon={<Droplets className="h-4 w-4" />}
          tone="warning"
        />
        <ESGMetricCard
          label="Affald"
          value="412"
          unit="t"
          trend={-11}
          icon={<Trash2 className="h-4 w-4" />}
        />
        <ESGMetricCard
          label="Biodiversitetsindeks"
          value="78"
          unit="/100"
          trend={6}
          icon={<Sprout className="h-4 w-4" />}
          tone="success"
        />
        <ESGMetricCard
          label="Naturimpact score"
          value="71"
          unit="/100"
          trend={4}
          icon={<Sprout className="h-4 w-4" />}
        />
        <ESGMetricCard
          label="Datadækning"
          value="91"
          unit="%"
          trend={3}
          icon={<Database className="h-4 w-4" />}
        />
        <ESGMetricCard
          label="Verifikationsniveau"
          value="74"
          unit="%"
          trend={5}
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Tendens — udvalgte metrikker" subtitle="Seneste 6 måneder" />
          <div className="px-5 pb-5">
            <LineChart
              series={[
                { label: "CO₂e", values: [48, 47, 46, 44, 43, 41], color: "oklch(0.5 0.13 155)" },
                {
                  label: "Energi",
                  values: [16.2, 15.9, 15.4, 15.1, 14.9, 14.82],
                  color: "oklch(0.78 0.14 75)",
                },
                {
                  label: "Vand",
                  values: [36, 36.5, 37, 37.4, 37.9, 38.4],
                  color: "oklch(0.5 0.13 220)",
                },
                {
                  label: "Biodiversitet",
                  values: [70, 72, 73, 75, 76, 78],
                  color: "oklch(0.65 0.15 150)",
                },
              ]}
            />
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
              <Legend color="oklch(0.5 0.13 155)" label="CO₂e (kt)" />
              <Legend color="oklch(0.78 0.14 75)" label="Energi (kMWh)" />
              <Legend color="oklch(0.5 0.13 220)" label="Vand (km³)" />
              <Legend color="oklch(0.65 0.15 150)" label="Biodiversitet" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Affald pr. fraktion" />
          <div className="px-5 pb-5">
            <Donut
              centerLabel="Total"
              centerValue="412 t"
              segments={[
                { label: "Genanvendelse", value: 218, color: "oklch(0.65 0.15 150)" },
                { label: "Forbrænding", value: 122, color: "oklch(0.78 0.14 75)" },
                { label: "Deponi", value: 48, color: "oklch(0.7 0.02 160)" },
                { label: "Farligt", value: 24, color: "oklch(0.6 0.21 25)" },
              ]}
            />
          </div>
        </Card>
      </div>

      {/* Metrics table */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Alle ESG-metrikker"
          subtitle="Klik på en metrik for detaljer og audit-events"
        />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Metrik</th>
              <th className="py-2">Kategori</th>
              <th className="py-2 text-right">Værdi</th>
              <th className="py-2">Enhed</th>
              <th className="py-2">Trend</th>
              <th className="py-2">Datakilde</th>
              <th className="py-2 w-24">Konfidens</th>
              <th className="py-2">Verifikation</th>
              <th className="py-2">Rapportering</th>
              <th className="py-2">Ansvarlig</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {METRICS.map((m) => (
              <tr
                key={m.id}
                className="hover:bg-muted/30 cursor-pointer"
                onClick={() => setOpenId(m.id)}
              >
                <td className="px-5 py-3 font-medium">{m.name}</td>
                <td>
                  <Pill>{m.category}</Pill>
                </td>
                <td className="text-right tabular-nums">{m.value.toLocaleString("da-DK")}</td>
                <td className="text-xs">{m.unit}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <MiniSpark
                      values={m.trendValues}
                      color={m.trendPct >= 0 ? "var(--leaf)" : "oklch(0.5 0.13 155)"}
                    />
                    <span
                      className={`text-xs tabular-nums ${m.trendPct >= 0 ? "text-success" : "text-success"}`}
                    >
                      {m.trendPct > 0 ? "+" : ""}
                      {m.trendPct}%
                    </span>
                  </div>
                </td>
                <td className="text-xs text-muted-foreground">{m.source}</td>
                <td className="pr-3">
                  <ReadinessScore label="" value={m.confidence} size="sm" />
                </td>
                <td>
                  <VerificationStatusBadge status={m.verification} />
                </td>
                <td>
                  <ReportingStatusPill status={m.reporting} />
                </td>
                <td className="text-xs">{m.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ESG breakdown */}
      <Card>
        <CardHeader title="ESG-score — bidrag" subtitle="Sådan er 82/100 sammensat" />
        <div className="px-5 pb-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
          {[
            ["Klima", 22, 25],
            ["Miljø", 14, 20],
            ["Biodiversitet", 13, 15],
            ["Datakvalitet", 14, 15],
            ["Governance", 11, 15],
            ["Dokumentation", 8, 10],
          ].map(([l, v, max]) => (
            <div key={l as string}>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{l}</span>
                <span className="font-medium tabular-nums">
                  {v} / {max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                <div
                  className="h-full bg-leaf"
                  style={{ width: `${((v as number) / (max as number)) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Drawer */}
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        subtitle={open ? `${open.category} · opdateret ${open.lastUpdated}` : ""}
        footer={
          <div className="flex gap-2 justify-end">
            <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted">
              Se i audit trail
            </button>
            <button className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2">
              Anvend i rapport
            </button>
          </div>
        }
      >
        {open && (
          <div className="space-y-4 text-sm">
            <Field k="Aktuel værdi" v={`${open.value.toLocaleString("da-DK")} ${open.unit}`} />
            <Field k="Definition" v={open.definition} />
            <Field k="Beregningsmetode" v={open.method} />
            <Field k="Datakilder" v={open.source} />
            <Field k="Konfidens" v={`${open.confidence}%`} />
            <Field k="Verifikation" v={open.verification} />
            <Field k="Dokumentationsstatus" v={open.reporting} />
            <Field k="Ansvarlig" v={open.owner} />
            <div>
              <div className="text-xs text-muted-foreground mb-1">Audit-events</div>
              <ul className="rounded-xl border divide-y text-xs">
                <li className="px-3 py-2 flex justify-between">
                  <span>Senest opdateret</span>
                  <span className="text-muted-foreground">{open.lastUpdated}</span>
                </li>
                <li className="px-3 py-2 flex justify-between">
                  <span>Sidst valideret</span>
                  <span className="text-muted-foreground">2026-05-04</span>
                </li>
                <li className="px-3 py-2 flex justify-between">
                  <span>Anvendt i rapport</span>
                  <span className="text-muted-foreground">ESG-bilag Q1 2026</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border p-3 flex items-start gap-2.5 bg-leaf/10">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-medium">Anbefalet forbedring</div>
                <div className="text-muted-foreground mt-0.5">
                  Tilføj manuel feltvalidering for at hæve konfidens over 90%.
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </main>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
