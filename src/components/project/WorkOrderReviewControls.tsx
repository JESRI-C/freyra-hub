import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { saveApprovedWorkOrderReport } from "@/services/report-document-service";
import type { ReportRevision } from "@/lib/report-document";
import { Link, useBlocker } from "@tanstack/react-router";
import { getProjectWorkOrderReviewContext } from "@/lib/work-order-submission.functions";
import { mutateProjectWorkOrderLifecycle } from "@/lib/work-order-lifecycle.functions";
import {
  MutateWorkOrderLifecycleSchema,
  workOrderStatusLabels,
  type WorkOrderStatus,
} from "@/lib/work-order-lifecycle";
import { WorkOrderRequestError, type WorkOrderScope } from "@/lib/work-order-access";
import type {
  ApprovedFollowUpBasis,
  WorkOrderReviewAction,
  WorkOrderReviewContext,
} from "@/lib/work-order-review";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

const button = "min-h-11 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50";
const actionLabels = {
  submit: "Aflevér til gennemgang",
  approve: "Godkend denne aflevering",
  return: "Returnér med mangler",
  reopen: "Genåbn til rettelse",
};
type Draft = {
  action: WorkOrderReviewAction;
  version: number;
  packetVersion: number;
  packetId: string;
  planVersionId: string | null;
  assignmentVersionId: string | null;
  executionRevisionId: string | null;
  reason: string;
};
export function WorkOrderReviewControls({
  scope,
  actorId,
  disabledByParent,
  parentAuthorized,
  readOnly,
  allowReview,
  canCreateReport = false,
  active,
  onEditing,
  onPhase,
  onOpenSubmissionVersion,
  onOpenFollowUpPlan,
  onCreateApprovedFollowUp,
}: {
  scope: WorkOrderScope;
  actorId: string;
  disabledByParent: boolean;
  parentAuthorized: boolean;
  readOnly: boolean;
  allowReview: boolean;
  canCreateReport?: boolean;
  active: boolean;
  onEditing: (editing: boolean) => void;
  onPhase: (phase: WorkOrderStatus | undefined) => void;
  onOpenSubmissionVersion?: (version: number) => void;
  onOpenFollowUpPlan?: () => void;
  onCreateApprovedFollowUp?: (packet: ApprovedFollowUpBasis) => void;
}) {
  const load = useServerFn(getProjectWorkOrderReviewContext),
    mutate = useServerFn(mutateProjectWorkOrderLifecycle),
    cache = useQueryClient();
  const key = [
    "work-order-submission",
    actorId,
    scope.organizationId,
    scope.projectId,
    scope.actionId,
  ];
  const [draft, setDraft] = useState<Draft | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const attempt = useRef<{ signature: string; requestId: string } | undefined>(undefined),
    inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [report, setReport] = useState<ReportRevision | null>(null);
  const locked = !!draft || busy || uncertain;
  useWorkOrderEditorLock(locked, onEditing);
  useBlocker({ shouldBlockFn: () => locked, enableBeforeUnload: locked });
  const query = useQuery({
    queryKey: [...key, "review-context"],
    queryFn: () => load({ data: scope }),
    retry: false,
    refetchOnWindowFocus: !locked && !disabledByParent,
    refetchOnReconnect: !locked && !disabledByParent,
  });
  const refetch = query.refetch;
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current && !locked && !disabledByParent) void refetch();
    wasActive.current = active;
  }, [active, locked, disabledByParent, refetch]);
  const c = query.data;
  const authorized =
    parentAuthorized &&
    !query.isError &&
    c?.user_id === actorId &&
    c.action_id === scope.actionId &&
    c.project_id === scope.projectId &&
    c.organization_id === scope.organizationId;
  const phase = authorized ? c?.state?.status : undefined;
  useEffect(() => {
    if (authorized) onPhase(phase);
  }, [authorized, phase, onPhase]);
  async function openReport(reviewId: string, submissionId: string) {
    if (
      !authorized ||
      !canCreateReport ||
      disabledByParent ||
      locked ||
      query.isFetching ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveApprovedWorkOrderReport({
        ...scope,
        submissionId,
        reviewId,
      });
      if (alive.current) {
        setReport(result);
        setNotice("Rapportkladden er klar. Åbn den gemte rapport for at se den og hente PDF.");
      }
      await cache.invalidateQueries({ queryKey: ["report-documents"] });
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Rapporten kunne ikke oprettes.");
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const currentApproval =
    c?.state?.status === "approved" && c.state.operation === "review" ? c.state : undefined;

  function submissionLink(version: number) {
    return (
      <Link
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2"
        to="/app/projects/$slug"
        params={{ slug: scope.projectId }}
        search={(previous) => ({
          ...previous,
          tab: "handlinger",
          task: scope.actionId,
          work: "submission",
          submissionVersion: version,
        })}
        onClick={(event) => {
          if (
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          )
            onOpenSubmissionVersion?.(version);
        }}
      >
        Se afleveringsversion {version}
      </Link>
    );
  }

  function reportAction(reviewId: string, submissionId: string, version: number) {
    if (report?.content.workOrderApproval?.reviewId === reviewId) {
      return (
        <Link
          className={button + " inline-flex items-center"}
          to="/app/reports/preview"
          search={{ report: report.report_id, version: report.version }}
        >
          Åbn den gemte rapport
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={button}
        disabled={locked || disabledByParent || query.isFetching}
        onClick={() => void openReport(reviewId, submissionId)}
      >
        Klargør rapportkladde for afleveringsversion {version}
      </button>
    );
  }
  function start(action: WorkOrderReviewAction) {
    if (!authorized || !c?.packet || disabledByParent || locked) return;
    const permitted =
      action === "submit"
        ? !readOnly && c.can_submit
        : action === "reopen"
          ? !readOnly && c.can_reopen
          : allowReview &&
            c.can_review &&
            phase === "submitted" &&
            !c.state?.blocked &&
            (action !== "approve" || c.packet_current);
    if (!permitted) return;
    const refs =
      action === "reopen"
        ? c.basis
        : {
            planVersionId: c.packet.plan_version_id,
            assignmentVersionId: c.packet.assignment_version_id,
            executionRevisionId: c.packet.execution_revision_id,
          };
    setDraft({
      action,
      version: c.state?.version ?? 0,
      packetVersion: c.packet.version,
      packetId: c.packet.id,
      ...refs,
      reason: "",
    });
    setError("");
    setNotice("");
    attempt.current = undefined;
  }
  async function save() {
    if (!draft || !authorized || disabledByParent || inFlight.current) return;
    const targets = {
      submit: "submitted",
      approve: "approved",
      return: "returned",
      reopen: "reopened",
    } as const;
    const parsed = MutateWorkOrderLifecycleSchema.safeParse({
      ...scope,
      expectedActorId: actorId,
      expectedVersion: draft.version,
      values: {
        operation:
          draft.action === "approve" || draft.action === "return" ? "review" : draft.action,
        targetStatus: targets[draft.action],
        planVersionId: draft.planVersionId,
        assignmentVersionId: draft.assignmentVersionId,
        executionRevisionId: draft.executionRevisionId,
        submissionVersionId: draft.packetId,
        reviewScope:
          draft.action === "approve" || draft.action === "return"
            ? "execution_and_documentation"
            : null,
        reason: draft.reason.trim(),
      },
      requestId: attempt.current?.requestId ?? crypto.randomUUID(),
    });
    if (!parsed.success) {
      setError(
        "Skriv en konkret begrundelse. Ved gennemgang skal den beskrive omfang og resultat med mindst 10 tegn.",
      );
      return;
    }
    const { requestId: _id, ...values } = parsed.data,
      signature = JSON.stringify(values);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, requestId: parsed.data.requestId };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate({ data: { ...parsed.data, requestId: attempt.current.requestId } });
      if (!alive.current) return;
      setNotice(
        `${actionLabels[draft.action]}: afleveringsversion ${draft.packetVersion} er registreret. Tidligere versioner er bevaret.`,
      );
      setDraft(null);
      setUncertain(false);
      attempt.current = undefined;
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        cache.invalidateQueries({ queryKey: ["work-order-lifecycle", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["work-order-log", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["audit", scope.projectId] }),
      ]);
    } catch (failure) {
      if (!alive.current) return;
      setUncertain(!(failure instanceof WorkOrderRequestError) || failure.code === "unavailable");
      setError(
        failure instanceof Error
          ? failure.message
          : "Handlingen kunne ikke bekræftes. Prøv samme gemning igen.",
      );
      // Refresh access without replacing the draft's exact version, sources or retry identity.
      await cache.invalidateQueries({ queryKey: key });
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Aflevering og faglig gennemgang"
      className="space-y-3 rounded-xl border p-4"
    >
      <h3 className="font-semibold">Aflevering og faglig gennemgang</h3>
      <p className="text-sm leading-6">
        Gennemgangen gælder den registrerede udførelse og dokumentationen i én bestemt
        afleveringsversion. Naturens effekt vurderes særskilt.
      </p>
      {query.isPending && <p role="status">Henter afleveringsstatus…</p>}
      {(query.error || error) && <p role="alert">{query.error?.message || error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && !draft && <p role="status">Klargør rapportkladden…</p>}
      {authorized && (
        <>
          <p className="text-sm font-medium">
            Status: {phase ? workOrderStatusLabels[phase] : "Ikke fastlagt"}
            {c?.packet ? ` · afleveringsversion ${c.packet.version}` : ""}
          </p>
          {c?.packet && !locked && !disabledByParent && submissionLink(c.packet.version)}
          {c?.state?.reason &&
            ["submitted", "approved", "returned", "reopened"].includes(phase ?? "") && (
              <p className="whitespace-pre-wrap text-sm">Begrundelse: {c.state.reason}</p>
            )}
          {c?.packet_current === false && (
            <p className="text-sm">
              Det aktuelle grundlag afviger fra afleveringen eller opfylder ikke længere kontrollen.
              Den gemte version og dens eventuelle godkendelse er bevaret. Genåbn og aflevér en ny
              version, hvis de nye oplysninger skal omfattes.
            </p>
          )}
          {c?.self_review && phase === "submitted" && (
            <p className="text-sm">
              En anden autoriseret reviewer skal gennemgå dette materiale. Du kan ikke godkende din
              egen udførelse eller dokumentation.
            </p>
          )}
          {phase === "submitted" && !c?.self_review && (!allowReview || !c?.can_review) && (
            <p className="text-sm">
              Afleveringen afventer faglig gennemgang. En person med gennemgangsadgang tager
              stilling til den gemte version.
            </p>
          )}
          {phase === "returned" && !c?.state?.blocked && (
            <p className="text-sm">
              {!readOnly && c?.can_reopen
                ? "Genåbn opgaven for at rette manglerne og aflevere en ny version."
                : "En person med adgang til at genåbne opgaven skal sætte rettelserne i gang."}
            </p>
          )}
          {phase === "reopened" && (
            <p className="text-sm">
              Ret de relevante oplysninger, og bekræft udført status under Arbejdsgrundlag. Fasthold
              derefter en ny afleveringsversion.
            </p>
          )}
          {c?.state?.blocked && (
            <p className="text-sm">
              Ophæv den registrerede blokering under Arbejdsgrundlag, før afleveringen kan
              fortsætte.
            </p>
          )}
          {!draft && (
            <div className="flex flex-wrap gap-2">
              {!readOnly && c?.can_submit && (
                <button
                  className={button}
                  disabled={disabledByParent || query.isFetching}
                  onClick={() => start("submit")}
                >
                  {actionLabels.submit}
                </button>
              )}
              {allowReview && c?.can_review && phase === "submitted" && (
                <>
                  <button
                    className={button}
                    disabled={
                      disabledByParent || query.isFetching || !c.packet_current || c.state?.blocked
                    }
                    onClick={() => start("approve")}
                  >
                    {actionLabels.approve}
                  </button>
                  <button
                    className={button}
                    disabled={disabledByParent || query.isFetching || c.state?.blocked}
                    onClick={() => start("return")}
                  >
                    {actionLabels.return}
                  </button>
                </>
              )}
              {!readOnly && c?.can_reopen && (
                <button
                  className={button}
                  disabled={disabledByParent || query.isFetching}
                  onClick={() => start("reopen")}
                >
                  {actionLabels.reopen}
                </button>
              )}
            </div>
          )}
          {canCreateReport && !draft && currentApproval && c?.packet && (
            <div className="space-y-2 rounded-lg border p-3">
              <h4 className="font-medium">Næste skridt · Projektrapport</h4>
              <p className="text-sm">
                Klargør rapporten med den godkendte udførelse og dokumentation fra
                afleveringsversion {c.packet.version}. Åbn derefter rapporten for at se den og hente
                PDF.
              </p>
              {reportAction(currentApproval.id, c.packet.id, c.packet.version)}
            </div>
          )}
          {!draft && currentApproval && onOpenFollowUpPlan && (
            <div className="space-y-2 rounded-lg border p-3">
              <h4 className="font-medium">Planlæg opfølgning</h4>
              <p className="text-sm">
                Hvis gennemgangen giver anledning til mere arbejde, kan du se eksisterende
                opfølgninger eller oprette en ny opgave fra arbejdsgrundlaget.
              </p>
              <button
                type="button"
                className={button}
                disabled={disabledByParent || query.isFetching}
                onClick={onOpenFollowUpPlan}
              >
                Åbn arbejdsgrundlaget for opfølgning
              </button>
              {onCreateApprovedFollowUp && c?.packet && (
                <button
                  type="button"
                  className={button}
                  disabled={disabledByParent || query.isFetching}
                  onClick={() => onCreateApprovedFollowUp(c.packet!)}
                >
                  Opret opfølgning fra godkendt plan
                </button>
              )}
            </div>
          )}
          {!!c?.recent_reviews.length && (
            <div className="space-y-2">
              <h4 className="font-medium">Seneste faglige gennemgange</h4>
              <ol className="space-y-2">
                {c.recent_reviews.map((entry) => (
                  <li key={entry.state.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {workOrderStatusLabels[entry.state.status]} · afleveringsversion{" "}
                      {entry.submission_version}
                    </p>
                    <p>
                      {new Date(entry.state.created_at).toLocaleString("da-DK")} · Registreret
                      reviewer {entry.state.created_by.slice(-8)}
                    </p>
                    <p className="whitespace-pre-wrap">{entry.state.reason}</p>
                    <p>Omfang: Registreret udførelse og vedlagt dokumentation.</p>
                    {!locked && !disabledByParent && submissionLink(entry.submission_version)}
                    {onCreateApprovedFollowUp &&
                      !locked &&
                      entry.state.status === "approved" &&
                      entry.state.id !== currentApproval?.id &&
                      entry.state.submission_version_id &&
                      entry.state.plan_version_id && (
                        <button
                          type="button"
                          className={button}
                          disabled={disabledByParent || query.isFetching}
                          onClick={() =>
                            onCreateApprovedFollowUp({
                              id: entry.state.submission_version_id!,
                              version: entry.submission_version,
                              plan_version_id: entry.state.plan_version_id!,
                            })
                          }
                        >
                          Opret opfølgning fra afleveringsversion {entry.submission_version}
                        </button>
                      )}
                    {canCreateReport &&
                      !draft &&
                      entry.state.status === "approved" &&
                      entry.state.id !== currentApproval?.id &&
                      entry.state.submission_version_id && (
                        <div className="mt-2">
                          {reportAction(
                            entry.state.id,
                            entry.state.submission_version_id,
                            entry.submission_version,
                          )}
                        </div>
                      )}
                  </li>
                ))}
              </ol>
              <p className="text-sm text-muted-foreground">
                De seneste fem gennemgange vises her. Hele historikken findes i opgavens status og
                logbog under Arbejdsgrundlag.
              </p>
            </div>
          )}
        </>
      )}
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-3 border-t pt-3"
        >
          <p className="font-medium">
            {actionLabels[draft.action]} · afleveringsversion {draft.packetVersion}
          </p>
          <label className="block text-sm font-medium">
            {draft.action === "approve" || draft.action === "return"
              ? "Gennemgået omfang, resultat og eventuelle mangler"
              : "Begrundelse for afleveringshandlingen"}
            <textarea
              className="mt-1 block min-h-24 w-full rounded-xl border bg-background p-3 text-base"
              value={draft.reason}
              maxLength={2000}
              required
              disabled={busy || uncertain}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            />
          </label>
          {uncertain && (
            <p role="status">
              Svaret er usikkert. Prøv samme handling igen for at hente kvitteringen uden en dublet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              type="submit"
              disabled={busy || disabledByParent || !authorized}
            >
              {busy
                ? "Gemmer…"
                : uncertain
                  ? "Prøv samme handling igen"
                  : "Gem afleveringshandling"}
            </button>
            <button
              className={button}
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setUncertain(false);
                setError("");
                attempt.current = undefined;
                void query.refetch();
              }}
            >
              Fortryd og hent status
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
