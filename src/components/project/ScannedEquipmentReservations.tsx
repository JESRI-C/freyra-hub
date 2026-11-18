import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { WorkOrderActionIdSchema } from "@/lib/work-order-access";

const reservations = z
  .array(
    z.object({
      booking_id: z.string().uuid(),
      action_id: WorkOrderActionIdSchema,
      equipment_name: z.string(),
      job_title: z.string(),
      starts_on: CalendarDate,
      ends_on: CalendarDate,
      checked_out: z.boolean(),
    }),
  )
  .max(21);

export function ScannedEquipmentReservations({
  actorId,
  equipmentId,
}: {
  actorId: string;
  equipmentId: string;
}) {
  const matches = useQuery({
    queryKey: ["field-equipment-label", actorId, equipmentId],
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const result = await client
        .rpc("list_field_equipment_label", { p_equipment_id: equipmentId })
        .abortSignal(signal);
      if (result.error) throw result.error;
      return reservations.parse(result.data);
    },
  });
  const page = matches.isSuccess ? matches.data : [];
  const rows = page.slice(0, 20);
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{rows[0]?.equipment_name ?? "Scannet udstyr"}</h1>
      <Link
        to="/opgaver"
        search={{ equipment: undefined, job: undefined, mode: undefined, booking: undefined }}
        className="inline-flex min-h-11 items-center underline"
      >
        Mine opgaver
      </Link>
      {matches.isPending && <p role="status">Henter tilgængelige reservationer…</p>}
      {matches.isError && (
        <div role="alert">
          <p>Reservationerne kunne ikke hentes.</p>
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => void matches.refetch()}
          >
            Prøv igen
          </button>
        </div>
      )}
      {matches.isSuccess && !rows.length && (
        <p>Der er ingen tilgængelige reservationer for din konto.</p>
      )}
      {!!rows.length && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.booking_id} className="rounded-xl border p-3">
              <p className="font-semibold">{row.job_title}</p>
              <p className="text-sm">
                {row.starts_on} til {row.ends_on} · {row.checked_out ? "Afhentet" : "Reserveret"}
              </p>
              <Link
                to="/opgaver"
                search={{ job: row.action_id, booking: row.booking_id, equipment: undefined }}
                className="inline-flex min-h-11 items-center underline"
              >
                Åbn reservation
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page.length > rows.length && (
        <p>Der er flere reservationer. Åbn jobbet i Mine opgaver for at finde de øvrige.</p>
      )}
    </main>
  );
}
