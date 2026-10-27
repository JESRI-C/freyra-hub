import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ArrowRight, Database } from "lucide-react";
import { CONNECTOR_REGISTRY } from "@/data/connectors-registry";
import { ConnectorRegistryTable } from "@/components/data-foundation/ConnectorRegistryTable";
import { useAuth } from "@/lib/auth";
import { AdvancedSettings } from "@/components/redesign/AdvancedSettings";

export const Route = createFileRoute("/app/sources")({
  head: () => ({ meta: [{ title: "Kilder — Freyra" }] }),
  component: SourcesPage,
});

function SourcesPage() {
  const [search, setSearch] = useState("");
  const { currentProject } = useAuth();
  const items = CONNECTOR_REGISTRY.filter((item) =>
    `${item.name} ${item.provider} ${item.category}`
      .toLocaleLowerCase("da-DK")
      .includes(search.toLocaleLowerCase("da-DK")),
  );
  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-8 lg:p-10">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Freyra · Kilder og metoder
        </p>
        <h1 className="mt-3 text-4xl">Hvad bygger dokumentationen på?</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Se de offentlige kilder, Freyra kan arbejde med. I den enkelte sag kan du se præcis, hvad
          der er hentet, hvornår det er hentet, og hvad der mangler.
        </p>
      </header>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-5">
        <div className="flex items-start gap-3">
          <Database className="mt-1 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg">Kildekataloget er en oversigt</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              En kilde i kataloget betyder ikke, at den dækker din sag. Gemte kildeversioner og
              deres mangler findes under Baseline.
            </p>
          </div>
        </div>
        {currentProject ? (
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground"
            to="/app/projects/$slug"
            params={{ slug: currentProject.slug ?? currentProject.id }}
            search={{ step: "baseline" }}
          >
            Se sagens baseline <ArrowRight className="size-4" />
          </Link>
        ) : (
          <Link className="text-sm text-primary underline" to="/app/projects">
            Vælg en sag for at se baseline
          </Link>
        )}
      </section>
      <label className="flex max-w-xl items-center gap-3 rounded-lg border bg-card p-3">
        <Search className="size-4 text-muted-foreground" />
        <span className="sr-only">Søg i kilder</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Søg efter kilde eller udbyder…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      {items.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-lg border bg-card p-5">
                <p className="text-xs text-muted-foreground">{item.provider}</p>
                <h2 className="mt-2 text-xl">{item.name}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Geografisk område: {item.coverage} · {item.license}
                </p>
              </article>
            ))}
          </div>
          <AdvancedSettings description="Det eksisterende kildekatalog med formater, metodeoplysninger og teknisk integrationsstatus. Status i kataloget beskriver tilslutningen og dokumenterer ikke dækning i din sag.">
            <div className="overflow-x-auto">
              <ConnectorRegistryTable connectors={items} />
            </div>
          </AdvancedSettings>
        </>
      ) : (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-xl">Ingen kilder matcher din søgning</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Prøv navnet på en udbyder eller en kortere søgning.
          </p>
          <button className="mt-4 text-sm text-primary underline" onClick={() => setSearch("")}>
            Vis alle kilder
          </button>
        </div>
      )}
      <Link to="/app/connect/registry" className="inline-block text-sm text-primary underline">
        Åbn den fulde oversigt over data og metoder
      </Link>
    </main>
  );
}
