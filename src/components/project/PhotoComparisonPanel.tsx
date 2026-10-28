import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BeforeAfterCompare } from "@/components/project-workspace/BeforeAfterCompare";
import { latestExecutions, executionRevisions } from "@/lib/action-execution";
import {
  assessPhotoComparison,
  type PhotoComparison,
  type ComparisonAssessment,
} from "@/lib/photo-comparison";
import type { WorkspaceEntry } from "@/lib/project-workspace";
import type { ProjectScope } from "@/services/project-workspace-service";
import { listActionExecutions } from "@/services/action-execution-service";
import { listProjectMedia } from "@/services/project-media-service";
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
    queryFn: async () => {
      const result = await listProjectMedia(scope.projectId);
      if (!result.data) throw new Error(result.error ?? "Originalerne kunne ikke hentes.");
      return result.data.filter((m) => ["field_photo", "drone_image"].includes(m.category));
    },
    retry: false,
    staleTime: 0,
  });
  const [draft, setDraft] = useState<PhotoComparison | null>(null);
  const [base, setBase] = useState<WorkspaceEntry | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const allExecutions = executionRevisions(executions.data ?? []);
  const latest = latestExecutions(executions.data ?? []);
  function assessment(p: PhotoComparison): ComparisonAssessment {
    const exact = allExecutions.find((r) => r.entry.id === p.executionRevisionId);
    const current = latest.find((r) => r.execution.actionId === exact?.execution.actionId);
    const before = media.data?.find((m) => m.id === p.beforeId),
      after = media.data?.find((m) => m.id === p.afterId);
    if (!exact || !current || !before || !after)
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
    setDraft({
      schema: "freyra.photo-comparison/v1",
      comparisonId: crypto.randomUUID(),
      executionRevisionId: latest[0]?.entry.id ?? "",
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
  const ready = records.isSuccess && executions.isSuccess && media.isSuccess;
  const currentAssessment =
    draft?.beforeId &&
    draft.afterId &&
    draft.executionRevisionId &&
    draft.beforeId !== draft.afterId
      ? assessment(draft)
      : null;
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
                value={draft.executionRevisionId}
                onChange={(e) => setDraft({ ...draft, executionRevisionId: e.target.value })}
              >
                <option value="">Vælg dokumenteret udførelse</option>
                {allExecutions.map((r) => (
                  <option key={r.entry.id} value={r.entry.id}>
                    {r.execution.actualDate ?? "Planlagt"} ·{" "}
                    {r.execution.reach || "Strækning uafklaret"} · v{r.entry.version}
                    {latest.some((v) => v.entry.id === r.entry.id) ? " (aktuel)" : " (historisk)"}
                  </option>
                ))}
              </select>
            </label>
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
                        {m.title} · {m.capturedAt ?? "Optagedato ukendt"}
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
          {before && after && (
            <BeforeAfterCompare
              beforeUrl={before.url}
              afterUrl={after.url}
              beforeLabel={"Før · " + (before.capturedAt ?? "ukendt dato")}
              afterLabel={"Efter · " + (after.capturedAt ?? "ukendt dato")}
            />
          )}
          {currentAssessment && (
            <div role="status">
              <p>
                {currentAssessment.status === "reassessment_required"
                  ? "Kræver ny vurdering af udførelsesversionen"
                  : currentAssessment.status === "descriptive"
                    ? "Beskrivende sammenligning med de registrerede begrænsninger"
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
