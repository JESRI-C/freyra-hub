import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  PROGRAM_AREAS,
  PROGRAM_FEATURES,
  programFeatureLink,
  programFeatureMatches,
  type ProgramFeature,
  SKYHOST_JOB_AREAS,
} from "@/lib/program-map";
import { WorkspaceGuide } from "./WorkspaceGuide";

const control = "min-h-11 min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium";
const statusLabels = {
  existing: "Eksisterende visning",
  partial: "Under udbygning",
  unlinked: "Afventer samling",
  planned: "Planlagt funktion",
};
export function ProgramMap({
  projectId,
  projectName,
}: {
  projectId?: string;
  projectName?: string;
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("all");
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState<"program" | "skyhost">("program");
  const term = query.trim().toLocaleLowerCase("da-DK");
  const visible = PROGRAM_FEATURES.filter(
    (item) =>
      (area === "all" || item.areaId === area) &&
      (status === "all" || item.status === status) &&
      programFeatureMatches(item, term),
  );
  return (
    <main className="mx-auto w-full max-w-[1200px] min-w-0 space-y-6 p-3 pb-12 sm:p-6 [overflow-wrap:anywhere]">
      <header>
        <h1 className="text-2xl font-semibold">Programoverblik</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Find funktionerne, forstå sammenhængen, og åbn det relevante arbejdsrum.
        </p>
      </header>
      <WorkspaceGuide
        question="Hvad kan du bruge Freyra til?"
        purpose="Fra naturproblem til plan, udførelse, vurdering og dokumentation. De eksisterende værktøjer er samlet her sammen med de funktioner, der fortsat skal udvikles."
        output="En fælles indgang til programmet med tydelig forskel på eksisterende visninger og planlagte funktioner."
      />
      <div className="flex flex-wrap gap-2" aria-label="Vælg programkort">
        <button
          type="button"
          className={button}
          aria-pressed={mode === "program"}
          onClick={() => setMode("program")}
        >
          Hele Freyra
        </button>
        <button
          type="button"
          className={button}
          aria-pressed={mode === "skyhost"}
          onClick={() => setMode("skyhost")}
        >
          Skyhosts ti jobområder
        </button>
      </div>
      <p className="text-sm">
        {projectName ? (
          <>
            Valgt naturprojekt: <strong>{projectName}</strong>. Projektværktøjer åbnes herfra på
            dette projekt.
          </>
        ) : (
          <>
            Vælg et naturprojekt for at åbne dets værktøjer. Fagmoduler vælger deres eget projekt.
          </>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        En eksisterende visning er ikke en godkendelse af data eller et løfte om fuld
        Skyhost-funktionalitet. Adgang og kildestatus kontrolleres i det enkelte arbejdsrum.
      </p>
      {mode === "program" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">
              Søg i programmet
              <input
                className={control}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Fx fotos, timer eller rapport"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Arbejdsområde
              <select
                aria-label="Arbejdsområde"
                className={control}
                value={area}
                onChange={(e) => setArea(e.target.value)}
              >
                <option value="all">Alle arbejdsområder</option>
                {PROGRAM_AREAS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Vis funktioner
              <select
                aria-label="Vis funktioner"
                className={control}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Alle funktioner</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status" className="text-sm">
            Fundne punkter: {visible.length}.
          </p>
          {!visible.length && (
            <div className="space-y-3">
              <p>Ingen funktioner matcher søgningen.</p>
              <button
                className={button}
                onClick={() => {
                  setQuery("");
                  setArea("all");
                  setStatus("all");
                }}
              >
                Vis alle funktioner igen
              </button>
            </div>
          )}
          {PROGRAM_AREAS.map((a) => {
            const items = visible.filter((item) => item.areaId === a.id);
            if (!items.length) return null;
            return (
              <details
                key={`${a.id}:${term}:${area}:${status}`}
                open={!!term || area !== "all" || status !== "all"}
                className="border-t pt-3"
              >
                <summary className="min-h-11 cursor-pointer py-3 text-lg font-semibold">
                  {a.label}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({items.length})
                  </span>
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {items.map((item) => (
                    <FeatureCard key={item.id} item={item} projectId={projectId} />
                  ))}
                </div>
              </details>
            );
          })}
        </>
      ) : (
        <section aria-label="Skyhost-jobkortets funktioner" className="space-y-4">
          <p className="text-sm">
            De ti områder følger den eksisterende Skyhost-kortlægning. Her ser du deres plads i
            Freyra og det konkrete restarbejde.
          </p>
          <ol className="grid gap-3 md:grid-cols-2">
            {SKYHOST_JOB_AREAS.map((a, i) => (
              <li key={a.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  Jobområde {i + 1} · {a.planned ? "Planlagt" : "Delvist samlet"}
                </p>
                <h2 className="text-lg font-semibold">{a.title}</h2>
                <p className="text-sm leading-6">{a.purpose}</p>
                <p className="text-sm">
                  <strong>Restarbejde: </strong>
                  {a.remaining}
                </p>
                <div className="flex flex-wrap gap-2">
                  {a.featureIds.map((id) => {
                    const feature = PROGRAM_FEATURES.find((f) => f.id === id)!;
                    return <FeatureAction key={id} item={feature} projectId={projectId} />;
                  })}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
function FeatureCard({ item, projectId }: { item: ProgramFeature; projectId?: string }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{statusLabels[item.status]}</p>
      <h3 className="font-semibold">{item.title}</h3>
      <p className="text-sm leading-6">{item.purpose}</p>
      <p className="border-t pt-3 text-sm leading-6">
        <strong>Det får du: </strong>
        {item.output}
      </p>
      <div className="mt-auto">
        <FeatureAction item={item} projectId={projectId} />
      </div>
    </article>
  );
}
function FeatureAction({ item, projectId }: { item: ProgramFeature; projectId?: string }) {
  const link = programFeatureLink(item, projectId);
  if (!link)
    return (
      <p className="text-sm text-muted-foreground">
        {item.title}: {item.status === "unlinked" ? "afventer samling" : "planlagt"}, kan endnu ikke
        åbnes.
      </p>
    );
  const needsProject = item.destination?.kind === "project" && !projectId;
  return (
    <Link to={link.to} search={link.search} className={button}>
      {needsProject
        ? `Vælg projekt til ${item.title}`
        : item.destination?.kind === "route" && item.destination.selectAt
          ? `Vælg projekt til ${item.title}`
          : `Åbn ${item.title}`}
    </Link>
  );
}
