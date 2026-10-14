import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  getSurveyRoundNoteAccess,
  getSurveyRoundNote,
  listSurveyRoundNotes,
  saveSurveyRoundNote,
} from "@/lib/survey-round-note.functions";
import {
  ManualSurveyRoundNoteSchema,
  type SaveSurveyRoundNoteInput,
  type SurveyRoundNoteVersion,
} from "@/services/baseline/survey-round-note-persistence";
import type { SurveyRoundMediaVersion } from "@/services/baseline/survey-round-media-persistence";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";
import type { VerificationPlanVersion } from "@/services/baseline/verification-plan-persistence";
import {
  assertSurveyRoundNoteMatchesScope,
  assertSurveyRoundNoteSaved,
  createSurveyRoundNoteReceipt,
  readSurveyRoundNoteReceipt,
  sameSurveyRoundNoteReceipt,
  surveyRoundNoteQuestions,
  surveyRoundNoteReceiptKey,
  type SurveyRoundNoteExecution,
  type SurveyRoundNoteReceipt,
  type SurveyRoundNoteSaveResult,
} from "./survey-round-note-request";

const ANSWERS = {
  supports_reference: "Understøtter referenceplaceringen",
  does_not_support_reference: "Understøtter ikke referenceplaceringen",
  inconclusive: "Kan ikke afgøres",
};
const PRIORITIES = { not_assessed: "Ikke vurderet", high: "Høj", normal: "Normal", low: "Lav" };
function message(error: unknown): string {
  return error instanceof Error ? error.message : "Noterne kunne ikke læses eller gemmes.";
}

export function SurveyRoundNotePanel({
  binding,
  round,
  plan,
  guided = false,
}: {
  binding: SurveyRoundMediaVersion;
  round: SurveyRoundVersion;
  plan: VerificationPlanVersion;
  guided?: boolean;
}) {
  const { user } = useAuth();
  const [questionId, setQuestionId] = useState("");
  const [answer, setAnswer] = useState<
    "" | SaveSurveyRoundNoteInput["manual"]["qualitativeAnswer"]
  >("");
  const [statement, setStatement] = useState("");
  const [uncertainty, setUncertainty] = useState("");
  const [followup, setFollowup] = useState("");
  const [priority, setPriority] =
    useState<SaveSurveyRoundNoteInput["manual"]["proposedPriority"]>("not_assessed");
  const [receipt, setReceipt] = useState<SurveyRoundNoteReceipt | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<SurveyRoundNoteSaveResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingRequest = useRef<SurveyRoundNoteReceipt | null>(null);
  const writing = useRef<{ execution: SurveyRoundNoteExecution } | null>(null);
  const getAccess = useServerFn(getSurveyRoundNoteAccess),
    getNote = useServerFn(getSurveyRoundNote),
    listNotes = useServerFn(listSurveyRoundNotes),
    saveNote = useServerFn(saveSurveyRoundNote);
  const client = useQueryClient();
  const key = JSON.stringify([
    user?.id ?? null,
    round.projectId,
    round.id,
    round.manifestSha256,
    round.baselineId,
    round.baselineSha256,
    round.planId,
    round.planSha256,
    plan.id,
    plan.manifestSha256,
    binding.id,
    binding.manifestSha256,
    binding.mediaId,
    binding.manifest.originalSha256,
    binding.manifest.originalValidationSha256,
  ]);
  const current = useRef({ key, generation: 0, instance: {}, alive: true });
  if (current.current.key !== key) {
    current.current.key = key;
    current.current.generation++;
  }
  const execution: SurveyRoundNoteExecution = {
    key,
    generation: current.current.generation,
    instance: current.current.instance,
  };
  const isCurrent = (token: SurveyRoundNoteExecution) =>
    current.current.alive &&
    current.current.key === token.key &&
    current.current.generation === token.generation &&
    current.current.instance === token.instance;
  const assertCurrent = (token: SurveyRoundNoteExecution) => {
    if (!isCurrent(token))
      throw new Error("Brugeren eller det valgte billedgrundlag er ændret. Genåbn noten.");
  };
  useEffect(() => {
    const instance = current.current;
    instance.alive = true;
    return () => {
      instance.alive = false;
    };
  }, []);
  const questions = surveyRoundNoteQuestions({ binding, round, plan });
  const singleQuestion = guided && questions.length === 1 ? questions[0] : null;
  const bound = questions.length > 0;
  const access = useQuery({
    queryKey: ["survey-round-note-access", key],
    enabled: bound && !!user,
    retry: false,
    queryFn: async () => {
      assertCurrent(execution);
      const value = await getAccess({ data: { projectId: round.projectId } });
      assertCurrent(execution);
      if (value.projectId !== round.projectId || value.userId !== user?.id)
        throw new Error("Adgangssvaret matcher ikke den aktuelle bruger og sag.");
      return value;
    },
  });
  const accessReady =
    !!user &&
    !access.error &&
    !access.isPending &&
    access.data?.userId === user.id &&
    access.data.projectId === round.projectId;
  const canDraft = accessReady && access.data?.canDraft === true;
  const scope = accessReady ? { actorId: access.data!.userId, binding, round, plan } : null;
  const receiptKey = scope ? surveyRoundNoteReceiptKey(scope) : null;
  const receiptReady = !!receiptKey && hydratedKey === key;
  const notes = useInfiniteQuery({
    queryKey: ["survey-round-notes", key],
    initialPageParam: undefined as number | undefined,
    enabled: bound && accessReady,
    retry: false,
    queryFn: async ({ pageParam }) => {
      assertCurrent(execution);
      if (!scope) throw new Error("Hent din aktuelle læseadgang igen.");
      const value = await listNotes({
        data: {
          projectId: round.projectId,
          roundVersionId: round.id,
          mediaBindingId: binding.id,
          beforeVersion: pageParam,
          limit: 30,
        },
      });
      assertCurrent(execution);
      for (const note of value.items) {
        await assertSurveyRoundNoteMatchesScope(note, scope);
        assertCurrent(execution);
      }
      return value;
    },
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
  });
  const stored =
    accessReady && !notes.error ? (notes.data?.pages.flatMap((page) => page.items) ?? []) : [];
  const completedCurrent = completed && isCurrent(completed.execution) ? completed : null;
  const visible =
    accessReady && !notes.error
      ? [
          ...stored,
          ...(completedCurrent && !stored.some((note) => note.id === completedCurrent.version.id)
            ? [completedCurrent.version]
            : []),
        ]
      : [];
  const selected = visible.find((note) => note.id === selectedId) ?? visible[0] ?? null;
  const visibleReceipt = receiptReady ? receipt : null;
  const foundReceipt = visibleReceipt
    ? (visible.find(
        (note) =>
          note.requestId === visibleReceipt.input.requestId &&
          note.logicalNoteId === visibleReceipt.input.logicalNoteId &&
          note.createdBy === visibleReceipt.actorId,
      ) ?? null)
    : null;
  const resetFields = () => {
    setQuestionId(singleQuestion?.id ?? "");
    setAnswer("");
    setStatement("");
    setUncertainty("");
    setFollowup("");
    setPriority("not_assessed");
  };
  const applyReceipt = (value: SurveyRoundNoteReceipt) => {
    setQuestionId(value.input.questionId);
    setAnswer(value.input.manual.qualitativeAnswer);
    setStatement(value.input.manual.manualStatement);
    setUncertainty(value.input.manual.uncertainty);
    setFollowup(value.input.manual.proposedFollowup);
    setPriority(value.input.manual.proposedPriority);
  };
  const retire = (result: SurveyRoundNoteSaveResult) => {
    if (
      !scope ||
      !receiptKey ||
      !isCurrent(result.execution) ||
      result.receipt.actorId !== scope.actorId ||
      !sameSurveyRoundNoteReceipt(pendingRequest.current, result.receipt)
    )
      return;
    setCompleted(result);
    setSelectedId(result.version.id);
    void client.invalidateQueries({ queryKey: ["survey-round-notes", key] });
    try {
      const shared = readSurveyRoundNoteReceipt(localStorage.getItem(receiptKey), scope);
      if (shared && !sameSurveyRoundNoteReceipt(shared, result.receipt))
        throw new Error("Et andet genforsøg er aktivt.");
      if (shared) {
        localStorage.removeItem(receiptKey);
        if (localStorage.getItem(receiptKey) !== null)
          throw new Error("Genforsøget blev ikke ryddet.");
      }
    } catch {
      setLocalError(
        "Noten er bekræftet, men browserens genforsøgsreference kunne ikke ryddes. Referencen er bevaret. Bekræft den gemte note igen før en ny note.",
      );
      return;
    }
    pendingRequest.current = null;
    setReceipt(null);
    setLocalError(null);
    resetFields();
    save.reset();
    confirm.reset();
  };
  const save = useMutation({
    mutationKey: ["survey-round-note-save", key, execution.generation],
    retry: false,
    mutationFn: async (): Promise<SurveyRoundNoteSaveResult> => {
      assertCurrent(execution);
      if (writing.current && isCurrent(writing.current.execution))
        throw new Error("En gemning er allerede i gang.");
      const operation = { execution };
      writing.current = operation;
      try {
        if (!bound || !scope || !canDraft || !receiptReady || localError || notes.error)
          throw new Error("Din aktuelle adgang eller indlæsning tillader ikke at gemme en note.");
        const fresh = await access.refetch();
        assertCurrent(execution);
        if (
          fresh.error ||
          fresh.data?.userId !== scope.actorId ||
          fresh.data.projectId !== round.projectId ||
          fresh.data.canDraft !== true
        )
          throw new Error("Din aktuelle adgang tillader ikke at gemme noter.");
        const shared = readSurveyRoundNoteReceipt(
          localStorage.getItem(surveyRoundNoteReceiptKey(scope)),
          scope,
        );
        if (!pendingRequest.current && shared) {
          pendingRequest.current = shared;
          setReceipt(shared);
          applyReceipt(shared);
          throw new Error(
            "Et tidligere genforsøg er genåbnet. Kontrollér teksten og prøv samme note igen.",
          );
        }
        const request =
          pendingRequest.current ??
          (await createSurveyRoundNoteReceipt(
            scope,
            questionId,
            {
              qualitativeAnswer: answer as SaveSurveyRoundNoteInput["manual"]["qualitativeAnswer"],
              manualStatement: statement,
              uncertainty,
              proposedFollowup: followup,
              proposedPriority: priority,
            },
            crypto.randomUUID(),
            crypto.randomUUID(),
          ));
        assertCurrent(execution);
        const latest = readSurveyRoundNoteReceipt(
          localStorage.getItem(surveyRoundNoteReceiptKey(scope)),
          scope,
        );
        if (latest && !sameSurveyRoundNoteReceipt(latest, request))
          throw new Error(
            "Et andet vindue har et genforsøg for dette foto. Genåbn noterne før en ny gemning.",
          );
        pendingRequest.current = request;
        setReceipt(request);
        applyReceipt(request);
        try {
          const text = JSON.stringify(request);
          localStorage.setItem(surveyRoundNoteReceiptKey(scope), text);
          if (localStorage.getItem(surveyRoundNoteReceiptKey(scope)) !== text)
            throw new Error("Genforsøget blev ikke fastholdt.");
        } catch {
          throw new Error(
            "Genforsøgsreferencen kunne ikke gemmes i browseren. Ingen note er sendt; teksten er bevaret i denne visning.",
          );
        }
        assertCurrent(execution);
        const written = await saveNote({
          data: { ...request.input, expectedCallerUserId: request.actorId },
        });
        assertCurrent(execution);
        await assertSurveyRoundNoteSaved(written, request, scope);
        assertCurrent(execution);
        const version = await getNote({
          data: { projectId: round.projectId, noteVersionId: written.id },
        });
        assertCurrent(execution);
        if (
          !version ||
          version.id !== written.id ||
          version.manifestSha256 !== written.manifestSha256
        )
          throw new Error(
            "Noten afventer bekræftelse fra den gemte version. Genforsøgsreferencen er bevaret.",
          );
        await assertSurveyRoundNoteSaved(version, request, scope);
        assertCurrent(execution);
        return { version, receipt: request, execution };
      } finally {
        if (writing.current === operation) writing.current = null;
      }
    },
    onSuccess: retire,
    onError: () => {
      if (isCurrent(execution)) void notes.refetch();
    },
  });
  const confirm = useMutation({
    mutationKey: [
      "survey-round-note-confirm",
      key,
      execution.generation,
      visibleReceipt?.input.requestId,
    ],
    retry: false,
    mutationFn: async (): Promise<SurveyRoundNoteSaveResult> => {
      assertCurrent(execution);
      if (!scope || !visibleReceipt || !foundReceipt)
        throw new Error("Hent de gemte noter igen for at bekræfte genforsøget.");
      const version = await getNote({
        data: { projectId: round.projectId, noteVersionId: foundReceipt.id },
      });
      assertCurrent(execution);
      if (
        !version ||
        version.id !== foundReceipt.id ||
        version.manifestSha256 !== foundReceipt.manifestSha256
      )
        throw new Error("Noten kunne ikke bekræftes med din aktuelle læseadgang.");
      await assertSurveyRoundNoteSaved(version, visibleReceipt, scope);
      assertCurrent(execution);
      return { version, receipt: visibleReceipt, execution };
    },
    onSuccess: retire,
  });
  useEffect(() => {
    if (!scope || !receiptKey || !isCurrent(execution)) return;
    setHydratedKey(null);
    pendingRequest.current = null;
    setReceipt(null);
    setCompleted(null);
    setSelectedId(null);
    resetFields();
    try {
      const previous = readSurveyRoundNoteReceipt(localStorage.getItem(receiptKey), scope);
      pendingRequest.current = previous;
      setReceipt(previous);
      if (previous) applyReceipt(previous);
      setLocalError(null);
    } catch (error) {
      setLocalError(`Genforsøget kan ikke genåbnes: ${message(error)}`);
    }
    setHydratedKey(key);
    // Caller and exact immutable input pins define a new receipt lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, receiptKey]);
  const manualValid =
    ManualSurveyRoundNoteSchema.safeParse({
      qualitativeAnswer: answer,
      manualStatement: statement,
      uncertainty,
      proposedFollowup: followup,
      proposedPriority: priority,
    }).success && questions.some((question) => question.id === questionId);
  const pending = save.isPending || confirm.isPending;
  const locked =
    !canDraft || pending || !!visibleReceipt || !receiptReady || !!localError || !!notes.error;
  const failure = access.error ?? notes.error ?? save.error ?? confirm.error;
  const error = !bound
    ? "Det valgte gemte foto og spørgsmål understøttes ikke af denne manuelle note."
    : (localError ?? (failure ? message(failure) : null));
  const questionTitle = (id: string) =>
    questions.find((question) => question.id === id)?.title ??
    "Spørgsmålet kunne ikke genfindes i den gemte plan.";
  return (
    <section
      aria-label="Manuelle noter til billedtilknytningen"
      className="rounded border p-3 space-y-3"
    >
      <h4 className="font-medium">Manuel note til foto og spørgsmål</h4>
      <p className="text-sm text-muted-foreground">
        {guided
          ? "Åbn fotoet ovenfor. Besvar spørgsmålet med din egen vurdering, beskriv usikkerheden, og foreslå eventuel opfølgning. Noten afventer faglig godkendelse."
          : "Beskriv din manuelle vurdering af referencespørgsmålet. Noten er en kladde uden fagligt review. Den fastslår ikke opmåling, arter, hydrauliske forhold eller rapportklarhed. Fotoet åbnes særskilt ovenfor; gemning dokumenterer ikke, at det er blevet set."}
      </p>
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
            void notes.refetch();
          }}
        >
          Hent adgang og noter igen
        </button>
      )}
      {!accessReady && !access.error && bound && <p className="text-sm">Henter din adgang …</p>}
      {bound && accessReady && (
        <>
          {!canDraft && (
            <p className="text-sm">
              Du har læseadgang. En ny kladde kræver bidragsadgang til sagen.
            </p>
          )}
          {receiptReady && (
            <>
              <fieldset disabled={locked} className="space-y-2">
                <legend className="font-medium text-sm">Ny note (ikke fagligt gennemgået)</legend>
                {singleQuestion ? (
                  <p className="text-sm font-medium">{singleQuestion.title}</p>
                ) : (
                  <label className="block text-sm">
                    Gemt spørgsmål
                    <select
                      aria-label="Spørgsmål til den manuelle note"
                      value={questionId}
                      onChange={(e) => setQuestionId(e.target.value)}
                      className="block w-full border rounded bg-background p-2"
                    >
                      <option value="">Vælg spørgsmål …</option>
                      {questions.map((question) => (
                        <option key={question.id} value={question.id}>
                          {question.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block text-sm">
                  Manuel vurdering
                  <select
                    aria-label="Manuel vurdering"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value as typeof answer)}
                    className="block w-full border rounded bg-background p-2"
                  >
                    <option value="">Vælg vurdering …</option>
                    {Object.entries(ANSWERS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Hvad kan du konkret beskrive?
                  <input
                    aria-label="Manuel beskrivelse"
                    type="text"
                    maxLength={2000}
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                    className="block w-full border rounded bg-background p-2"
                  />
                </label>
                <label className="block text-sm">
                  Hvad er usikkert eller kan ikke afgøres?
                  <input
                    aria-label="Usikkerhed"
                    type="text"
                    maxLength={1000}
                    value={uncertainty}
                    onChange={(e) => setUncertainty(e.target.value)}
                    className="block w-full border rounded bg-background p-2"
                  />
                </label>
                <label className="block text-sm">
                  Foreslået opfølgning
                  <input
                    aria-label="Foreslået opfølgning"
                    type="text"
                    maxLength={1000}
                    value={followup}
                    onChange={(e) => setFollowup(e.target.value)}
                    className="block w-full border rounded bg-background p-2"
                  />
                </label>
                <label className="block text-sm">
                  Foreslået prioritet (valgfri)
                  <select
                    aria-label="Foreslået prioritet"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof priority)}
                    className="block w-full border rounded bg-background p-2"
                  >
                    {Object.entries(PRIORITIES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              {visibleReceipt && (
                <p className="text-sm">
                  Samme note og genforsøg er bevaret. Teksten er låst, indtil den gemte note er
                  bekræftet. En ny note er en selvstændig kladde, ikke en rettelse eller
                  godkendelse.
                </p>
              )}
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                disabled={
                  !canDraft ||
                  pending ||
                  !receiptReady ||
                  !!localError ||
                  !!notes.error ||
                  (!visibleReceipt && !manualValid)
                }
                onClick={() => save.mutate()}
              >
                {save.isPending
                  ? "Gemmer og bekræfter …"
                  : visibleReceipt
                    ? "Prøv samme note igen"
                    : "Gem som ikke-gennemgået kladde"}
              </button>
              {visibleReceipt && foundReceipt && (
                <button
                  type="button"
                  disabled={pending}
                  className="text-sm underline"
                  onClick={() => confirm.mutate()}
                >
                  {confirm.isPending ? "Bekræfter …" : "Bekræft den gemte note og ryd genforsøget"}
                </button>
              )}
            </>
          )}
          {notes.isPending && <p className="text-sm">Henter gemte noter …</p>}
          {!notes.isPending && !notes.error && visible.length === 0 && (
            <p className="text-sm">Ingen gemte manuelle noter til denne billedtilknytning endnu.</p>
          )}
          {!!visible.length && (
            <label className="block text-sm">
              Gemt note
              <select
                aria-label="Gemt manuel note"
                value={selected?.id ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="block w-full border rounded bg-background p-2"
              >
                {visible.map((note) => (
                  <option key={note.id} value={note.id}>
                    Note {note.version} · Ikke fagligt gennemgået
                  </option>
                ))}
              </select>
            </label>
          )}
          {notes.hasNextPage && !notes.error && (
            <button
              type="button"
              disabled={notes.isFetchingNextPage}
              className="text-sm underline"
              onClick={() => void notes.fetchNextPage()}
            >
              Vis ældre noter til dette foto
            </button>
          )}
          {selected && (
            <article className="rounded bg-muted/30 p-3 space-y-2 text-sm">
              <h5 className="font-medium">Gemt manuel note · Ikke fagligt gennemgået</h5>
              <p>{questionTitle(selected.manifest.questionId)}</p>
              <p>Manuel vurdering: {ANSWERS[selected.manifest.manual.qualitativeAnswer]}</p>
              <p>Beskrivelse: {selected.manifest.manual.manualStatement}</p>
              <p>Usikkerhed: {selected.manifest.manual.uncertainty}</p>
              <p>Foreslået opfølgning: {selected.manifest.manual.proposedFollowup}</p>
              <p>Foreslået prioritet: {PRIORITIES[selected.manifest.manual.proposedPriority]}</p>
              <p className="text-xs text-muted-foreground">
                Registreret {new Date(selected.createdAt).toLocaleString("da-DK")}.
                Registreringstiden er ikke fotoets optagetid. Der er endnu ingen faglig
                reviewbeslutning knyttet til denne note.
              </p>
              <details className="text-xs">
                <summary>Vis gemte referencer</summary>
                <p className="break-all">
                  Note: {selected.id} · {selected.manifestSha256}
                </p>
                <p className="break-all">
                  Billedtilknytning: {selected.mediaBindingId} ·{" "}
                  {selected.manifest.mediaBindingSha256}
                </p>
                <p className="break-all">
                  Runde: {selected.roundVersionId} · {selected.manifest.roundSha256}
                </p>
              </details>
            </article>
          )}
        </>
      )}
    </section>
  );
}
