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
  const tasks = useInfiniteQuery({
    queryKey: ["my-work-orders", actorId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      load({ data: { expectedActorId: actorId, afterActionId: pageParam, pageSize: 20 } }),
    getNextPageParam: (page) => page.nextAfterActionId ?? undefined,
    retry: false,
  });
  const items = tasks.isError ? [] : (tasks.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-4 p-3 pb-12 sm:p-6 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mine opgaver</h1>
        <button className={button} disabled={tasks.isFetching} onClick={() => void tasks.refetch()}>
          {tasks.isFetching ? "Henter…" : "Opdater opgaver"}
        </button>
      </header>
      <p className="text-sm text-muted-foreground">
        Dine tildelte arbejdsopgaver og ledige opgaver i dine puljer. Åbn arbejdsgrundlaget, og
        overtag en puljeopgave, når du skal udføre den.
      </p>
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
        <TaskCard key={task.action_id} task={task} actorId={actorId} />
      ))}
      {tasks.hasNextPage && !tasks.isError && (
        <button
          className={button}
          disabled={tasks.isFetching}
          onClick={() => void tasks.fetchNextPage()}
        >
          {tasks.isFetchingNextPage ? "Henter…" : "Hent flere opgaver"}
        </button>
      )}
    </main>
  );
}
function TaskCard({ task, actorId }: { task: MyWorkOrder; actorId: string }) {
  const claim = useServerFn(claimProjectWorkOrderPool),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inFlight = useRef(false),
    attempt = useRef<{ signature: string; requestId: string } | null>(null);
  async function take() {
    if (inFlight.current || !task.can_claim) return;
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
      await cache.invalidateQueries({ queryKey: ["my-work-orders", actorId] });
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
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Se arbejdsgrundlag</summary>
        <WorkOrderPlanSummary row={{ plan: task.plan, version: task.plan_version }} />
      </details>
      {task.can_claim && (
        <button
          className={button + " bg-primary text-primary-foreground"}
          disabled={busy}
          onClick={() => void take()}
        >
          {busy ? "Overtager…" : "Overtag opgaven"}
        </button>
      )}
      {task.can_plan && (
        <Link
          to="/app/projects/$slug"
          params={{ slug: task.project_id }}
          search={{ step: "udfoerelse" }}
          className={button}
        >
          Åbn udførelse i projektet
        </Link>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
