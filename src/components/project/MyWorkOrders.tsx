import { WorkspaceGuide } from "@/components/WorkspaceGuide";
import { programPageGuide } from "@/lib/program-map";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import {
  claimProjectWorkOrderPool,
  listCurrentUserWorkOrders,
} from "@/lib/work-order-assignments.functions";
import { assignmentModeLabels, type MyWorkOrder } from "@/lib/work-order-assignments";
import { WorkOrderPlanSummary } from "./WorkOrderPlanSummary";
import { WorkOrderStatusPanel } from "./WorkOrderStatusPanel";
import { WorkOrderEvidencePanel } from "./WorkOrderEvidencePanel";
import { FieldWorkOrderEquipment } from "./FieldWorkOrderEquipment";
import { WorkOrderVisitResults } from "./WorkOrderVisitResults";
import { WorkOrderMaterials } from "./WorkOrderMaterials";
import { WorkOrderTimePanel } from "./WorkOrderTimePanel";
import { WorkOrderSubmissionPanel } from "./WorkOrderSubmissionPanel";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50";

const taskFilters = [
  ["all", "Alle"],
  ["active", "Aktive"],
  ["waiting", "Afventer"],
  ["cancelled", "Aflyste"],
] as const;

export function MyWorkOrders() {
  const { user, loading, authError } = useAuth();
  if (loading)
    return (
      <p role="status" className="p-4">
        Kontrollerer din adgang…
      </p>
    );
  if (authError)
    return (
      <p role="alert" className="p-4">
        Din adgang kunne ikke kontrolleres. Log ind igen.
      </p>
    );
  if (!user)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Mine opgaver</h1>
        <Link to="/login" search={{ next: "/opgaver" }} className={button}>
          Log ind for at se dine opgaver
        </Link>
      </main>
    );
  return <MyTasks key={user.id} actorId={user.id} />;
}
function MyTasks({ actorId }: { actorId: string }) {
  const load = useServerFn(listCurrentUserWorkOrders);
  const [editors, setEditors] = useState<Set<string>>(() => new Set());
  const [activeTaskId, setActiveTask] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof taskFilters)[number][0]>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const tasks = useInfiniteQuery({
    queryKey: ["my-work-orders", actorId, filter, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      load({
        data: {
          expectedActorId: actorId,
          afterActionId: pageParam,
          pageSize: 20,
          filter,
          search: search || undefined,
        },
      }),
    getNextPageParam: (page) => page.nextAfterActionId ?? undefined,
    retry: false,
    refetchOnWindowFocus: editors.size === 0,
    refetchOnReconnect: editors.size === 0,
  });
  const items = tasks.isError ? [] : (tasks.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-4 p-3 pb-12 sm:p-6 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mine opgaver</h1>
        <button
          className={button}
          disabled={tasks.isFetching || editors.size > 0}
          onClick={() => void tasks.refetch()}
        >
          {tasks.isFetching ? "Henter…" : "Opdater opgaver"}
        </button>
      </header>
      <WorkspaceGuide {...programPageGuide("/opgaver")!} />
      {!activeTaskId && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <label className="min-w-0 flex-1 text-sm font-medium">
            Find opgave efter titel
            <input
              type="search"
              maxLength={120}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 text-base"
            />
          </label>
          <button type="submit" className={button}>
            Søg
          </button>
          {search && (
            <button
              type="button"
              className={button}
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
            >
              Ryd søgning
            </button>
          )}
        </form>
      )}
      {!activeTaskId && (
        <div role="group" aria-label="Filtrér mine opgaver" className="flex flex-wrap gap-2">
          {taskFilters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                button + (filter === value ? " bg-primary text-primary-foreground" : " bg-card")
              }
              aria-pressed={filter === value}
              disabled={editors.size > 0}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {activeTaskId && (
        <button
          type="button"
          className={button}
          disabled={editors.size > 0}
          onClick={() => setActiveTask(null)}
        >
          ← Tilbage til opgavelisten
        </button>
      )}
      {!!editors.size && (
        <p role="status" className="text-sm">
          Gem eller fortryd din kladde, før du opdaterer listen eller overtager en anden opgave.
        </p>
      )}
      <Link to="/select" className="inline-flex min-h-11 items-center text-sm underline">
        Åbn projektoversigten
      </Link>
      {tasks.isPending && <p role="status">Henter dine opgaver…</p>}
      {tasks.isError && (
        <p role="alert" className="rounded-xl border border-destructive p-3">
          {tasks.error.message} Listen kunne ikke opdateres. Tryk på “Opdater opgaver” for at prøve
          igen.
        </p>
      )}
      {tasks.isSuccess && !items.length && (
        <p role="status" className="rounded-xl border p-4">
          {search
            ? `Ingen opgaver matcher “${search}” i den valgte visning.`
            : filter === "all"
              ? "Du har ingen tildelte opgaver med en gemt plan."
              : "Du har ingen opgaver med den valgte status."}
        </p>
      )}
      {items.map((task) => (
        <div key={task.action_id} hidden={activeTaskId !== null && activeTaskId !== task.action_id}>
          <TaskCard
            task={task}
            actorId={actorId}
            active={activeTaskId === task.action_id}
            onOpen={() => setActiveTask(task.action_id)}
            locked={editors.size > 0}
            onEditing={(value) =>
              setEditors((old) => {
                const next = new Set(old);
                if (value) next.add(task.action_id);
                else next.delete(task.action_id);
                return next;
              })
            }
          />
        </div>
      ))}
      {tasks.hasNextPage && !tasks.isError && (
        <button
          className={button}
          disabled={tasks.isFetching || editors.size > 0}
          onClick={() => void tasks.fetchNextPage()}
        >
          {tasks.isFetchingNextPage ? "Henter…" : "Hent flere opgaver"}
        </button>
      )}
    </main>
  );
}
function TaskCard({
  task,
  actorId,
  locked,
  onEditing,
  active,
  onOpen,
}: {
  task: MyWorkOrder;
  actorId: string;
  locked: boolean;
  onEditing: (value: boolean) => void;
  active: boolean;
  onOpen: () => void;
}) {
  const canExecute = task.can_execute && !task.cancelled;
  const claim = useServerFn(claimProjectWorkOrderPool),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [statusOpened, setStatusOpened] = useState(false),
    [editing, setEditing] = useState(false);
  const [evidenceOpened, setEvidenceOpened] = useState(false),
    [evidenceEditing, setEvidenceEditing] = useState(false);
  const [submissionOpened, setSubmissionOpened] = useState(false),
    [submissionEditing, setSubmissionEditing] = useState(false),
    [timeOpened, setTimeOpened] = useState(false),
    [timeEditing, setTimeEditing] = useState(false);
  const [materialsOpened, setMaterialsOpened] = useState(false);
  const [materialsEditing, setMaterialsEditing] = useState(false);
  const [visitEditing, setVisitEditing] = useState(false);
  const statusDetails = useRef<HTMLDetailsElement>(null);
  const statusSummary = useRef<HTMLElement>(null);
  const nestedLocks = useRef(new Set<string>());
  function reportEditing(part: string, value: boolean) {
    if (value) nestedLocks.current.add(part);
    else nestedLocks.current.delete(part);
    onEditing(nestedLocks.current.size > 0);
  }
  const inFlight = useRef(false),
    attempt = useRef<{ signature: string; requestId: string } | null>(null);
  async function take() {
    if (inFlight.current || !task.can_claim || task.cancelled || locked || !active) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const input = {
        organizationId: task.organization_id,
        projectId: task.project_id,
        actionId: task.action_id,
        expectedActorId: actorId,
        expectedVersion: task.assignment_version,
        planVersionId: task.plan_version_id,
      };
      const signature = JSON.stringify(input);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, requestId: crypto.randomUUID() };
      await claim({ data: { ...input, requestId: attempt.current.requestId } });
      setMessage("Du har overtaget opgaven.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["my-work-orders", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-lifecycle", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-log", actorId] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opgaven kunne ikke overtages. Prøv igen.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="min-w-0 space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-lg font-semibold">{task.plan.title}</h2>
      <p className="text-sm">
        {task.assignment_mode ? assignmentModeLabels[task.assignment_mode] : "Direkte opgaveadgang"}
        {task.assignment_mode === "pool"
          ? task.claimed_by === actorId
            ? " · Overtaget af dig"
            : task.claimed_by
              ? " · Overtaget"
              : " · Ledig"
          : ""}
      </p>
      {task.cancelled && (
        <p className="rounded-xl border bg-muted px-3 py-2 text-sm font-medium">
          Aflyst. Se instruktion og historik ved at åbne opgaven.
        </p>
      )}
      {!task.cancelled && task.waiting_for_prerequisites && (
        <p className="rounded-xl border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm font-medium dark:bg-amber-950">
          Afventer forudsætninger. Arbejdet kan startes, når de er udført.
        </p>
      )}
      {!active && (
        <button
          type="button"
          className={button + " w-full bg-primary text-primary-foreground"}
          disabled={locked}
          onClick={onOpen}
        >
          Åbn opgave
        </button>
      )}
      <div hidden={!active} className="space-y-3">
        <section aria-label="Opgavens instruktion" className="space-y-2 rounded-xl bg-muted/40 p-3">
          <h3 className="font-medium">Det skal du gøre</h3>
          <p className="whitespace-pre-wrap text-sm">
            {task.plan.instructions ||
              "Der er endnu ikke angivet en instruktion. Kontakt projektansvarlig, før arbejdet udføres."}
          </p>
        </section>
        {canExecute && (
          <div className="space-y-2 rounded-xl border p-3">
            <p className="text-sm">
              {task.waiting_for_prerequisites
                ? "Du kan følge opgaven i logbogen, mens du venter."
                : "Når du har læst instruktionen, kan du opdatere status og skrive noter i logbogen."}
            </p>
            <button
              type="button"
              className={button}
              disabled={locked || busy}
              onClick={() => {
                if (!statusDetails.current) return;
                statusDetails.current.open = true;
                setStatusOpened(true);
                statusSummary.current?.focus();
              }}
            >
              Gå til status og logbog
            </button>
          </div>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Se arbejdsgrundlag</summary>
          <WorkOrderPlanSummary row={{ plan: task.plan, version: task.plan_version }} />
        </details>
        {active && canExecute && (
          <FieldWorkOrderEquipment
            scope={{ organizationId: task.organization_id, projectId: task.project_id }}
            actorId={actorId}
            actionId={task.action_id}
          />
        )}
        {active && (task.plan.siteId || !!task.plan.visitStops?.length) && (
          <WorkOrderVisitResults
            key={task.plan_version_id}
            scope={{ organizationId: task.organization_id, projectId: task.project_id }}
            actorId={actorId}
            actionId={task.action_id}
            planVersionId={task.plan_version_id}
            planVersion={task.plan_version}
            plan={task.plan}
            canWrite={canExecute}
            disabled={(locked && !visitEditing) || busy}
            onEditing={(value) => {
              setVisitEditing(value);
              reportEditing("visits", value);
            }}
          />
        )}
        {task.can_claim && !task.cancelled && (
          <button
            className={button + " bg-primary text-primary-foreground"}
            disabled={busy || locked}
            onClick={() => void take()}
          >
            {busy ? "Overtager…" : "Overtag opgaven"}
          </button>
        )}
        <details
          ref={statusDetails}
          onToggle={(e) => {
            if (e.currentTarget.open) setStatusOpened(true);
          }}
        >
          <summary
            ref={statusSummary}
            className="min-h-11 cursor-pointer py-2 font-medium"
            onClick={(e) => {
              if (locked && !editing) e.preventDefault();
            }}
          >
            Status og logbog
          </summary>
          {statusOpened && (
            <fieldset
              disabled={(locked && !editing) || busy}
              className="min-w-0"
              aria-label="Opgavens status og noter"
            >
              <WorkOrderStatusPanel
                scope={{
                  actionId: task.action_id,
                  organizationId: task.organization_id,
                  projectId: task.project_id,
                }}
                actorId={actorId}
                onEditing={(value) => {
                  setEditing(value);
                  reportEditing("status", value);
                }}
              />
            </fieldset>
          )}
        </details>
        <details
          onToggle={(event) => {
            if (event.currentTarget.open) setEvidenceOpened(true);
          }}
        >
          <summary
            className="min-h-11 cursor-pointer py-2 font-medium"
            onClick={(event) => {
              if (locked && !evidenceEditing) event.preventDefault();
            }}
          >
            Se dokumentation
          </summary>
          {evidenceOpened && (
            <WorkOrderEvidencePanel
              scope={{ organizationId: task.organization_id, projectId: task.project_id }}
              actorId={actorId}
              actionId={task.action_id}
              canContribute={false}
              onEditing={(value) => {
                setEvidenceEditing(value);
                reportEditing("evidence", value);
              }}
            />
          )}
        </details>
        <details
          onToggle={(event) => {
            if (event.currentTarget.open) setSubmissionOpened(true);
          }}
        >
          <summary
            className="min-h-11 cursor-pointer py-2 font-medium"
            onClick={(event) => {
              if (locked && !submissionEditing) event.preventDefault();
            }}
          >
            Se afleveringsversioner
          </summary>
          {submissionOpened && (
            <WorkOrderSubmissionPanel
              scope={{ organizationId: task.organization_id, projectId: task.project_id }}
              actorId={actorId}
              actionId={task.action_id}
              readOnly
              allowReviewInReadOnly={!task.cancelled}
              onEditing={(value) => {
                setSubmissionEditing(value);
                reportEditing("submission", value);
              }}
            />
          )}
        </details>
        {(canExecute || timeOpened) && (
          <details
            onToggle={(event) => {
              if (event.currentTarget.open) setTimeOpened(true);
            }}
          >
            <summary
              className="min-h-11 cursor-pointer py-2 font-medium"
              onClick={(event) => {
                if (locked && !timeEditing) event.preventDefault();
              }}
            >
              Registrér arbejdstid
            </summary>
            {timeOpened && (
              <fieldset disabled={(locked && !timeEditing) || busy} className="min-w-0">
                <WorkOrderTimePanel
                  scope={{ organizationId: task.organization_id, projectId: task.project_id }}
                  actorId={actorId}
                  actionId={task.action_id}
                  canWrite={canExecute}
                  onEditing={(value) => {
                    setTimeEditing(value);
                    reportEditing("time", value);
                  }}
                />
              </fieldset>
            )}
          </details>
        )}
        {(canExecute || materialsOpened) && (
          <details
            onToggle={(event) => {
              if (event.currentTarget.open) setMaterialsOpened(true);
            }}
          >
            <summary
              className="min-h-11 cursor-pointer py-2 font-medium"
              onClick={(event) => {
                if (locked && !materialsEditing) event.preventDefault();
              }}
            >
              Registrér materialeforbrug
            </summary>
            {materialsOpened && (
              <fieldset disabled={(locked && !materialsEditing) || busy} className="min-w-0">
                <WorkOrderMaterials
                  scope={{ organizationId: task.organization_id, projectId: task.project_id }}
                  actorId={actorId}
                  actionId={task.action_id}
                  canWrite={canExecute}
                  onEditing={(value) => {
                    setMaterialsEditing(value);
                    reportEditing("materials", value);
                  }}
                />
              </fieldset>
            )}
          </details>
        )}
        {task.can_plan && !task.cancelled && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              to="/app/projects/$slug"
              params={{ slug: task.project_id }}
              search={{ step: "udfoerelse", task: task.action_id, work: "execution" }}
              className={button}
            >
              Registrér udført arbejde
            </Link>
            <Link
              to="/felt"
              search={{ project: task.project_id, task: task.action_id }}
              className={button}
            >
              Tag fotos på projektet
            </Link>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </div>
    </article>
  );
}
