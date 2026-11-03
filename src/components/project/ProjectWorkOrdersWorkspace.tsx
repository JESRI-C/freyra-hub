import {
  WORK_ORDER_PARTS,
  type WorkOrderView,
  type WorkOrderListView,
} from "@/lib/work-order-navigation";
import { formatWorkOrderHours, workOrderHoursInPeriod } from "@/lib/work-order-plan";
import { Calendar } from "@/components/ui/calendar";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { da } from "react-day-picker/locale";
import { labelDayButton } from "react-day-picker";
import { WorkspaceGuide } from "@/components/WorkspaceGuide";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import type { FieldJobVersion } from "@/lib/field-job-cards";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import { listFieldJobActions, listFieldJobSchedule } from "@/services/field-job-cards-service";
import { createProjectAction, type ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderPeople } from "./useWorkOrderPeople";
import { MoreWorkOrderPeople } from "./MoreWorkOrderPeople";
import { ProjectWorkAvailability } from "./ProjectWorkAvailability";
import { WorkOrderPlansPanel } from "./WorkOrderPlansPanel";
import { FieldJobCardsPanel } from "./FieldJobCardsPanel";
import { ProjectEquipmentBookings } from "./ProjectEquipmentBookings";
import { ProjectWorkTimeOverview } from "./ProjectWorkTimeOverview";
import { ProjectMaterialCatalog, WorkOrderMaterials } from "./WorkOrderMaterials";
import { WorkOrderTimeSummary } from "./WorkOrderTimeSummary";
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
  initialListView?: WorkOrderListView;
  onListView?: (view: WorkOrderListView) => void;
};
export type { WorkOrderView } from "@/lib/work-order-navigation";
type Part = WorkOrderView;
type Editor = Part | "material-catalog";
const parts = WORK_ORDER_PARTS;
const taskPageSize = 40;
const scheduleDate = new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeZone: "UTC" });
function scheduleLabel(plan?: { start: string | null; end: string | null }) {
  if (!plan?.start) return "Ingen planlagt dato";
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
  initialListView,
  onListView,
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
  const [onlyUndated, setOnlyUndated] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskLimit, setTaskLimit] = useState(taskPageSize);
  const showSchedule = listView === "schedule" || listView === "calendar";
  const [scheduleActionId, setScheduleActionId] = useState<string>();
  const actionId = selectedActionId ?? localActionId;
  const [editors, setEditors] = useState<Set<Editor>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdActionId, setCreatedActionId] = useState<string>();
  const [calendarPlan, setCalendarPlan] = useState<{ actionId: string; date: string }>();
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
    if (calendarPlan?.actionId === createdActionId) onSelectAction?.(createdActionId, "plan");
    else onSelectAction?.(createdActionId);
    setCreatedActionId(undefined);
  }, [createdActionId, calendarPlan, locked, onSelectAction]);
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
  const undatedCount = (orderedActions ?? []).filter(({ id }) => !dates?.[id]?.start).length;
  const visibleActions =
    listView === "calendar"
      ? orderedActions?.filter(({ id }) => {
          const plan = dates?.[id];
          return plan?.start && plan.start <= through && (plan.end ?? plan.start) >= from;
        })
      : orderedActions?.filter(
          (task) =>
            (listView !== "schedule" || !onlyUndated || !dates?.[task.id]?.start) &&
            task.title.toLocaleLowerCase("da").includes(taskSearch.trim().toLocaleLowerCase("da")),
        );
  const usesTaskList = listView !== "time" && listView !== "bookings";
  const visibleCount = usesTaskList ? (visibleActions?.length ?? 0) : 0;
  const estimates = new Map(
    (visibleActions ?? []).map(({ id }) => {
      const plan = dates?.[id];
      const hours =
        listView === "calendar" && plan
          ? workOrderHoursInPeriod(plan, from, through)
          : (plan?.estimatedHours ?? null);
      return [id, hours];
    }),
  );
  const knownEstimates = [...estimates.values()].filter((hours) => hours !== null);
  const totalEstimatedHours = knownEstimates.reduce((total, hours) => total + hours, 0);
  const scheduledPeriods = (orderedActions ?? []).flatMap(({ id }) => dates?.[id] ?? []);
  const daySummaries = new Map<string, { total: number; overlap: Set<string> }>();
  function daySummary(key: string) {
    const cached = daySummaries.get(key);
    if (cached) return cached;
    let total = 0;
    const assigned = new Set<string>();
    const overlap = new Set<string>();
    for (const plan of scheduledPeriods) {
      if (!plan.start || plan.start > key || (plan.end ?? plan.start) < key) continue;
      total++;
      if (canEdit && plan.responsibleId) {
        if (assigned.has(plan.responsibleId)) overlap.add(plan.responsibleId);
        assigned.add(plan.responsibleId);
      }
    }
    const summary = { total, overlap };
    daySummaries.set(key, summary);
    return summary;
  }
  const dayOverlap = day ? daySummary(from).overlap : undefined;
  const selected = actions.data?.find((a) => a.id === actionId);
  const [timeReview, setTimeReview] = useState<{ actionId: string; date: string }>();
  function select(id: string, view?: WorkOrderView, reviewDate?: string) {
    if (locked) return;
    setTimeReview(reviewDate ? { actionId: id, date: reviewDate } : undefined);
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
        setCalendarPlan(createDate ? { actionId: action.id, date: createDate } : undefined);
        if (createDate) setScheduleActionId(action.id);
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
              <button type="button" className={button} disabled={locked} onClick={() => select("")}>
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
              {listView !== "calendar" && usesTaskList && !!actions.data.length && (
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
                    }}
                    modifiersClassNames={{
                      planned:
                        "[&_button]:font-semibold [&_button]:underline [&_button]:underline-offset-4",
                      overlap: "[&_button]:ring-2 [&_button]:ring-inset [&_button]:ring-amber-600",
                    }}
                    labels={{
                      labelPrevious: () => "Forrige måned",
                      labelNext: () => "Næste måned",
                      labelDayButton: (date, modifiers, options, lib) =>
                        labelDayButton(date, modifiers, options, lib) +
                        (modifiers.planned ? ", planlagt arbejde" : "") +
                        (modifiers.overlap ? ", flere opgaver for samme ansvarlige" : ""),
                    }}
                  />
                  {canEdit && (
                    <p className="text-sm text-muted-foreground">
                      En ring markerer, at samme ansvarlige har flere opgaver på datoen. Vælg dagen
                      for at se opgaverne.
                    </p>
                  )}
                  {day && actorId && access.data?.canManageAvailability && names.has(filter) && (
                    <ProjectWorkAvailability
                      key={filter + ":" + from}
                      scope={scope}
                      actorId={actorId}
                      personId={filter}
                      date={from}
                      estimated={totalEstimatedHours}
                      unknown={visibleCount - knownEstimates.length}
                      onEditing={setAvailabilityEditing}
                    />
                  )}
                  {access.data?.canManageAvailability && (!day || !names.has(filter)) && (
                    <p className="text-sm text-muted-foreground">
                      Vælg en ansvarlig og en dato for at sammenholde estimatet med den tilgængelige
                      tid.
                    </p>
                  )}
                  {day && (
                    <button
                      type="button"
                      className={button}
                      disabled={locked}
                      onClick={() => setDay(undefined)}
                    >
                      Vis hele måneden
                    </button>
                  )}
                  <p role="status" className="text-sm">
                    {visibleCount} {visibleCount === 1 ? "planlagt opgave" : "planlagte opgaver"}{" "}
                    {day ? "på den valgte dato" : "i måneden"}.
                  </p>
                  {schedule.isSuccess && undatedCount > 0 && (
                    <button
                      type="button"
                      className={button}
                      disabled={locked}
                      onClick={() => {
                        setTaskSearch("");
                        setTaskLimit(taskPageSize);
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
                !visibleCount && <p role="status">Ingen opgaver matcher dit udvalg.</p>}
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
                  const estimate = estimates.get(a.id);
                  return (
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
          {!creating && canEdit && access.data?.canConfigure && (
            <button
              type="button"
              className={button}
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
                  maxLength={200}
                  value={title}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              {createDate && (
                <p className="text-sm text-muted-foreground">
                  {scheduleDate.format(new Date(createDate))} foreslås som startdato, når du åbner
                  arbejdsgrundlaget.
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
              timeReviewDate={timeReview?.actionId === actionId ? timeReview.date : undefined}
              openBooking={listView === "bookings"}
              suggestedStart={calendarPlan?.actionId === actionId ? calendarPlan?.date : undefined}
              canManageTime={!!access.data?.canManageAvailability}
              onEditing={onEditing}
              initialView={
                timeReview?.actionId === actionId
                  ? "execution"
                  : scheduleActionId === actionId
                    ? "plan"
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
  suggestedStart,
  timeReviewDate,
  onEditing,
  initialView,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  round?: string;
  canEdit: boolean;
  canContribute: boolean;
  canManageTime: boolean;
  openBooking: boolean;
  suggestedStart?: string;
  timeReviewDate?: string;
  onEditing: (part: Editor, value: boolean) => void;
  initialView?: WorkOrderView;
}) {
  const [savedObservation, setSavedObservation] = useState<FieldJobVersion>();
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
  const navigationId = useId();
  const current = parts.find((item) => item.id === part)!;
  const next = parts[parts.indexOf(current) + 1];
  function openPart(id: Part) {
    setOpened((old) => new Set([...old, id]));
    setPart(id);
  }
  function openPartWithFocus(id: Part) {
    openPart(id);
    document.getElementById(navigationId + id)?.focus();
  }
  return (
    <div className="min-w-0 space-y-4">
      <nav aria-label="Arbejd med opgaven" className="grid grid-cols-1 gap-2 sm:grid-cols-5">
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
            openBooking={openBooking}
            suggestedStart={suggestedStart}
            onEditing={planEditing}
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
            active={part === "submission"}
            canCreateReport={canEdit}
            scope={scope}
            actorId={actorId}
            actionId={actionId}
            onEditing={submissionEditing}
            onOpenPart={openPartWithFocus}
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
