import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderPeople } from "./useWorkOrderPeople";

const rowSchema = z.object({
  time_id: z.string().uuid(),
  actor_id: z.string().uuid(),
  version: z.number().int().positive(),
  minutes: z.number().int().min(0).max(1440),
  approved: z.boolean(),
});
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

export function WorkOrderTimeReview({
  scope,
  actorId,
  actionId,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
}) {
  const cache = useQueryClient();
  const people = useWorkOrderPeople(scope, actorId);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const writing = useRef(false);
  const key = ["work-order-time-review", actorId, scope, actionId, date];
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const review = useQuery({
    queryKey: key,
    retry: false,
    enabled: CalendarDate.safeParse(date).success,
    queryFn: async ({ signal }) => {
      const rows: z.infer<typeof rowSchema>[] = [];
      let after: string | null = null;
      for (;;) {
        const { data, error } = await db()
          .rpc("list_work_order_time_for_review", {
            p_organization_id: scope.organizationId,
            p_project_id: scope.projectId,
            p_action_id: actionId,
            p_work_date: date,
            p_after_actor_id: after,
          })
          .abortSignal(signal);
        if (error) throw new Error("Registreringerne kunne ikke hentes.");
        const page = z.array(rowSchema).max(100).parse(data);
        rows.push(...page);
        if (page.length < 100) return rows;
        after = page[page.length - 1].actor_id;
      }
    },
  });
  async function approve(row: z.infer<typeof rowSchema>) {
    if (writing.current || row.approved || row.actor_id === actorId) return;
    writing.current = true;
    setBusy(row.time_id);
    setError("");
    try {
      const result = await db()
        .from("work_order_time_approvals")
        .insert({ time_id: row.time_id })
        .select("time_id")
        .single();
      const receipt = result.error
        ? await db()
            .from("work_order_time_approvals")
            .select("time_id")
            .eq("time_id", row.time_id)
            .maybeSingle()
        : result;
      if (receipt.data?.time_id !== row.time_id)
        setError(
          result.error?.code === "40001"
            ? "Tidsregistreringen er rettet. Gennemgå den nye version."
            : "Godkendelsen kunne ikke bekræftes. Prøv igen.",
        );
      await review.refetch();
      await cache.invalidateQueries({ queryKey: ["work-order-time", actorId, scope, actionId] });
    } catch {
      setError("Godkendelsen kunne ikke bekræftes. Prøv igen.");
    } finally {
      writing.current = false;
      setBusy(undefined);
    }
  }
  return (
    <div className="space-y-3 pt-2 text-sm">
      <p>
        Godkend den viste version. Rettes registreringen, skal den nye version gennemgås særskilt.
      </p>
      <label className="block">
        Dato for timegodkendelse
        <input
          type="date"
          value={date}
          disabled={!!busy}
          className="mt-1 block min-h-11 rounded-xl border bg-background px-3 text-base"
          onChange={(event) => {
            setDate(event.target.value);
            setError("");
          }}
        />
      </label>
      {review.isPending && date && <p role="status">Henter tidsregistreringer…</p>}
      {review.isError && (
        <button type="button" className={button} onClick={() => void review.refetch()}>
          Hent tidsregistreringer igen
        </button>
      )}
      {review.isSuccess && !review.data.length && <p>Ingen tidsregistreringer på datoen.</p>}
      {error && <p role="alert">{error}</p>}
      {review.isSuccess && review.data.length > 0 && (
        <ul className="space-y-2">
          {review.data.map((row) => {
            const person = people.data?.find((member) => member.user_id === row.actor_id);
            return (
              <li key={row.time_id} className="space-y-1 rounded-lg border p-3">
                <p className="font-medium">
                  {person?.display_name || person?.email || "Udfører " + row.actor_id.slice(-8)}
                </p>
                <p>
                  {row.minutes} min. · Version {row.version}
                </p>
                {row.approved ? (
                  <p>Godkendt</p>
                ) : row.actor_id === actorId ? (
                  <p>Afventer godkendelse fra en anden projektleder.</p>
                ) : (
                  <button
                    type="button"
                    className={button}
                    disabled={!!busy || review.isFetching}
                    onClick={() => void approve(row)}
                  >
                    {busy === row.time_id ? "Godkender…" : "Godkend version " + row.version}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
