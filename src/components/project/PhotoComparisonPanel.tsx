import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BeforeAfterCompare } from "@/components/project-workspace/BeforeAfterCompare";
import { latestExecutions, executionRevisions } from "@/lib/action-execution";
import {
  assessPhotoComparison,
  comparisonCaptureLabel,
  suggestPhotoPairs,
  type PhotoComparison,
  type ComparisonAssessment,
} from "@/lib/photo-comparison";
import type { WorkspaceEntry } from "@/lib/project-workspace";
import type { ProjectScope } from "@/services/project-workspace-service";
import { listActionExecutions } from "@/services/action-execution-service";
import { getProjectMedia, listComparisonPhotos } from "@/services/project-media-service";
import {
  listPhotoComparisons,
  latestPhotoComparisons,
  savePhotoComparison,
} from "@/services/photo-comparison-service";
export function PhotoComparisonPanel({
  scope,
  canEdit,
}: {
  scope: ProjectScope;
  canEdit: boolean;
}) {
  const cache = useQueryClient();
  const key = ["photo-comparisons", scope.organizationId, scope.projectId];
  const records = useQuery({
    queryKey: key,
    queryFn: () => listPhotoComparisons(scope),
    retry: false,
  });
  const executions = useQuery({
    queryKey: ["action-executions", scope.organizationId, scope.projectId],
    queryFn: () => listActionExecutions(scope),
    retry: false,
  });
  const media = useQuery({
    queryKey: ["comparison-originals", scope.organizationId, scope.projectId],
    queryFn: () => listComparisonPhotos(scope.projectId),
    retry: false,
    staleTime: 0,
  });
  const [draft, setDraft] = useState<PhotoComparison | null>(null);
  const [base, setBase] = useState<WorkspaceEntry | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState<"execution" | "dates">("execution");
  const [earlierDate, setEarlierDate] = useState("");
  const [laterDate, setLaterDate] = useState("");
  const allExecutions = useMemo(() => executionRevisions(executions.data ?? []), [executions.data]);
  const latest = latestExecutions(executions.data ?? []);
  const selectedExecution = allExecutions.find(
    ({ entry }) => entry.id === draft?.executionRevisionId,
  );
  const hasDraft = draft !== null;
  const suggestions = useMemo(
    () =>
      hasDraft && canEdit
        ? suggestPhotoPairs(
            media.data ?? [],
            scope.projectId,
            selectedExecution?.execution,
            suggestionMode === "dates" ? { earlier: earlierDate, later: laterDate } : undefined,
          )
        : [],
    [
      canEdit,
      hasDraft,
      media.data,
      scope.projectId,
      selectedExecution,
      suggestionMode,
      earlierDate,
      laterDate,
    ],
  );
  function assessment(p: PhotoComparison): ComparisonAssessment {
    const exact = allExecutions.find((r) => r.entry.id === p.executionRevisionId);
    const current = latest.find((r) => r.execution.actionId === exact?.execution.actionId);
    const before = media.data?.find((m) => m.id === p.beforeId),
      after = media.data?.find((m) => m.id === p.afterId);
    if (!before || !after || (p.executionRevisionId && (!exact || !current)))
      return {
        status: "insufficient",
        gaps: ["Udførelse eller originaler er ikke tilgængelige."],
        quantitative: false,
      };
    return assessPhotoComparison(p, exact, current, before, after);
  }
  function create() {
    setBase(undefined);
    setError("");
    setSuggestionMode(latest.length ? "execution" : "dates");
    setEarlierDate("");
    setLaterDate("");
    setDraft({
      schema: "freyra.photo-comparison/v1",
      comparisonId: crypto.randomUUID(),
      executionRevisionId: latest[0]?.entry.id ?? null,
      beforeId: "",
      afterId: "",
      parameter: "visible_vegetation",
      samePlaceEvidence: "",
      commonCoverage: "unknown",
      coverageDescription: "",
      excludedAreas: "",
      captureDifferences: "",
      conclusion: "",
      correctionReason: "",
      quantitative: false,
    });
  }
  const field = "mt-1 block w-full rounded border bg-background p-2";
  const before = media.data?.find((m) => m.id === draft?.beforeId),
    after = media.data?.find((m) => m.id === draft?.afterId);
  const preview = useQuery({
    queryKey: ["comparison-preview", scope.organizationId, scope.projectId, before?.id, after?.id],
    enabled: !!before && !!after && before.id !== after.id,
    retry: false,
    gcTime: 0,
    queryFn: async () => {
      if (!before || !after) throw new Error("Vælg to originaler.");
      const [earlier, later] = await Promise.all(
        [before.id, after.id].map((id) => getProjectMedia(scope.projectId, id)),
      );
      if (!earlier.data || !later.data) throw new Error("Det valgte billedpar kunne ikke åbnes.");
      return { before: earlier.data, after: later.data };
    },
  });
  const ready = records.isSuccess && executions.isSuccess && media.isSuccess;
  const currentAssessment =
    draft?.beforeId && draft.afterId && draft.beforeId !== draft.afterId ? assessment(draft) : null;
  return (
    <section aria-label="Før og efter" className="space-y-4">
      <p>
        Sammenlign synlige forhold på samme strækning. Kamera-GPS er ikke billeddækning. Skjulte
        områder udelades; fotografier og Quick Orto åbner ikke en præcis arealmåling.
      </p>
      {!ready && !records.isError && !executions.isError && !media.isError && (
        <p role="status">Henter grundlag…</p>
      )}
      {(records.isError || executions.isError || media.isError) && (
        <p role="alert">Grundlaget kunne ikke hentes. Prøv igen.</p>
      )}
      {canEdit && (
        <Button disabled={!ready} onClick={create}>
          Opret beskrivende sammenligning
        </Button>
      )}
      {latestPhotoComparisons(records.data ?? []).map(({ entry, comparison }) => {
        const result = ready ? assessment(comparison) : null;
        return (
          <article key={entry.id} className="rounded border p-3">
            <h3>Fotopar · version {entry.version}</h3>
            <p>
              {result?.status === "reassessment_required"
                ? "Kræver ny vurdering"
                : result?.status === "descriptive"
                  ? "Beskrivende – ingen kvantitativ effekt"
                  : result?.status === "visual_only"
                    ? "Synlige forskelle mellem optagedatoer"
                    : result
                      ? "Utilstrækkeligt grundlag"
                      : "Afventer læsning"}
            </p>
            <ul>
              {result?.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              disabled={!ready}
              onClick={() => {
                setBase(entry);
                setDraft({ ...comparison, correctionReason: "" });
                setSuggestionMode(comparison.executionRevisionId ? "execution" : "dates");
                setEarlierDate("");
                setLaterDate("");
                setError("");
              }}
            >
              Åbn fotopar
            </Button>
          </article>
        );
      })}
      {draft && (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canEdit) return;
            setBusy(true);
            setError("");
            try {
              await savePhotoComparison(scope, draft, base);
              await cache.invalidateQueries({ queryKey: key });
              setDraft(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kunne ikke gemme.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={!canEdit || busy} className="space-y-3">
            <legend>Grundlag og sammenlignelighed</legend>
            <label className="block">
              Udførelsesversion
              <select
                className={field}
                value={draft.executionRevisionId ?? ""}
                onChange={(e) => {
                  const executionRevisionId = e.target.value || null;
                  setDraft({ ...draft, executionRevisionId });
                  if (!executionRevisionId) setSuggestionMode("dates");
                }}
              >
                <option value="">Sammenlign optagedatoer uden udførelsesreference</option>
                {allExecutions.map((r) => (
                  <option key={r.entry.id} value={r.entry.id}>
                    {r.execution.actualDate ?? "Planlagt"} ·{" "}
                    {r.execution.reach || "Strækning uafklaret"} · v{r.entry.version}
                    {latest.some((v) => v.entry.id === r.entry.id) ? " (aktuel)" : " (historisk)"}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-2">
              <legend>Grundlag for billedforslag</legend>
              <select
                className={field}
                aria-label="Grundlag for billedforslag"
                value={suggestionMode}
                onChange={(e) => setSuggestionMode(e.target.value as typeof suggestionMode)}
              >
                <option value="execution">Omkring den registrerede arbejdsdato</option>
                <option value="dates">To valgte optagedatoer</option>
              </select>
              {suggestionMode === "dates" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    Tidligere optagedato
                    <input
                      type="date"
                      className={field}
                      value={earlierDate}
                      onChange={(e) => setEarlierDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Senere optagedato
                    <input
                      type="date"
                      className={field}
                      value={laterDate}
                      onChange={(e) => setLaterDate(e.target.value)}
                    />
                  </label>
                  {earlierDate &&
                    laterDate &&
                    (earlierDate >= laterDate || !suggestions.length) && (
                      <p role="status" className="text-sm">
                        {earlierDate >= laterDate
                          ? "Vælg to forskellige optagedatoer i kronologisk rækkefølge."
                          : "Der er ingen billedforslag for de valgte datoer. Du kan vælge originaler manuelt."}
                      </p>
                    )}
                </div>
              )}
            </fieldset>
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <h3>Foreslåede fotopar</h3>
                <p className="text-sm text-muted-foreground">
                  Forslagene bygger på optagedato og enten en gemt billedkobling eller højst 30 m
                  mellem registrerede kamerapositioner. Kontrollér motiv og fælles synlig dækning.
                </p>
                <ul className="space-y-2">
                  {suggestions.map(({ before, after, distanceM, linked }) => (
                    <li key={after.id}>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-9 w-full justify-start whitespace-normal text-left"
                        onClick={() =>
                          setDraft({ ...draft, beforeId: before.id, afterId: after.id })
                        }
                      >
                        {before.title} → {after.title} ·{" "}
                        {linked ? "Gemt billedkobling" : `${Math.round(distanceM!)} m`}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(["beforeId", "afterId"] as const).map((name) => (
                <label key={name}>
                  {name === "beforeId" ? "Før-original" : "Efter-original"}
                  <select
                    className={field}
                    value={draft[name]}
                    onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
                  >
                    <option value="">Vælg original</option>
                    {media.data?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} · {comparisonCaptureLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="block">
              Parameter
              <select
                className={field}
                value={draft.parameter}
                onChange={(e) =>
                  setDraft({ ...draft, parameter: e.target.value as PhotoComparison["parameter"] })
                }
              >
                <option value="visible_vegetation">Synlig vegetation</option>
                <option value="access">Adgangsforhold</option>
                <option value="other">Andet</option>
              </select>
            </label>
            <label className="block">
              Fælles synlig dækning
              <select
                className={field}
                value={draft.commonCoverage}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    commonCoverage: e.target.value as PhotoComparison["commonCoverage"],
                  })
                }
              >
                <option value="unknown">Ukendt</option>
                <option value="limited">Begrænset</option>
                <option value="documented">Dokumenteret</option>
              </select>
            </label>
            {(
              [
                [
                  "samePlaceEvidence",
                  "Samme sted – strækning, pejlemærker og begrundelse for parring",
                ],
                ["coverageDescription", "Fælles dækket delstrækning og begrænsninger"],
                [
                  "excludedAreas",
                  "Skjulte/udeladte områder, fx løv og refleksion (skriv også hvis ingen er kendt)",
                ],
                ["captureDifferences", "Forskelle i sæson, lys, vinkel og øvrige forhold"],
                ["conclusion", "Beskrivende observation og usikkerhed – ikke beregnet effekt"],
                ["correctionReason", "Årsag til rettelse"],
              ] as const
            ).map(([name, label]) => (
              <label key={name} className="block">
                {label}
                <textarea
                  className={field}
                  maxLength={2000}
                  value={draft[name]}
                  onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
                />
              </label>
            ))}
          </fieldset>
          {preview.isFetching && <p role="status">Henter billedparret…</p>}
          {preview.isError && (
            <div role="alert">
              Billedparret kunne ikke åbnes.{" "}
              <Button type="button" variant="outline" onClick={() => void preview.refetch()}>
                Prøv igen
              </Button>
            </div>
          )}
          {before && after && preview.data && (
            <BeforeAfterCompare
              beforeUrl={preview.data.before.url}
              afterUrl={preview.data.after.url}
              beforeLabel={"Tidligere · " + comparisonCaptureLabel(before)}
              afterLabel={"Senere · " + comparisonCaptureLabel(after)}
            />
          )}
          {currentAssessment && (
            <div role="status">
              <p>
                {currentAssessment.status === "reassessment_required"
                  ? "Kræver ny vurdering af udførelsesversionen"
                  : currentAssessment.status === "descriptive"
                    ? "Beskrivende sammenligning med de registrerede begrænsninger"
                    : currentAssessment.status === "visual_only"
                      ? "Synlige forskelle mellem optagedatoer. Forholdet til indsatsen er uafklaret."
                      : "Utilstrækkeligt grundlag; kan gemmes som kladde"}
              </p>
              <ul>
                {currentAssessment.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
          {canEdit && <Button disabled={busy || !ready}>Gem sammenligningsversion</Button>}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
