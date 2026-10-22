import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Briefcase,
  Leaf,
  Trees,
  Sprout,
  ShieldCheck,
  Download,
  Send,
  Plus,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import { AiInsightBanner } from "@/components/ai/AiInsightBanner";
import {
  ImpactMetricCard,
  ProjectMap,
  Donut,
  CategoryBadge,
  VerificationBadge,
  RiskBadge,
  ReportingPill,
  DataQualityScore,
  fmt,
} from "@/components/impact/Primitives";
import { PROJECTS } from "@/lib/impact-data";
import { usePortfolio } from "@/lib/impact-state";

export const Route = createFileRoute("/app/impact/portfolio")({
  head: () => ({ meta: [{ title: "Min portefølje — Impact Exchange" }] }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const portfolio = usePortfolio();
  const items = PROJECTS.filter((p) => portfolio.has(p.id));

  const total = (k: keyof (typeof items)[number]) =>
    items.reduce((s, p) => s + (typeof p[k] === "number" ? (p[k] as number) : 0), 0);

  const co2 = total("co2ePotential");
  const ha = total("hectares");
  const bio = items.length
    ? Math.round(items.reduce((s, p) => s + p.biodiversityIndex, 0) / items.length)
    : 0;
  const reportingReady = items.length
    ? Math.round((items.filter((p) => p.reporting === "Rapportklar").length / items.length) * 100)
    : 0;

  const byType = Array.from(new Set(items.map((p) => p.category))).map((c) => ({
    label: c,
    value: items.filter((p) => p.category === c).length,
    color: [
      "oklch(0.5 0.13 155)",
      "oklch(0.65 0.15 150)",
      "oklch(0.78 0.14 75)",
      "oklch(0.6 0.21 25)",
      "oklch(0.7 0.16 145)",
      "oklch(0.5 0.13 220)",
    ][Math.floor(Math.random() * 6) % 6],
  }));
  const palette = [
    "oklch(0.5 0.13 155)",
    "oklch(0.65 0.15 150)",
    "oklch(0.78 0.14 75)",
    "oklch(0.6 0.21 25)",
    "oklch(0.7 0.16 145)",
    "oklch(0.5 0.13 220)",
  ];
  byType.forEach((s, i) => (s.color = palette[i % palette.length]));

  const byGeo = Array.from(new Set(items.map((p) => p.region))).map((r, i) => ({
    label: r,
    value: items.filter((p) => p.region === r).length,
    color: palette[(i + 2) % palette.length],
  }));

  const byVerif = ["Verificeret", "Under verifikation", "Planlagt"]
    .map((v, i) => ({
      label: v,
      value: items.filter((p) => p.verification === v).length,
      color: ["oklch(0.65 0.15 150)", "oklch(0.78 0.14 75)", "oklch(0.7 0.02 160)"][i],
    }))
    .filter((s) => s.value > 0);

  const byRisk = ["Lav", "Medium", "Høj"]
    .map((v, i) => ({
      label: v,
      value: items.filter((p) => p.risk === v).length,
      color: ["oklch(0.65 0.15 150)", "oklch(0.78 0.14 75)", "oklch(0.6 0.21 25)"][i],
    }))
    .filter((s) => s.value > 0);

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <AiInsightBanner
        module="Portefølje"
        tone="insight"
        cacheKey={`portfolio:${items.length}:${reportingReady}`}
        context={`Antal projekter: ${items.length}. CO₂e potentiale: ${fmt(co2)} t. Areal: ${fmt(ha)} ha. Gennemsnitlig biodiversitet: ${bio}/100. Andel rapportklar: ${reportingReady}%. Kategorier: ${byType.map((c) => `${c.label}=${c.value}`).join(", ")}.`}
      />

      {/* Summary */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">

        <ImpactMetricCard
          label="Projekter i portefølje"
          value={`${items.length}`}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="CO₂e potentiale"
          value={fmt(co2)}
          unit="t"
          icon={<Leaf className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="Areal"
          value={fmt(ha)}
          unit="ha"
          icon={<Trees className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="Biodiversitetsindeks"
          value={`${bio}`}
          unit="/100"
          icon={<Sprout className="h-4 w-4" />}
        />
        <ImpactMetricCard
          label="Rapportklar"
          value={`${reportingReady}`}
          unit="%"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      {/* Composition */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader title="Pr. projekttype" />
          <div className="px-5 pb-5">
            {byType.length ? <Donut size={140} segments={byType} /> : <Empty />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Pr. geografi" />
          <div className="px-5 pb-5">
            {byGeo.length ? <Donut size={140} segments={byGeo} /> : <Empty />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Pr. verifikation" />
          <div className="px-5 pb-5">
            {byVerif.length ? <Donut size={140} segments={byVerif} /> : <Empty />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Pr. risikoniveau" />
          <div className="px-5 pb-5">
            {byRisk.length ? <Donut size={140} segments={byRisk} /> : <Empty />}
          </div>
        </Card>
      </div>

      {/* Map */}
      <Card>
        <CardHeader
          title="Porteføljens projekter på kortet"
          subtitle={`${items.length} valgte projekter`}
        />
        <div className="px-5 pb-5">
          <ProjectMap projects={items} />
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Valgte projekter"
          subtitle="Klik for detaljer eller fjern fra portefølje"
        />
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
            <tr>
              <th className="px-5 py-2">Projekt</th>
              <th className="py-2">Land</th>
              <th className="py-2">Type</th>
              <th className="py-2 text-right">CO₂e</th>
              <th className="py-2 text-right">Bio.</th>
              <th className="py-2 text-right">Areal</th>
              <th className="py-2">Verifikation</th>
              <th className="py-2 w-28">Datakvalitet</th>
              <th className="py-2">Risiko</th>
              <th className="py-2">Rapportering</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-3 font-medium">{p.title}</td>
                <td>{p.country}</td>
                <td>
                  <CategoryBadge category={p.category} />
                </td>
                <td className="text-right tabular-nums">{fmt(p.co2ePotential)} t</td>
                <td className="text-right tabular-nums">{p.biodiversityIndex}</td>
                <td className="text-right tabular-nums">{fmt(p.hectares)} ha</td>
                <td>
                  <VerificationBadge status={p.verification} />
                </td>
                <td className="pr-3">
                  <DataQualityScore value={p.dataQuality} label="" />
                </td>
                <td>
                  <RiskBadge level={p.risk} />
                </td>
                <td>
                  <ReportingPill status={p.reporting} />
                </td>
                <td className="pr-5 text-right">
                  <button
                    onClick={() => portfolio.remove(p.id)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Fjern
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Ingen projekter i porteføljen endnu — gå til{" "}
                  <Link to="/app/impact/projects" className="text-primary hover:underline">
                    Projekter
                  </Link>{" "}
                  for at tilføje.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* AI insight + Reporting readiness */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-leaf/15 text-primary grid place-items-center">
              <Wand2 className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">AI portfolio insight</div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Porteføljen har stærk balance mellem CO₂-fortrængning og biodiversitetsværdi, men er
                overvægtet i Nordeuropa (4 af 6 projekter). Datadækningen er solid (ø91%), dog er to
                projekter i delvist klar rapporteringsstatus. AI'en anbefaler at supplere med 1
                marint projekt i Sydøstasien og at fremrykke verifikation af Danish Wetland
                Restoration for at hæve rapportklarheden over 85% inden Q3.
              </p>
              <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
                <li className="rounded-lg border p-2.5">
                  <span className="font-medium">Styrke:</span> Høj datakvalitet og bred
                  verifikationsdækning.
                </li>
                <li className="rounded-lg border p-2.5">
                  <span className="font-medium">Svaghed:</span> Geografisk koncentration i
                  Nordeuropa.
                </li>
                <li className="rounded-lg border p-2.5">
                  <span className="font-medium">Manglende dækning:</span> Marine økosystemer i
                  Asien.
                </li>
                <li className="rounded-lg border p-2.5 inline-flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-warning-foreground mt-0.5" />
                  <span>
                    <span className="font-medium">Risiko:</span> Afhængighed af 2
                    verifikationspartnere.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Rapporteringsklarhed" subtitle="Pr. dokumentationsdimension" />
          <div className="px-5 pb-5 space-y-3">
            {[
              ["CO₂-dokumentation", 88],
              ["Biodiversitetsdokumentation", 76],
              ["Verifikation", 82],
              ["Audit trail", 91],
              ["Datakvalitet", 90],
              ["ESG-relevans", 84],
            ].map(([l, v]) => (
              <DataQualityScore key={l as string} label={l as string} value={v as number} />
            ))}
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-end">
        <button className="text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center gap-1.5">
          <Download className="h-4 w-4" /> Eksportér porteføljerapport
        </button>
        <Link
          to="/app/ledger"
          className="text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center gap-1.5"
        >
          <Send className="h-4 w-4" /> Send til ESG Ledger
        </Link>
        <Link
          to="/app/impact/projects"
          className="text-sm rounded-lg border px-3 py-2 hover:bg-muted inline-flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Find flere projekter
        </Link>
        <button className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2 inline-flex items-center gap-1.5">
          <Wand2 className="h-4 w-4" /> Optimér portefølje
        </button>
      </div>
    </main>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground py-6 text-center">Ingen data endnu</div>;
}
