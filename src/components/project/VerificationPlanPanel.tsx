import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import {
  getVerificationPlan,
  listVerificationPlans,
  saveVerificationPlan,
} from "@/lib/verification-plan.functions";
import {
  createDraftVerificationPlan,
  type DraftVerificationPlan,
} from "@/services/baseline/verification-plan";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";

/** Preview, saved draft and future approval remain distinct. Save fetches no sources. */
export function VerificationPlanPanel({ snapshot }: { snapshot: PublicBaselineSnapshot }) {
  const [preview, setPreview] = useState<DraftVerificationPlan | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingRequest = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const savePlan = useServerFn(saveVerificationPlan);
  const listPlans = useServerFn(listVerificationPlans);
  const getPlan = useServerFn(getVerificationPlan);
  const versions = useInfiniteQuery({
    queryKey: ["verification-plans", snapshot.projectId, snapshot.id],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      listPlans({
        data: {
          projectId: snapshot.projectId,
          baselineId: snapshot.id,
          beforeVersion: pageParam,
          limit: 30,
        },
      }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    retry: false,
  });
  const summaries = versions.error
    ? []
    : (versions.data?.pages.flatMap((page) => page.items) ?? []);
  const activeId = selectedId ?? summaries[0]?.id ?? null;
  const saved = useQuery({
    queryKey: ["verification-plan", snapshot.projectId, activeId],
    queryFn: () => getPlan({ data: { projectId: snapshot.projectId, planId: activeId! } }),
    enabled: activeId !== null,
    retry: false,
  });
  const requestStorageKey = `gofreyra.verification-plan-request:${snapshot.projectId}:${snapshot.id}`;
  const save = useMutation({
    mutationFn: () => {
      // Persist only an opaque retry ID before the request. A reload after an
      // ambiguous response can safely retry the same write without a new version.
      if (!pendingRequest.current) {
        try {
          const previous = localStorage.getItem(requestStorageKey);
          if (
            previous &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previous)
          )
            pendingRequest.current = previous;
        } catch {
          /* In-memory retry remains available when local storage is unavailable. */
        }
      }
      pendingRequest.current ??= crypto.randomUUID();
      try {
        localStorage.setItem(requestStorageKey, pendingRequest.current);
      } catch {
        /* See above. */
      }
      return savePlan({
        data: {
          projectId: snapshot.projectId,
          baselineId: snapshot.id,
          requestId: pendingRequest.current,
        },
      });
    },
    onSuccess: async (version) => {
      pendingRequest.current = null;
      try {
        localStorage.removeItem(requestStorageKey);
      } catch {
        /* The persisted version is authoritative. */
      }
      setSelectedId(version.id);
      queryClient.setQueryData(["verification-plan", snapshot.projectId, version.id], version);
      await queryClient.invalidateQueries({
        queryKey: ["verification-plans", snapshot.projectId, snapshot.id],
      });
    },
    retry: false,
  });
  useEffect(() => {
    let current = true;
    setPreview(null);
    setPreviewError(null);
    void createDraftVerificationPlan(snapshot)
      .then((draft) => {
        if (current) setPreview(draft);
      })
      .catch((failure: unknown) => {
        if (current)
          setPreviewError(
            failure instanceof Error ? failure.message : "Verifikationsudkastet kunne ikke dannes.",
          );
      });
    return () => {
      current = false;
    };
  }, [snapshot]);
  const failure = save.error ?? versions.error ?? saved.error;
  const error =
    failure instanceof Error
      ? failure.message
      : failure
        ? "Planen kunne ikke læses eller gemmes."
        : previewError;
  const stored = versions.error || saved.error ? null : saved.data;
  const plan =
    versions.error || saved.error ? null : activeId ? (stored?.manifest ?? null) : preview;
  const priorityLabels = { high: "høj", normal: "normal", low: "lav" };

  return (
    <Card>
      <CardHeader
        title="Spørgsmål til drone og felt"
        subtitle={`Forslag fra gemt datagrundlag, version ${snapshot.version}`}
      />
      <div className="px-5 pb-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Rækkefølgen er datagrundlag → spørgsmål → drone/felt → faglig gennemgang. Disse forslag er
          endnu ikke en godkendt flyveplan eller registrerede resultater.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || !!previewError}
            className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
          >
            {save.isPending ? "Gemmer plan …" : "Gem planversion som udkast"}
          </button>
          {!!summaries.length && (
            <label className="text-sm space-y-1">
              <span className="block">Gemt planversion</span>
              <select
                value={activeId ?? ""}
                disabled={save.isPending}
                onChange={(event) => setSelectedId(event.target.value)}
                className="rounded border bg-background p-2 max-w-full"
              >
                {summaries.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version} ·{" "}
                    {new Date(version.createdAt).toLocaleString("da-DK")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {versions.hasNextPage && (
            <button
              type="button"
              disabled={versions.isFetchingNextPage}
              className="text-sm underline"
              onClick={() => void versions.fetchNextPage()}
            >
              {versions.isFetchingNextPage ? "Henter …" : "Vis ældre planversioner"}
            </button>
          )}
        </div>
        {stored ? (
          <p className="text-xs text-muted-foreground">
            Gemt udkast, version {stored.version}. Spørgsmål, metode og datagrundlag er fastholdt.
            Faglig godkendelse afventer.
          </p>
        ) : (
          !versions.isPending &&
          !activeId && (
            <p className="text-xs text-muted-foreground">
              Forslagene er endnu ikke gemt som en planversion.
            </p>
          )
        )}
        {(versions.isPending || saved.isFetching) && (
          <p className="text-sm text-muted-foreground">Henter gemte planer …</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!plan && !error && (
          <p className="text-sm text-muted-foreground">Danner forslag fra den gemte version …</p>
        )}
        {plan && (
          <>
            {plan.questions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Datagrundlaget giver endnu ingen dokumenterbare drone- eller feltspørgsmål.
              </p>
            )}
            {plan.questions.map((question) => (
              <div key={question.id} className="rounded border p-3 space-y-2">
                <div className="flex justify-between gap-3 text-sm">
                  <strong>{question.title}</strong>
                  <Pill tone="info">Udkast · {priorityLabels[question.priority]} prioritet</Pill>
                </div>
                <p className="text-sm">{question.question}</p>
                <p className="text-xs text-muted-foreground">{question.rationale}</p>
                <p className="text-xs text-muted-foreground">{question.area.restriction}</p>
                <p className="text-xs text-muted-foreground">
                  Undersøgelsesperiode: {question.dates.baselineFrom}–{question.dates.baselineTo}.
                  Kilde hentet: {question.dates.sourceFetchedAt.slice(0, 10)}.
                </p>
                <p className="text-sm">
                  <strong>Dokumentation:</strong>{" "}
                  {
                    question.requiredEvidence.find((evidence) => evidence.kind === "original_photo")
                      ?.description
                  }
                </p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Metode og usikkerhed</summary>
                  <p className="mt-2">{question.method}</p>
                  {question.uncertainty.map((warning) => (
                    <p key={warning} className="mt-1">
                      {warning}
                    </p>
                  ))}
                </details>
                <p className="text-xs text-muted-foreground">
                  Faglig gennemgang skal senere registrere: understøttet, afkræftet, ikke afgørligt
                  eller kræver besigtigelse.
                </p>
              </div>
            ))}
            {plan.baselineDataGaps.length > 0 && (
              <details className="rounded border p-3 text-sm">
                <summary className="cursor-pointer">
                  {plan.baselineDataGaps.length} kilder kræver mere datagrundlag
                </summary>
                <p className="mt-2 text-muted-foreground">
                  Manglende offentlige kilder skal hentes eller importeres. Dronefotos kan ikke
                  udfylde disse kildehuller.
                </p>
                {plan.baselineDataGaps.map((gap) => (
                  <p key={gap.sourceId} className="mt-2 text-xs text-muted-foreground">
                    <strong>
                      {gap.provider} · {gap.dataset}:
                    </strong>{" "}
                    {gap.reason}
                  </p>
                ))}
              </details>
            )}
            {plan.warnings.map((warning) => (
              <p key={warning} className="text-xs text-muted-foreground">
                {warning}
              </p>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}
