import {
  WORK_ORDER_PARTS,
  type WorkOrderView,
  type WorkOrderListView,
} from "@/lib/work-order-navigation";
import {
  formatWorkOrderHours,
  workOrderHoursInPeriod,
  workOrderPlanOverlaps,
} from "@/lib/work-order-plan";
import { scheduleDate, scheduleLabel } from "@/lib/work-order-schedule-label";
import { Calendar } from "@/components/ui/calendar";
import { addDays, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { da } from "react-day-picker/locale";
import { labelDayButton } from "react-day-picker";
import { WorkspaceGuide } from "@/components/WorkspaceGuide";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import type { WorkOrderFollowUpSource } from "@/lib/work-order-plan";
import { rememberFollowUpSource } from "@/lib/work-order-follow-up-draft";
import type { FieldJobVersion } from "@/lib/field-job-cards";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import { listFieldJobActions, listFieldJobSchedule } from "@/services/field-job-cards-service";
import { getIndicatorsByProject } from "@/services/indicators-service";
import { createProjectAction, type ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderPeople } from "./useWorkOrderPeople";
import { MoreWorkOrderPeople } from "./MoreWorkOrderPeople";
import { ProjectWorkAvailability } from "./ProjectWorkAvailability";
import { WorkOrderPlansPanel, type PlanDateEditorRequest } from "./WorkOrderPlansPanel";
import { FieldJobCardsPanel } from "./FieldJobCardsPanel";
import { ProjectEquipmentBookings } from "./ProjectEquipmentBookings";
import { WorkOrderEquipmentBooking } from "./WorkOrderEquipmentBooking";
import { ProjectWorkTimeOverview } from "./ProjectWorkTimeOverview";
import { ProjectMaterialCatalog, WorkOrderMaterials } from "./WorkOrderMaterials";
import { WorkOrderTimeSummary } from "./WorkOrderTimeSummary";
import { ActionExecutionPanel } from "./ActionExecutionPanel";
import { WorkOrderEvidencePanel } from "./WorkOrderEvidencePanel";
import { WorkOrderSubmissionPanel } from "./WorkOrderSubmissionPanel";
import type { WorkOrderCorrectionNote } from "@/lib/work-order-review";

type Props = {
  scope: ProjectScope;
  round?: string;
  canEdit: boolean;
  selectedActionId?: string;
  onSelectAction?: (id: string | undefined, view?: WorkOrderView) => void;
  initialView?: WorkOrderView;
  submissionVersion?: number;
  initialListView?: WorkOrderListView;
  reviewOnly?: boolean;
  onReviewOnly?: (value: boolean) => void;
  onListView?: (view: WorkOrderListView) => void;
};
export type { WorkOrderView } from "@/lib/work-order-navigation";
type Part = WorkOrderView;
type Editor = Part | "material-catalog";
const parts = WORK_ORDER_PARTS;
const taskPageSize = 40;
const reviewAttention = {
  submitted: { status: "Afleveret · Afventer faglig gennemgang", action: "Se afleveringen" },
  returned: { status: "Returneret · Afventer rettelse", action: "Se hvad der skal rettes" },
  reopened: { status: "Genåbnet · Klar til rettelse", action: "Fortsæt rettelsen" },
} as const;
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
  submissionVersion,
  initialListView,
  onListView,
  reviewOnly,
  onReviewOnly,
}: Props & { actorId?: string }) {
  const cache = useQueryClient();
  const loadAccess = useServerFn(getFieldJobAccess);
  const [localActionId, setLocalAction] = useState("");
  const [localListView, setLocalListView] = useState<WorkOrderListView>("tasks");
  const listView = initialListView ?? localListView;
  function setListView(view: WorkOrderListView) {
    setLocalListView(view);
    onListView?.(view);
  }
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState<Date>();
  const [responsible, setResponsible] = useState("");
  const [availabilityEditing, setAvailabilityEditing] = useState(false);
  const [openSuggestionCapacity, setOpenSuggestionCapacity] = useState(() => new Set<string>());
  const [onlyUndated, setOnlyUndated] = useState(false);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [localReviewOnly, setLocalReviewOnly] = useState(false);
  const onlyReviewAttention = reviewOnly ?? localReviewOnly;
  const [overlapFilterDate, setOverlapFilterDate] = useState<string>();
  const [taskSearch, setTaskSearch] = useState("");
  const [taskLimit, setTaskLimit] = useState(taskPageSize);
  const showSchedule = listView === "schedule" || listView === "calendar";
  const [requestedTaskView, setRequestedTaskView] = useState<{
    actionId: string;
    view: WorkOrderView;
  }>();
  const [dateEditor, setDateEditor] = useState<{
    actionId: string;
    request: PlanDateEditorRequest;
  }>();
  const actionId = selectedActionId ?? localActionId;
  const [editors, setEditors] = useState<Set<Editor>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdActionId, setCreatedActionId] = useState<string>();
  const [calendarPlan, setCalendarPlan] = useState<{ actionId: string; date: string }>();
  const [followUpSource, setFollowUpSource] = useState<WorkOrderFollowUpSource>();
  const [copiedPlan, setCopiedPlan] = useState<{
    actionId: string;
    source: WorkOrderFollowUpSource;
  }>();
  const alive = useRef(true);
  const inFlight = useRef(false);
  const createAttempt = useRef<{ id: string; signature: string } | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const locked = editors.size > 0 || busy || creating || availabilityEditing;
  useBlocker({ shouldBlockFn: () => locked, enableBeforeUnload: locked });
  useEffect(() => {
    if (!createdActionId || locked) return;
    setLocalAction(createdActionId);
    if (calendarPlan?.actionId === createdActionId || copiedPlan?.actionId === createdActionId)
      onSelectAction?.(createdActionId, "plan");
    else onSelectAction?.(createdActionId);
    setCreatedActionId(undefined);
  }, [createdActionId, calendarPlan, copiedPlan, locked, onSelectAction]);
  const onEditing = useCallback((part: Editor, value: boolean) => {
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
    queryFn: ({ signal }) => listFieldJobActions(scope, signal),
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
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const people = useWorkOrderPeople(
    scope,
    actorId,
    authorized && canEdit && showSchedule && !actionId,
  );
  const names = new Map(
    (canEdit ? (people.data ?? []) : []).map((person) => [
      person.user_id,
      person.display_name || person.email || "Projektmedlem",
    ]),
  );
  const filter =
    canEdit && (responsible === "unassigned" || names.has(responsible)) ? responsible : "";
  const dates = schedule.data;
  const orderedActions =
    showSchedule && dates
      ? (actions.data ?? [])
          .filter(({ id }) => {
            const personId = dates[id]?.responsibleId;
            return !filter || (filter === "unassigned" ? !personId : personId === filter);
          })
          .sort((a, b) => {
            const startA = dates[a.id]?.start ?? "9999-99-99";
            const startB = dates[b.id]?.start ?? "9999-99-99";
            return startA.localeCompare(startB) || a.title.localeCompare(b.title, "da");
          })
      : actions.data;
  const calendarKey = (date: Date) => format(date, "yyyy-MM-dd");
  const from = calendarKey(day ?? startOfMonth(month));
  const createDate = listView === "calendar" && day ? from : undefined;
  const through = calendarKey(day ?? endOfMonth(month));
  const undatedCount = (orderedActions ?? []).filter(
    ({ id }) => !dates?.[id]?.cancelled && !dates?.[id]?.start,
  ).length;
  const waitingCount = (actions.data ?? []).filter(
    ({ id }) => dates?.[id]?.waitingForActionIds?.length,
  ).length;
  const unassignedPlannedCount = (actions.data ?? []).filter(({ id }) => {
    const plan = dates?.[id];
    return plan?.start && !plan.cancelled && !plan.responsibleId;
  }).length;
  const undatedTaskCount =
    listView === "schedule" && schedule.isSuccess
      ? (actions.data ?? []).filter(({ id }) => !dates?.[id]?.cancelled && !dates?.[id]?.start)
          .length
      : 0;
  const calendarActions =
    listView === "calendar"
      ? orderedActions?.filter(({ id }) => {
          const plan = dates?.[id];
          return (
            !plan?.cancelled &&
            plan?.start &&
            plan.start <= through &&
            (plan.end ?? plan.start) >= from
          );
        })
      : undefined;
  const scheduledPeriods = (orderedActions ?? []).flatMap(({ id }) => dates?.[id] ?? []);
  const daySummaries = new Map<string, { total: number; waiting: number; overlap: Set<string> }>();
  function daySummary(key: string) {
    const cached = daySummaries.get(key);
    if (cached) return cached;
    let total = 0;
    let waiting = 0;
    const assigned = new Set<string>();
    const overlap = new Set<string>();
    for (const plan of scheduledPeriods) {
      if (!workOrderPlanOverlaps(plan, key, key)) continue;
      total++;
      if (plan.waitingForActionIds?.length) waiting++;
      if (canEdit && plan.responsibleId) {
        if (assigned.has(plan.responsibleId)) overlap.add(plan.responsibleId);
        assigned.add(plan.responsibleId);
      }
    }
    const summary = { total, waiting, overlap };
    daySummaries.set(key, summary);
    return summary;
  }
  const dayOverlap = day ? daySummary(from).overlap : undefined;
  const onlyOverlaps = listView === "calendar" && !!dayOverlap?.size && overlapFilterDate === from;
  const searchTerm = taskSearch.trim().toLocaleLowerCase("da");
  const visibleActions = (listView === "calendar" ? calendarActions : orderedActions)?.filter(
    (task) =>
      (listView !== "schedule" ||
        !onlyUndated ||
        (!dates?.[task.id]?.cancelled && !dates?.[task.id]?.start)) &&
      (!showSchedule || !onlyWaiting || !!dates?.[task.id]?.waitingForActionIds?.length) &&
      (!showSchedule || !onlyReviewAttention || !!dates?.[task.id]?.reviewStatus) &&
      (!onlyOverlaps || dayOverlap.has(dates?.[task.id]?.responsibleId ?? "")) &&
      task.title.toLocaleLowerCase("da").includes(searchTerm),
  );
  const usesTaskList = listView !== "time" && listView !== "bookings";
  const visibleCount = usesTaskList ? (visibleActions?.length ?? 0) : 0;
  const estimates = new Map(
    (calendarActions ?? visibleActions ?? []).map(({ id }) => {
      const plan = dates?.[id];
      const hours = plan?.cancelled
        ? null
        : listView === "calendar" && plan
          ? workOrderHoursInPeriod(plan, from, through)
          : (plan?.estimatedHours ?? null);
      return [id, hours];
    }),
  );
  const knownEstimates = (visibleActions ?? [])
    .map(({ id }) => estimates.get(id) ?? null)
    .filter((hours) => hours !== null);
  const calendarEstimates = [...estimates.values()].filter((hours) => hours !== null);
  const totalEstimatedHours = knownEstimates.reduce((total, hours) => total + hours, 0);
  function showProjectPlanningTasks(focus: "waiting" | "undated" | "unassigned") {
    setTaskSearch("");
    setResponsible(focus === "unassigned" ? "unassigned" : "");
    setOnlyUndated(focus === "undated");
    setOnlyWaiting(focus === "waiting");
    setTaskLimit(taskPageSize);
    if (listView !== "schedule") setListView("schedule");
  }
  const selected = actions.data?.find((a) => a.id === actionId);
  const linkedIndicators = useQuery({
    queryKey: ["indicators", scope.projectId, actorId],
    queryFn: () => getIndicatorsByProject(scope.projectId),
    enabled: authorized && actions.isSuccess && !!selected?.linked_indicator_id,
    retry: false,
  });
  const linkedIndicator = linkedIndicators.isSuccess
    ? linkedIndicators.data.find(
        (indicator) =>
          indicator.id === selected?.linked_indicator_id &&
          indicator.project_id === scope.projectId,
      )
    : undefined;
  const [timeReview, setTimeReview] = useState<{ actionId: string; date: string }>();
  function select(id: string, view?: WorkOrderView, reviewDate?: string) {
    if (locked) return;
    setTimeReview(reviewDate ? { actionId: id, date: reviewDate } : undefined);
    setLocalAction(id);
    setRequestedTaskView(view ? { actionId: id, view } : undefined);
    setDateEditor(undefined);
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
      const signature = JSON.stringify({ scope, title: title.trim(), source: followUpSource?.id });
      if (createAttempt.current?.signature !== signature)
        createAttempt.current = { signature, id: crypto.randomUUID() };
      const action = await createProjectAction(
        scope,
        title.trim(),
        followUpSource
          ? "Opfølgning på " +
              followUpSource.plan.title +
              " (planversion " +
              followUpSource.version +
              ")."
          : "Arbejdsgrundlag afventer planlægning.",
        createAttempt.current.id,
      );
      if (actorId && followUpSource)
        rememberFollowUpSource(actorId, { ...scope, actionId: action.id }, followUpSource);
      if (alive.current) {
        setCreating(false);
        setTitle("");
        setCalendarPlan(
          createDate && !followUpSource ? { actionId: action.id, date: createDate } : undefined,
        );
        setCopiedPlan(followUpSource ? { actionId: action.id, source: followUpSource } : undefined);
        setFollowUpSource(undefined);
        if (createDate || followUpSource)
          setRequestedTaskView({ actionId: action.id, view: "plan" });
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
          <h2 className={`${actionId ? "text-2xl leading-tight" : "text-xl"} font-semibold`}>
            {authorized && !actions.isError && selected
              ? selected.title
              : actionId
                ? "Arbejdsopgave"
                : "Arbejdsopgaver"}
          </h2>
          {!actionId && (
            <p className="mt-1 text-sm text-muted-foreground">
              Planlæg en konkret indsats, følg det udførte arbejde, og saml den dokumentation, der
              hører til opgaven.
            </p>
          )}
        </div>
        {!actionId && (
          <Link to="/opgaver" className={button}>
            Mine opgaver
          </Link>
        )}
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
          {!creating && !actionId && canEdit && access.data?.canConfigure && (
            <button
              type="button"
              className={button + " bg-primary text-primary-foreground"}
              disabled={locked}
              onClick={() => setCreating(true)}
            >
              {createDate ? "Opret arbejdsopgave på valgt dato" : "Opret arbejdsopgave"}
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
                  maxLength={followUpSource ? 160 : 200}
                  autoFocus={!!followUpSource}
                  value={title}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              {followUpSource && (
                <p className="text-sm text-muted-foreground">
                  Genbrug arbejdsgrundlaget fra {followUpSource.plan.title}, version{" "}
                  {followUpSource.version}. Vælg nye datoer og ansvarlig i den nye plan.
                </p>
              )}
              {createDate && !followUpSource && (
                <p className="text-sm text-muted-foreground">
                  Arbejdsgrundlaget åbner som kladde med {scheduleDate.format(new Date(createDate))}{" "}
                  som foreslået startdato.
                </p>
              )}
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
                    setFollowUpSource(undefined);
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
          {actionId ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-start gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={locked}
                  onClick={() => select("")}
                >
                  Tilbage til{" "}
                  {listView === "calendar"
                    ? "kalender"
                    : listView === "schedule"
                      ? "planoversigt"
                      : listView === "time"
                        ? "timer"
                        : listView === "bookings"
                          ? "bookingoversigt"
                          : "opgaveliste"}
                </button>
                <details className="min-w-0 flex-1 rounded-xl border bg-card px-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                    Skift opgave
                  </summary>
                  <label className="block pb-3 text-sm font-medium">
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
                  <Link to="/opgaver" className={button + " mb-3"} disabled={locked}>
                    Mine opgaver
                  </Link>
                </details>
              </div>
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
              {initialView === "submission" && listView === "tasks" && !!actions.data.length && (
                <p className="rounded-xl border bg-primary/5 p-3 text-sm">
                  Vælg en arbejdsopgave for at åbne dens aflevering og faglige gennemgang.
                </p>
              )}
              {!actions.data.length && <p>Der er endnu ingen arbejdsopgaver i projektet.</p>}
              {!!actions.data.length && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Vis arbejdsopgaver">
                  {(
                    [
                      ["tasks", "Opgaveliste"],
                      ["schedule", "Planoversigt"],
                      ["calendar", "Kalender"],
                      ["time", "Timer"],
                      ["bookings", "Booking"],
                    ] as const
                  )
                    .filter(
                      ([view]) =>
                        (view !== "time" && view !== "bookings") ||
                        access.data?.canManageAvailability,
                    )
                    .map(([view, label]) => (
                      <button
                        key={view}
                        type="button"
                        className={
                          button +
                          (listView === view ? " bg-primary text-primary-foreground" : " bg-card")
                        }
                        aria-pressed={listView === view}
                        disabled={locked}
                        onClick={() => {
                          setOnlyUndated(false);
                          setListView(view);
                          setTaskLimit(taskPageSize);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              )}
              {listView === "time" && !access.data?.canManageAvailability && (
                <p>Projektets timer kræver projektlederadgang.</p>
              )}
              {listView === "bookings" && !access.data?.canManageAvailability && (
                <p>Projektets bookingoversigt kræver projektlederadgang.</p>
              )}
              {usesTaskList && !!actions.data.length && (
                <label className="block text-sm font-medium">
                  Find opgave
                  <input
                    type="search"
                    className={control}
                    placeholder="Søg efter opgavens titel"
                    value={taskSearch}
                    onChange={(event) => {
                      setTaskSearch(event.target.value);
                      setTaskLimit(taskPageSize);
                    }}
                  />
                </label>
              )}
              {listView === "schedule" &&
                canEdit &&
                schedule.isSuccess &&
                (undatedTaskCount > 0 || waitingCount > 0 || unassignedPlannedCount > 0) && (
                  <div className="space-y-2 rounded-xl border bg-primary/5 p-3">
                    <h3 className="font-medium">Freyra hjælper med planen</h3>
                    {unassignedPlannedCount > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm">
                          {unassignedPlannedCount === 1
                            ? "1 opgave har en startdato og mangler en ansvarlig i planen."
                            : `${unassignedPlannedCount} opgaver har en startdato og mangler en ansvarlig i planen.`}
                          {" Åbn arbejdsgrundlaget for at vælge en ansvarlig."}
                        </p>
                        <button
                          type="button"
                          className={button}
                          disabled={locked}
                          onClick={() => showProjectPlanningTasks("unassigned")}
                        >
                          Se opgaver uden ansvarlig
                        </button>
                      </div>
                    )}
                    {waitingCount > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm">
                          {waitingCount === 1
                            ? "1 opgave afventer, at en forudsætning bliver udført."
                            : `${waitingCount} opgaver afventer, at deres forudsætninger bliver udført.`}
                        </p>
                        <button
                          type="button"
                          className={button}
                          disabled={locked}
                          onClick={() => showProjectPlanningTasks("waiting")}
                        >
                          Se afventende opgaver i hele projektet ({waitingCount})
                        </button>
                      </div>
                    )}
                    {undatedTaskCount > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm">
                          {undatedTaskCount === 1
                            ? "1 opgave mangler en startdato og vises derfor ikke i kalenderen."
                            : `${undatedTaskCount} opgaver mangler en startdato og vises derfor ikke i kalenderen.`}
                        </p>
                        <button
                          type="button"
                          className={button}
                          disabled={locked}
                          onClick={() => showProjectPlanningTasks("undated")}
                        >
                          Se opgaver uden startdato i hele projektet
                        </button>
                      </div>
                    )}
                  </div>
                )}
              {showSchedule && (
                <div className="space-y-2">
                  <h3 className="font-semibold">
                    {listView === "calendar" ? "Kalender" : "Planoversigt"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {listView === "calendar"
                      ? "Vælg en dato, eller se alle planlagte opgaver i måneden. Understregede datoer har planlagt arbejde."
                      : "Se opgaver efter planlagt start. Åbn en opgave for at se eller ændre dens arbejdsgrundlag."}
                  </p>
                  {listView === "schedule" && schedule.isSuccess && (
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={onlyUndated}
                        disabled={locked}
                        onChange={(event) => {
                          setOnlyUndated(event.target.checked);
                          setTaskLimit(taskPageSize);
                        }}
                      />
                      Kun opgaver uden planlagt dato
                    </label>
                  )}
                  {schedule.isSuccess && (
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={onlyWaiting}
                        disabled={locked}
                        onChange={(event) => {
                          setOnlyWaiting(event.target.checked);
                          setTaskLimit(taskPageSize);
                        }}
                      />
                      Kun opgaver der afventer forudsætninger
                    </label>
                  )}
                  {schedule.isSuccess && (
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={onlyReviewAttention}
                        disabled={locked}
                        onChange={(event) => {
                          setLocalReviewOnly(event.target.checked);
                          onReviewOnly?.(event.target.checked);
                          setTaskLimit(taskPageSize);
                        }}
                      />
                      Kun afleveringer til gennemgang eller rettelse
                    </label>
                  )}
                  {canEdit && schedule.isSuccess && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block min-w-0 text-sm font-medium">
                        Ansvarlig i planen
                        <select
                          className={control}
                          value={filter}
                          disabled={locked}
                          onChange={(event) => setResponsible(event.target.value)}
                        >
                          <option value="">Alle opgaver</option>
                          <option value="unassigned">Uden ansvarlig</option>
                          {[...names].map(([id, name]) => (
                            <option key={id} value={id}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <MoreWorkOrderPeople query={people} />
                    </div>
                  )}
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
              {listView === "calendar" && schedule.isSuccess && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={button}
                      disabled={locked}
                      onClick={() => {
                        const today = new Date();
                        setMonth(today);
                        setDay(today);
                        setTaskLimit(taskPageSize);
                      }}
                    >
                      I dag
                    </button>
                    {day && (
                      <button
                        type="button"
                        className={button}
                        disabled={locked}
                        onClick={() => {
                          setDay(undefined);
                          setTaskLimit(taskPageSize);
                        }}
                      >
                        Vis hele måneden
                      </button>
                    )}
                  </div>
                  <Calendar
                    mode="single"
                    locale={da}
                    month={month}
                    selected={day}
                    onMonthChange={(next) => {
                      if (locked) return;
                      setMonth(next);
                      setDay(undefined);
                    }}
                    onSelect={(next) => {
                      if (!locked) setDay(next);
                    }}
                    showOutsideDays={false}
                    className="max-w-full p-1 [--cell-size:clamp(1.5rem,8vw,2.75rem)]"
                    modifiers={{
                      planned: (date) => daySummary(calendarKey(date)).total > 0,
                      overlap: (date) => daySummary(calendarKey(date)).overlap.size > 0,
                      waiting: (date) => daySummary(calendarKey(date)).waiting > 0,
                    }}
                    modifiersClassNames={{
                      planned:
                        "[&_button]:font-semibold [&_button]:underline [&_button]:underline-offset-4",
                      waiting: "[&_button]:bg-amber-100 dark:[&_button]:bg-amber-950",
                      overlap: "[&_button]:ring-2 [&_button]:ring-inset [&_button]:ring-amber-600",
                    }}
                    labels={{
                      labelPrevious: () => "Forrige måned",
                      labelNext: () => "Næste måned",
                      labelDayButton: (date, modifiers, options, lib) =>
                        labelDayButton(date, modifiers, options, lib) +
                        (modifiers.planned ? ", planlagt arbejde" : "") +
                        (modifiers.waiting ? ", opgaver afventer forudsætning" : "") +
                        (modifiers.overlap ? ", flere opgaver for samme ansvarlige" : ""),
                    }}
                  />
                  {scheduledPeriods.some((plan) => plan.waitingForActionIds?.length) && (
                    <p className="text-sm text-muted-foreground">
                      En gul baggrund markerer opgaver, der afventer en forudsætning.
                    </p>
                  )}
                  {canEdit && (
                    <p className="text-sm text-muted-foreground">
                      En ring markerer, at samme ansvarlige har flere opgaver på datoen. Vælg dagen
                      for at se opgaverne.
                    </p>
                  )}
                  {!!dayOverlap?.size && (
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={onlyOverlaps}
                        disabled={locked}
                        onChange={(event) => {
                          setOverlapFilterDate(event.target.checked ? from : undefined);
                          setTaskLimit(taskPageSize);
                        }}
                      />
                      Vis kun overlappende opgaver på dagen
                    </label>
                  )}
                  {day && actorId && access.data?.canManageAvailability && names.has(filter) && (
                    <ProjectWorkAvailability
                      key={filter + ":" + from}
                      scope={scope}
                      actorId={actorId}
                      personId={filter}
                      date={from}
                      estimated={calendarEstimates.reduce((total, hours) => total + hours, 0)}
                      unknown={(calendarActions?.length ?? 0) - calendarEstimates.length}
                      onEditing={setAvailabilityEditing}
                    />
                  )}
                  {access.data?.canManageAvailability && (!day || !names.has(filter)) && (
                    <p className="text-sm text-muted-foreground">
                      Vælg en ansvarlig og en dato for at sammenholde estimatet med den tilgængelige
                      tid.
                    </p>
                  )}
                  <p role="status" className="text-sm">
                    {visibleCount} {visibleCount === 1 ? "planlagt opgave" : "planlagte opgaver"}{" "}
                    {day ? "på den valgte dato" : "i måneden"}.
                    {(searchTerm || onlyWaiting || onlyOverlaps) &&
                      " Filtrene ændrer listen. Kalenderens markeringer viser stadig planlagt arbejde."}
                    {day && <> Valgt dato: {scheduleDate.format(new Date(from))}.</>}
                  </p>
                  {waitingCount > 0 && (
                    <button
                      type="button"
                      className={button}
                      disabled={locked}
                      onClick={() => showProjectPlanningTasks("waiting")}
                    >
                      Se afventende opgaver i hele projektet ({waitingCount})
                    </button>
                  )}
                  {schedule.isSuccess && undatedCount > 0 && (
                    <button
                      type="button"
                      className={button}
                      disabled={locked}
                      onClick={() => {
                        setTaskSearch("");
                        setTaskLimit(taskPageSize);
                        setOnlyWaiting(false);
                        setOnlyUndated(true);
                        setListView("schedule");
                      }}
                    >
                      Se opgaver uden planlagt dato ({undatedCount})
                    </button>
                  )}
                </div>
              )}
              {listView !== "calendar" &&
                usesTaskList &&
                (!showSchedule || schedule.isSuccess) &&
                !!actions.data.length &&
                !visibleCount && (
                  <p role="status">
                    {showSchedule && onlyReviewAttention
                      ? "Ingen afleveringer til gennemgang eller rettelse matcher dit udvalg."
                      : "Ingen opgaver matcher dit udvalg."}
                  </p>
                )}
              {showSchedule && schedule.isSuccess && visibleCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  {listView === "calendar"
                    ? "Estimeret tid i udsnittet"
                    : "Estimat for de viste opgaver"}{" "}
                  ·{" "}
                  {knownEstimates.length
                    ? formatWorkOrderHours(totalEstimatedHours)
                    : "Ingen estimeret tid"}
                  {knownEstimates.length < visibleCount &&
                    ` · ${visibleCount - knownEstimates.length} uden estimat`}
                </p>
              )}
              {listView === "calendar" && schedule.isSuccess && knownEstimates.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Estimatet fordeles ligeligt over opgavens kalenderdage, inklusive weekender.
                </p>
              )}
              {usesTaskList &&
                (!showSchedule || schedule.isSuccess) &&
                visibleActions?.slice(0, taskLimit).map((a) => {
                  const plan = dates?.[a.id];
                  const review = plan?.reviewStatus
                    ? reviewAttention[plan.reviewStatus]
                    : undefined;
                  const estimate = estimates.get(a.id);
                  const prerequisiteIds = dates?.[a.id]?.waitingForActionIds ?? [];
                  const prerequisites = prerequisiteIds.flatMap((id) => {
                    const task = actions.data.find((candidate) => candidate.id === id);
                    return task ? [task] : [];
                  });
                  const prerequisiteEndDates = prerequisites.map(({ id }) => {
                    const prerequisite = dates?.[id];
                    return prerequisite?.cancelled ? null : (prerequisite?.end ?? null);
                  });
                  const latestPrerequisiteEnd =
                    plan &&
                    !plan.cancelled &&
                    !plan.start &&
                    prerequisiteEndDates.length === prerequisiteIds.length &&
                    prerequisiteEndDates.length > 0 &&
                    prerequisiteEndDates.every(Boolean)
                      ? prerequisiteEndDates.sort().at(-1)
                      : null;
                  const proposedStart = latestPrerequisiteEnd
                    ? calendarKey(addDays(parseISO(latestPrerequisiteEnd), 1))
                    : null;
                  const suggestedDate =
                    listView === "schedule" &&
                    proposedStart &&
                    proposedStart >= calendarKey(new Date()) &&
                    (!plan?.end || proposedStart <= plan.end)
                      ? proposedStart
                      : null;
                  const responsibleId = plan?.responsibleId;
                  const conflictingTasks =
                    canEdit && suggestedDate && responsibleId
                      ? actions.data.filter(({ id }) => {
                          const otherPlan = dates?.[id];
                          return (
                            id !== a.id &&
                            otherPlan?.responsibleId === responsibleId &&
                            workOrderPlanOverlaps(
                              otherPlan,
                              suggestedDate,
                              plan.end ?? suggestedDate,
                            )
                          );
                        })
                      : [];
                  const capacityKey = a.id + ":" + suggestedDate;
                  const canReadCapacity = !!(
                    actorId &&
                    access.data?.canManageAvailability &&
                    responsibleId &&
                    suggestedDate
                  );
                  const suggestedDayEstimates =
                    canReadCapacity && openSuggestionCapacity.has(capacityKey) && suggestedDate
                      ? [
                          workOrderHoursInPeriod(
                            {
                              start: suggestedDate,
                              end: plan?.end ?? null,
                              estimatedHours: plan?.estimatedHours,
                            },
                            suggestedDate,
                            suggestedDate,
                          ),
                          ...conflictingTasks.flatMap(({ id }) => {
                            const otherPlan = dates?.[id];
                            return otherPlan &&
                              workOrderPlanOverlaps(otherPlan, suggestedDate, suggestedDate)
                              ? [workOrderHoursInPeriod(otherPlan, suggestedDate, suggestedDate)]
                              : [];
                          }),
                        ]
                      : [];
                  const dateAction = suggestedDate
                    ? "Brug datoforslag"
                    : plan?.start
                      ? "Omplanlæg datoer"
                      : "Angiv startdato";
                  return (
                    <div key={a.id} className="space-y-1">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => select(a.id, showSchedule ? "plan" : undefined)}
                        className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{a.title}</span>
                          {showSchedule && (
                            <span className="block text-sm text-muted-foreground">
                              {dates?.[a.id]?.cancelled ? "Aflyst" : scheduleLabel(dates?.[a.id])}
                              {review && (
                                <span className="block font-medium text-foreground">
                                  {review.status}
                                </span>
                              )}
                              {canEdit && plan?.start && !plan.cancelled && !plan.responsibleId && (
                                <span className="block">Mangler ansvarlig i planen</span>
                              )}
                              {prerequisiteIds.length > 0 && (
                                <span className="block font-medium text-foreground">
                                  Afventer ·{" "}
                                  {prerequisiteIds.length === 1
                                    ? (prerequisites[0]?.title ?? "Forudsætning for opstart")
                                    : prerequisiteIds.length + " forudsætninger"}
                                </span>
                              )}
                              {estimate != null && (
                                <span className="block">
                                  {listView === "calendar" ? "Estimat i udsnittet" : "Estimat"} ·{" "}
                                  {formatWorkOrderHours(estimate)}
                                </span>
                              )}
                              {canEdit && (
                                <span className="block">
                                  {dates?.[a.id]?.responsibleId
                                    ? (names.get(dates?.[a.id]?.responsibleId ?? "") ??
                                      "Ansvarlig registreret")
                                    : "Ingen ansvarlig i planen"}
                                </span>
                              )}
                              {listView === "calendar" &&
                                dayOverlap?.has(dates?.[a.id]?.responsibleId ?? "") && (
                                  <span className="block font-medium text-foreground">
                                    Flere opgaver samme dag
                                  </span>
                                )}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm text-primary">Åbn →</span>
                      </button>
                      {showSchedule && review && (
                        <button
                          type="button"
                          className={button}
                          disabled={locked}
                          onClick={() => select(a.id, "submission")}
                        >
                          {review.action}
                        </button>
                      )}
                      {showSchedule &&
                        prerequisites.map((prerequisite) => (
                          <button
                            type="button"
                            className={button}
                            disabled={locked}
                            key={prerequisite.id}
                            aria-label={"Åbn forudsætning: " + prerequisite.title}
                            onClick={() => select(prerequisite.id, "plan")}
                          >
                            {prerequisites.length > 1 ? prerequisite.title : "Åbn forudsætning"}
                          </button>
                        ))}
                      {canEdit && suggestedDate && (
                        <div className="space-y-2 rounded-lg bg-muted px-3 py-2 text-sm">
                          <p>
                            Forslag til startdato: {scheduleDate.format(new Date(suggestedDate))}.
                            Dagen efter den seneste planlagte slutdato for de opgaver, der stadig
                            afventes.
                          </p>
                          {conflictingTasks.length > 0 && (
                            <details>
                              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                                {conflictingTasks.length === 1
                                  ? "Den ansvarlige har én overlappende opgave"
                                  : "Den ansvarlige har " +
                                    conflictingTasks.length +
                                    " overlappende opgaver"}
                              </summary>
                              <ul className="space-y-1">
                                {conflictingTasks.map((task) => (
                                  <li key={task.id}>
                                    <button
                                      type="button"
                                      className={button}
                                      disabled={locked}
                                      onClick={() => select(task.id, "plan")}
                                    >
                                      Åbn {task.title}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {canReadCapacity && actorId && responsibleId && (
                            <details
                              key={capacityKey}
                              onToggle={(event) => {
                                const open = event.currentTarget.open;
                                setOpenSuggestionCapacity((current) => {
                                  if (current.has(capacityKey) === open) return current;
                                  const next = new Set(current);
                                  if (open) next.add(capacityKey);
                                  else next.delete(capacityKey);
                                  return next;
                                });
                              }}
                            >
                              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                                Se tilgængelig tid på den foreslåede startdag
                              </summary>
                              {openSuggestionCapacity.has(capacityKey) && (
                                <ProjectWorkAvailability
                                  scope={scope}
                                  actorId={actorId}
                                  personId={responsibleId}
                                  date={suggestedDate}
                                  estimated={suggestedDayEstimates.reduce<number>(
                                    (total, hours) => total + (hours ?? 0),
                                    0,
                                  )}
                                  unknown={
                                    suggestedDayEstimates.filter((hours) => hours === null).length
                                  }
                                  readOnly
                                />
                              )}
                            </details>
                          )}
                          {actorId && access.data?.canManageAvailability && (
                            <WorkOrderEquipmentBooking
                              key={a.id + ":" + suggestedDate + ":" + (plan?.end ?? "")}
                              scope={scope}
                              actorId={actorId}
                              actionId={a.id}
                              plannedStart={suggestedDate}
                              plannedEnd={plan?.end ?? null}
                              disabled={locked}
                              preview
                            />
                          )}
                          <p>Tjek bemanding og udstyr, før du planlægger.</p>
                        </div>
                      )}
                      {showSchedule &&
                        plan?.planVersionId &&
                        !plan.cancelled &&
                        canEdit &&
                        access.data?.canConfigure && (
                          <button
                            type="button"
                            className={button}
                            aria-label={dateAction + " for " + a.title}
                            disabled={locked}
                            onClick={() => {
                              select(a.id, "plan");
                              setDateEditor({
                                actionId: a.id,
                                request: suggestedDate
                                  ? { planVersionId: plan.planVersionId, start: suggestedDate }
                                  : true,
                              });
                            }}
                          >
                            {dateAction}
                          </button>
                        )}
                    </div>
                  );
                })}
              {usesTaskList &&
                (!showSchedule || schedule.isSuccess) &&
                visibleCount > taskLimit && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => setTaskLimit(taskLimit + taskPageSize)}
                  >
                    Vis flere opgaver · {taskLimit} af {visibleCount}
                  </button>
                )}
            </div>
          )}
          {listView === "time" && actorId && authorized && access.data?.canManageAvailability && (
            <div hidden={!!actionId}>
              <ProjectWorkTimeOverview
                scope={scope}
                actorId={actorId}
                locked={locked}
                active={!actionId}
                onOpen={(id, date) => select(id, "execution", date)}
              />
            </div>
          )}
          {listView === "bookings" &&
            actorId &&
            authorized &&
            access.data?.canManageAvailability && (
              <div hidden={!!actionId}>
                <ProjectEquipmentBookings
                  scope={scope}
                  actorId={actorId}
                  active={!actionId}
                  locked={locked}
                  tasks={actions.data}
                  onOpen={(id) => select(id, "plan")}
                />
              </div>
            )}
          {authorized && actions.isSuccess && selected?.linked_indicator_id && (
            <section
              aria-label="Indikator for opgaven"
              className="space-y-1 rounded-xl border p-3 text-sm"
            >
              <h3 className="font-medium">Indikator for opgaven</h3>
              {linkedIndicator ? (
                <>
                  <p>{linkedIndicator.label}</p>
                  <p className="text-muted-foreground">
                    {linkedIndicator.target_value != null &&
                    linkedIndicator.target_direction &&
                    linkedIndicator.target_unit
                      ? `${linkedIndicator.target_direction === "at_most" ? "Højst" : "Mindst"} ${linkedIndicator.target_value} ${linkedIndicator.target_unit}`
                      : "Der er endnu ikke sat en målværdi."}
                  </p>
                  {!locked && (
                    <Link
                      to="/app/projects/$slug"
                      params={{ slug: scope.projectId }}
                      search={{
                        tab: "indikatorer",
                        task: selected.id,
                        round,
                        indicator: linkedIndicator.id,
                      }}
                      className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
                    >
                      Åbn indikatorens målehistorik
                    </Link>
                  )}
                </>
              ) : linkedIndicators.isPending ? (
                <p role="status">Henter indikatoren…</p>
              ) : (
                <p>Den tilknyttede indikator kunne ikke vises med din aktuelle adgang.</p>
              )}
            </section>
          )}
          {selected && actorId && (
            <TaskWorkspace
              key={actionId}
              scope={scope}
              actorId={actorId}
              actionId={actionId}
              round={round}
              canEdit={canEdit}
              canContribute={!!access.data?.canContribute}
              timeReviewDate={timeReview?.actionId === actionId ? timeReview.date : undefined}
              openBooking={listView === "bookings"}
              openReschedule={dateEditor?.actionId === actionId ? dateEditor.request : false}
              planSource={copiedPlan?.actionId === actionId ? copiedPlan?.source : undefined}
              onFollowUp={
                canEdit && access.data?.canConfigure && !locked
                  ? (source) => {
                      setFollowUpSource(source);
                      setTitle(source.plan.title.slice(0, 145) + " – opfølgning");
                      setCreating(true);
                    }
                  : undefined
              }
              suggestedStart={calendarPlan?.actionId === actionId ? calendarPlan?.date : undefined}
              canManageTime={!!access.data?.canManageAvailability}
              onEditing={onEditing}
              submissionVersion={submissionVersion}
              initialView={
                timeReview?.actionId === actionId
                  ? "execution"
                  : requestedTaskView?.actionId === actionId
                    ? requestedTaskView.view
                    : initialView
              }
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
  canManageTime,
  openBooking,
  openReschedule,
  planSource,
  onFollowUp,
  suggestedStart,
  timeReviewDate,
  onEditing,
  initialView,
  submissionVersion,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  round?: string;
  canEdit: boolean;
  canContribute: boolean;
  canManageTime: boolean;
  openBooking: boolean;
  openReschedule: PlanDateEditorRequest;
  planSource?: WorkOrderFollowUpSource;
  onFollowUp?: (source: WorkOrderFollowUpSource) => void;
  suggestedStart?: string;
  timeReviewDate?: string;
  onEditing: (part: Editor, value: boolean) => void;
  initialView?: WorkOrderView;
  submissionVersion?: number;
}) {
  const [savedObservation, setSavedObservation] = useState<FieldJobVersion>();
  const [part, setPart] = useState<Part>(initialView ?? "plan");
  const [correctionNote, setCorrectionNote] = useState<WorkOrderCorrectionNote>();
  const [opened, setOpened] = useState<Set<Part>>(() => new Set([initialView ?? "plan"]));
  useEffect(() => {
    if (!initialView) return;
    setCorrectionNote(undefined);
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
  const navigationId = useId();
  const current = parts.find((item) => item.id === part)!;
  const next = parts[parts.indexOf(current) + 1];
  function openPart(id: Part, note?: WorkOrderCorrectionNote) {
    if (note || id === "submission") setCorrectionNote(note);
    setOpened((old) => new Set([...old, id]));
    setPart(id);
  }
  function openPartWithFocus(id: Part, note?: WorkOrderCorrectionNote) {
    openPart(id, note);
    const mobile =
      typeof window.matchMedia === "function" && !window.matchMedia("(min-width: 640px)").matches;
    document.getElementById(navigationId + (mobile ? "mobile" : id))?.focus();
  }
  return (
    <div className="min-w-0 space-y-4">
      <nav aria-label="Arbejd med opgaven">
        <label className="block text-sm font-medium sm:hidden">
          Del af arbejdsopgaven
          <select
            id={navigationId + "mobile"}
            className={control}
            value={part}
            onChange={(event) => openPart(event.target.value as Part)}
          >
            {parts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden gap-2 sm:grid sm:grid-cols-5">
          {parts.map((item) => (
            <button
              key={item.id}
              type="button"
              id={navigationId + item.id}
              aria-pressed={part === item.id}
              onClick={() => openPart(item.id)}
              className={
                button + (part === item.id ? " bg-primary text-primary-foreground" : " bg-card")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="flex flex-wrap items-start gap-2">
        {next && (
          <button
            type="button"
            className={button + " bg-primary text-primary-foreground"}
            onClick={() => openPart(next.id)}
          >
            Videre til {next.label.toLowerCase()} →
          </button>
        )}
        <details className="min-w-0 flex-1 rounded-xl border bg-card px-3">
          <summary
            aria-label={`Hjælp til ${current.label.toLowerCase()}`}
            className="min-h-11 cursor-pointer py-3 text-sm font-medium"
          >
            Hjælp
          </summary>
          <div className="pb-3">
            <WorkspaceGuide
              question={current.question}
              purpose={current.purpose}
              output={current.output}
            />
          </div>
        </details>
      </div>
      {correctionNote && (canEdit || canContribute) && (
        <aside
          aria-label="Mangler ved afleveringen"
          className="space-y-2 rounded-xl border p-4 text-sm"
        >
          <h4 className="font-semibold">
            Mangler i afleveringsversion {correctionNote.submissionVersion}
          </h4>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{correctionNote.reason}</p>
          <button type="button" className={button} onClick={() => openPartWithFocus("submission")}>
            Tilbage til afleveringen
          </button>
        </aside>
      )}
      {opened.has("plan") && (
        <div hidden={part !== "plan"}>
          <WorkOrderPlansPanel
            scope={scope}
            round={round}
            selectedActionId={actionId}
            openBooking={openBooking}
            openReschedule={openReschedule}
            planSource={planSource}
            onFollowUp={onFollowUp}
            suggestedStart={suggestedStart}
            onEditing={planEditing}
            onOpenExecution={() => openPartWithFocus("execution")}
            onOpenSubmission={() => openPartWithFocus("submission")}
          />
        </div>
      )}
      {opened.has("field") && (
        <div hidden={part !== "field"}>
          <FieldJobCardsPanel
            scope={scope}
            selectedActionId={actionId}
            onEditing={fieldEditing}
            onSaved={setSavedObservation}
          />
        </div>
      )}
      {opened.has("execution") && (
        <div hidden={part !== "execution"}>
          {canManageTime && (
            <WorkOrderTimeSummary
              scope={scope}
              actionId={actionId}
              actorId={actorId}
              reviewDate={timeReviewDate}
            />
          )}
          {canManageTime && (
            <>
              <WorkOrderMaterials scope={scope} actionId={actionId} actorId={actorId} />
              <ProjectMaterialCatalog
                scope={scope}
                actorId={actorId}
                onEditing={(value) => onEditing("material-catalog", value)}
              />
            </>
          )}
          <ActionExecutionPanel
            scope={scope}
            canEdit={canEdit}
            canContribute={canContribute}
            selectedRoundId={round}
            selectedActionId={actionId}
            onEditing={executionEditing}
            onOpenStatus={() => openPartWithFocus("plan")}
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
            onOpenField={() => openPartWithFocus("field")}
            savedObservation={savedObservation}
          />
        </div>
      )}
      {opened.has("submission") && (
        <div hidden={part !== "submission"}>
          <WorkOrderSubmissionPanel
            requestedVersion={submissionVersion}
            active={part === "submission"}
            canCreateReport={canEdit}
            scope={scope}
            actorId={actorId}
            actionId={actionId}
            onEditing={submissionEditing}
            onOpenPart={openPartWithFocus}
            onFollowUp={onFollowUp}
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
