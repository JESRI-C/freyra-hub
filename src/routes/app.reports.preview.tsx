import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Send, RefreshCw, AlertTriangle, MessageSquare } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { ReadinessScore, Chip } from "@/components/reports/Primitives";
import {
  ReportMasthead,
  ReportSection,
  ReportHero,
  ReportKpi,
  ReportBars,
  ReportTable,
  ReportKV,
  ReportNote,
  DOC_BLAA,
  DOC_GROEN,
} from "@/components/reports/ReportDoc";
import { MISSING_DATA } from "@/lib/reports-data";

export const Route = createFileRoute("/app/reports/preview")({
  component: Page,
});

const PAGES = [
  "Forside",
  "Executive summary",
  "Nøgletal",
  "Diagrammer",
  "AI-anbefalinger",
  "Risiko & usikkerhed",
  "Dokumentation",
  "Næste handlinger",
];

function Page() {
  const [page, setPage] = useState(0);

  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-4">
      <PageHeader
        title="Rapportpreview"
        description="Skallebæk Biodiversity Pilot — Naturimpact og ESG-status · Q2 2026"
        actions={
          <div className="flex gap-2">
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Opdater preview
            </button>
            <button className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" /> Send til review
            </button>
            <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Eksportér PDF
            </button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[180px_1fr_320px] gap-4">
        {/* LEFT: thumbnails */}
        <Card className="p-3 h-fit">
          <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Sider</div>
          <ul className="space-y-1.5">
            {PAGES.map((p, i) => (
              <li key={p}>
                <button
                  onClick={() => setPage(i)}
                  className={`w-full text-left rounded-lg border p-2 text-xs ${page === i ? "border-primary bg-leaf/15" : "bg-card hover:bg-muted"}`}
                >
                  <div className="aspect-[3/4] rounded bg-gradient-to-br from-muted to-card mb-1.5 grid place-items-center text-muted-foreground text-[10px]">
                    {i + 1}
                  </div>
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* CENTER: preview */}
        <Card className="p-0 overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b text-xs text-muted-foreground flex items-center justify-between">
            <span>
              Side {page + 1} af {PAGES.length} · {PAGES[page]}
            </span>
            <Chip tone="success">Klarhed 82%</Chip>
          </div>
          <div className="bg-card px-10 py-12 min-h-[800px]">
            <PreviewPage idx={page} />
          </div>
        </Card>

        {/* RIGHT: status */}
        <div className="space-y-3">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">Rapportklarhed</div>
            <ReadinessScore value={82} size="lg" />
            <div className="text-xs text-muted-foreground mt-2">
              Klar til intern brug. 3 rettelser før ekstern deling.
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning-foreground" /> Manglende data
            </div>
            <ul className="space-y-1.5 text-xs">
              {MISSING_DATA.slice(0, 3).map((m) => (
                <li key={m.issue} className="p-2 rounded border bg-warning/5">
                  <div className="font-medium">{m.issue}</div>
                  <div className="text-muted-foreground mt-0.5">→ {m.target}</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Review-kommentarer
            </div>
            <ul className="space-y-2 text-xs">
              <li className="p-2 rounded border bg-muted/30">
                <strong>Emma Larsen:</strong> Tilføj sammenligning med 2025-baseline.
              </li>
              <li className="p-2 rounded border bg-muted/30">
                <strong>Jesper Riel:</strong> Forkort executive summary til 200 ord.
              </li>
            </ul>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">Eksport-advarsler</div>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>· Verifikation under 85% — påvirker kunde-ekstern brug</li>
              <li>· Bilag mangler rådataudtræk</li>
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}

function PreviewPage({ idx }: { idx: number }) {
  if (idx === 0)
    return (
      <ReportMasthead
        kicker="GoFreyra · Naturimpact-rapport"
        title="Skallebæk Biodiversity Pilot"
        subtitle="Naturimpact og ESG-status"
        badge={<Chip tone="success">Klar til intern brug · 82%</Chip>}
        meta={[
          { label: "Periode", value: "Q2 2026" },
          { label: "Målgruppe", value: "Kunde" },
          { label: "Genereret", value: "8. maj 2026" },
          { label: "Version", value: "v1.4" },
          { label: "Sprog", value: "Dansk" },
          { label: "Sider", value: "22" },
        ]}
      />
    );
  if (idx === 1)
    return (
      <ReportSection
        title="Executive summary"
        intro="Status for naturtilstand, datadækning og anbefalede handlinger — Q2 2026."
      >
        <div className="max-w-2xl space-y-4">
          <p className="text-base leading-relaxed">
            Skallebæk Biodiversity Pilot viser en <strong>positiv udvikling</strong> i
            naturtilstand og datadækning. Datagrundlaget er stærkt på vandmålinger og
            satellitbaseret vegetationsanalyse, mens feltverifikation fortsat bør styrkes før
            ekstern rapportering.
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">
            Vandkvaliteten i Zone A og B er stabil, NDVI er steget 6 % siden baseline, og
            biodiversitetsindekset peger på øget habitat-diversitet i vådområdet. Anbefalingen
            er at prioritere feltregistrering i Zone C samt verificere droneoverflight Q2 før
            kunde- og investordeling.
          </p>
        </div>
      </ReportSection>
    );
  if (idx === 2)
    return (
      <ReportSection
        title="Nøgletal"
        intro="Udvikling vs. forrige kvartal. Grøn delta = forbedring."
      >
        <div className="max-w-2xl space-y-5">
          <ReportHero
            label="Biodiversitetsindeks"
            value="0,71"
            tone="positive"
            sub="+0,06 vs. Q1 2026 — øget habitat-diversitet i vådområdet"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <ReportKpi label="CO₂e-potentiale" value="1.420 t/år" sub="+12 % vs. Q1" />
            <ReportKpi label="Vandkvalitet" value="94 %" sub="+2 % vs. Q1" />
            <ReportKpi label="Datakvalitet" value="91 %" sub="+3 % vs. Q1" />
            <ReportKpi label="Rapportklarhed" value="82 %" sub="3 rettelser udestår" />
            <ReportKpi label="Verifikation" value="DNV aktiv" sub="Signatur Q2 udestående" />
            <ReportKpi label="Datadækning" value="4 af 5 zoner" sub="Zone C mangler felt" />
          </div>
        </div>
      </ReportSection>
    );
  if (idx === 3)
    return (
      <div className="max-w-2xl space-y-8">
        <ReportSection
          title="CO₂e-potentiale pr. kvartal"
          intro="t CO₂e/år, kvartalsvis opgørelse 2026."
        >
          <ReportBars
            rows={[
              { label: "Q1", andel: 1280 / 1420, vaerdi: "1.280 t", farve: DOC_BLAA },
              { label: "Q2", andel: 1340 / 1420, vaerdi: "1.340 t", farve: DOC_BLAA },
              { label: "Q3", andel: 1380 / 1420, vaerdi: "1.380 t", farve: DOC_BLAA },
              { label: "Q4", andel: 1420 / 1420, vaerdi: "1.420 t", farve: DOC_BLAA },
            ]}
          />
        </ReportSection>
        <ReportSection
          title="Biodiversitetsindeks pr. kvartal"
          intro="Indeks 0–1, højere er bedre."
        >
          <ReportBars
            rows={[
              { label: "Q1", andel: 0.62, vaerdi: "0,62", farve: DOC_GROEN },
              { label: "Q2", andel: 0.66, vaerdi: "0,66", farve: DOC_GROEN },
              { label: "Q3", andel: 0.69, vaerdi: "0,69", farve: DOC_GROEN },
              { label: "Q4", andel: 0.71, vaerdi: "0,71", farve: DOC_GROEN },
            ]}
          />
        </ReportSection>
        <ReportSection
          title="Datakvalitet pr. kilde"
          intro="Andel godkendte målinger pr. datakilde."
        >
          <ReportBars
            rows={[
              { label: "Sensor", andel: 0.96, vaerdi: "96 %", farve: DOC_BLAA },
              { label: "ERP", andel: 0.94, vaerdi: "94 %", farve: DOC_BLAA },
              { label: "Satellit", andel: 0.88, vaerdi: "88 %", farve: DOC_BLAA },
              { label: "Felt", andel: 0.82, vaerdi: "82 %", farve: DOC_BLAA },
              { label: "Drone", andel: 0.71, vaerdi: "71 %", farve: DOC_BLAA },
            ]}
          />
        </ReportSection>
      </div>
    );
  if (idx === 4)
    return (
      <ReportSection
        title="AI-anbefalinger"
        intro="Prioriterede handlinger genereret ud fra datahuller og verifikationskrav."
      >
        <div className="max-w-2xl space-y-2.5">
          {[
            {
              p: "Høj",
              t: "Verificér droneoverflight Q2",
              e: "Hæver verifikationsscore med 8 point",
              d: "DNV-signatur",
              o: "Mikkel Holm",
            },
            {
              p: "Høj",
              t: "Tilføj feltobservationer i Zone C",
              e: "Lukker biodiversitets-data-gap",
              d: "Field-app uploads",
              o: "Emma Larsen",
            },
            {
              p: "Mellem",
              t: "Korrigér Scope 3 leverandørmapping",
              e: "Forbedrer Scope 3-aggregering",
              d: "Scope 3 CSV",
              o: "Emma Larsen",
            },
          ].map((r) => (
            <div key={r.t} className="rounded-xl border px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Chip tone={r.p === "Høj" ? "warning" : "muted"}>{r.p}</Chip>
                <div className="font-medium text-sm">{r.t}</div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-xs mt-2.5 text-muted-foreground">
                <span>
                  <strong className="text-foreground">Effekt:</strong> {r.e}
                </span>
                <span>
                  <strong className="text-foreground">Data:</strong> {r.d}
                </span>
                <span>
                  <strong className="text-foreground">Ejer:</strong> {r.o}
                </span>
              </div>
            </div>
          ))}
        </div>
      </ReportSection>
    );
  if (idx === 5)
    return (
      <div className="max-w-2xl space-y-6">
        <ReportSection
          title="Risiko & usikkerhed"
          intro="Sandsynlighed (→) × konsekvens (↑). Ikoner og placering bærer alvoren — ikke farven alene."
        >
          <div className="grid grid-cols-[auto_1fr] gap-2 items-stretch">
            <div className="flex flex-col justify-between py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Høj</span>
              <span>Mellem</span>
              <span>Lav</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { tone: "bg-warning/30", label: "" },
                { tone: "bg-destructive/25", label: "Drone-EXIF" },
                { tone: "bg-destructive/40", label: "" },
                { tone: "bg-success/20", label: "" },
                { tone: "bg-warning/30", label: "Zone C-felt" },
                { tone: "bg-destructive/25", label: "" },
                { tone: "bg-success/15", label: "" },
                { tone: "bg-success/20", label: "Scope 3" },
                { tone: "bg-warning/30", label: "" },
              ].map((c, i) => (
                <div
                  key={i}
                  className={`h-14 rounded-lg ${c.tone} grid place-items-center text-[10px] font-medium text-foreground/80 px-1 text-center`}
                >
                  {c.label}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 ml-[3.2rem] flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Lav</span>
            <span>Mellem</span>
            <span>Høj</span>
          </div>
        </ReportSection>
        <ReportNote title="Datahuller">
          Feltverifikation Zone C · EXIF-GPS på drone Q2 · Scope 3-leverandørkategori. Hullerne
          påvirker ekstern deling — se AI-anbefalinger for lukkende handlinger.
        </ReportNote>
      </div>
    );
  if (idx === 6)
    return (
      <ReportSection
        title="Dokumentation"
        intro="Sporbarhed: kilder, metode og revisionsspor bag rapportens tal."
      >
        <div className="max-w-2xl">
          <ReportKV
            items={[
              {
                label: "Datakilder",
                value: "SKB-WQ-01 · SKB-SOIL-02 · Sentinel-2 NDVI · Field App · ERP API",
              },
              { label: "Audit trail", value: "248 events i ESG Ledger (Q2)" },
              { label: "Verifikation", value: "DNV — aktiv, signatur Q2 udestående" },
              { label: "Metode", value: "ESRS E4 · OGC SensorThings · GHG Protocol" },
              {
                label: "Bilag",
                value: "Metodebilag · Datatabel · Emissionsfaktorer · Audit extract",
              },
            ]}
          />
        </div>
      </ReportSection>
    );
  return (
    <ReportSection
      title="Næste handlinger"
      intro="Handlinger der hæver rapportklarheden før ekstern deling."
    >
      <div className="max-w-2xl">
        <ReportTable
          head={["Handling", "Frist", "Ejer", "Effekt"]}
          numericFra={4}
          rows={[
            ["Feltobs. Zone C", "20. maj", "Emma Larsen", "+8 % klarhed"],
            ["DNV-signatur Q2", "25. maj", "Jesper Riel", "Verifikation OK"],
            ["Scope 3 mapping", "30. maj", "Emma Larsen", "Scope 3 lukkes"],
          ]}
        />
      </div>
    </ReportSection>
  );
}
