import { WORK_ORDER_PARTS, type WorkOrderView } from "@/lib/work-order-navigation";
import { WorkspaceGuide } from "@/components/WorkspaceGuide";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import { listFieldJobActions, listFieldJobSchedule } from "@/services/field-job-cards-service";
import { createProjectAction, type ProjectScope } from "@/services/project-workspace-service";
import { WorkOrderPlansPanel } from "./WorkOrderPlansPanel";
import { FieldJobCardsPanel } from "./FieldJobCardsPanel";
import { ActionExecutionPanel } from "./ActionExecutionPanel";
import { WorkOrderEvidencePanel } from "./WorkOrderEvidencePanel";
import { WorkOrderSubmissionPanel } from "./WorkOrderSubmissionPanel";

type Props = {
  scope: ProjectScope;
  round?: string;
  canEdit: boolean;
  selectedActionId?: string;
  onSelectAction?: (id: string | undefined, view?: WorkOrderView) => void;
  initialView?: WorkOrderView;
};
export type { WorkOrderView } from "@/lib/work-order-navigation";
type Part = WorkOrderView;
const parts = WORK_ORDER_PARTS;
const scheduleDate = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeZone: "UTC" });
function scheduleLabel(plan?: { start: string; end: string | null }) {
  if (!plan) return "Ingen planlagt dato";
  const start = scheduleDate.format(new Date(plan.start));
  return plan.end && plan.end !== plan.start
    ? start + " – " + scheduleDate.format(new Date(plan.end))
    : start;
}
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background p-3 text-base";

/** A single task context. Switching views keeps opened editors and uncertain retries alive. */
export function ProjectWorkOrdersWorkspace(props: Props) {
  const { user } = useAuth();
  return (
    <WorkOrders
      key={`${user?.id ?? "anonymous"}:${props.scope.organizationId}:${props.scope.projectId}`}
      {...props}
      actorId={user?.id}
    />
  );
}
function WorkOrders({
  scope,
  round,
  canEdit,
  selectedActionId,
  onSelectAction,
  actorId,
  initialView,
}: Props & { actorId?: string }) {
  const cache = useQueryClient();
  const loadAccess = useServerFn(getFieldJobAccess);
  const [localActionId, setLocalAction] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleActionId, setScheduleActionId] = useState<string>();
  const actionId = selectedActionId ?? localActionId;
  const [editors, setEditors] = useState<Set<Part>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdActionId, setCreatedActionId] = useState<string>();
  const alive = useRef(true);
  const inFlight = useRef(false);
  const createAttempt = useRef<{ id: string; signature: string } | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const locked = editors.size > 0 || busy || creating;
  useBlocker({ shouldBlockFn: () => locked, enableBeforeUnload: locked });
  useEffect(() => {
    if (!createdActionId || locked) return;
    setLocalAction(createdActionId);
    onSelectAction?.(createdActionId);
    setCreatedActionId(undefined);
  }, [createdActionId, locked, onSelectAction]);
  const onEditing = useCallback((part: Part, value: boolean) => {
    setEditors((old) => {
      if (old.has(part) === value) return old;
      const next = new Set(old);
      if (value) next.add(part);
      else next.delete(part);
      return next;
    });
  }, []);
  const access = useQuery({
    queryKey: ["field-job-access", actorId, scope.projectId],
    queryFn: () => loadAccess({ data: { projectId: scope.projectId } }),
    enabled: !!actorId,
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const sameAccess =
    !!actorId && access.data?.userId === actorId && access.data.projectId === scope.projectId;
  const authorized = sameAccess && !access.isError;
  const actions = useQuery({
    queryKey: ["field-job-actions", actorId, scope],
    queryFn: () => listFieldJobActions(scope),
    enabled: authorized,
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const schedule = useQuery({
    queryKey: ["field-job-schedule", actorId, scope],
    queryFn: () => listFieldJobSchedule(scope),
    enabled: authorized && showSchedule && !actionId && actions.isSuccess,
    retry: false,
  });
  const dates = schedule.data;
  const visibleActions =
    showSchedule && dates
      ? [...(actions.data ?? [])].sort((a, b) => {
          const startA = dates[a.id]?.start ?? "9999-99-99";
          const startB = dates[b.id]?.start ?? "9999-99-99";
          return startA.localeCompare(startB) || a.title.localeCompare(b.title, "da");
        })
      : actions.data;
  const selected = actions.data?.find((a) => a.id === actionId);
  function select(id: string, view?: WorkOrderView) {
    if (locked) return;
    setLocalAction(id);
    setScheduleActionId(view === "plan" ? id : undefined);
    onSelectAction?.(id || undefined, view);
    setError("");
  }
  async function create() {
    if (!authorized || !canEdit || !access.data?.canConfigure || inFlight.current || !title.trim())
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify({ scope, title: title.trim() });
      if (createAttempt.current?.signature !== signature)
        createAttempt.current = { signature, id: crypto.randomUUID() };
      const action = await createProjectAction(
        scope,
        title.trim(),
        "Arbejdsgrundlag afventer planlægning.",
        createAttempt.current.id,
      );
      if (alive.current) {
        setCreating(false);
        setTitle("");
        setCreatedActionId(action.id);
        createAttempt.current = undefined;
      }
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["field-job-actions", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["project-workspace"] }),
        cache.invalidateQueries({ queryKey: ["actions", scope.projectId] }),
      ]);
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : "Opgaven kunne ikke oprettes.");
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Arbejdsopgaver" className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Arbejdsopgaver</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Planlæg en konkret indsats, følg det udførte arbejde, og saml den dokumentation, der
            hører til opgaven.
          </p>
        </div>
        <Link to="/opgaver" className={button}>
          Mine opgaver
        </Link>
      </header>
      {!actorId && <p>Log ind for at åbne arbejdsopgaver.</p>}
      {(access.isPending || (authorized && actions.isPending)) && actorId && (
        <p role="status">Henter arbejdsopgaver…</p>
      )}
      {(access.error || actions.error) && (
        <div className="space-y-2">
          <p role="alert">
            {(access.error || actions.error)?.message} Dine åbne kladder bevares, mens adgangen
            kontrolleres igen.
          </p>
          <button
            type="button"
            className={button}
            disabled={access.isFetching || actions.isFetching || busy}
            onClick={() => void Promise.all([access.refetch(), actions.refetch()])}
          >
            Prøv igen
          </button>
        </div>
      )}
      {sameAccess && actions.data && (
        <div className="space-y-4" hidden={!authorized || actions.isError}>
          {actionId ? (
            <div className="space-y-3 rounded-2xl border bg-card p-4">
              <label className="block text-sm font-medium">
                Opgave
                <select
                  aria-label="Valgt arbejdsopgave"
                  className={control}
                  value={actionId}
                  disabled={locked}
                  onChange={(e) => select(e.target.value)}
                >
                  <option value="">Til opgavelisten</option>
                  {!selected && (
                    <option value={actionId}>Opgaven findes ikke i dette udvalg</option>
                  )}
                  {actions.data.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </label>
              {locked && (
                <p role="status" className="text-sm">
                  Gem eller fortryd dine ændringer, før du vælger en anden opgave. Du kan skifte
                  visning og fortsætte din kladde.
                </p>
              )}
              {!selected && (
                <p role="alert">
                  Opgaven kunne ikke findes i projektet med din adgang. Vælg en opgave fra listen.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {!actions.data.length && <p>Der er endnu ingen arbejdsopgaver i projektet.</p>}
              {!!actions.data.length && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Vis arbejdsopgaver">
                  <button
                    type="button"
                    className={button}
                    aria-pressed={!showSchedule}
                    disabled={locked}
                    onClick={() => setShowSchedule(false)}
                  >
                    Opgaveliste
                  </button>
                  <button
                    type="button"
                    className={button}
                    aria-pressed={showSchedule}
                    disabled={locked}
                    onClick={() => setShowSchedule(true)}
                  >
                    Planoversigt
                  </button>
                </div>
              )}
              {showSchedule && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Planoversigt</h3>
                  <p className="text-sm text-muted-foreground">
                    Se opgaver efter planlagt start. Åbn en opgave for at se eller ændre dens
                    arbejdsgrundlag.
                  </p>
                  {schedule.isPending && !!actions.data.length && (
                    <p role="status">Henter planlagte datoer…</p>
                  )}
                  {schedule.isError && (
                    <div>
                      <p role="alert">Planoversigten kunne ikke hentes.</p>
                      <button
                        type="button"
                        className={button}
                        onClick={() => void schedule.refetch()}
                      >
                        Prøv planoversigten igen
                      </button>
                    </div>
                  )}
                </div>
              )}
              {(!showSchedule || schedule.isSuccess) &&
                visibleActions?.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    disabled={locked}
                    onClick={() => select(a.id, showSchedule ? "plan" : undefined)}
                    className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{a.title}</span>
                      {showSchedule && (
                        <span className="block text-sm text-muted-foreground">
                          {scheduleLabel(dates?.[a.id])}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm text-primary">Åbn →</span>
                  </button>
                ))}
            </div>
          )}
          {!creating && canEdit && access.data?.canConfigure && (
            <button
              type="button"
              className={button}
              disabled={locked}
              onClick={() => setCreating(true)}
            >
              Opret arbejdsopgave
            </button>
          )}
          {creating && (
            <form
              className="space-y-3 rounded-xl border bg-card p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label className="block">
                Hvad skal der udføres?
                <input
                  className={control}
                  required
                  maxLength={200}
                  value={title}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className={button + " bg-primary text-primary-foreground"}
                  disabled={busy || !title.trim()}
                >
                  Opret opgave
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    setCreating(false);
                    setTitle("");
                    setError("");
                  }}
                >
                  Fortryd
                </button>
              </div>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
          {selected && actorId && (
            <TaskWorkspace
              key={actionId}
              scope={scope}
              actorId={actorId}
              actionId={actionId}
              round={round}
              canEdit={canEdit}
              canContribute={!!access.data?.canContribute}
              onEditing={onEditing}
              initialView={scheduleActionId === actionId ? "plan" : initialView}
            />
          )}
        </div>
      )}
    </section>
  );
}
function TaskWorkspace({
  scope,
  actorId,
  actionId,
  round,
  canEdit,
  canContribute,
  onEditing,
  initialView,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  round?: string;
  canEdit: boolean;
  canContribute: boolean;
  onEditing: (part: Part, value: boolean) => void;
  initialView?: WorkOrderView;
}) {
  const [part, setPart] = useState<Part>(initialView ?? "plan");
  const [opened, setOpened] = useState<Set<Part>>(() => new Set([initialView ?? "plan"]));
  useEffect(() => {
    if (!initialView) return;
    setOpened((old) => (old.has(initialView) ? old : new Set([...old, initialView])));
    setPart(initialView);
  }, [initialView]);
  const planEditing = useCallback((value: boolean) => onEditing("plan", value), [onEditing]);
  const fieldEditing = useCallback((value: boolean) => onEditing("field", value), [onEditing]);
  const executionEditing = useCallback(
    (value: boolean) => onEditing("execution", value),
    [onEditing],
  );
  const evidenceEditing = useCallback(
    (value: boolean) => onEditing("evidence", value),
    [onEditing],
  );
  const submissionEditing = useCallback(
    (value: boolean) => onEditing("submission", value),
    [onEditing],
  );
  const current = parts.find((item) => item.id === part)!;
  const next = parts[parts.indexOf(current) + 1];
  function openPart(id: Part) {
    setOpened((old) => new Set([...old, id]));
    setPart(id);
  }
  return (
    <div className="min-w-0 space-y-4">
      <nav aria-label="Arbejd med opgaven" className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {parts.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={part === item.id}
            onClick={() => openPart(item.id)}
            className={
              button + (part === item.id ? " bg-primary text-primary-foreground" : " bg-card")
            }
          >
            {item.label}
          </button>
        ))}
      </nav>
      <WorkspaceGuide
        question={current.question}
        purpose={current.purpose}
        output={current.output}
      />
      {opened.has("plan") && (
        <div hidden={part !== "plan"}>
          <WorkOrderPlansPanel
            scope={scope}
            round={round}
            selectedActionId={actionId}
            onEditing={planEditing}
          />
        </div>
      )}
      {opened.has("field") && (
        <div hidden={part !== "field"}>
          <FieldJobCardsPanel scope={scope} selectedActionId={actionId} onEditing={fieldEditing} />
        </div>
      )}
      {opened.has("execution") && (
        <div hidden={part !== "execution"}>
          <ActionExecutionPanel
            scope={scope}
            canEdit={canEdit}
            canContribute={canContribute}
            selectedRoundId={round}
            selectedActionId={actionId}
            onEditing={executionEditing}
          />
        </div>
      )}
      {opened.has("evidence") && (
        <div hidden={part !== "evidence"}>
          <WorkOrderEvidencePanel
            scope={scope}
            actorId={actorId}
            actionId={actionId}
            canContribute={canContribute}
            onEditing={evidenceEditing}
          />
        </div>
      )}
      {opened.has("submission") && (
        <div hidden={part !== "submission"}>
          <WorkOrderSubmissionPanel
            active={part === "submission"}
            canCreateReport={canEdit}
            scope={scope}
            actorId={actorId}
            actionId={actionId}
            onEditing={submissionEditing}
          />
        </div>
      )}
      {next && (
        <button
          type="button"
          className={button + " bg-primary text-primary-foreground"}
          onClick={() => openPart(next.id)}
        >
          Videre til {next.label.toLowerCase()} →
        </button>
      )}
      <Link
        to="/app/projects/$slug"
        params={{ slug: scope.projectId }}
        search={{ tab: "medier", round, task: actionId }}
        className={button}
      >
        Fotos på projektet
      </Link>
      <Link
        to="/felt"
        search={{ project: scope.projectId, round, task: actionId }}
        className={button}
      >
        Tag fotos på projektet
      </Link>
    </div>
  );
}
