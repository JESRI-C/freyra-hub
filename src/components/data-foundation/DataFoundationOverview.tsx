import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { CONNECTOR_REGISTRY, getActiveConnectors } from "@/data/connectors-registry";
import type { ConnectorCategory } from "@/lib/supabase/types";
import { Card, CardHeader } from "@/components/ui-bits";

const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  satellite: "Satellit",
  nature: "Natur",
  water: "Vand",
  terrain: "Terræn",
  weather: "Vejr",
  authority: "Myndighed",
  soil: "Jordbund",
  eu_reference: "EU-reference",
};

const CATEGORY_COLORS: Record<ConnectorCategory, string> = {
  satellite: "bg-violet-100 text-violet-700",
  nature: "bg-emerald-100 text-emerald-700",
  water: "bg-blue-100 text-blue-700",
  terrain: "bg-amber-100 text-amber-700",
  weather: "bg-sky-100 text-sky-700",
  authority: "bg-slate-100 text-slate-700",
  soil: "bg-orange-100 text-orange-700",
  eu_reference: "bg-indigo-100 text-indigo-700",
};

const NEXT_STEPS = [
  "Konfigurer VITE_DMI_API_KEY for adgang til DMI klimadata",
  "Konfigurer VITE_COPERNICUS_TOKEN for Sentinel-2 vegetationsanalyse",
  "Konfigurer VITE_DATAFORDELER_KEY for matrikeldata og højdemodel",
  "Tilknyt projektpolygoner for geometribaserede WFS-forespørgsler",
  "Aktivér connector_fetch_logs-tabellen i Supabase for aktivitetslog",
];

export function DataFoundationOverview() {
  const total = CONNECTOR_REGISTRY.length;
  const active = getActiveConnectors().length;

  // Unique categories present
  const categories = Array.from(
    new Set(CONNECTOR_REGISTRY.map((c) => c.category)),
  ) as ConnectorCategory[];

  return (
    <Card>
      <CardHeader
        title="Data Foundation"
        subtitle="Tilgængelige datakilder og API-forbindelser i GoFreyra-platformen"
        action={
          <Link
            to="/app/connect/registry"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            Se alle <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <div className="px-5 pb-5 space-y-4">
        {/* Stats row */}
        <div className="flex flex-wrap gap-4">
          <div className="rounded-xl border bg-muted/20 px-4 py-3 text-center min-w-[80px]">
            <div className="text-2xl font-semibold">{total}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Connectorer</div>
          </div>
          <div className="rounded-xl border bg-emerald-50 px-4 py-3 text-center min-w-[80px]">
            <div className="text-2xl font-semibold text-emerald-700">{active}</div>
            <div className="text-xs text-emerald-600 mt-0.5">Aktiv / Klar</div>
          </div>
          <div className="rounded-xl border bg-muted/20 px-4 py-3 text-center min-w-[80px]">
            <div className="text-2xl font-semibold">{categories.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Kategorier</div>
          </div>
        </div>

        {/* Category badges */}
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <span
              key={cat}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[cat]}`}
            >
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>

        {/* Next steps */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Næste integrationstrin
          </div>
          <ul className="space-y-1.5">
            {NEXT_STEPS.map((step, i) => {
              const done = i > 4; // none done yet
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <span className={done ? "text-muted-foreground line-through" : ""}>{step}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}
