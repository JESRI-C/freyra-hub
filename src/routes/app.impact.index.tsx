import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Search,
  Leaf,
  Trees,
  Sprout,
  ShieldCheck,
  Globe2,
  ArrowRight,
  Filter,
  Waves,
  Building2,
  FileBarChart,
  Brain,
  FileText,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import {
  ProjectCard,
  ProjectMap,
  ImpactMetricCard,
  Donut,
  ImpactChart,
  CategoryBadge,
} from "@/components/impact/Primitives";
import { PROJECTS, CATEGORIES } from "@/lib/impact-data";
import { usePortfolio, useCompare } from "@/lib/impact-state";
import {
  ModuleHeader,
  ActivityFeed,
  CriticalActionsPanel,
  CrossModuleLink,
  ReportReadinessBadge,
  actionToast,
} from "@/components/platform/Primitives";
import { ACTIVITY_FEED, CRITICAL_ACTIONS, PROJECT_FACTS } from "@/lib/platform-data";

export const Route = createFileRoute("/app/impact/")({
  head: () => ({ meta: [{ title: "Impact Exchange — GoFreyra" }] }),
  component: OverviewPage,
});

const FILTER_CHIPS = [
  "Alle",
  "Skov & natur",
  "Klimaprojekter",
  "Biodiversitet",
  "Jord & landbrug",
  "Vand & hav",
];

function OverviewPage() {
  const portfolio = usePortfolio();
  const compare = useCompare();
  const featured = PROJECTS.slice(0, 4);

  const verifSegments = [
    {
      label: "Verificeret",
      value: PROJECTS.filter((p) => p.verification === "Verificeret").length,
      color: "oklch(0.65 0.15 150)",
    },
    {
      label: "Under verifikation",
      value: PROJECTS.filter((p) => p.verification === "Under verifikation").length,
      color: "oklch(0.78 0.14 75)",
    },
    {
      label: "Planlagt",
      value: PROJECTS.filter((p) => p.verification === "Planlagt").length,
      color: "oklch(0.7 0.02 160)",
    },
  ];

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <ModuleHeader
        eyebrow="Impact Exchange"
        title="Impact Exchange"
        subtitle="Find, vurder og dokumentér verificerede natur- og klimaprojekter."
        projectName={PROJECT_FACTS.name}
        freshness="1 time"
        status="Verificeret"
        readiness={PROJECT_FACTS.reportReadiness}
        primaryCta={{
          label: "Find projekter",
          to: "/app/impact/projects",
          icon: <Search className="h-4 w-4" />,
        }}
        secondaryCta={{
          label: "Se portefølje",
          to: "/app/impact/portfolio",
          icon: <Globe2 className="h-4 w-4" />,
        }}
      />

      <div className="flex flex-wrap gap-2">
        <FilterPill label="Projekttype" />
        <FilterPill label="Region" />
        <FilterPill label="Standard" />
        <FilterPill label="Verifikation" />
      </div>

      {/* Map */}
      <Card>
        <CardHeader
          title="Globalt projekt-kort"
          subtitle="Verificerede projekter på tværs af kategorier og geografier"
          action={
            <div className="flex flex-wrap gap-1.5">
              {FILTER_CHIPS.map((c) => (
                <button
                  key={c}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    c === "Alle"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          }
        />
        <div className="px-5 pb-5">
          <ProjectMap projects={PROJECTS} />
        </div>
      </Card>

      {/* Impact summary */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <ImpactMetricCard
          label="Aktive projekter"
          value="28"
          icon={<Leaf className="h-4 w-4" />}
          hint="+3 denne måned"
        />
        <ImpactMetricCard
          label="CO₂e potentiale"
          value="1,24"
          unit="M ton"
          icon={<Trees className="h-4 w-4" />}
          hint="Akkumuleret over 10 år"
        />
        <ImpactMetricCard
          label="Areal beskyttet"
          value="56.320"
          unit="ha"
          icon={<Sprout className="h-4 w-4" />}
          hint="Beskyttet + restaureret"
        />
        <ImpactMetricCard
          label="Biodiversitetsindeks"
          value="78"
          unit="/100"
          icon={<Waves className="h-4 w-4" />}
          hint="Vægtet gennemsnit"
        />
      </div>

      {/* Verification trust */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-success/15 text-success grid place-items-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">
              Alle projekter er verificerede eller under tredjepartsverifikation
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
              Hvert projekt er knyttet til en akkrediteret partner, en metodik og en sporbar
              audit-trail i ESG Ledger.
            </p>
          </div>
        </div>
        <Link
          to="/app/impact/verification"
          className="text-sm rounded-lg border px-3 py-2 hover:bg-muted whitespace-nowrap"
        >
          Se verifikation
        </Link>
      </Card>

      {/* Featured grid */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Udvalgte projekter
          </h3>
          <Link to="/app/impact/projects" className="text-sm text-primary hover:underline">
            Se alle 28 →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {featured.map((p) => (
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
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Impact over tid"
            subtitle="CO₂e reduceret · areal beskyttet · biodiversitetsudvikling"
          />
          <div className="px-5 pb-5">
            <ImpactChart
              series={[
                {
                  label: "CO₂e",
                  values: [120, 138, 154, 172, 189, 206],
                  color: "oklch(0.5 0.13 155)",
                },
                { label: "Areal", values: [40, 52, 58, 64, 71, 78], color: "oklch(0.78 0.14 75)" },
                {
                  label: "Biodiversitet",
                  values: [62, 64, 67, 70, 73, 78],
                  color: "oklch(0.65 0.15 150)",
                },
              ]}
            />
            <div className="flex gap-4 text-xs text-muted-foreground mt-2">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: "oklch(0.5 0.13 155)" }}
                />
                CO₂e (kt)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: "oklch(0.78 0.14 75)" }}
                />
                Areal (kha)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: "oklch(0.65 0.15 150)" }}
                />
                Biodiversitetsindeks
              </span>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Verifikationsstatus" subtitle="Fordeling af projekter" />
          <div className="px-5 pb-5">
            <Donut segments={verifSegments} />
          </div>
        </Card>
      </div>

      {/* Categories */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold">Projektkategorier</div>
            <div className="text-xs text-muted-foreground">
              Otte tematiske kategorier af verificeret impact
            </div>
          </div>
          <Link
            to="/app/impact/projects"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Filtrér <Filter className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <CategoryBadge key={c} category={c} />
          ))}
        </div>
      </Card>

      {/* CTA */}
      <Card className="overflow-hidden">
        <div
          className="p-6 grid md:grid-cols-[1fr_auto] gap-4 items-center"
          style={{
            background: "linear-gradient(135deg, oklch(0.94 0.06 150), oklch(0.97 0.02 150))",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Skab reel impact</div>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Sæt verificerede natur- og klimaprojekter ind i din ESG-dokumentation. Bliv partner
                og få adgang til vores marketplace, ledger og verifikationspartnere.
              </p>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-soft hover:opacity-95">
            Bliv partner <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {/* Cross-module actions */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Projekt-handlinger
          </div>
          <button
            onClick={() => actionToast("Projektet er føjet til porteføljen")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <Globe2 className="h-3.5 w-3.5" /> Føj til portefølje
          </button>
          <button
            onClick={() => actionToast("Dokumentation sendt til ESG Ledger")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <FileBarChart className="h-3.5 w-3.5" /> Send til ESG Ledger
          </button>
          <button
            onClick={() => actionToast("Projektet bruges i rapportudkast")}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-background hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" /> Brug i rapport
          </button>
          <CrossModuleLink to="/app/decisions" label="Analysér med DecisionsIQ" />
          <span className="ml-auto">
            <ReportReadinessBadge value={86} />
          </span>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Seneste aktivitet" subtitle="Impact Exchange-relaterede hændelser" />
          <ActivityFeed items={ACTIVITY_FEED.filter((a) => a.module === "Impact Exchange")} />
        </Card>
        <Card>
          <CardHeader title="Kritiske handlinger" subtitle="På tværs af porteføljen" />
          <CriticalActionsPanel
            items={CRITICAL_ACTIONS.filter(
              (c) => c.module === "Impact Exchange" || c.module === "ESG Ledger",
            ).slice(0, 3)}
          />
        </Card>
      </div>
    </main>
  );
}

function FilterPill({ label }: { label: string }) {
  return (
    <button className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-xl bg-card border hover:bg-muted">
      <Filter className="h-3 w-3" /> {label}
    </button>
  );
}
