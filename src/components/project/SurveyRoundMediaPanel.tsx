import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  getSurveyRoundMediaAccess,
  getSurveyRoundMedia,
  getSurveyRoundMediaOriginalUrl,
  listSurveyRoundMedia,
  listSurveyRoundMediaCandidates,
  saveSurveyRoundMedia,
} from "@/lib/survey-round-media.functions";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import type { VerificationPlanVersion } from "@/services/baseline/verification-plan-persistence";
import {
  assertSurveyRoundMediaSaved,
  createSurveyRoundMediaReceipt,
  readSurveyRoundMediaReceipt,
  surveyRoundMediaMatchesRound,
  surveyRoundMediaReceiptKey,
  type SurveyRoundMediaExecution,
  type SurveyRoundMediaReceipt,
  type SurveyRoundMediaSaveResult,
} from "./survey-round-media-request";

function readableError(failure: unknown): string {
  return failure instanceof Error
    ? failure.message
    : "Billedtilknytningen kunne ikke læses eller gemmes.";
}
/** Only a saved round is accepted. The original preview is requested separately and stays in memory. */
export function SurveyRoundMediaPanel({
  round,
  plan,
}: {
  round: SurveyRoundVersion;
  plan: VerificationPlanVersion;
}) {
  const { user } = useAuth();
  const [mediaId, setMediaId] = useState("");
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SurveyRoundMediaReceipt | null>(null);
  const [confirmedReceipt, setConfirmedReceipt] = useState<SurveyRoundMediaReceipt | null>(null);
  const [confirmedResult, setConfirmedResult] = useState<SurveyRoundMediaSaveResult | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    executionKey: string;
    generation: number;
    bindingKey: string;
    signedUrl: string;
    expiresAt: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const previewRequest = useRef(0);
  const pendingRequest = useRef<SurveyRoundMediaReceipt | null>(null);
  const queryClient = useQueryClient();
  const getAccess = useServerFn(getSurveyRoundMediaAccess);
  const getBinding = useServerFn(getSurveyRoundMedia);
  const listBindings = useServerFn(listSurveyRoundMedia);
  const listCandidates = useServerFn(listSurveyRoundMediaCandidates);
  const saveBinding = useServerFn(saveSurveyRoundMedia);
  const signOriginal = useServerFn(getSurveyRoundMediaOriginalUrl);
  const key = JSON.stringify([
    user?.id ?? null,
    round.projectId,
    round.id,
    round.manifestSha256,
    round.baselineId,
    round.baselineSha256,
    round.planId,
    round.planSha256,
  ]);
  const current = useRef({ key, generation: 0, instance: {}, alive: true });
  if (current.current.key !== key) {
    current.current.key = key;
    current.current.generation++;
  }
  const execution: SurveyRoundMediaExecution = {
    key,
    generation: current.current.generation,
    instance: current.current.instance,
  };
  const isCurrent = (token: SurveyRoundMediaExecution) =>
    current.current.alive &&
    current.current.key === token.key &&
    current.current.generation === token.generation &&
    current.current.instance === token.instance;
  const assertCurrent = (token: SurveyRoundMediaExecution) => {
    if (!isCurrent(token))
      throw new Error("Brugeren eller den valgte runde er ændret. Genåbn billedtilknytningen.");
  };
  useEffect(() => {
    const instance = current.current;
    instance.alive = true;
    return () => {
      instance.alive = false;
    };
  }, []);
  const bound =
    plan.projectId === round.projectId &&
    plan.id === round.planId &&
    plan.manifestSha256 === round.planSha256 &&
    plan.baselineId === round.baselineId &&
    plan.baselineSha256 === round.baselineSha256 &&
    round.status === "draft" &&
    round.manifest.questionIds.every((id) => plan.manifest.questions.some((q) => q.id === id));
  const access = useQuery({
    queryKey: ["survey-round-media-access", user?.id, round.projectId],
    queryFn: async () => {
      assertCurrent(execution);
      const value = await getAccess({ data: { projectId: round.projectId } });
      assertCurrent(execution);
      if (value.projectId !== round.projectId || value.userId !== user?.id)
        throw new Error("Adgangssvaret matcher ikke den aktuelle bruger og sag.");
      return value;
    },
    enabled: bound && !!user,
    retry: false,
  });
  const accessReady =
    !!user &&
    !access.error &&
    !access.isPending &&
    access.data?.userId === user.id &&
    access.data.projectId === round.projectId;
  const canAssign = accessReady && access.data?.canAssign === true;
  const scope = accessReady ? { actorId: access.data!.userId, round } : null;
  const receiptKey = scope ? surveyRoundMediaReceiptKey(scope) : null;
  const receiptReady = receiptKey !== null && receiptKey === hydratedKey;
  const candidates = useInfiniteQuery({
    queryKey: ["survey-round-media-candidates", user?.id, round.projectId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      assertCurrent(execution);
      const value = await listCandidates({
        data: { projectId: round.projectId, beforeId: pageParam, limit: 30 },
      });
      assertCurrent(execution);
      return value;
    },
    getNextPageParam: (page) => page.nextBeforeId ?? undefined,
    enabled: bound && accessReady,
    retry: false,
  });
  const available =
    accessReady && !candidates.error
      ? (candidates.data?.pages.flatMap((page) => page.items) ?? [])
      : [];
  const candidate = available.find((item) => item.mediaId === mediaId) ?? null;
  const bindings = useInfiniteQuery({
    queryKey: ["survey-round-media", user?.id, round.projectId, round.id, round.manifestSha256],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      assertCurrent(execution);
      const value = await listBindings({
        data: {
          projectId: round.projectId,
          roundVersionId: round.id,
          beforeVersion: pageParam,
          limit: 30,
        },
      });
      assertCurrent(execution);
      if (value.items.some((item) => !surveyRoundMediaMatchesRound(item, round)))
        throw new Error("En gemt billedtilknytning matcher ikke den valgte rundeversion.");
      return value;
    },
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    enabled: bound && accessReady,
    retry: false,
  });
  const stored =
    accessReady && !bindings.error
      ? (bindings.data?.pages.flatMap((page) => page.items) ?? [])
      : [];
  const selected = stored.find((item) => item.id === selectedBindingId) ?? stored[0] ?? null;
  const bindingKey = selected ? `${selected.id}:${selected.manifestSha256}` : "";
  const previewSelection = useRef(bindingKey);
  previewSelection.current = bindingKey;
  const recoveryVersion =
    confirmedResult &&
    isCurrent(confirmedResult.execution) &&
    confirmedResult.receipt.input.requestId === receipt?.input.requestId
      ? confirmedResult.version
      : null;
  const confirmedSaved = receipt
    ? ([...stored, ...(recoveryVersion ? [recoveryVersion] : [])].find((item) => {
        try {
          assertSurveyRoundMediaSaved(item, receipt, round);
          return true;
        } catch {
          return false;
        }
      }) ?? null)
    : null;
  const conflictSaved = receipt
    ? (stored.find(
        (item) =>
          surveyRoundMediaMatchesRound(item, round) &&
          item.mediaId === receipt.input.mediaId &&
          item.manifest.originalSha256 === receipt.originalSha256 &&
          item.manifest.originalValidationSha256 === receipt.originalValidationSha256 &&
          (item.createdBy !== receipt.actorId || item.requestId !== receipt.input.requestId),
      ) ?? null)
    : null;
  const alreadyBound = candidate
    ? stored.some((item) => item.mediaId === candidate.mediaId)
    : false;
  const retire = (result: SurveyRoundMediaSaveResult): void => {
    if (
      !scope ||
      !receiptKey ||
      !isCurrent(result.execution) ||
      result.receipt.actorId !== scope.actorId
    )
      return;
    setConfirmedReceipt(result.receipt);
    setConfirmedResult(result);
    // A completed authorized readback remains available for a fresh read-only
    // confirmation even if browser cleanup fails before the list is refreshed.
    void queryClient.invalidateQueries({
      queryKey: ["survey-round-media", user?.id, round.projectId, round.id, round.manifestSha256],
    });
    try {
      const savedReceipt = readSurveyRoundMediaReceipt(localStorage.getItem(receiptKey), scope);
      if (savedReceipt?.input.requestId === result.receipt.input.requestId) {
        localStorage.removeItem(receiptKey);
        if (
          readSurveyRoundMediaReceipt(localStorage.getItem(receiptKey), scope)?.input.requestId ===
          result.receipt.input.requestId
        )
          throw new Error("Genforsøget blev ikke ryddet.");
      }
    } catch {
      setLocalError(
        "Billedtilknytningen er bekræftet, men browserens genforsøgsreference kunne ikke ryddes. Den oprindelige reference er bevaret. Prøv bekræftelsen igen før en ny tilknytning.",
      );
      return;
    }
    if (pendingRequest.current?.input.requestId === result.receipt.input.requestId) {
      pendingRequest.current = null;
      setReceipt(null);
      setMediaId("");
      setQuestionIds([]);
    }
    setConfirmedReceipt(null);
    setConfirmedResult(null);
    setLocalError(null);
    setSelectedBindingId(result.version.id);
    save.reset();
    confirm.reset();
    closeConflict.reset();
  };
  const save = useMutation({
    mutationKey: ["survey-round-media-save", key, execution.generation],
    mutationFn: async (): Promise<SurveyRoundMediaSaveResult> => {
      assertCurrent(execution);
      if (
        !bound ||
        !scope ||
        !canAssign ||
        !receiptReady ||
        localError ||
        candidates.error ||
        bindings.error
      )
        throw new Error(
          "Din aktuelle adgang eller indlæsning tillader ikke at gemme billedtilknytningen.",
        );
      const currentAccess = await access.refetch();
      assertCurrent(execution);
      if (
        currentAccess.error ||
        currentAccess.data?.userId !== scope.actorId ||
        currentAccess.data.projectId !== round.projectId ||
        currentAccess.data.canAssign !== true
      )
        throw new Error("Din aktuelle adgang tillader ikke at tilknytte billeder til runden.");
      const shared = readSurveyRoundMediaReceipt(
        localStorage.getItem(surveyRoundMediaReceiptKey(scope)),
        scope,
      );
      if (!pendingRequest.current && shared) {
        pendingRequest.current = shared;
        setReceipt(shared);
        setMediaId(shared.input.mediaId);
        setQuestionIds([...shared.input.questionIds]);
        throw new Error(
          "Et tidligere genforsøg blev fundet. Kontrollér det genåbnede udkast og prøv igen.",
        );
      }
      if (!pendingRequest.current && alreadyBound)
        throw new Error(
          "Fotoet er allerede knyttet til denne rundeversion. Åbn den gemte tilknytning for at se dens fastholdte spørgsmål.",
        );
      if (!pendingRequest.current && !candidate) throw new Error("Vælg et originalfoto fra sagen.");
      const request =
        pendingRequest.current ??
        createSurveyRoundMediaReceipt(scope, candidate!, questionIds, crypto.randomUUID());
      if (shared && shared.input.requestId !== request.input.requestId)
        throw new Error(
          "Et andet vindue har et genforsøg for denne runde. Genåbn tilknytningerne før en ny gemning.",
        );
      pendingRequest.current = request;
      setReceipt(request);
      try {
        const text = JSON.stringify(request);
        localStorage.setItem(surveyRoundMediaReceiptKey(scope), text);
        if (localStorage.getItem(surveyRoundMediaReceiptKey(scope)) !== text)
          throw new Error("Genforsøget blev ikke fastholdt.");
      } catch {
        throw new Error(
          "Genforsøgsreferencen kunne ikke gemmes i browseren. Ingen billedtilknytning er sendt; dit udkast er bevaret i denne visning.",
        );
      }
      assertCurrent(execution);
      const written = await saveBinding({
        data: { ...request.input, expectedCallerUserId: request.actorId },
      });
      assertCurrent(execution);
      assertSurveyRoundMediaSaved(written, request, round);
      const version = await getBinding({
        data: { projectId: round.projectId, bindingId: written.id },
      });
      assertCurrent(execution);
      if (
        !version ||
        version.id !== written.id ||
        version.manifestSha256 !== written.manifestSha256
      )
        throw new Error(
          "Gemningen afventer bekræftelse fra den gemte tilknytning. Genforsøgsreferencen er bevaret.",
        );
      assertSurveyRoundMediaSaved(version, request, round);
      return { version, receipt: request, execution };
    },
    onSuccess: retire,
    onError: () => {
      if (isCurrent(execution)) void bindings.refetch();
    },
    retry: false,
  });
  const confirm = useMutation({
    mutationKey: [
      "survey-round-media-confirm",
      key,
      execution.generation,
      receipt?.input.requestId,
    ],
    mutationFn: async (): Promise<SurveyRoundMediaSaveResult> => {
      assertCurrent(execution);
      if (!receipt || !confirmedSaved || !scope)
        throw new Error("Hent de gemte tilknytninger igen for at bekræfte genforsøget.");
      const version = await getBinding({
        data: { projectId: round.projectId, bindingId: confirmedSaved.id },
      });
      assertCurrent(execution);
      if (
        !version ||
        version.id !== confirmedSaved.id ||
        version.manifestSha256 !== confirmedSaved.manifestSha256
      )
        throw new Error("Den gemte tilknytning kunne ikke bekræftes med din aktuelle læseadgang.");
      assertSurveyRoundMediaSaved(version, receipt, round);
      return { version, receipt, execution };
    },
    onSuccess: retire,
    retry: false,
  });
  const closeConflict = useMutation({
    mutationKey: [
      "survey-round-media-conflict",
      key,
      execution.generation,
      receipt?.input.requestId,
    ],
    mutationFn: async (): Promise<SurveyRoundMediaSaveResult> => {
      assertCurrent(execution);
      if (!receipt || !scope || !conflictSaved)
        throw new Error("Hent de gemte tilknytninger igen for at undersøge genforsøget.");
      const fresh = await listBindings({
        data: {
          projectId: round.projectId,
          roundVersionId: round.id,
          mediaId: receipt.input.mediaId,
          limit: 2,
        },
      });
      assertCurrent(execution);
      if (fresh.items.length !== 1 || fresh.nextBeforeVersion !== null)
        throw new Error("Den eksisterende tilknytning kunne ikke bekræftes entydigt.");
      const version = await getBinding({
        data: { projectId: round.projectId, bindingId: fresh.items[0].id },
      });
      assertCurrent(execution);
      if (
        !version ||
        version.id !== fresh.items[0].id ||
        version.manifestSha256 !== fresh.items[0].manifestSha256 ||
        !surveyRoundMediaMatchesRound(version, round) ||
        version.mediaId !== receipt.input.mediaId ||
        version.manifest.originalSha256 !== receipt.originalSha256 ||
        version.manifest.originalValidationSha256 !== receipt.originalValidationSha256 ||
        (version.createdBy === receipt.actorId && version.requestId === receipt.input.requestId)
      )
        throw new Error("Genforsøget er stadig uafklaret. Den oprindelige reference er bevaret.");
      return { version, receipt, execution };
    },
    onSuccess: retire,
    retry: false,
  });
  const showOriginal = async () => {
    assertCurrent(execution);
    if (!selected || bindings.error || !accessReady) return;
    const requestedKey = bindingKey;
    const requestNo = ++previewRequest.current;
    setPreview(null);
    setPreviewError(null);
    setPreviewPending(true);
    try {
      const value = await signOriginal({
        data: { projectId: round.projectId, bindingId: selected.id },
      });
      assertCurrent(execution);
      if (requestNo !== previewRequest.current || previewSelection.current !== requestedKey) return;
      if (
        value.bindingId !== selected.id ||
        value.bindingSha256 !== selected.manifestSha256 ||
        value.projectId !== round.projectId ||
        value.mediaId !== selected.mediaId ||
        value.originalSha256 !== selected.manifest.originalSha256 ||
        value.currentStorageVersionChecked !== true ||
        value.expiresInSeconds !== 60 ||
        value.reportEligible !== false ||
        value.georeferenced !== false
      )
        throw new Error("Forhåndsvisningen matcher ikke den aktuelle billedtilknytning.");
      setPreview({
        executionKey: execution.key,
        generation: execution.generation,
        bindingKey: requestedKey,
        signedUrl: value.signedUrl,
        expiresAt: Date.now() + 60_000,
      });
    } catch (failure) {
      if (
        isCurrent(execution) &&
        requestNo === previewRequest.current &&
        previewSelection.current === requestedKey
      )
        setPreviewError(readableError(failure));
    } finally {
      if (
        isCurrent(execution) &&
        requestNo === previewRequest.current &&
        previewSelection.current === requestedKey
      )
        setPreviewPending(false);
    }
  };
  useEffect(() => {
    previewRequest.current++;
    setPreview(null);
    setPreviewError(null);
    setPreviewPending(false);
  }, [key, bindingKey]);
  useEffect(() => {
    if (!receiptKey || !scope || !isCurrent(execution)) return;
    setHydratedKey(null);
    setPreview(null);
    setConfirmedReceipt(null);
    setConfirmedResult(null);
    setSelectedBindingId(null);
    try {
      const previous = readSurveyRoundMediaReceipt(localStorage.getItem(receiptKey), scope);
      pendingRequest.current = previous;
      setReceipt(previous);
      setMediaId(previous?.input.mediaId ?? "");
      setQuestionIds(previous ? [...previous.input.questionIds] : []);
      setLocalError(null);
    } catch (failure) {
      setLocalError(`Genforsøget kan ikke genåbnes: ${readableError(failure)}`);
    }
    setHydratedKey(receiptKey);
    // Immutable round pins and caller identity define the durable receipt scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptKey]);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(
      () => setPreview((value) => (value === preview ? null : value)),
      Math.max(0, preview.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [preview]);
  const visiblePreview =
    accessReady &&
    !bindings.error &&
    preview?.executionKey === key &&
    preview.generation === execution.generation &&
    preview.bindingKey === bindingKey &&
    preview.expiresAt > Date.now()
      ? preview
      : null;
  const pending = save.isPending || confirm.isPending || closeConflict.isPending;
  const locked =
    !canAssign ||
    pending ||
    !!receipt ||
    !receiptReady ||
    !!localError ||
    !!candidates.error ||
    !!bindings.error;
  const failure =
    access.error ??
    candidates.error ??
    bindings.error ??
    save.error ??
    confirm.error ??
    closeConflict.error;
  const error = !bound
    ? "Den gemte runde matcher ikke den valgte planversion."
    : (localError ?? previewError ?? (failure ? readableError(failure) : null));
  const questionTitle = (id: string) =>
    plan.manifest.questions.find((question) => question.id === id)?.title ??
    "Spørgsmålet kunne ikke genfindes i den gemte plan.";
  return (
    <section aria-label="Fotos til registreringsrunden" className="rounded border p-3 space-y-3">
      <h3 className="font-medium">Fotos til registreringsrunden</h3>
      <p className="text-sm text-muted-foreground">
        Vælg et originalfoto, der allerede er modtaget i sagen, og de spørgsmål fra denne gemte
        runde, som billedet skal belyse. Tilknytningen er et udkast til senere faglig gennemgang.
      </p>
      <p className="text-sm">
        Planlagt registrering: {round.manifest.recordingWindow.dateFrom}–
        {round.manifest.recordingWindow.dateTo} · Europe/Copenhagen
      </p>
      {!accessReady && !access.error && bound && <p className="text-sm">Henter din adgang …</p>}
      {accessReady && !canAssign && (
        <p className="text-sm text-muted-foreground">
          Du har læseadgang til billedtilknytningerne. Tilknytning kræver bidragsadgang til sagen.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {failure && (
        <button
          type="button"
          className="text-sm underline"
          onClick={() => {
            void access.refetch();
            void candidates.refetch();
            void bindings.refetch();
          }}
        >
          Hent adgang og billedtilknytninger igen
        </button>
      )}
      {bound && accessReady && (
        <>
          <fieldset disabled={locked} className="space-y-2">
            <legend className="font-medium text-sm">Tilknyt et originalfoto</legend>
            <label className="block text-sm">
              Originalfoto
              <select
                aria-label="Originalfoto til runden"
                value={mediaId}
                onChange={(event) => setMediaId(event.target.value)}
                className="block w-full rounded border bg-background p-2"
              >
                <option value="">Vælg et foto …</option>
                {available.map((item) => (
                  <option
                    key={item.mediaId}
                    value={item.mediaId}
                    disabled={stored.some((binding) => binding.mediaId === item.mediaId)}
                  >
                    {item.fileName} · {Math.ceil(item.sizeBytes / 1024)} kB
                    {item.originalValidationStatus === "review_required"
                      ? " · Afventer gennemgang"
                      : ""}
                    {stored.some((binding) => binding.mediaId === item.mediaId)
                      ? " · Allerede tilknyttet"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {round.manifest.questionIds.map((id) => (
              <label key={id} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={questionTitle(id)}
                  checked={questionIds.includes(id)}
                  onChange={(event) =>
                    setQuestionIds((previous) =>
                      event.target.checked
                        ? [...previous, id]
                        : previous.filter((value) => value !== id),
                    )
                  }
                />
                {questionTitle(id)}
              </label>
            ))}
          </fieldset>
          {candidates.isPending && <p className="text-sm">Henter originalfotos …</p>}
          {!candidates.isPending && !candidates.error && available.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Der er endnu ingen gemte droneoriginaler at vælge i sagen.
            </p>
          )}
          {candidates.hasNextPage && !candidates.error && (
            <button
              type="button"
              className="text-sm underline"
              disabled={candidates.isFetchingNextPage}
              onClick={() => void candidates.fetchNextPage()}
            >
              Vis flere originalfotos
            </button>
          )}
          {receipt && (
            <p className="text-sm">
              Et genforsøg er bevaret med samme originalfoto og spørgsmål. Nye valg er låst, indtil
              tilknytningen er bekræftet. Originalfoto i genforsøget: {receipt.fileName}.
            </p>
          )}
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            disabled={
              !canAssign ||
              pending ||
              !receiptReady ||
              !!localError ||
              !!candidates.error ||
              !!bindings.error ||
              (!receipt && (!candidate || alreadyBound || questionIds.length === 0))
            }
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? "Gemmer og bekræfter …"
              : receipt
                ? "Prøv samme billedtilknytning igen"
                : "Gem billedtilknytning som udkast"}
          </button>
          {receipt && confirmedSaved && (
            <button
              type="button"
              className="text-sm underline"
              disabled={pending}
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending
                ? "Bekræfter …"
                : confirmedReceipt
                  ? "Bekræft og ryd genforsøgsreferencen igen"
                  : "Bekræft den gemte tilknytning igen"}
            </button>
          )}
          {bindings.isPending && <p className="text-sm">Henter gemte billedtilknytninger …</p>}
          <p className="text-xs text-muted-foreground">
            Et originalfoto kan tilknyttes én gang pr. rundeversion. De valgte spørgsmål fastholdes
            ved gemning. Det samme foto kan bruges i en anden runde.
          </p>
          {alreadyBound && !receipt && (
            <p className="text-sm">
              Fotoet er allerede knyttet til denne rundeversion. Se den gemte tilknytnings spørgsmål
              nedenfor.
            </p>
          )}
          {receipt && conflictSaved && (
            <div className="space-y-2">
              <p className="text-sm">
                Fotoet er allerede gemt med en anden tilknytning i denne rundeversion. Dine valg fra
                genforsøget er ikke gemt. Den eksisterende tilknytnings spørgsmål fastholdes.
              </p>
              <button
                type="button"
                className="text-sm underline"
                disabled={pending}
                onClick={() => closeConflict.mutate()}
              >
                {closeConflict.isPending
                  ? "Kontrollerer eksisterende tilknytning …"
                  : "Åbn eksisterende tilknytning og afslut dette genforsøg"}
              </button>
            </div>
          )}
          {!bindings.isPending && !bindings.error && stored.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Der er endnu ingen gemte billedtilknytninger til denne rundeversion.
            </p>
          )}
          {!!stored.length && (
            <label className="block text-sm">
              Gemt billedtilknytning
              <select
                aria-label="Gemt billedtilknytning"
                value={selected?.id ?? ""}
                onChange={(event) => {
                  setSelectedBindingId(event.target.value);
                  setPreview(null);
                }}
                className="block w-full rounded border bg-background p-2"
              >
                {stored.map((item) => (
                  <option key={item.id} value={item.id}>
                    Udkast {item.version} ·{" "}
                    {available.find((original) => original.mediaId === item.mediaId)?.fileName ??
                      "Originalfoto"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {bindings.hasNextPage && !bindings.error && (
            <button
              type="button"
              className="text-sm underline"
              disabled={bindings.isFetchingNextPage}
              onClick={() => void bindings.fetchNextPage()}
            >
              Vis ældre billedtilknytninger
            </button>
          )}
          {selected && (
            <div className="rounded bg-muted/30 p-3 space-y-2">
              <p className="font-medium text-sm">
                Gemt billedtilknytning · Udkast {selected.version}
              </p>
              <ul className="list-disc pl-5 text-sm">
                {selected.manifest.questionIds.map((id) => (
                  <li key={id}>{questionTitle(id)}</li>
                ))}
              </ul>
              <p className="text-sm">
                Billedets optagetid:{" "}
                {selected.manifest.sourceMetadata.capture.timezoneKnown
                  ? `${selected.manifest.sourceMetadata.capture.capturedAtUtc} · UTC`
                  : selected.manifest.sourceMetadata.capture.localTimestamp
                    ? `${selected.manifest.sourceMetadata.capture.localTimestamp} · Tidszone ukendt`
                    : "Ukendt"}
                . Forholdet til det planlagte registreringsvindue er ikke verificeret.
              </p>
              <p className="text-sm text-muted-foreground">
                {selected.manifest.sourceMetadata.cameraPosition
                  ? "Der findes en kameraposition. Den beskriver kameraets placering; billedets arealdækning er ikke verificeret."
                  : "Kameraposition er ukendt. Billedets arealdækning er ikke verificeret."}
              </p>
              <button
                type="button"
                className="text-sm underline"
                disabled={previewPending}
                onClick={showOriginal}
              >
                {previewPending ? "Kontrollerer adgang …" : "Vis originalfoto med aktuel adgang"}
              </button>
              {visiblePreview && (
                <div className="space-y-2">
                  <img
                    src={visiblePreview.signedUrl}
                    alt="Originalfoto til den valgte registreringsrunde"
                    referrerPolicy="no-referrer"
                    className="max-h-96 rounded object-contain"
                  />
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => {
                      previewRequest.current++;
                      setPreview(null);
                      setPreviewPending(false);
                      setPreviewError(null);
                    }}
                  >
                    Luk originalfoto
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Tilknytningen godkender ikke billedkvalitet, afgrænsning, observationer eller
                rapport. Den faglige gennemgang afventer.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
