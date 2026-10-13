import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import {
  getSurveyRound,
  getSurveyRoundAccess,
  listSurveyRounds,
  saveSurveyRound,
} from "@/lib/survey-round.functions";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import type { VerificationPlanVersion } from "@/services/baseline/verification-plan-persistence";
import {
  assertSurveyRoundSaveResult,
  createSurveyRoundReceipt,
  readSurveyRoundReceipt,
  surveyRoundMatchesSelection,
  surveyRoundReceiptKey,
  type SurveyRoundDraftInput,
  type SurveyRoundRequestReceipt,
  type SurveyRoundRequestScope,
  type SurveyRoundExecutionToken,
  type SurveyRoundMutationResult,
} from "./survey-round-request";

const kindLabels = { before: "Før", after: "Efter", control: "Kontrol" };
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const emptyDraft = (): SurveyRoundDraftInput => ({
  kind: "before",
  title: "",
  recordingWindow: { dateFrom: "", dateTo: "" },
  questionIds: [],
});
function readableError(failure: unknown): string {
  return failure instanceof Error
    ? failure.message
    : "Registreringsrunden kunne ikke læses eller gemmes.";
}

/** A draft binds the selected immutable baseline and plan; it fetches no public source data. */
export function SurveyRoundPanel({
  snapshot,
  plan,
}: {
  snapshot: PublicBaselineSnapshot;
  plan: VerificationPlanVersion;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<SurveyRoundDraftInput>(emptyDraft);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SurveyRoundRequestReceipt | null>(null);
  const [confirmedReceipt, setConfirmedReceipt] = useState<SurveyRoundRequestReceipt | null>(null);
  const [hydratedReceiptKey, setHydratedReceiptKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const pendingRequest = useRef<SurveyRoundRequestReceipt | null>(null);
  const queryClient = useQueryClient();
  const checkAccess = useServerFn(getSurveyRoundAccess);
  const saveRound = useServerFn(saveSurveyRound);
  const getRound = useServerFn(getSurveyRound);
  const listRounds = useServerFn(listSurveyRounds);
  const selection = {
    projectId: snapshot.projectId,
    baselineId: snapshot.id,
    baselineSha256: snapshot.manifestSha256,
    planId: plan.id,
    planSha256: plan.manifestSha256,
  };
  const executionKey = JSON.stringify([
    user?.id ?? null,
    selection.projectId,
    selection.baselineId,
    selection.baselineSha256,
    selection.planId,
    selection.planSha256,
  ]);
  const executionScope = useRef({ key: executionKey, generation: 0, alive: true, instance: {} });
  if (executionScope.current.key !== executionKey) {
    executionScope.current.key = executionKey;
    executionScope.current.generation++;
  }
  const execution: SurveyRoundExecutionToken = {
    key: executionKey,
    generation: executionScope.current.generation,
    instance: executionScope.current.instance,
  };
  const isCurrentExecution = (token: SurveyRoundExecutionToken) =>
    executionScope.current.alive &&
    executionScope.current.key === token.key &&
    executionScope.current.generation === token.generation &&
    executionScope.current.instance === token.instance;
  const assertCurrentExecution = (token: SurveyRoundExecutionToken) => {
    if (!isCurrentExecution(token))
      throw new Error(
        "Brugeren eller de valgte inputversioner er ændret. Genåbn registreringsrunden.",
      );
  };
  useEffect(() => {
    const current = executionScope.current;
    current.alive = true;
    return () => {
      current.alive = false;
    };
  }, []);
  const bound =
    plan.projectId === selection.projectId &&
    plan.baselineId === selection.baselineId &&
    plan.baselineSha256 === selection.baselineSha256 &&
    plan.status === "draft";
  const access = useQuery({
    queryKey: ["survey-round-access", user?.id, selection.projectId],
    queryFn: async () => {
      assertCurrentExecution(execution);
      const result = await checkAccess({ data: { projectId: selection.projectId } });
      assertCurrentExecution(execution);
      if (result.userId !== user?.id || result.projectId !== selection.projectId)
        throw new Error("Adgangssvaret matcher ikke den aktuelle bruger og sag.");
      return result;
    },
    enabled: bound && !!user,
    retry: false,
  });
  const accessReady =
    !access.error &&
    !access.isPending &&
    access.data?.projectId === selection.projectId &&
    access.data.userId === user?.id &&
    Uuid.test(access.data.userId);
  const canPersist = accessReady && access.data?.canPersist === true;
  const scope: SurveyRoundRequestScope | null = accessReady
    ? {
        ...selection,
        actorId: access.data!.userId,
        availableQuestionIds: plan.manifest.questions.map((question) => question.id),
      }
    : null;
  const receiptKey = scope ? surveyRoundReceiptKey(scope) : null;
  const receiptReady = receiptKey !== null && hydratedReceiptKey === receiptKey;
  const versions = useInfiniteQuery({
    queryKey: [
      "survey-rounds",
      user?.id,
      selection.projectId,
      selection.baselineId,
      selection.planId,
    ],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      assertCurrentExecution(execution);
      const result = await listRounds({
        data: {
          projectId: selection.projectId,
          baselineId: selection.baselineId,
          planId: selection.planId,
          beforeVersion: pageParam,
          limit: 30,
        },
      });
      assertCurrentExecution(execution);
      return result;
    },
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    enabled: bound && accessReady,
    retry: false,
  });
  const summaries =
    !accessReady || versions.error
      ? []
      : (versions.data?.pages.flatMap((page) => page.items) ?? []);
  const activeId = selectedId ?? summaries[0]?.id ?? null;
  const saved = useQuery({
    queryKey: ["survey-round", user?.id, selection.projectId, activeId],
    queryFn: async () => {
      assertCurrentExecution(execution);
      const result = await getRound({
        data: { projectId: selection.projectId, roundVersionId: activeId! },
      });
      assertCurrentExecution(execution);
      return result;
    },
    enabled: accessReady && !versions.error && activeId !== null,
    retry: false,
  });
  const stored =
    accessReady &&
    !versions.error &&
    !saved.error &&
    saved.data &&
    surveyRoundMatchesSelection(saved.data, selection) &&
    saved.data.manifest.questionIds.length > 0 &&
    saved.data.manifest.questionIds.every((id) =>
      plan.manifest.questions.some((question) => question.id === id),
    )
      ? saved.data
      : null;
  const invalidSaved = accessReady && !versions.error && !saved.error && !!saved.data && !stored;
  const retireConfirmedReceipt = (
    confirmed: SurveyRoundRequestReceipt,
    token: SurveyRoundExecutionToken,
  ): boolean => {
    if (!scope || !receiptKey || !isCurrentExecution(token) || confirmed.actorId !== scope.actorId)
      return false;
    setConfirmedReceipt(confirmed);
    try {
      const current = readSurveyRoundReceipt(localStorage.getItem(receiptKey), scope);
      if (current?.input.requestId === confirmed.input.requestId) {
        localStorage.removeItem(receiptKey);
        const remaining = readSurveyRoundReceipt(localStorage.getItem(receiptKey), scope);
        if (remaining?.input.requestId === confirmed.input.requestId)
          throw new Error("Genforsøgsreferencen blev ikke ryddet.");
      }
    } catch {
      setLocalError(
        "Runden er gemt, men browserens genforsøgsreference kunne ikke ryddes. Den oprindelige reference er bevaret; genåbn den gemte runde og prøv rydning igen før en ny runde.",
      );
      return false;
    }
    if (pendingRequest.current?.input.requestId === confirmed.input.requestId) {
      pendingRequest.current = null;
      setReceipt(null);
      setDraft(emptyDraft());
    }
    setConfirmedReceipt(null);
    setLocalError(null);
    return true;
  };
  const save = useMutation({
    mutationKey: [
      "survey-round-save",
      user?.id,
      selection.projectId,
      selection.baselineId,
      selection.baselineSha256,
      selection.planId,
      selection.planSha256,
      execution.generation,
    ],
    mutationFn: async (): Promise<SurveyRoundMutationResult> => {
      assertCurrentExecution(execution);
      if (!bound || !scope || !canPersist || !receiptReady || localError)
        throw new Error("Denne bruger kan ikke oprette en registreringsrunde i sagen.");
      const currentAccess = await access.refetch();
      assertCurrentExecution(execution);
      if (
        currentAccess.error ||
        currentAccess.data?.projectId !== scope.projectId ||
        currentAccess.data.userId !== scope.actorId ||
        currentAccess.data.canPersist !== true
      )
        throw new Error("Din aktuelle adgang tillader ikke at gemme registreringsrunden.");
      const sharedReceipt = readSurveyRoundReceipt(
        localStorage.getItem(surveyRoundReceiptKey(scope)),
        scope,
      );
      if (!pendingRequest.current && sharedReceipt) {
        pendingRequest.current = sharedReceipt;
        setReceipt(sharedReceipt);
        setDraft({
          kind: sharedReceipt.input.kind,
          title: sharedReceipt.input.title,
          recordingWindow: { ...sharedReceipt.input.recordingWindow },
          questionIds: [...sharedReceipt.input.questionIds],
        });
        throw new Error(
          "Et tidligere genforsøg blev fundet. Kontrollér det genåbnede udkast og prøv igen.",
        );
      }
      const request =
        pendingRequest.current ?? createSurveyRoundReceipt(scope, draft, crypto.randomUUID());
      if (sharedReceipt && sharedReceipt.input.requestId !== request.input.requestId)
        throw new Error(
          "Et andet vindue har en genforsøgsreference for samme plan. Genåbn de gemte runder før en ny gemning.",
        );
      pendingRequest.current = request;
      setReceipt(request);
      try {
        const text = JSON.stringify(request);
        localStorage.setItem(surveyRoundReceiptKey(scope), text);
        if (localStorage.getItem(surveyRoundReceiptKey(scope)) !== text)
          throw new Error("Genforsøgsreferencen blev ikke fastholdt.");
      } catch {
        throw new Error(
          "Genforsøgsreferencen kunne ikke gemmes i browseren. Ingen registreringsrunde er sendt; dit udkast er bevaret i denne visning.",
        );
      }
      assertCurrentExecution(execution);
      const version = await saveRound({
        data: { ...request.input, expectedCallerUserId: request.actorId },
      });
      assertSurveyRoundSaveResult(version, request);
      return { version, receipt: request, execution };
    },
    onSuccess: async (result) => {
      if (
        !scope ||
        !isCurrentExecution(result.execution) ||
        result.receipt.actorId !== scope.actorId
      )
        return;
      const { version } = result;
      retireConfirmedReceipt(result.receipt, result.execution);
      setSelectedId(version.id);
      queryClient.setQueryData(
        ["survey-round", user?.id, selection.projectId, version.id],
        version,
      );
      await queryClient.invalidateQueries({
        queryKey: [
          "survey-rounds",
          user?.id,
          selection.projectId,
          selection.baselineId,
          selection.planId,
        ],
      });
    },
    retry: false,
  });
  useEffect(() => {
    if (!scope || !receiptKey || !isCurrentExecution(execution)) return;
    setHydratedReceiptKey(null);
    setConfirmedReceipt(null);
    try {
      const previous = readSurveyRoundReceipt(localStorage.getItem(receiptKey), scope);
      pendingRequest.current = previous;
      setReceipt(previous);
      setDraft(
        previous
          ? {
              kind: previous.input.kind,
              title: previous.input.title,
              recordingWindow: { ...previous.input.recordingWindow },
              questionIds: [...previous.input.questionIds],
            }
          : emptyDraft(),
      );
      setLocalError(null);
    } catch (failure) {
      setLocalError(`Genforsøget kan ikke genåbnes: ${readableError(failure)}`);
    }
    setHydratedReceiptKey(receiptKey);
    // Scope identities and the selected saved plan are fixed by the parent key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptKey]);
  useEffect(() => {
    if (
      !stored ||
      !receipt ||
      !scope ||
      !receiptKey ||
      save.isPending ||
      !isCurrentExecution(execution)
    )
      return;
    try {
      assertSurveyRoundSaveResult(stored, receipt);
    } catch {
      return;
    }
    // An actual authorized saved-version read can confirm an ambiguous save,
    // including after write access has been revoked. No writer is called here.
    retireConfirmedReceipt(receipt, execution);
    save.reset();
    // The immutable version hash and exact caller-scoped receipt identify this confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.id, stored?.manifestSha256, receipt?.input.requestId, receiptKey, save.isPending]);
  const locked = !canPersist || save.isPending || receipt !== null || !receiptReady || !!localError;
  const failure = access.error ?? versions.error ?? saved.error ?? save.error;
  const error = !bound
    ? "Planversionen matcher ikke det valgte gemte datagrundlag."
    : (localError ??
      (failure
        ? readableError(failure)
        : invalidSaved
          ? "Den gemte runde matcher ikke den valgte baseline og planversion."
          : null));

  return (
    <Card>
      <CardHeader
        title="Registreringsrunder"
        subtitle="Planlæg en før-, efter- eller kontrolrunde fra en gemt plan"
      />
      <div className="px-5 pb-5 space-y-4">
        <p className="text-sm">
          Datagrundlag, version {snapshot.version} · Plan, version {plan.version}
        </p>
        <p className="text-sm text-muted-foreground">
          Runden er et udkast. Datoer og spørgsmål beskriver den planlagte registrering. Fotos,
          dækning og faglige resultater skal registreres og gennemgås senere.
        </p>
        {!accessReady && !access.error && bound && <p className="text-sm">Henter din adgang …</p>}
        {accessReady && !canPersist && (
          <p className="text-sm text-muted-foreground">
            Du har læseadgang til gemte runder. Oprettelse kræver skriveadgang til sagen.
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
              void versions.refetch();
              if (activeId) void saved.refetch();
            }}
          >
            Hent adgang og gemte runder igen
          </button>
        )}
        {bound && accessReady && (
          <>
            <fieldset disabled={locked} className="space-y-3">
              <legend className="font-medium text-sm">Ny registreringsrunde</legend>
              <label className="block text-sm">
                Type
                <select
                  aria-label="Rundetype"
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      kind: event.target.value as SurveyRoundDraftInput["kind"],
                    })
                  }
                  className="block rounded border bg-background p-2"
                >
                  <option value="before">Før</option>
                  <option value="after">Efter</option>
                  <option value="control">Kontrol</option>
                </select>
              </label>
              <label className="block text-sm">
                Titel
                <input
                  aria-label="Rundetitel"
                  value={draft.title}
                  maxLength={120}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  className="block w-full rounded border bg-background p-2"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="text-sm">
                  Fra dato
                  <input
                    type="date"
                    aria-label="Registrering fra dato"
                    value={draft.recordingWindow.dateFrom}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        recordingWindow: { ...draft.recordingWindow, dateFrom: event.target.value },
                      })
                    }
                    className="block rounded border bg-background p-2"
                  />
                </label>
                <label className="text-sm">
                  Til dato
                  <input
                    type="date"
                    aria-label="Registrering til dato"
                    value={draft.recordingWindow.dateTo}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        recordingWindow: { ...draft.recordingWindow, dateTo: event.target.value },
                      })
                    }
                    className="block rounded border bg-background p-2"
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Kalenderdatoer i Europe/Copenhagen. Det planlagte vindue dokumenterer ikke faktisk
                tidsdækning eller egnethed til en før/efter-sammenligning.
              </p>
              <fieldset className="space-y-2">
                <legend className="text-sm">Vælg spørgsmål fra den gemte planversion</legend>
                {plan.manifest.questions.map((question) => (
                  <label key={question.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.questionIds.includes(question.id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          questionIds: event.target.checked
                            ? [...draft.questionIds, question.id]
                            : draft.questionIds.filter((id) => id !== question.id),
                        })
                      }
                    />
                    <span>
                      {question.title}
                      <span className="block text-muted-foreground">{question.question}</span>
                    </span>
                  </label>
                ))}
                {plan.manifest.questions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Denne plan indeholder ingen valgbare spørgsmål. Gem en plan med dokumenterbare
                    spørgsmål før oprettelse af en runde.
                  </p>
                )}
              </fieldset>
            </fieldset>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={
                !canPersist ||
                !receiptReady ||
                save.isPending ||
                !!confirmedReceipt ||
                !!localError ||
                draft.questionIds.length === 0 ||
                !draft.title.trim() ||
                !draft.recordingWindow.dateFrom ||
                !draft.recordingWindow.dateTo
              }
              className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
            >
              {save.isPending
                ? "Gemmer registreringsrunde …"
                : receipt
                  ? "Prøv gemning af samme udkast igen"
                  : "Gem registreringsrunde som udkast"}
            </button>
            {receipt && (
              <p className="text-xs text-muted-foreground">
                {confirmedReceipt
                  ? "Runden er gemt. Den oprindelige genforsøgsreference afventer rydning i browseren."
                  : "Gemningen er endnu ikke bekræftet. Genforsøg bevarer den samme titel, datoer og spørgsmål, så der ikke oprettes en ny runde ved et usikkert svar."}
              </p>
            )}
            {confirmedReceipt && stored && (
              <button
                type="button"
                className="text-sm underline"
                onClick={() => {
                  if (!isCurrentExecution(execution)) return;
                  assertSurveyRoundSaveResult(stored, confirmedReceipt);
                  if (retireConfirmedReceipt(confirmedReceipt, execution)) save.reset();
                }}
              >
                Ryd den bekræftede genforsøgsreference igen
              </button>
            )}
            {(versions.isPending || saved.isFetching) && (
              <p className="text-sm">Henter gemte registreringsrunder …</p>
            )}
            {!!summaries.length && (
              <label className="block text-sm">
                Gemt registreringsrunde
                <select
                  aria-label="Gemt registreringsrunde"
                  value={activeId ?? ""}
                  disabled={save.isPending}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="block w-full rounded border bg-background p-2"
                >
                  {summaries.map((version) => (
                    <option key={version.id} value={version.id}>
                      Udkast {version.version} · {kindLabels[version.kind]} · {version.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {versions.hasNextPage && !versions.error && (
              <button
                type="button"
                disabled={versions.isFetchingNextPage}
                onClick={() => void versions.fetchNextPage()}
                className="text-sm underline"
              >
                {versions.isFetchingNextPage ? "Henter …" : "Vis ældre registreringsrunder"}
              </button>
            )}
            {!versions.isPending && !versions.error && summaries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Der er endnu ingen gemte runder for denne baseline og planversion.
              </p>
            )}
            {activeId && !saved.isFetching && !saved.error && saved.data === null && (
              <p role="alert" className="text-sm text-destructive">
                Den valgte gemte runde kunne ikke findes.
              </p>
            )}
            {stored && (
              <div className="rounded border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <strong>{stored.manifest.title}</strong>
                  <Pill tone="info">Gemt udkast · {kindLabels[stored.kind]}</Pill>
                </div>
                <p className="text-sm">
                  Rundeversion {stored.roundVersion} · Datagrundlag {snapshot.version} · Plan{" "}
                  {plan.version}
                </p>
                <p className="text-sm">
                  Planlagt: {stored.manifest.recordingWindow.dateFrom}–
                  {stored.manifest.recordingWindow.dateTo} · Europe/Copenhagen
                </p>
                <ul className="list-disc pl-5 text-sm">
                  {stored.manifest.questionIds.map((id) => (
                    <li key={id}>
                      {plan.manifest.questions.find((question) => question.id === id)?.title ??
                        "Spørgsmålet kunne ikke genfindes i den valgte plan."}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Afgrænsning, faglig godkendelse og rapportaccept afventer. Runden dokumenterer
                  ikke modtagne fotos eller gennemførte registreringer.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
