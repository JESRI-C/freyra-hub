import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { workEquipmentKind, workEquipmentKindLabel } from "@/lib/work-order-equipment";
import type { ProjectScope } from "@/services/project-workspace-service";

const schema = z
  .array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      kind: workEquipmentKind,
      starts_on: CalendarDate,
      ends_on: CalendarDate,
    }),
  )
  .max(21);
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

export function FieldWorkOrderEquipment({
  scope,
  actorId,
  actionId,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
}) {
  const [open, setOpen] = useState(false);
  const bookings = useInfiniteQuery({
    queryKey: ["field-work-order-equipment", actorId, scope, actionId],
    enabled: open,
    retry: false,
    initialPageParam: null as { starts_on: string; id: string } | null,
    queryFn: async ({ pageParam, signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const result = await client
        .rpc("list_field_work_order_equipment", {
          p_organization_id: scope.organizationId,
          p_project_id: scope.projectId,
          p_action_id: actionId,
          p_after_starts_on: pageParam?.starts_on ?? null,
          p_after_id: pageParam?.id ?? null,
        })
        .abortSignal(signal);
      if (result.error) throw new Error("Reserveret udstyr kunne ikke hentes.");
      return schema.parse(result.data);
    },
    getNextPageParam: (lastPage) => (lastPage.length === 21 ? lastPage[19] : undefined),
  });
  const rows = bookings.isError
    ? []
    : (bookings.data?.pages.flatMap((page) => page.slice(0, 20)) ?? []);
  return (
    <details
      className="space-y-2 rounded-xl border px-3 pb-3 text-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-3 font-medium">Reserveret udstyr</summary>
      <p>Se udstyret, der er reserveret til denne opgave. Datoerne gælder hele dage.</p>
      {open && bookings.isPending && <p role="status">Henter reserveret udstyr…</p>}
      {open && bookings.isError && <p role="alert">Reserveret udstyr kunne ikke hentes.</p>}
      {bookings.isSuccess && !rows.length && <p>Der er ingen aktive reservationer på opgaven.</p>}
      {!!rows.length && (
        <ul className="space-y-2">
          {rows.map((booking) => (
            <li key={booking.id} className="rounded-lg border p-2">
              <p className="font-medium">
                {booking.name} · {workEquipmentKindLabel[booking.kind]}
              </p>
              <p>
                {booking.starts_on === booking.ends_on
                  ? booking.starts_on
                  : booking.starts_on + " til " + booking.ends_on}
              </p>
            </li>
          ))}
        </ul>
      )}
      {open && (bookings.hasNextPage || bookings.isError) && (
        <button
          type="button"
          className={button}
          disabled={bookings.isFetching}
          onClick={() => {
            if (bookings.hasNextPage) void bookings.fetchNextPage();
            else void bookings.refetch();
          }}
        >
          {bookings.isError ? "Prøv igen" : "Vis flere reservationer"}
        </button>
      )}
    </details>
  );
}
