import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { workEquipmentKind, workEquipmentKindLabel } from "@/lib/work-order-equipment";
import type { ProjectScope } from "@/services/project-workspace-service";

const uuid = z.string().uuid();
const pageSize = 40;
const datePattern = "yyyy-MM-dd";
const danishWeek = { weekStartsOn: 1 } as const;
const periodChoices = [
  { label: "I dag", start: (date: Date) => date, end: (date: Date) => date },
  {
    label: "Denne uge",
    start: (date: Date) => startOfWeek(date, danishWeek),
    end: (date: Date) => endOfWeek(date, danishWeek),
  },
  { label: "Denne måned", start: startOfMonth, end: endOfMonth },
];
const booking = z.object({
  id: uuid,
  action_id: uuid,
  starts_on: CalendarDate,
  ends_on: CalendarDate,
  cancelled_at: z.string().datetime({ offset: true }).nullable(),
  organization_work_equipment: z.object({ name: z.string(), kind: workEquipmentKind }),
});
const pageSchema = z.array(booking).max(pageSize + 1);
const reminderPageSize = 20;
const reminderPage = z
  .array(
    z.object({
      equipment_id: uuid,
      equipment_name: z.string(),
      action_id: uuid,
      next_service_on: CalendarDate,
      days_until_service: z.number().int(),
    }),
  )
  .max(reminderPageSize + 1);
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
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), datePattern));
  const [through, setThrough] = useState(() => format(endOfMonth(new Date()), datePattern));
  const [bookingActionId, setBookingActionId] = useState("");
  const [search, setSearch] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const valid =
    CalendarDate.safeParse(from).success &&
    CalendarDate.safeParse(through).success &&
    from <= through;
  const reminders = useInfiniteQuery({
    queryKey: ["project-equipment-service-reminders", actorId, scope],
    enabled: active,
    retry: false,
    initialPageParam: null as { next_service_on: string; equipment_id: string } | null,
    queryFn: async ({ pageParam, signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const response = await client
        .rpc("list_project_equipment_service_reminders", {
          p_organization_id: scope.organizationId,
          p_project_id: scope.projectId,
          p_after_due: pageParam?.next_service_on ?? null,
          p_after_equipment_id: pageParam?.equipment_id ?? null,
        })
        .abortSignal(signal);
      if (response.error) throw response.error;
      return reminderPage.parse(response.data);
    },
    getNextPageParam: (lastPage) =>
      lastPage.length > reminderPageSize ? lastPage[reminderPageSize - 1] : undefined,
  });
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
  const serviceRows = reminders.isSuccess
    ? reminders.data.pages.flatMap((page) => page.slice(0, reminderPageSize))
    : [];
  const names = new Map(tasks.map((task) => [task.id, task.title]));
  const selectedTask = names.has(bookingActionId) ? bookingActionId : "";
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
      {active && (
        <section aria-label="Servicepåmindelser" className="space-y-2 rounded-xl border p-3">
          <h4 className="font-semibold">Servicepåmindelser</h4>
          {reminders.isPending && <p role="status">Henter servicefrister…</p>}
          {reminders.isError && (
            <div className="space-y-2">
              <p role="alert">Servicefristerne kunne ikke hentes.</p>
              <button type="button" className={button} onClick={() => void reminders.refetch()}>
                Prøv igen
              </button>
            </div>
          )}
          {reminders.isSuccess && serviceRows.length === 0 && (
            <p>Ingen servicefrister inden for de næste 7 dage.</p>
          )}
          {!!serviceRows.length && (
            <ul className="divide-y">
              {serviceRows.map((row) => (
                <li
                  key={row.equipment_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="font-medium">{row.equipment_name}</p>
                    <p className={row.days_until_service < 0 ? "font-semibold" : undefined}>
                      {row.days_until_service < 0
                        ? "Overskredet"
                        : row.days_until_service === 0
                          ? "Forfalder i dag"
                          : "Forfalder snart"}
                      {" · "}
                      {row.next_service_on}
                    </p>
                  </div>
                  {names.has(row.action_id) && (
                    <button
                      type="button"
                      className={button}
                      disabled={locked}
                      aria-label={"Åbn booking for " + row.equipment_name}
                      onClick={() => onOpen(row.action_id)}
                    >
                      Åbn booking
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {reminders.hasNextPage && (
            <button
              type="button"
              className={button}
              disabled={reminders.isFetching}
              onClick={() => void reminders.fetchNextPage()}
            >
              Vis flere servicefrister
            </button>
          )}
        </section>
      )}
      {tasks.length > 0 ? (
        <form
          className="grid items-end gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedTask && !locked) onOpen(selectedTask);
          }}
        >
          <label className="min-w-0 text-sm">
            Vælg opgave til udstyrsbooking
            <select
              className={control}
              value={selectedTask}
              disabled={locked}
              onChange={(event) => setBookingActionId(event.target.value)}
            >
              <option value="">Vælg arbejdsopgave</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={button} disabled={locked || !selectedTask}>
            Åbn booking
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Opret en arbejdsopgave, og gem dens arbejdsgrundlag for at reservere udstyr.
        </p>
      )}
      <fieldset disabled={locked} className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">Filtrér reservationer</legend>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {periodChoices.map(({ label, start, end }) => {
            const today = new Date();
            const startDate = format(start(today), datePattern);
            const endDate = format(end(today), datePattern);
            return (
              <button
                key={label}
                type="button"
                className={button + " aria-pressed:border-primary aria-pressed:bg-primary/10"}
                aria-pressed={from === startDate && through === endDate}
                onClick={() => {
                  setFrom(startDate);
                  setThrough(endDate);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
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
      {!valid && (
        <p role="alert">Vælg begge datoer. Fra dato skal være før eller lig med slutdatoen.</p>
      )}
      {valid && bookings.isPending && <p role="status">Henter projektets reservationer…</p>}
      {bookings.isError && <p role="alert">Projektets reservationer kunne ikke hentes.</p>}
      {bookings.isSuccess && !rows?.length && (
        <p>Ingen reservationer matcher perioden og filtrene.</p>
      )}
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
