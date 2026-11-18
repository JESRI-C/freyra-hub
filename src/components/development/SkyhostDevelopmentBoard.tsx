import { useMemo, useState } from "react";
import { z } from "zod";
import register from "./product-plan.json";
import { acceptanceEvidence, evidenceForFeature } from "./acceptance-evidence";

const states = {
  mapping: "Kortlægning",
  implementation: "Implementering",
  acceptance_pending: "Samlet accept afventer",
  done: "Færdig og verificeret",
} as const;
const featureSchema = z
  .object({
    id: z.string(),
    resId: z.string(),
    module: z.string(),
    feature: z.string(),
    actors: z.string(),
    data: z.string(),
    acceptance: z.string(),
    stage: z.string(),
    source: z.string(),
    deliveryStatus: z.enum(["mapping", "implementation", "acceptance_pending", "done"]),
    goFreyraDemoRoute: z.string().optional(),
    goFreyraFieldRoute: z.string().optional(),
    goFreyraReuseCode: z.array(z.string()).optional(),
  })
  .passthrough();
const features = z.object({ features: z.array(featureSchema) }).parse(register).features;
const modules = [...new Set(features.map((feature) => feature.module))].sort((a, b) =>
  a.localeCompare(b, "da"),
);
const control = "mt-1 min-h-11 w-full min-w-0 rounded-lg border bg-background px-3";
const steps = [
  "Kunde og sag",
  "Jobs · plan · tildeling",
  "Mobil · kort · dokumentation",
  "Godkendelse og historik",
  "Rapport og fakturagrundlag",
];

function demoRoute(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") && !/[<>\\\s]/.test(value)
    ? value
    : null;
}

export function SkyhostDevelopmentBoard() {
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [state, setState] = useState("");
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("da");
    return features.filter(
      (feature) =>
        (!module || feature.module === module) &&
        (!state || feature.deliveryStatus === state) &&
        (!term ||
          [
            feature.resId,
            feature.feature,
            feature.module,
            feature.actors,
            feature.data,
            feature.acceptance,
            feature.stage,
          ]
            .join(" ")
            .toLocaleLowerCase("da")
            .includes(term)),
    );
  }, [search, module, state]);
  return (
    <main className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6 px-3 py-5 sm:px-6">
      <header>
        <p className="text-sm text-muted-foreground">Administration · produktudvikling</p>
        <h1 className="text-2xl font-semibold">Skyhost → GoFreyra</h1>
        <p className="mt-2 max-w-3xl text-sm">
          Samlet overblik over funktioner, kodehenvisninger og acceptprøver. Kortlægningen er
          foreløbig. Kodehenvisninger dokumenterer ikke i sig selv en færdig funktion.
        </p>
      </header>
      <section aria-label="Whiteboard for feltarbejde" className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Whiteboard · sammenhæng i feltarbejdet</h2>
        <ol className="mt-3 grid gap-2 lg:grid-cols-5">
          {steps.map((step, index) => (
            <li key={step} className="rounded-lg border p-3 text-sm">
              <span className="mr-2 text-muted-foreground">{index + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">
          Materiel, GPS, kørebog, vintertjeneste og integrationer knyttes til forløbet. Roller og
          organisation afgrænser adgangen på tværs.
        </p>
      </section>
      <section aria-labelledby="development-kanban" className="min-w-0 space-y-4">
        <h2 id="development-kanban" className="text-lg font-semibold">
          Kanban · hele produktet
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Søg i krav og accept
            <input
              type="search"
              className={control}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Fx billeder, CO₂ eller F-040"
            />
          </label>
          <label className="text-sm font-medium">
            Modul
            <select
              className={control}
              value={module}
              onChange={(event) => setModule(event.target.value)}
            >
              <option value="">Alle moduler</option>
              {modules.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Udviklingsstatus
            <select
              className={control}
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              <option value="">Alle statusser</option>
              {Object.entries(states).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p role="status" className="text-sm">
          {rows.length} af {features.length} funktionsområder ·{" "}
          {features.filter((feature) => feature.deliveryStatus === "done").length} med afsluttet
          samlet accept
        </p>
        <div className="grid min-w-0 gap-4 xl:grid-cols-4 sm:grid-cols-2">
          {Object.entries(states)
            .filter(([key]) => !state || key === state)
            .map(([key, label]) => {
              const cards = rows.filter((feature) => feature.deliveryStatus === key);
              return (
                <section
                  key={key}
                  aria-label={label}
                  className="min-w-0 rounded-xl bg-muted/40 p-3"
                >
                  <h3 className="mb-3 font-semibold">
                    {label} ({cards.length})
                  </h3>
                  {cards.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ingen kort i dette udvalg.</p>
                  )}
                  <div className="space-y-3">
                    {cards.map((feature) => {
                      const routes = [
                        ...new Set(
                          [
                            demoRoute(feature.goFreyraDemoRoute),
                            demoRoute(feature.goFreyraFieldRoute),
                          ].filter((value): value is string => !!value),
                        ),
                      ];
                      const code = Object.entries(feature)
                        .filter(
                          ([name, value]) =>
                            /^goFreyra.*(?:Code|Migration)$/.test(name) &&
                            typeof value === "string",
                        )
                        .map(([, value]) => value as string);
                      return (
                        <article
                          key={feature.id}
                          data-res-id={feature.resId}
                          className="min-w-0 break-words rounded-lg border bg-card p-3 [overflow-wrap:anywhere]"
                        >
                          <p className="text-xs text-muted-foreground">
                            {feature.resId} · {feature.module}
                          </p>
                          <h4 className="mt-1 font-semibold">{feature.feature}</h4>
                          <p className="mt-2 text-sm">{feature.stage}</p>
                          <details className="mt-3 text-sm">
                            <summary className="min-h-11 cursor-pointer py-3 font-medium">
                              Krav og acceptprøve
                            </summary>
                            <dl className="space-y-3">
                              {[
                                ["Brugere", feature.actors],
                                ["Data og adgang", feature.data],
                                ["Acceptprøve", feature.acceptance],
                              ].map(([title, text]) => (
                                <div key={title}>
                                  <dt className="font-medium">{title}</dt>
                                  <dd className="mt-1">{text}</dd>
                                </div>
                              ))}
                            </dl>
                            <a
                              className="mt-3 inline-block py-2 underline"
                              href={feature.source}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Produktkilde
                            </a>
                            {code.map((path) => (
                              <p key={path} className="mt-2 text-xs">
                                <span className="font-medium">Kode: </span>
                                <code>{path}</code>
                              </p>
                            ))}
                            {feature.goFreyraReuseCode?.map((path) => (
                              <p key={path} className="mt-2 text-xs">
                                <span className="font-medium">Mulig genbrug: </span>
                                <code>{path}</code>
                              </p>
                            ))}
                            {routes.map((route) => (
                              <a
                                key={route}
                                href={route}
                                className="mt-3 block min-h-11 rounded-lg border px-3 py-2 underline"
                              >
                                Åbn i GoFreyra: {route}
                              </a>
                            ))}
                            {evidenceForFeature(feature).map((evidence) => (
                              <a
                                key={evidence.id}
                                href={`#${evidence.id}`}
                                className="mt-3 block min-h-11 rounded-lg border px-3 py-2 underline"
                              >
                                Prøvestatus: {evidence.title}
                              </a>
                            ))}
                            {[feature.goFreyraDemoRoute, feature.goFreyraFieldRoute]
                              .filter((route) => route && !demoRoute(route))
                              .map((route) => (
                                <p key={route} className="mt-2 text-xs">
                                  Vælg konkret job i appen: {route}
                                </p>
                              ))}
                          </details>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
        </div>
      </section>
      <section aria-label="Dokumenterede delprøver" className="min-w-0 space-y-3">
        <h2 className="text-lg font-semibold">Dokumenterede delprøver</h2>
        <p className="text-sm text-muted-foreground">
          Interne prøveresultater opbevares privat. Hele funktionsområdet og en fysisk telefon afventer fortsat accept på denne udgivelse.
        </p>
        {acceptanceEvidence.map((evidence) => (
          <div
            id={evidence.id}
            key={evidence.id}
            className="min-w-0 scroll-mt-6 rounded-xl border bg-card p-4"
          >
            <h3 className="font-semibold">{evidence.title}</h3>
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2">Vis prøvestatus</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">
                {JSON.stringify(evidence.result, null, 2)}
              </pre>
            </details>
          </div>
        ))}
      </section>
    </main>
  );
}
