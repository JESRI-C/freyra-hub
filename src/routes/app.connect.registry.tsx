import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Map } from "lucide-react";
import { PageHeader } from "@/components/ui-bits";
import { ConnectorRegistryTable } from "@/components/data-foundation/ConnectorRegistryTable";
import { CONNECTOR_REGISTRY, getActiveConnectors } from "@/data/connectors-registry";
import type { ConnectorCategory } from "@/lib/supabase/types";

export const Route = createFileRoute("/app/connect/registry")({
  head: () => ({ meta: [{ title: "Connector Registry — GoFreyra" }] }),
  component: RegistryPage,
});

type FilterCategory = ConnectorCategory | "all";

const FILTER_LABELS: { id: FilterCategory; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "satellite", label: "Satellit" },
  { id: "nature", label: "Natur" },
  { id: "water", label: "Vand" },
  { id: "terrain", label: "Terræn" },
  { id: "weather", label: "Vejr" },
  { id: "authority", label: "Myndighed" },
  { id: "soil", label: "Jordbund" },
  { id: "eu_reference", label: "EU-reference" },
];

function RegistryPage() {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");

  const filtered =
    activeFilter === "all"
      ? CONNECTOR_REGISTRY
      : CONNECTOR_REGISTRY.filter((c) => c.category === activeFilter);

  const activeCount = getActiveConnectors().length;
  const total = CONNECTOR_REGISTRY.length;

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="Data Connector Registry"
        description="Oversigt over alle tilgængelige datakilder og API-forbindelser i GoFreyra-platformen."
        actions={
          <Link
            to="/app/projects/map/$slug"
            params={{ slug: "skallebaek-biodiversity-pilot" }}
            className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm font-medium hover:bg-muted/40 transition"
          >
            <Map className="h-4 w-4 text-primary" />
            Åbn geodata-kort
          </Link>
        }
      />

      {/* Summary stats */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border bg-card px-4 py-2.5 flex items-center gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Connectorer i alt</div>
            <div className="text-xl font-semibold mt-0.5">{total}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-emerald-50 px-4 py-2.5 flex items-center gap-3">
          <div>
            <div className="text-xs text-emerald-600">Aktiv / Klar</div>
            <div className="text-xl font-semibold mt-0.5 text-emerald-700">{activeCount}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-card px-4 py-2.5 flex items-center gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Viser</div>
            <div className="text-xl font-semibold mt-0.5">{filtered.length}</div>
          </div>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveFilter(id)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              activeFilter === id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-muted/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Full table */}
      <ConnectorRegistryTable connectors={filtered} />

      {/* Info note */}
      <div className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
        <div className="font-medium text-foreground">Om Data Foundation</div>
        <p>
          Data Foundation er GoFreyras dataorkestreringslaag der forbinder projektområder med danske
          og europæiske åbne miljødatakilder. Connectorer med status "Aktiv" returnerer live-data.
          Connectorer med "Klar" kræver API-konfiguration via miljøvariable i <code>.env</code>
          -filen.
        </p>
        <p>
          Preview-tilstand returnerer geografisk realistiske eksempeldata fra Danmark og EU uden
          nettrafik, så platformen aldrig fejler ved manglende API-nøgler.
        </p>
      </div>
    </main>
  );
}
