import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { workEquipmentKind, workEquipmentKindLabel } from "@/lib/work-order-equipment";
import type { ProjectScope } from "@/services/project-workspace-service";

const uuid = z.string().uuid();
const pageSize = 40;
const booking = z.object({
  id: uuid,
  action_id: uuid,
  starts_on: CalendarDate,
  ends_on: CalendarDate,
  cancelled_at: z.string().datetime({ offset: true }).nullable(),
  organization_work_equipment: z.object({ name: z.string(), kind: workEquipmentKind }),
});
const pageSchema = z.array(booking).max(pageSize + 1);
const control = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base";
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

export function ProjectEquipmentBookings({
  scope,
  actorId,
  active,
  locked,
  tasks,
  onOpen,
}: {
  scope: ProjectScope;
  actorId: string;
  active: boolean;
  locked: boolean;
  tasks: Array<{ id: string; title: string }>;
  onOpen: (actionId: string) => void;
}) {
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [through, setThrough] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const valid =
    CalendarDate.safeParse(from).success &&
    CalendarDate.safeParse(through).success &&
    from <= through;
  const bookings = useInfiniteQuery({
    queryKey: [
      "project-equipment-bookings",
      actorId,
      scope,
      from,
      through,
      search,
      includeCancelled,
    ],
    enabled: active && valid,
    retry: false,
    initialPageParam: null as { starts_on: string; id: string } | null,
    queryFn: async ({ pageParam, signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      let query = client
        .from("work_order_equipment_bookings")
        .select(
          "id,action_id,starts_on,ends_on,cancelled_at,organization_work_equipment!inner(name,kind)",
        )
        .eq("project_id", scope.projectId)
        .eq("organization_id", scope.organizationId)
        .lte("starts_on", through)
        .gte("ends_on", from)
        .ilike("organization_work_equipment.name", "%" + search.trim() + "%");
      if (!includeCancelled) query = query.is("cancelled_at", null);
      if (pageParam) {
        const { starts_on: start, id } = pageParam;
        query = query.or(`starts_on.gt.${start},and(starts_on.eq.${start},id.gt.${id})`);
      }
      const result = await query
        .order("starts_on")
        .order("id")
        .limit(pageSize + 1)
        .abortSignal(signal);
      if (result.error) throw new Error("Projektets reservationer kunne ikke hentes.");
      return pageSchema.parse(result.data);
    },
    getNextPageParam: (lastPage) =>
      lastPage.length > pageSize ? lastPage[pageSize - 1] : undefined,
  });
  const rows = bookings.data?.pages.flatMap((page) => page.slice(0, pageSize));
  const names = new Map(tasks.map((task) => [task.id, task.title]));
  return (
    <section
      aria-label="Projektets bookingoversigt"
      className="min-w-0 space-y-3 rounded-xl border bg-card p-3 sm:p-4"
    >
      <h3 className="font-semibold">Projektets bookingoversigt</h3>
      <p className="text-sm text-muted-foreground">
        Se reservationer, der overlapper perioden. Åbn en reservation for at gå til opgavens
        udstyrsbooking.
      </p>
      <fieldset disabled={locked} className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          Fra dato
          <input
            type="date"
            className={control}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Til og med
          <input
            type="date"
            className={control}
            value={through}
            onChange={(event) => setThrough(event.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Søg efter udstyr
          <input
            type="search"
            className={control}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(event) => setIncludeCancelled(event.target.checked)}
          />
          Vis også aflyste reservationer
        </label>
      </fieldset>
      {!valid && <p role="alert">Vælg en gyldig periode.</p>}
      {valid && bookings.isPending && <p role="status">Henter projektets reservationer…</p>}
      {bookings.isError && <p role="alert">Projektets reservationer kunne ikke hentes.</p>}
      {bookings.isSuccess && !rows?.length && <p>Ingen reservationer matcher dit udvalg.</p>}
      {!!rows?.length && (
        <ul className="space-y-2">
          {rows.map((row) => {
            const title = names.get(row.action_id);
            const item = row.organization_work_equipment;
            const content = (
              <>
                <span className="block font-medium">
                  {item.name} · {workEquipmentKindLabel[item.kind]}
                </span>
                <span className="block">
                  {row.starts_on} til {row.ends_on} · {row.cancelled_at ? "Aflyst" : "Reserveret"}
                </span>
                <span className="block text-muted-foreground">
                  {title ?? "Arbejdsopgave uden adgang fra opgavelisten"}
                </span>
              </>
            );
            return (
              <li key={row.id} className="break-words">
                {title ? (
                  <button
                    type="button"
                    className={button + " w-full p-3 text-left"}
                    disabled={locked}
                    onClick={() => onOpen(row.action_id)}
                  >
                    {content}
                    <span className="mt-1 block text-primary">Åbn opgavens booking →</span>
                  </button>
                ) : (
                  <div className="rounded-xl border p-3 text-sm">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {valid && !bookings.isPending && (
        <div className="flex flex-wrap gap-2">
          {bookings.hasNextPage && !bookings.isError && (
            <button
              type="button"
              className={button}
              disabled={bookings.isFetching || locked}
              onClick={() => void bookings.fetchNextPage()}
            >
              Vis flere reservationer
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={bookings.isFetching || locked}
            onClick={() => void bookings.refetch()}
          >
            {bookings.isError ? "Prøv igen" : "Opdater reservationer"}
          </button>
        </div>
      )}
    </section>
  );
}
