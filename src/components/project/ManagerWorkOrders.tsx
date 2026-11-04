import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Filter,
  LayoutGrid,
  List,
  Map,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  emptyManagerWorkOrderFilters,
  MANAGER_SELECTION_CHANGED_MESSAGE,
  ManagerWorkOrderFiltersSchema,
  type ManagerWorkOrder,
  type ManagerWorkOrderPage,
} from "@/lib/manager-work-orders";
import { listManagerWorkOrders } from "@/lib/manager-work-orders.functions";
import { WorkOrderObservationDraftDialog } from "./WorkOrderObservationDraftDialog";
import { workOrderStatusLabels } from "@/lib/work-order-lifecycle";
import { workOrderStatusDestination } from "@/lib/work-order-navigation";
import { scheduleDate, scheduleLabel } from "@/lib/work-order-schedule-label";
import {
  ManagerWorkOrderMap,
  type ManagerMapSelection,
  type ManagerMapViewport,
} from "./ManagerWorkOrderMap";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const colors = {
  open: "bg-muted text-foreground",
  started: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  performed: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100",
  submitted: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  approved: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
  correction: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  waiting: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  cancelled: "bg-muted text-muted-foreground",
  untracked: "bg-muted text-muted-foreground",
} as const;
const lanes = [
  { id: "open", label: "Åbne" },
  { id: "started", label: "I gang" },
  { id: "performed", label: "Udført" },
  { id: "submitted", label: "Afleveret" },
  { id: "approved", label: "Godkendt" },
  { id: "waiting", label: "Afventer" },
  { id: "correction", label: "Til rettelse" },
  { id: "cancelled", label: "Aflyste" },
  { id: "untracked", label: "Uden jobstatus" },
] as const;
type Lane = (typeof lanes)[number]["id"];

function overviewKey(actorId: string, organizationId: string) {
  return `freyra-manager-work-orders/v1:${actorId}:${organizationId}`;
}

function readOverview(actorId: string, organizationId: string) {
  const fallback = {
    filters: emptyManagerWorkOrderFilters(),
    view: "board" as "board" | "list" | "map",
    selection: null as ManagerMapSelection | null,
  };
  try {
    const raw = sessionStorage.getItem(overviewKey(actorId, organizationId));
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    const filters = ManagerWorkOrderFiltersSchema.safeParse(saved?.filters);
    if (!filters.success || !["board", "list", "map"].includes(saved.view)) return fallback;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const selection =
      typeof saved.selection?.actionId === "string" &&
      uuid.test(saved.selection.actionId) &&
      typeof saved.selection?.projectId === "string" &&
      uuid.test(saved.selection.projectId)
        ? { actionId: saved.selection.actionId, projectId: saved.selection.projectId }
        : null;
    return { filters: filters.data, view: saved.view as "board" | "list" | "map", selection };
  } catch {
    return fallback;
  }
}

function selectionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && error.code === "conflict") ||
      ("statusCode" in error && error.statusCode === 409) ||
      ("message" in error && error.message === MANAGER_SELECTION_CHANGED_MESSAGE))
  );
}

function accessDenied(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && error.code === "access") ||
      ("statusCode" in error && error.statusCode === 403) ||
      ("message" in error && error.message === "Arbejdsopgaven er ikke tilgængelig."))
  );
}

function statusLane(status: ManagerWorkOrder["task_status"]): Lane {
  if (!status) return "untracked";
  if (status === "returned" || status === "reopened") return "correction";
  if (["started", "performed", "submitted", "approved", "cancelled"].includes(status))
    return status as Lane;
  return "open";
}
function laneFor(task: ManagerWorkOrder): Lane {
  if (task.task_status === "cancelled") return "cancelled";
  if (task.blocked || task.waiting_for_prerequisites) return "waiting";
  return statusLane(task.task_status);
}

function personName(name: string | null | undefined, personId: string) {
  const value = name?.trim();
  return !value ||
    value.toLowerCase() === personId.toLowerCase() ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? "Navn ikke tilgængeligt"
    : value;
}

function assignmentLabel(task: ManagerWorkOrder) {
  if (task.assignment_mode === "unassigned") return "Ikke tildelt";
  if (!task.assignment_is_current) return "Tildeling skal fornyes";
  if (task.claimed_by) return "Overtaget af " + personName(task.claimed_by_name, task.claimed_by);
  const people = task.candidate_user_ids
    .map((id, index) => personName(task.candidate_names[index], id))
    .join(", ");
  if (task.assignment_mode === "pool") return "Pulje · afventer overtagelse";
  return (task.assignment_mode === "group" ? "Gruppe: " : "Tildelt: ") + people;
}

function OrderCard({ task, compact }: { task: ManagerWorkOrder; compact: boolean }) {
  const destination = workOrderStatusDestination(task.task_status);
  const opensSubmission = destination?.view === "submission";
  const needsAssignment = task.assignment_mode === "unassigned" || !task.assignment_is_current;
  const search = { tab: "handlinger", task: task.action_id, work: destination?.view ?? "plan" };
  return (
    <article
      aria-label={task.title}
      className={`min-w-0 rounded-xl border bg-card p-4 shadow-sm ${compact ? "space-y-3" : "grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"}`}
    >
      <div className="min-w-0">
        <span
          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${colors[statusLane(task.task_status)]}`}
        >
          {task.task_status ? workOrderStatusLabels[task.task_status] : "Jobstatus mangler"}
        </span>
        <p className="mt-3 text-xs font-medium text-muted-foreground">{task.project_name}</p>
        <h3 className="mt-1 text-base font-semibold leading-snug">
          <Link
            to="/app/projects/$slug"
            params={{ slug: task.project_id }}
            search={search}
            className="rounded hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {task.title}
          </Link>
        </h3>
        {!task.task_status && task.legacy_status && (
          <p className="mt-2 text-xs text-muted-foreground">
            Tidligere status: {task.legacy_status}
          </p>
        )}
        {(task.blocked || task.waiting_for_prerequisites) && (
          <p className="mt-2 inline-flex rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {task.blocked ? "Blokeret" : "Afventer forudsætninger"}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {scheduleLabel({ start: task.planned_start, end: task.planned_end })}
            {task.due_date && (
              <span className="block text-xs">
                Frist: {scheduleDate.format(new Date(task.due_date))}
              </span>
            )}
          </span>
        </p>
        <p
          className={`flex items-start gap-2 ${needsAssignment ? "font-medium text-foreground" : ""}`}
        >
          {needsAssignment ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <UserRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>{assignmentLabel(task)}</span>
        </p>
        {task.plan_responsible_id && (
          <p className="text-xs">
            Ansvarlig i planen: {personName(task.plan_responsible_name, task.plan_responsible_id)}
          </p>
        )}
        {(task.site_name || task.location_note) && (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{task.site_name || task.location_note}</span>
          </p>
        )}
      </div>
      <div
        className={`flex gap-2 ${compact ? "flex-col border-t pt-3" : "flex-wrap items-start md:flex-col"}`}
      >
        <Link
          to="/app/projects/$slug"
          params={{ slug: task.project_id }}
          search={search}
          aria-label={`${opensSubmission ? "Åbn aflevering" : "Åbn arbejdsgrundlag"} for ${task.title}`}
          className={
            button +
            (opensSubmission ? " bg-primary/5 text-primary" : "") +
            (compact ? " w-full" : "")
          }
        >
          {destination?.label ?? "Arbejdsgrundlag"}{" "}
          <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
        {opensSubmission && (
          <Link
            to="/app/projects/$slug"
            params={{ slug: task.project_id }}
            search={{ ...search, work: "plan" }}
            aria-label={`Åbn arbejdsgrundlag for ${task.title}`}
            className={button + (compact ? " w-full" : "")}
          >
            Arbejdsgrundlag
          </Link>
        )}
      </div>
    </article>
  );
}

export function ManagerWorkOrders() {
  const { user, orgId, loading, authError } = useAuth();
  if (loading) return <p role="status">Kontrollerer din adgang…</p>;
  if (authError) return <p role="alert">Din adgang kunne ikke kontrolleres. Log ind igen.</p>;
  if (!user)
    return (
      <Link to="/login" search={{ next: "/app/work-orders" }} className={button}>
        Log ind for at se arbejdsordrer
      </Link>
    );
  if (!orgId)
    return (
      <Link to="/select" className={button}>
        Vælg organisation
      </Link>
    );
  return <ManagerOrders key={`${user.id}:${orgId}`} actorId={user.id} organizationId={orgId} />;
}

function ManagerOrders({ actorId, organizationId }: { actorId: string; organizationId: string }) {
  const load = useServerFn(listManagerWorkOrders);
  const boardHintId = useId();
  const [saved] = useState(() => readOverview(actorId, organizationId));
  const [view, setView] = useState(saved.view);
  const [selection, setSelection] = useState(saved.selection);
  const [mapViewport, setMapViewport] = useState<ManagerMapViewport | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [filters, setFilters] = useState(saved.filters);
  const [draft, setDraft] = useState(saved.filters);
  const [filterError, setFilterError] = useState("");
  const [catalog, setCatalog] = useState<Pick<ManagerWorkOrderPage, "projects" | "assignees">>({
    projects: [],
    assignees: [],
  });
  const tasks = useInfiniteQuery({
    queryKey: ["manager-work-orders", actorId, organizationId, filters, selectionRevision],
    initialPageParam: { cursor: null as string | null, selectionToken: null as string | null },
    queryFn: ({ pageParam }) =>
      load({
        data: {
          organizationId,
          expectedActorId: actorId,
          filters,
          cursor: pageParam.cursor,
          selectionToken: pageParam.selectionToken,
          pageSize: 30,
        },
      }),
    getNextPageParam: (page) =>
      page.nextCursor
        ? { cursor: page.nextCursor, selectionToken: page.selectionToken }
        : undefined,
    retry: false,
  });
  const conflict = tasks.isError && selectionConflict(tasks.error);
  const denied = tasks.isError && accessDenied(tasks.error);
  const items = useMemo(
    () =>
      conflict || denied || (tasks.isError && !tasks.isFetchNextPageError)
        ? []
        : (tasks.data?.pages.flatMap((page) => page.items) ?? []),
    [conflict, denied, tasks.isError, tasks.isFetchNextPageError, tasks.data],
  );
  const totals = conflict || denied ? undefined : tasks.data?.pages[0]?.totals;
  const laneTotals = conflict || denied ? undefined : tasks.data?.pages[0]?.laneTotals;
  const visibleCatalog = denied ? { projects: [], assignees: [] } : catalog;
  const hasMore = tasks.hasNextPage && !denied;
  useEffect(() => {
    if (denied) {
      setSelection(null);
      setMapViewport(null);
      setCatalog({ projects: [], assignees: [] });
    }
  }, [denied]);
  useEffect(() => {
    if (!conflict) return;
    setSelectionNotice(
      "Udvalget ændrede sig, mens opgaverne blev hentet. Oversigten starter forfra med de samme filtre.",
    );
    setMapViewport(null);
    setSelectionRevision((value) => value + 1);
  }, [conflict]);
  useEffect(() => {
    const page = tasks.data?.pages[0];
    if (page) setCatalog({ projects: page.projects, assignees: page.assignees });
  }, [tasks.data]);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        overviewKey(actorId, organizationId),
        JSON.stringify({ filters, view, selection }),
      );
    } catch {
      // The overview remains usable when browser storage is unavailable.
    }
  }, [actorId, organizationId, filters, view, selection]);
  const dateInvalid = !!draft.dueFrom && !!draft.dueThrough && draft.dueFrom > draft.dueThrough;
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(emptyManagerWorkOrderFilters());
  return (
    <section
      aria-label="Arbejdsordrer på tværs af projekter"
      className="min-w-0 space-y-5 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Alle projekter, du leder, i den valgte organisation.
          </p>
          <p role="status" aria-live="polite" className="mt-2 text-lg font-semibold">
            {tasks.isPending
              ? "Henter arbejdsordrer…"
              : totals
                ? `${items.length} af ${totals.matchingJobs} arbejdsordrer indlæst`
                : `${items.length} arbejdsordrer vist`}
          </p>
          {totals && (
            <p className="mt-1 text-xs text-muted-foreground">
              Hele udvalget: {totals.mappedJobs} opgaver med kortposition · {totals.unmappedJobs}{" "}
              uden · {totals.positions} kortobjekter.
            </p>
          )}
          {hasMore && (
            <p className="mt-1 text-xs text-muted-foreground">
              Der er flere resultater. Hent flere for at udvide kort, liste og Kanban.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <WorkOrderObservationDraftDialog
            organizationId={organizationId}
            projects={visibleCatalog.projects}
            initialProjectId={filters.projectId}
            onCreated={() => {
              setSelectionNotice("Arbejdsordrekladden er gemt. Dine filtre er bevaret.");
              setSelectionRevision((value) => value + 1);
            }}
          />
          <Link
            to="/app/projects"
            className={button + " bg-primary text-primary-foreground hover:bg-primary/90"}
          >
            <Plus className="size-4" aria-hidden="true" /> Opret i et projekt
          </Link>
        </div>
      </div>

      <form
        aria-label="Filtrér arbejdsordrer"
        className="space-y-3 rounded-2xl border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (dateInvalid) {
            setFilterError("Frist til må ikke ligge før frist fra.");
            return;
          }
          const parsed = ManagerWorkOrderFiltersSchema.safeParse({
            ...draft,
            search: draft.search.trim(),
          });
          if (!parsed.success) {
            setFilterError("Kontrollér filtrene, og angiv gyldige kalenderdatoer.");
            return;
          }
          setFilterError("");
          setSelectionNotice("");
          setMapViewport(null);
          setFilters(parsed.data);
        }}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="min-w-0 text-sm font-medium">
            Find arbejdsordre
            <input
              type="search"
              className={control}
              placeholder="Søg efter titel"
              value={draft.search}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            />
          </label>
          <label className="min-w-0 text-sm font-medium">
            Projekt
            <select
              className={control}
              value={draft.projectId ?? ""}
              onChange={(event) => setDraft({ ...draft, projectId: event.target.value || null })}
            >
              <option value="">Alle projekter</option>
              {visibleCatalog.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium">
            Jobstatus
            <select
              className={control}
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as typeof draft.status })
              }
            >
              <option value="all">Alle statusser</option>
              <option value="waiting">Afventer</option>
              {Object.entries(workOrderStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              <option value="untracked">Jobstatus mangler</option>
            </select>
          </label>
          <button
            type="submit"
            className={button + " self-end bg-primary text-primary-foreground hover:bg-primary/90"}
          >
            <Search className="size-4" aria-hidden="true" /> Vis resultater
          </button>
        </div>
        <details className="border-t pt-2">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <Filter className="size-4" aria-hidden="true" /> Tildeling og frister
          </summary>
          <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="min-w-0 text-sm font-medium">
              Tildeling
              <select
                className={control}
                value={draft.assignment}
                onChange={(event) =>
                  setDraft({ ...draft, assignment: event.target.value as typeof draft.assignment })
                }
              >
                <option value="all">Alle tildelinger</option>
                <option value="unassigned">Ikke tildelt</option>
                <option value="person">Person</option>
                <option value="group">Gruppe</option>
                <option value="pool">Pulje</option>
              </select>
            </label>
            <label className="min-w-0 text-sm font-medium">
              Udfører
              <select
                className={control}
                value={draft.assigneeId ?? ""}
                onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value || null })}
              >
                <option value="">Alle udførere</option>
                {visibleCatalog.assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personName(person.name, person.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-sm font-medium">
              Frist fra
              <input
                type="date"
                className={control}
                value={draft.dueFrom ?? ""}
                onChange={(event) => setDraft({ ...draft, dueFrom: event.target.value || null })}
              />
            </label>
            <label className="min-w-0 text-sm font-medium">
              Frist til
              <input
                type="date"
                className={control}
                value={draft.dueThrough ?? ""}
                min={draft.dueFrom ?? undefined}
                onChange={(event) => setDraft({ ...draft, dueThrough: event.target.value || null })}
              />
            </label>
          </div>
        </details>
        {filterError && (
          <p role="alert" className="text-sm text-destructive">
            {filterError}
          </p>
        )}
        {filtersActive && (
          <button
            type="button"
            className="min-h-11 text-sm font-medium underline underline-offset-4"
            onClick={() => {
              setDraft(emptyManagerWorkOrderFilters());
              setFilters(emptyManagerWorkOrderFilters());
              setFilterError("");
              setMapViewport(null);
            }}
          >
            Nulstil filtre
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Visning af arbejdsordrer"
          className="flex rounded-xl border bg-card p-1"
        >
          {(
            [
              ["board", "Kanban", LayoutGrid],
              ["list", "Liste", List],
              ["map", "Kort", Map],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={
                button +
                " border-0 " +
                (view === mode ? "bg-primary text-primary-foreground hover:bg-primary/90" : "")
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasMore && (
            <button
              type="button"
              className={button}
              disabled={tasks.isFetching}
              onClick={() => void tasks.fetchNextPage()}
            >
              {tasks.isFetchingNextPage ? "Henter flere…" : "Hent flere arbejdsordrer"}
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={tasks.isFetching}
            onClick={() => void tasks.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />{" "}
            {tasks.isFetching ? "Henter…" : "Opdater"}
          </button>
        </div>
      </div>

      {selectionNotice && (
        <p role="status" className="rounded-xl border bg-muted/30 p-3 text-sm">
          {selectionNotice}
        </p>
      )}

      {tasks.isError && (
        <div role="alert" className="space-y-2 rounded-xl border p-4">
          <p>
            Arbejdsordrerne kunne ikke hentes. Kontrollér forbindelsen og din projektlederadgang.
          </p>
          <button
            type="button"
            className={button}
            onClick={() =>
              denied
                ? setSelectionRevision((value) => value + 1)
                : void (tasks.isFetchNextPageError ? tasks.fetchNextPage() : tasks.refetch())
            }
          >
            Prøv igen
          </button>
        </div>
      )}
      {!tasks.isPending && !tasks.isError && items.length === 0 && (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="font-semibold">Ingen arbejdsordrer i dette udvalg</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tilpas filtrene, eller vælg et projekt for at oprette en arbejdsordre.
          </p>
        </div>
      )}
      {items.length > 0 &&
        (view === "map" ? (
          <ManagerWorkOrderMap
            items={items}
            selection={selection}
            onSelect={setSelection}
            viewport={mapViewport}
            onViewport={setMapViewport}
            renderOrder={(task) => <OrderCard task={task} compact />}
          />
        ) : view === "list" ? (
          <div aria-label="Arbejdsordreliste" className="space-y-3">
            {items.map((task) => (
              <OrderCard key={task.action_id} task={task} compact={false} />
            ))}
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
            <p id={boardHintId} className="text-xs text-muted-foreground">
              Rul vandret mellem statuskolonnerne og lodret i hver kolonne.
            </p>
            <div
              role="region"
              aria-label="Arbejdsordretavle"
              aria-describedby={boardHintId}
              tabIndex={0}
              className="min-w-0 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex w-max min-w-full items-start gap-3">
                {lanes.map(({ id, label }) => {
                  const orders = items.filter((task) => laneFor(task) === id);
                  return (
                    <section
                      key={id}
                      aria-label={label}
                      className="flex h-[65dvh] max-h-[38rem] w-[19rem] max-w-[calc(100vw-3rem)] shrink-0 flex-col overflow-hidden rounded-2xl border bg-muted/30"
                    >
                      <h2
                        className={`flex shrink-0 items-center justify-between gap-2 rounded-t-2xl px-4 py-3 text-sm font-semibold ${colors[id]}`}
                      >
                        <span>{label}</span>
                        <span className="whitespace-nowrap text-xs font-normal">
                          {laneTotals
                            ? `${laneTotals[id]} i udvalget · ${orders.length} indlæst`
                            : `${orders.length} vist`}
                        </span>
                      </h2>
                      <div
                        role="region"
                        aria-label={`Opgaver · ${label}`}
                        tabIndex={0}
                        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {orders.length ? (
                          orders.map((task) => (
                            <OrderCard key={task.action_id} task={task} compact />
                          ))
                        ) : (
                          <p className="p-3 text-sm text-muted-foreground">
                            Ingen viste arbejdsordrer
                          </p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      {hasMore && (
        <div className="flex flex-col items-center gap-2 border-t pt-5">
          <button
            type="button"
            className={button + " w-full sm:w-auto"}
            disabled={tasks.isFetching}
            onClick={() => void tasks.fetchNextPage()}
          >
            {tasks.isFetchingNextPage ? "Henter flere…" : "Hent flere arbejdsordrer"}
          </button>
          <p className="text-xs text-muted-foreground">
            Kort, liste og Kanban bruger de samme {items.length} indlæste arbejdsordrer.
          </p>
        </div>
      )}
    </section>
  );
}
