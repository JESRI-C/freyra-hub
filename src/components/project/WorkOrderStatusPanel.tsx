import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBlocker } from "@tanstack/react-router";
import type { WorkOrderScope } from "@/lib/work-order-access";
import {
  getProjectWorkOrderLifecycleContext,
  mutateProjectWorkOrderLifecycle,
  getProjectWorkOrderLog,
  saveProjectWorkOrderNote,
  getProjectWorkOrderNoteHistory,
} from "@/lib/work-order-lifecycle.functions";
import {
  MutateWorkOrderLifecycleSchema,
  SaveWorkOrderNoteSchema,
  lifecycleGapLabels,
  noteKindLabels,
  workOrderStatusLabels,
  type LifecycleRequest,
  type WorkOrderLifecycleContext,
  type WorkOrderLogCursor,
  type WorkOrderLogEntry,
  type WorkOrderNote,
} from "@/lib/work-order-lifecycle";
import { workOrderExecutionGapLabels } from "@/lib/work-order-execution";
import { useWorkOrderPeople } from "./useWorkOrderPeople";
import { MoreWorkOrderPeople } from "./MoreWorkOrderPeople";
const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const button = "min-h-11 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50";
type Props = {
  scope: WorkOrderScope;
  actorId: string;
  onEditing?: (value: boolean) => void;
  manageNavigation?: boolean;
};
type Target = NonNullable<LifecycleRequest["targetStatus"]>;
type StatusDraft = {
  kind: "status";
  version: number;
  values: LifecycleRequest;
  localStart: string;
};
type NoteDraft = {
  kind: "note";
  noteId: string;
  authorId: string;
  version: number;
  noteKind: WorkOrderNote["kind"];
  body: string;
  reason: string;
  planVersionId: string | null;
  assignmentVersionId: string | null;
  executionRevisionId: string | null;
  lifecycleVersionId: string | null;
};
type Draft = StatusDraft | NoteDraft;
const person = (id: string, actorId: string) =>
  id === actorId ? "Dig" : "Registreret bruger · " + id.slice(-8);
const displayTime = (time: string) =>
  new Date(time).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "medium" });
function requirements(c: WorkOrderLifecycleContext, target: Target): string[] {
  const gaps: string[] = [];
  if (["planned", "assigned", "started", "performed"].includes(target))
    gaps.push(...c.basis.planGaps.map((g) => lifecycleGapLabels[g]));
  if (["assigned", "started", "performed"].includes(target) && !c.basis.assignmentValid)
    gaps.push("Opgaven mangler en gyldig aktuel tildeling");
  if (target === "performed") gaps.push(...c.basis.executionGaps.map((g) => lifecycleGapLabels[g]));
  return gaps;
}
export function WorkOrderStatusPanel(props: Props) {
  return (
    <StatusPanel
      key={`${props.actorId}:${props.scope.organizationId}:${props.scope.projectId}:${props.scope.actionId}`}
      {...props}
    />
  );
}
function StatusPanel({ scope, actorId, onEditing, manageNavigation = true }: Props) {
  const load = useServerFn(getProjectWorkOrderLifecycleContext),
    mutate = useServerFn(mutateProjectWorkOrderLifecycle),
    loadLog = useServerFn(getProjectWorkOrderLog),
    saveNote = useServerFn(saveProjectWorkOrderNote),
    noteHistory = useServerFn(getProjectWorkOrderNoteHistory),
    cache = useQueryClient();
  const inputScope = { ...scope, expectedActorId: actorId };
  const contextKey = ["work-order-lifecycle", actorId, scope],
    logKey = ["work-order-log", actorId, scope];
  const context = useQuery({
    queryKey: contextKey,
    queryFn: () => load({ data: inputScope }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const log = useInfiniteQuery({
    queryKey: logKey,
    initialPageParam: null as WorkOrderLogCursor | null,
    queryFn: ({ pageParam }) =>
      loadLog({ data: { ...inputScope, cursor: pageParam, pageSize: 20 } }),
    getNextPageParam: (p) => p.next ?? undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const attempt = useRef<{ signature: string; id: string } | null>(null),
    inFlight = useRef(false);
  const editingListener = useRef(onEditing),
    ownsEditor = useRef(false);
  editingListener.current = onEditing;
  useEffect(
    () => () => {
      if (ownsEditor.current) editingListener.current?.(false);
    },
    [],
  );
  const current = context.isError ? undefined : context.data;
  const people = useWorkOrderPeople(
    { organizationId: scope.organizationId, projectId: scope.projectId },
    actorId,
    !!current?.can_manage && draft?.kind === "status" && draft.values.operation === "block",
  );
  useBlocker({
    shouldBlockFn: () => manageNavigation && !!draft,
    enableBeforeUnload: manageNavigation && !!draft,
  });
  function opened(value: Draft) {
    ownsEditor.current = true;
    setDraft(value);
    setError("");
    setMessage("");
    attempt.current = null;
    onEditing?.(true);
  }
  function close() {
    ownsEditor.current = false;
    setDraft(null);
    setError("");
    attempt.current = null;
    onEditing?.(false);
  }
  function status(op: LifecycleRequest["operation"], target: Target | null) {
    if (!current) return;
    opened({
      kind: "status",
      version: current.state?.version ?? 0,
      localStart: "",
      values: {
        operation: op,
        targetStatus: target,
        planVersionId: current.basis.planVersionId,
        assignmentVersionId: current.basis.assignmentVersionId,
        executionRevisionId: current.basis.executionRevisionId,
        reason: "",
        startedAt: null,
        startedSource: null,
        blockOwnerId: op === "block" ? actorId : null,
        blockReason: null,
        blockNextAction: null,
        blockDueDate: null,
      },
    });
  }
  function note() {
    if (!current?.can_note) return;
    opened({
      kind: "note",
      noteId: crypto.randomUUID(),
      authorId: actorId,
      version: 0,
      noteKind: "comment",
      body: "",
      reason: "",
      planVersionId: current.basis.planVersionId,
      assignmentVersionId: current.basis.assignmentVersionId,
      executionRevisionId: current.basis.executionRevisionId,
      lifecycleVersionId: current.state?.id ?? null,
    });
  }
  async function correct(noteId: string) {
    if (inFlight.current || draft) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const p = await noteHistory({
        data: { ...inputScope, noteId, beforeVersion: null, pageSize: 1 },
      });
      const n = p.items[0];
      if (!n) throw Error("Noten kunne ikke findes.");
      if (n.author_id !== actorId && !current?.can_manage)
        throw Error("Kun notens oprindelige forfatter eller projektansvarlige kan rette den.");
      opened({
        kind: "note",
        noteId: n.note_id,
        authorId: n.author_id,
        version: n.version,
        noteKind: n.kind,
        body: n.body,
        reason: "",
        planVersionId: n.plan_version_id,
        assignmentVersionId: n.assignment_version_id,
        executionRevisionId: n.execution_revision_id,
        lifecycleVersionId: n.lifecycle_version_id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noten kunne ikke åbnes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const requestId = crypto.randomUUID();
      if (draft.kind === "status") {
        let values = draft.values;
        if (values.operation === "transition" && values.targetStatus === "started") {
          if (!draft.localStart || !Number.isFinite(new Date(draft.localStart).getTime()))
            throw Error("Angiv det faktiske starttidspunkt.");
          values = { ...values, startedAt: new Date(draft.localStart).toISOString() };
        }
        const p = MutateWorkOrderLifecycleSchema.safeParse({
          ...inputScope,
          expectedVersion: draft.version,
          values,
          requestId,
        });
        if (!p.success)
          throw Error(p.error.issues[0]?.message ?? "Kontrollér statusregistreringen.");
        const { requestId: _unused, ...payload } = p.data,
          signature = JSON.stringify({ kind: "status", ...payload });
        if (attempt.current?.signature !== signature)
          attempt.current = { signature, id: requestId };
        await mutate({ data: { ...payload, requestId: attempt.current.id } });
      } else {
        const p = SaveWorkOrderNoteSchema.safeParse({
          ...inputScope,
          noteId: draft.noteId,
          authorId: draft.authorId,
          expectedVersion: draft.version,
          kind: draft.noteKind,
          body: draft.body,
          correctionReason: draft.reason,
          planVersionId: draft.planVersionId,
          assignmentVersionId: draft.assignmentVersionId,
          executionRevisionId: draft.executionRevisionId,
          lifecycleVersionId: draft.lifecycleVersionId,
          requestId,
        });
        if (!p.success) throw Error(p.error.issues[0]?.message ?? "Kontrollér noten.");
        const { requestId: _unused, ...payload } = p.data,
          signature = JSON.stringify({ mutationType: "note", ...payload });
        if (attempt.current?.signature !== signature)
          attempt.current = { signature, id: requestId };
        await saveNote({ data: { ...payload, requestId: attempt.current.id } });
      }
      close();
      setMessage("Din registrering er gemt som ny version.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: contextKey }),
        cache.invalidateQueries({ queryKey: logKey }),
        cache.invalidateQueries({ queryKey: ["my-work-orders", actorId] }),
      ]);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Registreringen kunne ikke gemmes.") +
          " Din kladde er bevaret.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const s = current?.state;
  const next: Target | null = !s
    ? "draft"
    : ((
        {
          draft: "planned",
          planned: "assigned",
          assigned: "started",
          started: "performed",
        } as Record<string, Target>
      )[s.status] ?? null);
  const canNext =
    !!current &&
    !!next &&
    (next === "started"
      ? current.can_start
      : next === "performed"
        ? current.can_perform
        : current.can_manage);
  const nextGaps = current && next ? requirements(current, next) : [];
  const active = !!s && !["approved", "cancelled"].includes(s.status);
  const canConfirm =
    !!current?.context_changed &&
    !!s &&
    (["draft", "planned", "assigned"].includes(s.status)
      ? current.can_manage
      : ["started", "performed"].includes(s.status) && current.can_perform);
  const entries = log.isError ? [] : (log.data?.pages.flatMap((p) => p.items) ?? []);
  const formGaps =
    draft?.kind === "status" && draft.values.targetStatus && current
      ? requirements(current, draft.values.targetStatus)
      : [];
  return (
    <section
      aria-label="Operationel status og logbog"
      className="min-w-0 space-y-4 rounded-xl border p-3 [overflow-wrap:anywhere]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Status og logbog</h3>
        <button
          type="button"
          className={button}
          disabled={!!draft || busy || context.isFetching || log.isFetching}
          onClick={() => void Promise.all([context.refetch(), log.refetch()])}
        >
          Hent nyt grundlag
        </button>
      </header>
      {context.isPending && <p role="status">Henter opgavens status…</p>}
      {context.error && <p role="alert">{context.error.message}</p>}
      {current && (
        <>
          <p className="font-medium">
            {current.context_changed ? "Historisk status: " : "Status: "}
            {s ? workOrderStatusLabels[s.status] : "Ikke fastlagt"}
            {s ? ` · version ${s.version}` : ""}
          </p>
          {s?.started_at && (
            <p className="text-sm">
              Faktisk start: {displayTime(s.started_at)}. Kilde: {s.started_source}. Bekræftet af{" "}
              {person(s.started_by_id!, actorId)}.
            </p>
          )}
          {s?.blocked && (
            <div className="space-y-1 rounded-xl border p-3 text-sm">
              <p className="font-semibold">Afventer · {s.block_reason}</p>
              <p>
                Ansvarlig: {person(s.block_owner_id!, actorId)}.{" "}
                {s.block_due_date ? `Frist: ${s.block_due_date}` : "Frist uafklaret"}.
              </p>
              <p>Næste handling: {s.block_next_action}</p>
            </div>
          )}
          {current.context_changed && (
            <p className="text-sm">
              Grundlaget er rettet siden statusversion {s?.version}. Den tidligere bekræftelse
              bevares i historikken. Kontrollér det aktuelle grundlag før næste statusskift.
            </p>
          )}
          {current.basis.unknownPlannedDate && (
            <p className="text-sm text-muted-foreground">Planlagt dato er uafklaret.</p>
          )}
          {current.basis.assignmentVersionId && !current.basis.assignmentValid && (
            <p className="text-sm">
              Den aktuelle tildeling mangler en aktiv, gyldig modtager. Kontrollér
              arbejdsfordelingen.
            </p>
          )}
          {s?.status === "performed" && (
            <p className="text-sm">
              Udført arbejde er endnu ikke afleveret eller fagligt godkendt.
            </p>
          )}
          {!!current.basis.documentationGaps.length && s?.status === "performed" && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {current.basis.documentationGaps.map((g) => (
                <li key={g}>
                  {workOrderExecutionGapLabels[g as keyof typeof workOrderExecutionGapLabels] ??
                    "Dokumentationen kræver afklaring"}
                </li>
              ))}
            </ul>
          )}
          {!draft && (
            <div className="flex flex-wrap gap-2">
              {canNext && next && (
                <button
                  type="button"
                  className={button}
                  disabled={busy || !!nextGaps.length}
                  onClick={() => status("transition", next)}
                >
                  {next === "draft"
                    ? "Opret kladde"
                    : next === "started"
                      ? "Registrer start"
                      : next === "performed"
                        ? "Bekræft udført"
                        : `Markér ${workOrderStatusLabels[next].toLowerCase()}`}
                </button>
              )}
              {canConfirm && s && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => status("confirm", s.status as Target)}
                >
                  Bekræft status på nyt grundlag
                </button>
              )}
              {current.can_note && active && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => status(s!.blocked ? "unblock" : "block", null)}
                >
                  {s?.blocked ? "Ophæv blokering" : "Sæt afventer"}
                </button>
              )}
              {current.can_manage &&
                s &&
                ["draft", "planned", "assigned", "started"].includes(s.status) && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => status("transition", "cancelled")}
                  >
                    Annuller opgave
                  </button>
                )}
              {current.can_note && (
                <button type="button" className={button} disabled={busy} onClick={note}>
                  Tilføj note
                </button>
              )}
            </div>
          )}
          {!draft && canNext && !!nextGaps.length && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {nextGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <legend className="font-medium">
              {draft.kind === "note"
                ? draft.version
                  ? `Ret note version ${draft.version}`
                  : "Ny manuel note"
                : draft.values.operation === "block"
                  ? "Registrer blokering"
                  : draft.values.operation === "unblock"
                    ? "Ophæv blokering"
                    : `${draft.values.operation === "confirm" ? "Bekræft" : "Registrer"} ${workOrderStatusLabels[draft.values.targetStatus!]}`}
            </legend>
            {draft.kind === "status" ? (
              <>
                <p className="text-sm">
                  Statusgrundlaget er fastlåst ved åbning af formularen. En rettelse fra en anden
                  bruger overskrives ikke.
                </p>
                {draft.values.operation === "transition" &&
                  draft.values.targetStatus === "started" && (
                    <>
                      <label className="block text-sm">
                        Faktisk start ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                        <input
                          className={control}
                          type="datetime-local"
                          step="1"
                          value={draft.localStart}
                          required
                          onChange={(e) => setDraft({ ...draft, localStart: e.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className={button}
                        onClick={() => {
                          const d = new Date();
                          setDraft({
                            ...draft,
                            localStart: new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                              .toISOString()
                              .slice(0, 19),
                            values: {
                              ...draft.values,
                              startedSource:
                                draft.values.startedSource || "Egenregistrering i Freyra",
                            },
                          });
                        }}
                      >
                        Indsæt tidspunkt nu
                      </button>
                      <label className="block text-sm">
                        Kilde til starttidspunkt
                        <input
                          className={control}
                          value={draft.values.startedSource ?? ""}
                          required
                          maxLength={2000}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              values: { ...draft.values, startedSource: e.target.value || null },
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                {draft.values.operation === "block" ? (
                  <>
                    <label className="block text-sm">
                      Årsag til afventer
                      <textarea
                        className={control}
                        value={draft.values.blockReason ?? ""}
                        maxLength={2000}
                        required
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            values: { ...draft.values, blockReason: e.target.value || null },
                          })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Ansvarlig for næste handling
                      <select
                        className={control}
                        value={draft.values.blockOwnerId ?? ""}
                        required
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            values: { ...draft.values, blockOwnerId: e.target.value || null },
                          })
                        }
                      >
                        <option value={actorId}>Dig selv</option>
                        {people.data
                          ?.filter((p) => p.user_id !== actorId)
                          .map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.display_name || p.email || person(p.user_id, actorId)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <MoreWorkOrderPeople query={people} />
                    <label className="block text-sm">
                      Næste handling
                      <textarea
                        className={control}
                        value={draft.values.blockNextAction ?? ""}
                        maxLength={2000}
                        required
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            values: { ...draft.values, blockNextAction: e.target.value || null },
                          })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Frist (valgfri)
                      <input
                        className={control}
                        type="date"
                        value={draft.values.blockDueDate ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            values: { ...draft.values, blockDueDate: e.target.value || null },
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label className="block text-sm">
                    {draft.values.operation === "confirm" ||
                    draft.values.operation === "unblock" ||
                    draft.values.targetStatus === "cancelled"
                      ? "Begrundelse"
                      : "Note til statusskiftet (valgfri)"}
                    <textarea
                      className={control}
                      value={draft.values.reason}
                      maxLength={2000}
                      onChange={(e) =>
                        setDraft({ ...draft, values: { ...draft.values, reason: e.target.value } })
                      }
                    />
                  </label>
                )}
                {!!formGaps.length && (
                  <ul className="list-disc pl-5 text-sm">
                    {formGaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="text-sm">
                  {draft.version
                    ? "Notens oprindelige grundlag og tidligere versioner bevares."
                    : "Noten knyttes til det grundlag, du har åbent nu."}
                </p>
                <label className="block text-sm">
                  Notetype
                  <select
                    className={control}
                    value={draft.noteKind}
                    onChange={(e) =>
                      setDraft({ ...draft, noteKind: e.target.value as WorkOrderNote["kind"] })
                    }
                  >
                    {Object.entries(noteKindLabels).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Note
                  <textarea
                    className={control}
                    value={draft.body}
                    rows={4}
                    maxLength={4000}
                    required
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  />
                </label>
                {!!draft.version && (
                  <label className="block text-sm">
                    Årsag til noterettelse
                    <textarea
                      className={control}
                      value={draft.reason}
                      required
                      maxLength={2000}
                      onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                    />
                  </label>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={button + " bg-primary text-primary-foreground"}
                disabled={!!formGaps.length}
              >
                {busy ? "Gemmer…" : draft.kind === "note" ? "Gem noteversion" : "Gem statusversion"}
              </button>
              <button type="button" className={button} onClick={close}>
                Fortryd
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="space-y-3">
        <h4 className="font-medium">Opgavens logbog</h4>
        {log.isPending && <p role="status">Henter logbog…</p>}
        {log.isError && <p role="alert">{log.error.message} Logbogen kunne ikke opdateres.</p>}
        {log.isSuccess && !entries.length && (
          <p className="text-sm">Ingen logposter i det åbnede grundlag.</p>
        )}
        <ol className="space-y-3">
          {entries.map((entry) => (
            <LogItem
              key={entry.key}
              entry={entry}
              actorId={actorId}
              canCorrect={
                !!current?.can_note && (current.can_manage || entry.detail.authorId === actorId)
              }
              disabled={busy || !!draft}
              onCorrect={correct}
            />
          ))}
        </ol>
        {log.hasNextPage && !log.isError && (
          <button
            className={button}
            type="button"
            disabled={!!draft || log.isFetching}
            onClick={() => void log.fetchNextPage()}
          >
            Hent ældre logposter
          </button>
        )}
      </div>
    </section>
  );
}
function LogItem({
  entry,
  actorId,
  canCorrect,
  disabled,
  onCorrect,
}: {
  entry: WorkOrderLogEntry;
  actorId: string;
  canCorrect: boolean;
  disabled: boolean;
  onCorrect: (noteId: string) => Promise<void>;
}) {
  const titles = {
    created: "Opgaven oprettet",
    plan: "Plan gemt",
    access: "Personadgang ændret",
    assignment:
      entry.event_type === "work_order.pool_claimed"
        ? "Puljeopgave overtaget"
        : "Arbejdsfordeling gemt",
    execution: "Faktisk udførelse gemt",
    status: "Status gemt",
    note: entry.detail.kind ? noteKindLabels[entry.detail.kind] : "Manuel note",
    group: "Arbejdsgruppe ændret",
  };
  const d = entry.detail;
  return (
    <li className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="font-medium">
        {titles[entry.kind]}
        {entry.source_version ? ` · version ${entry.source_version}` : ""}
      </p>
      <p className="text-muted-foreground">
        {entry.origin === "manual" ? "Manuel registrering" : "Systemhændelse"} ·{" "}
        {displayTime(entry.created_at)} · {person(entry.created_by, actorId)}
      </p>
      {d.body && <p className="whitespace-pre-wrap">{d.body}</p>}
      {d.status && (
        <p>
          {workOrderStatusLabels[d.status]}
          {d.blocked ? " · Afventer" : ""}
        </p>
      )}
      {d.reason && <p>Begrundelse: {d.reason}</p>}
      {d.blockReason && (
        <p>
          Afventer: {d.blockReason}. Næste handling: {d.blockNextAction}
        </p>
      )}
      {d.actualDate && (
        <p>
          Faktisk dato: {d.actualDate}. Metode: {d.method ?? "Uafklaret"}.
        </p>
      )}
      {d.startedAt && (
        <p>
          Faktisk start: {displayTime(d.startedAt)}. Kilde: {d.startedSource}.
        </p>
      )}
      {!entry.audit_recorded && (
        <p role="alert">Auditbeviset for denne version mangler. Kilderegistreringen er bevaret.</p>
      )}
      {entry.kind === "note" && canCorrect && d.noteId && (
        <button
          type="button"
          className={button}
          disabled={disabled}
          onClick={() => void onCorrect(d.noteId!)}
        >
          Ret note
        </button>
      )}
    </li>
  );
}
