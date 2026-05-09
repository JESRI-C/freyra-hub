import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Download, Send, RefreshCw, AlertTriangle, MessageSquare } from "lucide-react";
import { Card, PageHeader, Bars } from "@/components/ui-bits";
import { ReadinessScore, Section, Chip, MissingDataItem } from "@/components/reports/Primitives";
import { MISSING_DATA } from "@/lib/reports-data";
import { actionToast } from "@/components/platform/Primitives";

export const Route = createFileRoute("/app/reports/preview")({
  component: Page,
});

const PAGES = [
  "Forside", "Executive summary", "Nøgletal", "Diagrammer",
  "AI-anbefalinger", "Risiko & usikkerhed", "Dokumentation", "Næste handlinger",
];

function Page() {
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }

  function handleSendToReview() {
    actionToast("Rapport sendt til review");
  }

  function handleExportPdf() {
    // Inject a print-only style that hides the sidebar and topbar
    const styleId = "freyra-print-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @media print {
          [data-sidebar], nav, header, aside, [class*="sidebar"], [class*="topbar"], [class*="nav-"] {
            display: none !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
    setExporting(true);
    // Give React a tick to render the loading state before print dialog blocks
    setTimeout(() => {
      window.print();
      setExporting(false);
    }, 100);
  }

  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-4">
      <PageHeader title="Rapportpreview"
        description="Skallebæk Biodiversity Pilot — Naturimpact og ESG-status · Q2 2026"
        actions={
          <div className="flex gap-2">
            <button onClick={handleRefresh} disabled={refreshing} className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Opdaterer…" : "Opdater preview"}
            </button>
            <button onClick={handleSendToReview} className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Send til review</button>
            <button onClick={handleExportPdf} disabled={exporting} className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-60">
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Genererer PDF…" : "Eksportér PDF"}
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
                <button onClick={() => setPage(i)} className={`w-full text-left rounded-lg border p-2 text-xs ${page === i ? "border-primary bg-leaf/15" : "bg-card hover:bg-muted"}`}>
                  <div className="aspect-[3/4] rounded bg-gradient-to-br from-muted to-card mb-1.5 grid place-items-center text-muted-foreground text-[10px]">{i + 1}</div>
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* CENTER: preview */}
        <Card className="p-0 overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b text-xs text-muted-foreground flex items-center justify-between">
            <span>Side {page + 1} af {PAGES.length} · {PAGES[page]}</span>
            <Chip tone="success">Klarhed 82%</Chip>
          </div>
          <div className="bg-card p-10 min-h-[800px]">
            <PreviewPage idx={page} />
          </div>
        </Card>

        {/* RIGHT: status */}
        <div className="space-y-3">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">Rapportklarhed</div>
            <ReadinessScore value={82} size="lg" />
            <div className="text-xs text-muted-foreground mt-2">Klar til intern brug. 3 rettelser før ekstern deling.</div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning-foreground" /> Manglende data</div>
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
            <div className="text-sm font-semibold mb-2 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Review-kommentarer</div>
            <ul className="space-y-2 text-xs">
              <li className="p-2 rounded border bg-muted/30"><strong>Emma Larsen:</strong> Tilføj sammenligning med 2025-baseline.</li>
              <li className="p-2 rounded border bg-muted/30"><strong>Jesper Riel:</strong> Forkort executive summary til 200 ord.</li>
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
  if (idx === 0) return (
    <div className="space-y-6">
      <div className="text-xs uppercase tracking-wider text-primary font-semibold">GoFreyra · Naturimpact-rapport</div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Skallebæk Biodiversity Pilot</h1>
        <div className="text-lg text-muted-foreground mt-1">Naturimpact og ESG-status</div>
      </div>
      <div className="grid grid-cols-2 gap-4 max-w-md text-sm">
        <KV label="Periode" v="Q2 2026" />
        <KV label="Målgruppe" v="Kunde" />
        <KV label="Genereret" v={new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })} />
        <KV label="Version" v="v1.4" />
        <KV label="Sprog" v="Dansk" />
        <KV label="Sider" v="22" />
      </div>
      <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-leaf/20 text-primary text-xs font-medium">
        Klar til intern brug · 82%
      </div>
    </div>
  );
  if (idx === 1) return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold">Executive summary</h2>
      <p className="text-sm leading-relaxed text-foreground/90">
        Skallebæk Biodiversity Pilot viser en positiv udvikling i naturtilstand og datadækning. Datagrundlaget er stærkt på vandmålinger og satellitbaseret vegetationsanalyse, mens feltverifikation fortsat bør styrkes før ekstern rapportering.
      </p>
      <p className="text-sm leading-relaxed text-foreground/90">
        Vandkvaliteten i Zone A og B er stabil, NDVI er steget 6% siden baseline, og biodiversitetsindekset peger på øget habitat-diversitet i vådområdet. Anbefalingen er at prioritere feltregistrering i Zone C samt verificere droneoverflight Q2 før kunde- og investordeling.
      </p>
    </div>
  );
  if (idx === 2) return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Nøgletal</h2>
      <div className="grid grid-cols-3 gap-3 max-w-2xl">
        {[
          ["Biodiversitetsindeks", "0,71", "+0,06"],
          ["CO₂e potentiale", "1.420 t/år", "+12%"],
          ["Vandkvalitet", "94%", "+2%"],
          ["Datakvalitet", "91%", "+3%"],
          ["Rapportklarhed", "82%", "—"],
          ["Verifikationsstatus", "DNV: aktiv", "OK"],
        ].map(([l, v, d]) => (
          <div key={l} className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold mt-1">{v}</div>
            <div className="text-[11px] text-success mt-0.5">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
  if (idx === 3) return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold">Diagrammer</h2>
      <div className="rounded-xl border p-4"><div className="text-sm font-medium mb-2">CO₂e over tid</div><Bars data={[{label:"Q1",value:1280},{label:"Q2",value:1340},{label:"Q3",value:1380},{label:"Q4",value:1420}]} /></div>
      <div className="rounded-xl border p-4"><div className="text-sm font-medium mb-2">Biodiversitetsindeks</div><Bars data={[{label:"Q1",value:62},{label:"Q2",value:66},{label:"Q3",value:69},{label:"Q4",value:71}]} /></div>
      <div className="rounded-xl border p-4"><div className="text-sm font-medium mb-2">Datakvalitet pr. kilde</div><Bars data={[{label:"Sensor",value:96},{label:"Satellit",value:88},{label:"Drone",value:71},{label:"Felt",value:82},{label:"ERP",value:94}]} /></div>
    </div>
  );
  if (idx === 4) return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-xl font-semibold">AI-anbefalinger</h2>
      {[
        {p:"Høj", t:"Verificér droneoverflight Q2", e:"Hæver verifikationsscore med 8 point", d:"DNV-signatur", o:"Mikkel Holm"},
        {p:"Høj", t:"Tilføj feltobservationer i Zone C", e:"Lukker biodiversitets-data-gap", d:"Field-app uploads", o:"Emma Larsen"},
        {p:"Mellem", t:"Korrigér Scope 3 leverandørmapping", e:"Forbedrer Scope 3-aggregering", d:"Scope 3 CSV", o:"Emma Larsen"},
      ].map((r) => (
        <div key={r.t} className="rounded-xl border p-4">
          <div className="flex items-center gap-2"><Chip tone="primary">{r.p}</Chip><div className="font-medium">{r.t}</div></div>
          <div className="grid grid-cols-3 gap-3 text-xs mt-2 text-muted-foreground"><span><strong className="text-foreground">Effekt:</strong> {r.e}</span><span><strong className="text-foreground">Data:</strong> {r.d}</span><span><strong className="text-foreground">Ejer:</strong> {r.o}</span></div>
        </div>
      ))}
    </div>
  );
  if (idx === 5) return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-xl font-semibold">Risiko & usikkerhed</h2>
      <div className="rounded-xl border p-4 text-sm">
        <div className="font-medium mb-2">Risikomatrix (3×3)</div>
        <div className="grid grid-cols-3 gap-1">
          {[1,2,3,4,5,6,7,8,9].map((c) => <div key={c} className={`h-12 rounded ${c>6?"bg-destructive/30":c>3?"bg-warning/30":"bg-success/20"}`} />)}
        </div>
      </div>
      <div className="rounded-xl border p-4">
        <div className="font-medium text-sm">Datahuller</div>
        <ul className="text-xs mt-2 space-y-1 list-disc pl-5 text-muted-foreground"><li>Feltverifikation Zone C</li><li>EXIF GPS på drone Q2</li><li>Scope 3 leverandørkategori</li></ul>
      </div>
    </div>
  );
  if (idx === 6) return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-xl font-semibold">Dokumentation</h2>
      <div className="text-sm space-y-2">
        <div className="rounded-xl border p-3"><strong>Datakilder:</strong> SKB-WQ-01, SKB-SOIL-02, Sentinel-2 NDVI, Field App, ERP API</div>
        <div className="rounded-xl border p-3"><strong>Audit trail:</strong> 248 events i ESG Ledger (Q2)</div>
        <div className="rounded-xl border p-3"><strong>Verifikation:</strong> DNV — aktiv, signatur Q2 udestående</div>
        <div className="rounded-xl border p-3"><strong>Metode:</strong> ESRS E4, OGC SensorThings, GHG Protocol</div>
        <div className="rounded-xl border p-3"><strong>Bilag:</strong> Metodebilag, Datatabel, Emissionsfaktorer, Audit extract</div>
      </div>
    </div>
  );
  return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-xl font-semibold">Næste handlinger</h2>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-muted/50 text-xs"><tr><th className="px-3 py-2 text-left">Handling</th><th className="px-3 py-2 text-left">Frist</th><th className="px-3 py-2 text-left">Ejer</th><th className="px-3 py-2 text-left">Effekt</th></tr></thead>
        <tbody className="divide-y">
          {[["Feltobs. Zone C","20. maj","Emma Larsen","+8% klarhed"],["DNV-signatur Q2","25. maj","Jesper Riel","Verifikation OK"],["Scope 3 mapping","30. maj","Emma Larsen","Scope 3 lukkes"]].map((r) => (
            <tr key={r[0]}><td className="px-3 py-2">{r[0]}</td><td className="px-3 py-2">{r[1]}</td><td className="px-3 py-2">{r[2]}</td><td className="px-3 py-2 text-success">{r[3]}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KV({ label, v }: { label: string; v: string }) {
  return <div><div className="text-[11px] text-muted-foreground uppercase">{label}</div><div className="font-medium">{v}</div></div>;
}
