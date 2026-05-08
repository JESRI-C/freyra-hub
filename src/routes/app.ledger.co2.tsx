import { createFileRoute } from "@tanstack/react-router";
import { Cloud, TrendingDown, ShieldCheck, Send, Download, ClipboardCheck, AlertTriangle } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ESGMetricCard,
  Donut,
  LineChart,
  VerificationStatusBadge,
  ReadinessScore,
} from "@/components/ledger/Primitives";
import { EMISSION_SOURCES } from "@/lib/ledger-data";

export const Route = createFileRoute("/app/ledger/co2")({
  head: () => ({ meta: [{ title: "CO₂-regnskab — ESG Ledger" }] }),
  component: CO2Page,
});

function CO2Page() {
  const scope1 = EMISSION_SOURCES.filter((e) => e.scope === 1).reduce((s, e) => s + Math.max(e.co2e, 0), 0);
  const scope2 = EMISSION_SOURCES.filter((e) => e.scope === 2).reduce((s, e) => s + Math.max(e.co2e, 0), 0);
  const scope3 = EMISSION_SOURCES.filter((e) => e.scope === 3).reduce((s, e) => s + Math.max(e.co2e, 0), 0);
  const offsets = Math.abs(EMISSION_SOURCES.filter((e) => e.co2e < 0).reduce((s, e) => s + e.co2e, 0));
  const total = scope1 + scope2 + scope3 - offsets;

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <ESGMetricCard label="Total CO₂e (netto)" value={(total / 1000).toFixed(1)} unit="kt" trend={-8} icon={<Cloud className="h-4 w-4" />} hint="Efter dokumenterede reduktioner" />
        <ESGMetricCard label="Scope 1" value={(scope1).toLocaleString("da-DK")} unit="t" trend={-5} icon={<Cloud className="h-4 w-4" />} />
        <ESGMetricCard label="Scope 2" value={(scope2).toLocaleString("da-DK")} unit="t" trend={-12} icon={<Cloud className="h-4 w-4" />} />
        <ESGMetricCard label="Scope 3" value={(scope3).toLocaleString("da-DK")} unit="t" trend={-3} icon={<Cloud className="h-4 w-4" />} tone="warning" />
        <ESGMetricCard label="Reduktion vs. baseline" value="-21" unit="%" trend={4} icon={<TrendingDown className="h-4 w-4" />} tone="success" hint="Mål 2030: -42%" />
        <ESGMetricCard label="Datakonfidens" value="84" unit="%" trend={3} icon={<ClipboardCheck className="h-4 w-4" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Scope donut */}
        <Card>
          <CardHeader title="Scope-fordeling" subtitle="Bruttoemissioner før reduktioner" />
          <div className="px-5 pb-5">
            <Donut
              centerLabel="Brutto"
              centerValue={`${((scope1 + scope2 + scope3) / 1000).toFixed(1)} kt`}
              segments={[
                { label: "Scope 1", value: scope1, color: "oklch(0.5 0.13 155)" },
                { label: "Scope 2", value: scope2, color: "oklch(0.65 0.15 150)" },
                { label: "Scope 3", value: scope3, color: "oklch(0.78 0.14 75)" },
              ]}
            />
          </div>
        </Card>

        {/* Baseline comparison */}
        <Card className="lg:col-span-2">
          <CardHeader title="Baseline vs. aktuel" subtitle="Fremgang mod 2030-mål" />
          <div className="px-5 pb-5">
            <LineChart
              series={[
                { label: "Baseline-bane", values: [60, 58, 55, 52, 49, 46], color: "oklch(0.7 0.02 160)" },
                { label: "Mål-bane", values: [60, 56, 51, 46, 41, 36], color: "oklch(0.65 0.15 150)" },
                { label: "Aktuel", values: [60, 55, 50, 47, 44, 41], color: "oklch(0.5 0.13 155)" },
              ]}
            />
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.7 0.02 160)" }} />Baseline 2020</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.65 0.15 150)" }} />Mål-bane (-42% i 2030)</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.5 0.13 155)" }} />Aktuel udvikling</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Emission sources */}
      <Card className="overflow-hidden">
        <CardHeader title="Emissionskilder" subtitle="Aktivitet × emissionsfaktor → CO₂e" />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Kilde</th>
              <th className="py-2">Scope</th>
              <th className="py-2 text-right">Aktivitet</th>
              <th className="py-2">Enhed</th>
              <th className="py-2 text-right">Faktor</th>
              <th className="py-2">Faktor-enhed</th>
              <th className="py-2 text-right">CO₂e (t)</th>
              <th className="py-2">Metode</th>
              <th className="py-2 w-24">Kvalitet</th>
              <th className="py-2">Verifikation</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {EMISSION_SOURCES.map((e) => (
              <tr key={e.id} className={e.co2e < 0 ? "bg-success/5" : ""}>
                <td className="px-5 py-3 font-medium">{e.source}</td>
                <td><Pill>Scope {e.scope}</Pill></td>
                <td className="text-right tabular-nums">{e.activity.toLocaleString("da-DK")}</td>
                <td className="text-xs">{e.unit}</td>
                <td className="text-right tabular-nums">{e.factor}</td>
                <td className="text-xs text-muted-foreground">{e.factorUnit}</td>
                <td className={`text-right tabular-nums font-medium ${e.co2e < 0 ? "text-success" : ""}`}>
                  {e.co2e.toLocaleString("da-DK")}
                </td>
                <td className="text-xs">{e.method}</td>
                <td className="pr-3"><ReadinessScore label="" value={e.quality} size="sm" /></td>
                <td><VerificationStatusBadge status={e.verification} /></td>
                <td>
                  <Pill tone={e.status === "Aktiv" ? "success" : e.status === "Under review" ? "warning" : "danger"}>
                    {e.status}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Emission factor panel */}
        <Card className="lg:col-span-2">
          <CardHeader title="Emissionsfaktorer · gennemgang" subtitle="Kilder, gyldighed og review-status" />
          <ul className="px-5 pb-5 divide-y text-sm">
            {[
              { f: "DEFRA 2025 · diesel", source: "DEFRA", reviewed: "2026-01-12", conf: 96, needs: false },
              { f: "Energinet · markedsbaseret el", source: "Energinet", reviewed: "2026-04-30", conf: 94, needs: false },
              { f: "DEFRA 2023 · fjernvarme", source: "DEFRA", reviewed: "2024-02-08", conf: 72, needs: true },
              { f: "DEFRA 2025 · transport (vej)", source: "DEFRA", reviewed: "2026-01-12", conf: 88, needs: false },
              { f: "EPD · indkøbte varer", source: "EPD database", reviewed: "2025-09-04", conf: 68, needs: true },
            ].map((r) => (
              <li key={r.f} className="py-2.5 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">{r.f}</div>
                  <div className="text-xs text-muted-foreground">Kilde: {r.source} · sidst gennemgået {r.reviewed}</div>
                </div>
                <div className="text-xs tabular-nums w-12 text-right">{r.conf}%</div>
                {r.needs ? (
                  <Pill tone="warning">Validér</Pill>
                ) : (
                  <Pill tone="success">OK</Pill>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader title="Handlinger" subtitle="CO₂-dokumentation og rapportering" />
          <div className="px-5 pb-5 grid gap-2">
            <ActionBtn icon={<ClipboardCheck className="h-4 w-4" />} label="Validér emissionsfaktorer" />
            <ActionBtn icon={<Download className="h-4 w-4" />} label="Eksportér CO₂-bilag" />
            <ActionBtn icon={<Send className="h-4 w-4" />} label="Send til rapportering" primary />
            <ActionBtn icon={<ShieldCheck className="h-4 w-4" />} label="Markér datakilde som verificeret" />
            <div className="rounded-xl border p-3 mt-2 flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
              <span>2 emissionsfaktorer kræver opdatering inden Q2-rapport.</span>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}

function ActionBtn({ icon, label, primary }: { icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button
      className={`text-sm rounded-lg px-3 py-2.5 inline-flex items-center justify-start gap-2 border ${
        primary ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
      }`}
    >
      {icon} {label}
    </button>
  );
}
