import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import {
  getSurveyRoundMediaAccess,
  getSurveyRoundMedia,
  listSurveyRoundMedia,
  listSurveyRoundMediaCandidates,
  saveSurveyRoundMedia,
  type SurveyRoundMediaCandidate,
} from "@/lib/survey-round-media.functions";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import {
  createInspectionPhotoBatch,
  inspectionPhotoBatchKey,
  INSPECTION_PHOTO_PAGE_SIZE,
  MAX_INSPECTION_PHOTOS,
  readInspectionPhotoBatch,
  reopenInspectionPhotoBatch,
  sameInspectionPhotoBatchRequests,
  runInspectionPhotoBatch,
  writeInspectionPhotoBatch,
  type InspectionPhotoBatchReceipt,
} from "./inspection-photo-batch";

export interface InspectionPhotoBatchProps {
  round: SurveyRoundVersion;
  onAssigned?: () => void | Promise<void>;
}

function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Fotos kunne ikke indlæses eller tilknyttes.";
}

/** Explicit bulk work assignment to a saved round. This does not interpret or approve photos. */
export function InspectionPhotoBatch({ round, onAssigned }: InspectionPhotoBatchProps) {
  const { user } = useAuth();
  const getAccess = useServerFn(getSurveyRoundMediaAccess);
  const listCandidates = useServerFn(listSurveyRoundMediaCandidates);
  const listBindings = useServerFn(listSurveyRoundMedia);
  const getBinding = useServerFn(getSurveyRoundMedia);
  const saveBinding = useServerFn(saveSurveyRoundMedia);
  const key = JSON.stringify([
    user?.id ?? null,
    round.projectId,
    round.id,
    round.manifestSha256,
    round.baselineId,
    round.baselineSha256,
    round.planId,
    round.planSha256,
    round.manifest.questionIds,
  ]);
  const current = useRef({ key, generation: 0, alive: true });
  if (current.current.key !== key) {
    current.current.key = key;
    current.current.generation++;
  }
  const token = { key, generation: current.current.generation };
  const isCurrent = () =>
    current.current.alive &&
    current.current.key === token.key &&
    current.current.generation === token.generation;
  const assertCurrent = () => {
    if (!isCurrent())
      throw new Error("Brugeren eller rundeversionen er ændret. Genåbn fotoarbejdet.");
  };
  const [view, setView] = useState<{
    key: string;
    access: { userId: string; projectId: string; canAssign: boolean } | null;
    candidates: SurveyRoundMediaCandidate[];
    nextBeforeId: string | null;
    selected: string[];
    batch: InspectionPhotoBatchReceipt | null;
    hydrated: boolean;
    pending: boolean;
    error: string | null;
  }>({
    key,
    access: null,
    candidates: [],
    nextBeforeId: null,
    selected: [],
    batch: null,
    hydrated: false,
    pending: false,
    error: null,
  });
  const busy = useRef(false);
  const scope = user ? { actorId: user.id, round } : null;
  const ready =
    view.key === key &&
    view.hydrated &&
    scope !== null &&
    view.access !== null &&
    view.access.userId === scope.actorId &&
    view.access.projectId === round.projectId;
  const currentView = view.key === key ? view : null;
  const canAssign = ready && view.access?.canAssign === true;
  useEffect(() => {
    const lifecycle = current.current;
    lifecycle.alive = true;
    return () => {
      lifecycle.alive = false;
    };
  }, []);
  useEffect(() => {
    busy.current = false;
    const initial = {
      key,
      access: null,
      candidates: [],
      nextBeforeId: null,
      selected: [],
      batch: null,
      hydrated: false,
      pending: false,
      error: null,
    };
    setView(initial);
    if (!scope || round.status !== "draft" || round.manifest.questionIds.length === 0) return;
    try {
      const text = localStorage.getItem(inspectionPhotoBatchKey(scope));
      const stored = readInspectionPhotoBatch(text, scope);
      const batch = stored ? reopenInspectionPhotoBatch(stored) : null;
      setView({ ...initial, batch });
    } catch (failure) {
      setView({ ...initial, error: message(failure) });
      return;
    }
    void load(false);
    // The complete immutable scope is included in key. Old in-flight work uses its own token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function load(append: boolean) {
    if (!scope || busy.current) return;
    busy.current = true;
    setView((previous) => ({ ...previous, pending: true, error: null }));
    try {
      assertCurrent();
      const access = await getAccess({ data: { projectId: round.projectId } });
      assertCurrent();
      if (access.userId !== scope.actorId || access.projectId !== round.projectId)
        throw new Error("Adgangssvaret matcher ikke den aktuelle bruger og sag.");
      const existing = append && currentView ? currentView.candidates : [];
      const cursor = append ? currentView?.nextBeforeId : undefined;
      if (append && (!cursor || existing.length >= MAX_INSPECTION_PHOTOS)) return;
      const limit = Math.min(INSPECTION_PHOTO_PAGE_SIZE, MAX_INSPECTION_PHOTOS - existing.length);
      const page = await listCandidates({
        data: { projectId: round.projectId, beforeId: cursor ?? undefined, limit },
      });
      assertCurrent();
      const combined = [...existing, ...page.items];
      if (
        page.items.length > limit ||
        combined.length > MAX_INSPECTION_PHOTOS ||
        new Set(combined.map((candidate) => candidate.mediaId)).size !== combined.length ||
        (page.nextBeforeId !== null &&
          (page.items.length === 0 || page.nextBeforeId !== page.items.at(-1)?.mediaId))
      )
        throw new Error("Fotosiden har gentagne eller uventede referencer. Genindlæs listen.");
      setView((previous) => ({
        ...previous,
        access,
        candidates: combined,
        nextBeforeId: page.nextBeforeId,
        selected: append ? previous.selected : [],
        hydrated: true,
        error: null,
      }));
    } catch (failure) {
      if (isCurrent())
        setView((previous) => ({ ...previous, access: null, error: message(failure) }));
    } finally {
      if (isCurrent()) {
        busy.current = false;
        setView((previous) => ({ ...previous, pending: false }));
      }
    }
  }

  async function assign() {
    if (!scope || !ready || busy.current) return;
    busy.current = true;
    setView((previous) => ({ ...previous, pending: true, error: null }));
    let confirmedBefore = 0;
    let notify = false;
    try {
      const storageKey = inspectionPhotoBatchKey(scope);
      const run = async () => {
        assertCurrent();
        const storedText = localStorage.getItem(storageKey);
        let batch = readInspectionPhotoBatch(storedText, scope);
        if (!batch && view.batch)
          throw new Error("Den fastholdte batchreference mangler. Genåbn siden før et nyt forsøg.");
        if (batch && !view.batch) {
          const reopened = reopenInspectionPhotoBatch(batch);
          setView((previous) => ({ ...previous, batch: reopened }));
          throw new Error("Et tidligere batch er fundet. Kontrollér det og vælg genforsøg.");
        }
        if (batch && view.batch && !sameInspectionPhotoBatchRequests(batch, view.batch)) {
          const reopened = reopenInspectionPhotoBatch(batch);
          setView((previous) => ({ ...previous, batch: reopened }));
          throw new Error(
            "Batchen er ændret i et andet vindue. Kontrollér den viste batch før genforsøg.",
          );
        }
        if (batch && view.batch) batch = view.batch;
        if (!batch) {
          if (!canAssign || view.selected.length === 0)
            throw new Error("Vælg mindst ét originalfoto, og kontrollér din aktuelle adgang.");
          const selected = view.candidates.filter((candidate) =>
            view.selected.includes(candidate.mediaId),
          );
          if (selected.length !== view.selected.length)
            throw new Error("De valgte fotos matcher ikke den indlæste liste.");
          batch = createInspectionPhotoBatch(scope, selected);
          writeInspectionPhotoBatch(localStorage, scope, batch, storedText);
          setView((previous) => ({ ...previous, batch }));
        }
        confirmedBefore = batch.entries.filter((entry) => entry.status === "confirmed").length;
        const result = await runInspectionPhotoBatch({
          scope,
          storage: localStorage,
          api: { getAccess, listBindings, getBinding, saveBinding },
          expectedBatch: batch!,
          assertCurrent,
          onProgress: (updated) => {
            assertCurrent();
            notify =
              updated.entries.filter((entry) => entry.status === "confirmed").length >
              confirmedBefore;
            setView((previous) => ({ ...previous, batch: updated }));
          },
        });
        assertCurrent();
        setView((previous) => ({ ...previous, batch: result }));
      };
      if (typeof navigator !== "undefined" && navigator.locks)
        await navigator.locks.request(`${storageKey}:run`, { mode: "exclusive" }, run);
      else await run();
      assertCurrent();
    } catch (failure) {
      if (isCurrent()) setView((previous) => ({ ...previous, error: message(failure) }));
    } finally {
      if (isCurrent() && notify) {
        try {
          await onAssigned?.();
          assertCurrent();
        } catch (failure) {
          if (isCurrent()) setView((previous) => ({ ...previous, error: message(failure) }));
        }
      }
      if (isCurrent()) {
        busy.current = false;
        setView((previous) => ({ ...previous, pending: false }));
      }
    }
  }

  async function finishBatch() {
    if (
      !scope ||
      !view.batch ||
      busy.current ||
      view.batch.entries.some((entry) => entry.status === "pending")
    )
      return;
    busy.current = true;
    setView((previous) => ({ ...previous, pending: true }));
    try {
      const storageKey = inspectionPhotoBatchKey(scope);
      const finish = () => {
        assertCurrent();
        if (localStorage.getItem(storageKey) !== JSON.stringify(view.batch))
          throw new Error("Batchen er ændret i et andet vindue. Genåbn den før afslutning.");
        localStorage.removeItem(storageKey);
        if (localStorage.getItem(storageKey) !== null)
          throw new Error(
            "Batchreferencen kunne ikke ryddes. De bekræftede tilknytninger er bevaret.",
          );
        setView((previous) => ({ ...previous, batch: null, selected: [], error: null }));
      };
      if (typeof navigator !== "undefined" && navigator.locks)
        await navigator.locks.request(`${storageKey}:run`, { mode: "exclusive" }, finish);
      else finish();
      assertCurrent();
    } catch (failure) {
      if (isCurrent()) setView((previous) => ({ ...previous, error: message(failure) }));
    } finally {
      if (isCurrent()) {
        busy.current = false;
        setView((previous) => ({ ...previous, pending: false }));
      }
    }
  }

  const batch = currentView?.batch;
  const confirmed = batch?.entries.filter((entry) => entry.status === "confirmed").length ?? 0;
  const conflicts = batch?.entries.filter((entry) => entry.status === "conflict").length ?? 0;
  const pending = batch?.entries.filter((entry) => entry.status === "pending").length ?? 0;
  const locked = !!currentView?.pending || !!batch || !canAssign;
  return (
    <section
      aria-label="Tilknyt flere fotos til runden"
      className="rounded-xl border p-4 space-y-4"
    >
      <div>
        <h3 className="font-semibold">Knyt fotos til undersøgelsen</h3>
        <p className="text-sm text-muted-foreground">
          Vælg kontrollerede originaler fra denne sag. Ét klik knytter dem til rundens{" "}
          {round.manifest.questionIds.length} gemte spørgsmål som en arbejdsopgave. Det er ikke en
          AI-vurdering eller faglig godkendelse af billederne.
        </p>
      </div>
      {!user && <p className="text-sm">Log ind for at se sagens fotos.</p>}
      {(round.status !== "draft" || round.manifest.questionIds.length === 0) && (
        <p className="text-sm">Vælg en gemt kladderunde med mindst ét spørgsmål.</p>
      )}
      {currentView?.error && (
        <p role="alert" className="text-sm text-destructive">
          {currentView.error}
        </p>
      )}
      {currentView?.pending && (
        <p role="status" className="text-sm">
          Arbejder med fotos …
        </p>
      )}
      {ready && !canAssign && (
        <p className="text-sm">
          Du har læseadgang. Nye tilknytninger kræver bidragsadgang til sagen.
        </p>
      )}
      {!batch && !!currentView?.candidates.length && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={locked}
              checked={view.selected.length === view.candidates.length && view.selected.length > 0}
              onChange={(event) =>
                setView((previous) => ({
                  ...previous,
                  selected: event.target.checked
                    ? previous.candidates.map((candidate) => candidate.mediaId)
                    : [],
                }))
              }
            />
            Vælg alle {view.candidates.length} indlæste fotos
          </label>
          <ul className="max-h-80 overflow-y-auto divide-y">
            {view.candidates.map((candidate) => (
              <li key={candidate.mediaId} className="py-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={view.selected.includes(candidate.mediaId)}
                    onChange={(event) =>
                      setView((previous) => ({
                        ...previous,
                        selected: event.target.checked
                          ? [...previous.selected, candidate.mediaId]
                          : previous.selected.filter((id) => id !== candidate.mediaId),
                      }))
                    }
                  />
                  <span className="min-w-0 break-words">
                    {candidate.fileName}
                    <span className="block text-xs text-muted-foreground">
                      {(candidate.sizeBytes / 1024 / 1024).toFixed(1)} MB · Originalkontrol{" "}
                      {candidate.originalValidationStatus === "review_required"
                        ? "kræver gennemgang"
                        : "gemt"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {view.selected.length} valgt. Eksisterende tilknytninger kontrolleres før gemning og
            overskrives ikke.
          </p>
          {view.nextBeforeId && view.candidates.length < MAX_INSPECTION_PHOTOS && (
            <button
              type="button"
              disabled={locked}
              onClick={() => void load(true)}
              className="text-sm underline"
            >
              Vis flere fotos (højst 200)
            </button>
          )}
          {view.nextBeforeId && view.candidates.length >= MAX_INSPECTION_PHOTOS && (
            <p className="text-sm">
              Viser de første 200 originaler. Flere er ikke indlæst eller valgt.
            </p>
          )}
          <button
            type="button"
            disabled={locked || view.selected.length === 0}
            onClick={() => void assign()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Knyt {view.selected.length} valgte fotos til runden
          </button>
        </>
      )}
      {ready && !view.candidates.length && !view.pending && (
        <p className="text-sm">
          Ingen kontrollerede originalfotos i denne oversigt endnu. Upload originalerne til sagen
          først.
        </p>
      )}
      {!!batch && (
        <div className="space-y-3">
          <p role="status" className="text-sm">
            {confirmed} af {batch.entries.length} tilknytninger læsebekræftet · {pending} afventer ·{" "}
            {conflicts} konflikter
          </p>
          <ul className="space-y-2 text-sm">
            {batch.entries.map((entry) => (
              <li key={entry.receipt.input.requestId} className="rounded border p-2">
                <strong>{entry.receipt.fileName}</strong>:{" "}
                {entry.status === "confirmed"
                  ? "Gemt og læsebekræftet"
                  : entry.status === "conflict"
                    ? "Konflikt – eksisterende tilknytning bevares"
                    : "Afventer bekræftelse"}
                {entry.message && (
                  <p
                    className={
                      entry.status === "conflict" ? "text-amber-800" : "text-muted-foreground"
                    }
                  >
                    {entry.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {pending > 0 && (
            <button
              type="button"
              disabled={!ready || view.pending}
              onClick={() => void assign()}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
            >
              {conflicts
                ? "Fortsæt resterende fotos – viste konflikter bevares"
                : "Genoptag med de samme genforsøgsreferencer"}
            </button>
          )}
          {pending === 0 && (
            <button
              type="button"
              disabled={view.pending}
              onClick={() => void finishBatch()}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Afslut dette batch og vælg flere fotos
            </button>
          )}
        </div>
      )}
      {!currentView?.pending && user && (
        <button type="button" onClick={() => void load(false)} className="text-sm underline">
          Hent adgang og fotoliste igen
        </button>
      )}
    </section>
  );
}
