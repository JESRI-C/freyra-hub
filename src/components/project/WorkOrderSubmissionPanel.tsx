import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBlocker } from "@tanstack/react-router";
import {
  getProjectWorkOrderSubmissionContext,
  listProjectWorkOrderSubmissions,
  saveProjectWorkOrderSubmission,
} from "@/lib/work-order-submission.functions";
import { getProjectWorkOrderEvidenceOriginal } from "@/lib/work-order-evidence.functions";
import { submissionGapLabels } from "@/lib/work-order-submission";
import { WorkOrderRequestError } from "@/lib/work-order-access";
import type { ProjectScope } from "@/services/project-workspace-service";
import { WorkOrderExecutionReference } from "./WorkOrderExecutionReference";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";
import { WorkOrderReviewControls } from "./WorkOrderReviewControls";
import { WORK_ORDER_PARTS, type WorkOrderView } from "@/lib/work-order-navigation";
import type { WorkOrderStatus } from "@/lib/work-order-lifecycle";

const button = "min-h-11 rounded-xl border px-4 py-2 text-sm disabled:opacity-50";
const gapDestination: Record<keyof typeof submissionGapLabels, WorkOrderView> = {
  plan_incomplete: "plan",
  assignment_invalid: "plan",
  execution_incomplete: "execution",
  not_performed: "plan",
  task_blocked: "plan",
  lifecycle_basis_changed: "plan",
  observation_needs_review: "evidence",
  observation_incomplete: "evidence",
  original_unavailable: "evidence",
  evidence_missing: "evidence",
  too_many_evidence: "evidence",
  packet_too_large: "evidence",
};

export function WorkOrderSubmissionPanel({
  scope,
  actorId,
  actionId,
  readOnly = false,
  allowReviewInReadOnly = false,
  canCreateReport = false,
  active = true,
  onEditing,
  onOpenPart,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  readOnly?: boolean;
  allowReviewInReadOnly?: boolean;
  canCreateReport?: boolean;
  active?: boolean;
  onEditing?: (value: boolean) => void;
  onOpenPart?: (part: WorkOrderView) => void;
}) {
  const cache = useQueryClient();
  const contextFn = useServerFn(getProjectWorkOrderSubmissionContext);
  const historyFn = useServerFn(listProjectWorkOrderSubmissions);
  const saveFn = useServerFn(saveProjectWorkOrderSubmission);
  const originalFn = useServerFn(getProjectWorkOrderEvidenceOriginal);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [opening, setOpening] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [reviewEditing, setReviewEditing] = useState(false);
  const [reviewPhase, setReviewPhase] = useState<WorkOrderStatus | undefined>(undefined);
  const reviewClosed = ["submitted", "approved", "returned", "cancelled"].includes(
    reviewPhase ?? "",
  );
  const inFlight = useRef(false),
    alive = useRef(true);
  const attempt = useRef<{ signature: string; requestId: string } | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const task = { ...scope, actionId };
  const key = useMemo(
    () => ["work-order-submission", actorId, scope.organizationId, scope.projectId, actionId],
    [actorId, scope.organizationId, scope.projectId, actionId],
  );
  const locked = !!note || busy || opening || uncertain || reviewEditing;
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current && !locked) void cache.invalidateQueries({ queryKey: key });
    wasActive.current = active;
  }, [active, locked, cache, key]);
  useWorkOrderEditorLock(locked, onEditing);
  useBlocker({ shouldBlockFn: () => locked, enableBeforeUnload: locked });
  const context = useQuery({
    queryKey: [...key, "context"],
    queryFn: () => contextFn({ data: task }),
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const c = context.data;
  const authorized =
    !context.isError &&
    c?.user_id === actorId &&
    c.action_id === actionId &&
    c.project_id === scope.projectId &&
    c.organization_id === scope.organizationId;
  const writable = authorized && !!c?.can_prepare && !readOnly;
  const history = useInfiniteQuery({
    queryKey: [...key, "history"],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      historyFn({ data: { ...task, beforeVersion: pageParam, pageSize: 5 } }),
    getNextPageParam: (page) => page.nextBeforeVersion ?? undefined,
    enabled: authorized,
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  async function save() {
    if (
      !writable ||
      reviewClosed ||
      reviewEditing ||
      !c?.basis_hash ||
      !note.trim() ||
      c.gaps?.length ||
      inFlight.current
    )
      return;
    const input = {
      ...task,
      expectedActorId: actorId,
      expectedVersion: c.latest_version,
      basisHash: c.basis_hash,
      note: note.trim(),
    };
    const signature = JSON.stringify(input);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, requestId: crypto.randomUUID() };
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveFn({ data: { ...input, requestId: attempt.current.requestId } });
      if (!alive.current) return;
      setNote("");
      setUncertain(false);
      attempt.current = undefined;
      setNotice(
        `Afleveringsversion ${saved.version} er gemt. Grundlaget er fastholdt; det er ikke en faglig godkendelse.`,
      );
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        cache.invalidateQueries({ queryKey: ["audit", scope.projectId] }),
      ]);
    } catch (failure) {
      if (!alive.current) return;
      setUncertain(!(failure instanceof WorkOrderRequestError) || failure.code === "unavailable");
      setError(
        failure instanceof Error
          ? failure.message
          : "Afleveringen kunne ikke bekræftes. Prøv samme gemning igen.",
      );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function openOriginal(id: string) {
    if (!authorized || reviewEditing || inFlight.current) return;
    inFlight.current = true;
    setOpening(true);
    setError("");
    try {
      const result = await originalFn({ data: { ...task, id, expectedActorId: actorId } });
      if (!alive.current) return;
      const link = document.createElement("a");
      link.href = result.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      link.click();
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : "Originalen kunne ikke åbnes.");
    } finally {
      inFlight.current = false;
      if (alive.current) setOpening(false);
    }
  }
  return (
    <section
      aria-label="Opgavens afleveringsgrundlag"
      className="min-w-0 space-y-4 [overflow-wrap:anywhere]"
    >
      <header>
        <h3 className="text-lg font-semibold">Afleveringsgrundlag</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Fasthold den plan, udførelse og dokumentation, der skal gennemgås. Senere rettelser ændrer
          ikke de gemte afleveringsversioner.
        </p>
      </header>
      {context.isPending && <p role="status">Kontrollerer afleveringsgrundlaget…</p>}
      {(context.error || error || history.error) && (
        <p role="alert">{context.error?.message || error || history.error?.message}</p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        className={button}
        disabled={busy || opening || uncertain || reviewEditing || context.isFetching}
        onClick={() => void cache.invalidateQueries({ queryKey: key })}
      >
        Hent aktuelt grundlag
      </button>
      <WorkOrderReviewControls
        scope={task}
        actorId={actorId}
        active={active}
        readOnly={readOnly}
        allowReview={!readOnly || allowReviewInReadOnly}
        parentAuthorized={authorized}
        canCreateReport={canCreateReport}
        disabledByParent={!authorized || !!note || busy || opening || uncertain}
        onEditing={setReviewEditing}
        onPhase={setReviewPhase}
      />
      {authorized && (
        <>
          {writable && (!reviewClosed || !!note) && (
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm">
                Kontrollen kræver en udført og ublokeret opgave med aktuel plan og tildeling, en
                komplet udførelse og mindst én fuldt udfyldt registrering med et verificeret
                originalfoto. Alle aktive dokumentationskoblinger indgår.
              </p>
              {!!c?.gaps?.length && (
                <div>
                  <h4 className="font-medium">Dette mangler før grundlaget kan fastholdes</h4>
                  <ol className="mt-2 space-y-2 text-sm">
                    {WORK_ORDER_PARTS.map((part) => {
                      const gaps = c.gaps?.filter((gap) => gapDestination[gap] === part.id);
                      if (!gaps?.length) return null;
                      return (
                        <li key={part.id} className="rounded-lg border p-3">
                          <h5 className="font-medium">{part.label}</h5>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {gaps.map((gap) => (
                              <li key={gap}>{submissionGapLabels[gap]}</li>
                            ))}
                          </ul>
                          {onOpenPart && (
                            <button
                              type="button"
                              className="block min-h-11 text-left font-medium text-primary underline underline-offset-2 disabled:opacity-50"
                              disabled={locked}
                              onClick={() => {
                                if (!locked) onOpenPart(part.id);
                              }}
                            >
                              Åbn {part.label}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {(c.gaps.includes("observation_incomplete") ||
                    c.gaps.includes("observation_needs_review")) && (
                    <p className="mt-2 text-sm">
                      Se den tilknyttede version under Dokumentation. Hvis du gemmer en rettelse i
                      Feltregistrering, skal den nye version tilknyttes under Dokumentation.
                    </p>
                  )}
                </div>
              )}
              {!c?.gaps?.length && (
                <p className="text-sm">
                  Planversion {c?.plan_version} · udførelsesversion {c?.execution_version} ·{" "}
                  {c?.evidence_count} dokumentationskoblinger.
                </p>
              )}
              {c?.context_changed && (
                <p className="text-sm">
                  Grundlaget er ændret siden den seneste afleveringsversion. Den tidligere version
                  er bevaret.
                </p>
              )}
              <label className="block text-sm font-medium">
                Bemærkning til afleveringen
                <textarea
                  className="mt-1 block min-h-24 w-full rounded-xl border bg-background p-3 text-base"
                  maxLength={2000}
                  value={note}
                  disabled={busy || uncertain || reviewEditing || reviewClosed}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              {uncertain && (
                <p role="status" className="text-sm">
                  Gemmesvaret er usikkert. Prøv samme gemning igen for at få kvitteringen uden at
                  oprette en dublet.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button + " bg-primary text-primary-foreground"}
                  disabled={
                    busy ||
                    opening ||
                    reviewEditing ||
                    reviewClosed ||
                    context.isFetching ||
                    !!c?.gaps?.length ||
                    !note.trim()
                  }
                  onClick={() => void save()}
                >
                  {busy
                    ? "Gemmer…"
                    : uncertain
                      ? "Prøv samme gemning igen"
                      : "Gem afleveringsversion"}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy || opening || reviewEditing}
                  onClick={() => {
                    setNote("");
                    setError("");
                    setUncertain(false);
                    attempt.current = undefined;
                    void cache.invalidateQueries({ queryKey: key });
                  }}
                >
                  Fortryd kladde og genindlæs
                </button>
              </div>
            </div>
          )}
          {history.isPending && <p role="status">Henter afleveringsversioner…</p>}
          {history.data &&
            !history.isError &&
            !history.data.pages.some((page) => page.items.length) && (
              <p className="text-sm text-muted-foreground">
                Der er endnu ikke gemt et afleveringsgrundlag for opgaven.
              </p>
            )}
          {!history.isError &&
            history.data?.pages
              .flatMap((page) => page.items)
              .map((row) => (
                <article key={row.id} className="space-y-3 rounded-xl border p-4">
                  <h4 className="font-semibold">Afleveringsversion {row.version}</h4>
                  <p className="text-sm text-muted-foreground">
                    Gemt {new Date(row.created_at).toLocaleString("da-DK")} · Fastholdt grundlag
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{row.note}</p>
                  <p className="text-sm">
                    Planversion {row.snapshot.plan.version} · udførelsesversion{" "}
                    {row.snapshot.execution.binding.version} · {row.snapshot.evidence.length}{" "}
                    dokumentationskoblinger
                  </p>
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                      Se det fastholdte grundlag
                    </summary>
                    <div className="space-y-3 text-sm">
                      <h5 className="font-medium">{row.snapshot.plan.plan.title}</h5>
                      <p className="whitespace-pre-wrap">{row.snapshot.plan.plan.instructions}</p>
                      <p>Planlagt fra: {row.snapshot.plan.plan.plannedStart ?? "Ukendt"}</p>
                      <p>
                        Udført: {row.snapshot.execution.values.actualDate} ·{" "}
                        {row.snapshot.execution.values.method}
                      </p>
                      <p>{row.snapshot.execution.values.coverageDescription}</p>
                      {row.snapshot.execution.values.dataBasis !== "real" && (
                        <p>Eksempel- eller testgrundlag</p>
                      )}
                      <WorkOrderExecutionReference
                        scope={task}
                        actorId={actorId}
                        revisionId={row.execution_revision_id}
                      />
                      {row.snapshot.evidence.map((ev) => (
                        <div key={ev.id} className="space-y-2 border-t pt-3">
                          <h5 className="font-medium">
                            {ev.observation_snapshot.template.title} · registrering version{" "}
                            {ev.observation_snapshot.version}
                          </h5>
                          <dl>
                            {ev.observation_snapshot.template.fields.map((field) => (
                              <div key={field.key}>
                                <dt className="text-muted-foreground">{field.label}</dt>
                                <dd>
                                  {typeof ev.observation_snapshot.values[field.key] === "boolean"
                                    ? ev.observation_snapshot.values[field.key]
                                      ? "Ja"
                                      : "Nej"
                                    : (ev.observation_snapshot.values[field.key] ?? "Ukendt")}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <button
                            type="button"
                            className={button}
                            disabled={busy || opening || reviewEditing}
                            onClick={() => void openOriginal(ev.id)}
                          >
                            Åbn fastholdt originalfoto
                          </button>
                        </div>
                      ))}
                      <p className="text-muted-foreground">
                        Originalåbning kontrollerer din aktuelle adgang og filens identitet. En
                        tilbagetrukket kobling giver ikke et nyt original-link.
                      </p>
                    </div>
                  </details>
                </article>
              ))}
          {history.hasNextPage && (
            <button
              type="button"
              className={button}
              disabled={history.isFetching || busy}
              onClick={() => void history.fetchNextPage()}
            >
              Vis ældre afleveringsversioner
            </button>
          )}
        </>
      )}
    </section>
  );
}
