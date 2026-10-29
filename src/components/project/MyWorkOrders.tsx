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
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50";

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
  const tasks = useInfiniteQuery({
    queryKey: ["my-work-orders", actorId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      load({ data: { expectedActorId: actorId, afterActionId: pageParam, pageSize: 20 } }),
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
      <p className="text-sm text-muted-foreground">
        Åbn en opgave for at se instruktionen og registrere dit arbejde.
      </p>
      {activeTaskId && (
        <button
          type="button"
          className={button}
          disabled={editors.size > 0}
          onClick={() => setActiveTask(null)}
        >
          ← Alle mine opgaver
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
        <p className="rounded-xl border p-4">Du har ingen tildelte opgaver med en gemt plan.</p>
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
  const claim = useServerFn(claimProjectWorkOrderPool),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [statusOpened, setStatusOpened] = useState(false),
    [editing, setEditing] = useState(false);
  const inFlight = useRef(false),
    attempt = useRef<{ signature: string; requestId: string } | null>(null);
  async function take() {
    if (inFlight.current || !task.can_claim || locked || !active) return;
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
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Se arbejdsgrundlag</summary>
          <WorkOrderPlanSummary row={{ plan: task.plan, version: task.plan_version }} />
        </details>
        {task.can_claim && (
          <button
            className={button + " bg-primary text-primary-foreground"}
            disabled={busy || locked}
            onClick={() => void take()}
          >
            {busy ? "Overtager…" : "Overtag opgaven"}
          </button>
        )}
        <details
          onToggle={(e) => {
            if (e.currentTarget.open) setStatusOpened(true);
          }}
        >
          <summary
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
                  onEditing(value);
                }}
              />
            </fieldset>
          )}
        </details>
        {task.can_plan && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              to="/app/projects/$slug"
              params={{ slug: task.project_id }}
              search={{ step: "udfoerelse", task: task.action_id, work: "execution" }}
              className={button}
            >
              Registrér udført arbejde
            </Link>
            <Link to="/felt" search={{ project: task.project_id }} className={button}>
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
