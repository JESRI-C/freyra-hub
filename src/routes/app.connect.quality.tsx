import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, TrendingUp, TrendingDown, Sparkles, ArrowRight, Plus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";
import {
  ConnectionHealthCard,
  DataQualityScore,
  ProgressBar,
  Section,
  Chip,
} from "@/components/connect/Primitives";
import { QUALITY_DIMENSIONS, VALIDATION_RULES, DATA_SOURCES } from "@/lib/connect-data";
import { RuleDrawer } from "@/components/monitoring/RuleDrawer";
import { useConnectContext } from "@/lib/connect-context";
import { listRules, toggleRule } from "@/services/monitoring/quality-rules-service";

export const Route = createFileRoute("/app/connect/quality")({
  component: Page,
});

const READINESS = [
  {
    module: "DecisionsIQ",
    required: "Sensor + satellit + felt",
    quality: 92,
    missing: "—",
    status: "Klar",
  },
  {
    module: "ESG Ledger",
    required: "ERP + Scope 3 + verifikation",
    quality: 78,
    missing: "Scope 3 CSV",
    status: "Næsten klar",
  },
  {
    module: "Impact Exchange",
    required: "Felt + drone + satellit + verifikation",
    quality: 74,
    missing: "Drone EXIF GPS",
    status: "Kræver handling",
  },
  {
    module: "Reports",
    required: "Alle valideret",
    quality: 81,
    missing: "Manuelle uploads",
    status: "Næsten klar",
  },
];

function Page() {
  const { projectId } = useConnectContext();
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const rulesQuery = useQuery({
    queryKey: ["quality-rules", projectId],
    queryFn: () => listRules(projectId),
  });

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Datakvalitet"
          description="Er data pålideligt nok til analyse, dokumentation og rapportering?"
        />
        <button
          onClick={() => setRuleDrawerOpen(true)}
          className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5 shrink-0 mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Ny kvalitetsregel
        </button>
      </div>

      <Section
        title="Aktive kvalitetsregler"
        subtitle={rulesQuery.isLoading ? "Henter…" : `${rulesQuery.data?.length ?? 0} regler kører nu`}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-3">Navn</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Aktiv</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(rulesQuery.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-xs"><Chip>{r.rule_type}</Chip></td>
                    <td className="px-4 py-3 text-xs">{r.severity}</td>
                    <td className="px-4 py-3 text-xs">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={r.is_active}
                          onChange={(e) => { void toggleRule(r.id, e.target.checked).then(() => rulesQuery.refetch()); }}
                        />
                        {r.is_active ? "Aktiv" : "Inaktiv"}
                      </label>
                    </td>
                  </tr>
                ))}
                {!rulesQuery.isLoading && (rulesQuery.data ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen kvalitetsregler endnu — opret én for at aktivere kontrolrummet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <RuleDrawer
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        variant="quality"
        projectId={projectId}
        onCreated={() => rulesQuery.refetch()}
      />

      <AiInsightBanner
        module="Datakvalitet"
        tone="risk"
        cacheKey={`quality:${QUALITY_DIMENSIONS.length}:${VALIDATION_RULES.length}`}
        context={`Samlet kvalitet: 91%. Dimensioner: ${QUALITY_DIMENSIONS.map((q) => `${q.name}=${q.score}%`).join(", ")}. Antal valideringsregler: ${VALIDATION_RULES.length}. Datakilder under monitorering: ${DATA_SOURCES.length}.`}
      />


      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <ConnectionHealthCard
          label="Samlet"
          value="91%"
          tone="success"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Completeness"
          value="87%"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Freshness"
          value="94%"
          tone="success"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Consistency"
          value="89%"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Traceability"
          value="96%"
          tone="success"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <ConnectionHealthCard
          label="Verification"
          value="82%"
          tone="warning"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      </div>

      <Section
        title="Kvalitetsdimensioner"
        subtitle="Score, tendens, forklaring og anbefalet handling"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUALITY_DIMENSIONS.map((d) => (
            <Card key={d.name} className="p-4">
              <div className="flex items-start justify-between">
                <div className="text-sm font-semibold">{d.name}</div>
                <Chip tone={d.trend > 0 ? "primary" : "muted"}>
                  {d.trend > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {d.trend > 0 ? "+" : ""}
                  {d.trend}
                </Chip>
              </div>
              <div className="mt-2">
                <DataQualityScore score={d.score} size="md" />
              </div>
              <div className="text-xs text-muted-foreground mt-2">{d.why}</div>
              <div className="text-xs mt-2 text-foreground/90">
                <strong>Handling:</strong> {d.action}
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
                <th className="px-4 py-3">Kilde</th>
                <th className="px-4 py-3">Projekt</th>
                <th className="px-4 py-3">Compl.</th>
                <th className="px-4 py-3">Freshness</th>
                <th className="px-4 py-3">Consistency</th>
                <th className="px-4 py-3">Traceability</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Samlet</th>
                <th className="px-4 py-3">Rapportklar</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {DATA_SOURCES.map((s, i) => {
                const variation = (n: number) =>
                  Math.max(0, Math.min(100, s.quality + ((i % 3) - 1) * 4 + n));
                const overall = s.quality;
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-xs">{s.project}</td>
                    <td className="px-4 py-3">
                      <DataQualityScore score={variation(-2)} />
                    </td>
                    <td className="px-4 py-3">
                      <DataQualityScore score={variation(3)} />
                    </td>
                    <td className="px-4 py-3">
                      <DataQualityScore score={variation(0)} />
                    </td>
                    <td className="px-4 py-3">
                      <DataQualityScore score={variation(5)} />
                    </td>
                    <td className="px-4 py-3">
                      <DataQualityScore score={s.verified ? variation(2) : 40} />
                    </td>
                    <td className="px-4 py-3">
                      <DataQualityScore score={overall} size="md" />
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={overall >= 85 ? "primary" : "muted"}>
                        {overall >= 85 ? "Klar" : "Kræver handling"}
                      </Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Valideringsregler" subtitle="Aktive på platformen">
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {VALIDATION_RULES.map((r) => (
              <li key={r} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {r}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Data-huller" subtitle="Skal håndteres for fuld rapportklarhed">
          <ul className="text-sm space-y-2">
            {[
              "Mangler geotags på drone upload (Q2)",
              "Mangler feltregistrering i Zone C i 8 dage",
              "Scope 3 CSV mangler leverandørkategori",
              "Vandmålinger mangler sensor calibration note",
              "Satellit NDVI layer outdated (>5 dage)",
            ].map((t, i) => (
              <li key={i} className="flex gap-2 p-2.5 rounded-lg border bg-muted/30">
                <span className="text-destructive">●</span> {t}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section
        title="Geospatiale kvalitetstjek"
        subtitle="Specielle krav for kortlag, drone, satellit og feltdata"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            {
              label: "Koordinatvaliditet",
              score: 96,
              note: "Lat/lon inden for projektets bounding box",
            },
            {
              label: "Projektion genkendt",
              score: 92,
              note: "EPSG-kode læst fra fil eller bekræftet",
            },
            {
              label: "Coverage overlap",
              score: 78,
              note: "Lag dækker mindst 80% af projektarealet",
            },
            {
              label: "Metadata komplet",
              score: 71,
              note: "Kilde, dato, metode, sensor og opløsning",
            },
            { label: "Spatial nøjagtighed", score: 88, note: "RMSE under 1,0 m for drone-uploads" },
            {
              label: "Temporal friskhed",
              score: 84,
              note: "Lag opdateret inden for forventet kadence",
            },
            { label: "Zone-tilknytning", score: 90, note: "Hver kilde knyttet til mindst én zone" },
            {
              label: "Klar til kortvisning",
              score: 86,
              note: "Lag kan tegnes uden manuelle rettelser",
            },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{c.label}</div>
                <DataQualityScore score={c.score} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5">{c.note}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Modul-parathed" subtitle="Hvilke moduler kan bruge data lige nu?">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="px-4 py-3">Modul</th>
                <th className="px-4 py-3">Påkrævede inputs</th>
                <th className="px-4 py-3">Aktuel kvalitet</th>
                <th className="px-4 py-3">Mangler</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {READINESS.map((r) => (
                <tr key={r.module}>
                  <td className="px-4 py-3 font-medium">{r.module}</td>
                  <td className="px-4 py-3 text-xs">{r.required}</td>
                  <td className="px-4 py-3 w-48">
                    <ProgressBar value={r.quality} />
                  </td>
                  <td className="px-4 py-3 text-xs">{r.missing}</td>
                  <td className="px-4 py-3">
                    <Chip tone={r.status === "Klar" ? "primary" : "muted"}>{r.status}</Chip>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <a className="text-primary inline-flex items-center gap-1">
                      Åbn <ArrowRight className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Card className="p-5 bg-gradient-to-br from-card to-leaf/15">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">AI kvalitetsanbefaling</div>
            <p className="text-sm mt-2 text-foreground/90">
              Feltdata og droneuploads bør prioriteres, fordi de direkte påvirker rapportklarhed for
              biodiversitet og verifikation i Impact Exchange. Anbefaling: tving geotag i Field-app,
              kør tredjepartsverifikation på Q2 droneoverflight, og luk Scope 3 CSV-importfejl inden
              månedsskifte.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
