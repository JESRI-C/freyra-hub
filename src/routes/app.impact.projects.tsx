import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Filter, LayoutGrid, Table as TableIcon, Sparkles, X, ArrowRightLeft, ShieldCheck } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  ProjectCard,
  CategoryBadge,
  VerificationBadge,
  RiskBadge,
  ReportingPill,
  DataQualityScore,
  fmt,
} from "@/components/impact/Primitives";
import { PROJECTS, CATEGORIES } from "@/lib/impact-data";
import { usePortfolio, useCompare } from "@/lib/impact-state";

export const Route = createFileRoute("/app/impact/projects")({
  head: () => ({ meta: [{ title: "Projekter — Impact Exchange" }] }),
  component: ProjectsPage,
});

const FILTERS = [
  "Region",
  "Land",
  "Projekttype",
  "Naturtype",
  "CO₂e potentiale",
  "Biodiversitetsindeks",
  "Verifikationsstatus",
  "Datakvalitet",
  "Risiko",
  "Prisniveau",
  "Rapportklar",
];

function ProjectsPage() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("Alle");
  const portfolio = usePortfolio();
  const compare = useCompare();

  const filtered = useMemo(() => {
    return PROJECTS.filter((p) => {
      if (cat !== "Alle" && p.category !== cat) return false;
      if (q && !`${p.title} ${p.country} ${p.location} ${p.category}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [q, cat]);

  const compareProjects = PROJECTS.filter((p) => compare.has(p.id));

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5 pb-32">
      {/* Search & filter */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2 bg-muted/40 border rounded-xl px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg blandt 28 projekter…"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-xl overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <LayoutGrid className="h-4 w-4" /> Kort
              </button>
              <button
                onClick={() => setView("table")}
                className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 ${view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <TableIcon className="h-4 w-4" /> Tabel
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <button
            onClick={() => setCat("Alle")}
            className={`text-xs px-2.5 py-1 rounded-full border ${cat === "Alle" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            Alle
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`text-xs px-2.5 py-1 rounded-full border ${cat === c ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {FILTERS.map((f) => (
            <button key={f} className="text-xs px-2.5 py-1 rounded-full bg-muted/50 hover:bg-muted inline-flex items-center gap-1">
              <Filter className="h-3 w-3" /> {f}
            </button>
          ))}
        </div>
      </Card>

      {/* AI recommended */}
      <Card>
        <CardHeader
          title="AI-anbefalede projekter"
          subtitle="Tilpasset din portefølje og rapporteringsbehov"
          action={<Pill tone="info">4 anbefalinger</Pill>}
        />
        <div className="px-5 pb-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { tag: "Bedst til ESG-dokumentation", id: "amazonas" },
            { tag: "Høj biodiversitetsværdi", id: "mangrove-id" },
            { tag: "Lav risiko", id: "wind-india" },
            { tag: "Stærkeste datagrundlag", id: "nordic-coastal" },
          ].map((r) => {
            const p = PROJECTS.find((x) => x.id === r.id)!;
            return (
              <Link
                key={r.id}
                to="/app/impact/project"
                className="rounded-xl border p-3 hover:bg-muted/50 flex flex-col gap-2"
              >
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" /> {r.tag}
                </div>
                <div className="font-medium text-sm">{p.title}</div>
                <div className="flex flex-wrap gap-1.5"><CategoryBadge category={p.category} /><VerificationBadge status={p.verification} /></div>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Result count */}
      <div className="text-sm text-muted-foreground">
        Viser <span className="font-medium text-foreground">{filtered.length}</span> projekter
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              inPortfolio={portfolio.has(p.id)}
              selected={compare.has(p.id)}
              onAddToPortfolio={() => portfolio.add(p.id)}
              onSelect={() => compare.toggle(p.id)}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr>
                <th className="px-5 py-2">Projekt</th>
                <th className="py-2">Land</th>
                <th className="py-2">Kategori</th>
                <th className="py-2 text-right">CO₂e</th>
                <th className="py-2 text-right">Bio.</th>
                <th className="py-2 text-right">Areal</th>
                <th className="py-2">Verifikation</th>
                <th className="py-2 w-32">Datakvalitet</th>
                <th className="py-2">Risiko</th>
                <th className="py-2 text-right">Pris</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-medium">{p.title}</td>
                  <td>{p.country}</td>
                  <td><CategoryBadge category={p.category} /></td>
                  <td className="text-right tabular-nums">{fmt(p.co2ePotential)} t</td>
                  <td className="text-right tabular-nums">{p.biodiversityIndex}</td>
                  <td className="text-right tabular-nums">{fmt(p.hectares)} ha</td>
                  <td><VerificationBadge status={p.verification} /></td>
                  <td className="pr-3"><DataQualityScore value={p.dataQuality} label="" /></td>
                  <td><RiskBadge level={p.risk} /></td>
                  <td className="text-right tabular-nums">{p.pricePerUnit} kr</td>
                  <td className="pr-5">
                    <div className="flex gap-1">
                      <Link to="/app/impact/project" className="text-xs text-primary hover:underline">Se</Link>
                      <span className="text-muted-foreground">·</span>
                      <button onClick={() => compare.toggle(p.id)} className="text-xs hover:underline">Sammenlign</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Compare drawer */}
      {compareProjects.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 lg:left-72 z-30">
          <Card className="p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-semibold">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                Sammenligning ({compareProjects.length}/4)
              </div>
              <div className="flex gap-2">
                <button onClick={compare.clear} className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" /> Ryd
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-1.5 pr-3">Metrik</th>
                    {compareProjects.map((p) => (
                      <th key={p.id} className="text-left py-1.5 pr-3 min-w-40">
                        <div className="font-semibold text-foreground">{p.title}</div>
                        <div className="text-[10px]">{p.country}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    ["CO₂e potentiale", (p: any) => `${fmt(p.co2ePotential)} t`],
                    ["Biodiversitetsindeks", (p: any) => `${p.biodiversityIndex}/100`],
                    ["Areal", (p: any) => `${fmt(p.hectares)} ha`],
                    ["Datakvalitet", (p: any) => `${p.dataQuality}%`],
                    ["Verifikation", (p: any) => p.verification],
                    ["Risiko", (p: any) => p.risk],
                    ["Rapportering", (p: any) => p.reporting],
                    ["Pris pr. enhed", (p: any) => `${p.pricePerUnit} kr`],
                  ].map(([label, fn]) => (
                    <tr key={label as string}>
                      <td className="py-2 pr-3 text-muted-foreground">{label as string}</td>
                      {compareProjects.map((p) => (
                        <td key={p.id} className="py-2 pr-3 tabular-nums">{(fn as any)(p)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Link to="/app/impact/portfolio" className="text-xs rounded-lg border px-3 py-1.5 hover:bg-muted">
                Føj alle til portefølje
              </Link>
              <button className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Eksportér sammenligning
              </button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
