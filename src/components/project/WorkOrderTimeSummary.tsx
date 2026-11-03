import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { formatWorkOrderHours, WorkOrderEstimatedHoursSchema } from "@/lib/work-order-plan";
import type { ProjectScope } from "@/services/project-workspace-service";

const summarySchema = z.object({
  minutes: z.number().int().nonnegative(),
  entries: z.number().int().nonnegative(),
  estimatedHours: WorkOrderEstimatedHoursSchema.nullable(),
});

export function WorkOrderTimeSummary({
  scope,
  actionId,
  actorId,
}: {
  scope: ProjectScope;
  actionId: string;
  actorId: string;
}) {
  const query = useQuery({
    queryKey: ["work-order-time-summary", actorId, scope, actionId],
    retry: false,
    queryFn: async () => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const result = await client.rpc("get_work_order_time_summary", {
        p_organization_id: scope.organizationId,
        p_project_id: scope.projectId,
        p_action_id: actionId,
      });
      if (result.error) throw new Error("Timeoverblikket kunne ikke hentes.");
      return summarySchema.parse(result.data);
    },
  });
  const data = query.isSuccess ? query.data : undefined;
  const remaining =
    data?.estimatedHours == null || !data.entries ? null : data.estimatedHours - data.minutes / 60;
  return (
    <section aria-label="Timeoverblik" className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Timeoverblik</h3>
      <p className="text-sm text-muted-foreground">
        Seneste tidsregistrering pr. udfører og dato for hele opgaven.
      </p>
      {query.isPending && <p role="status">Henter timeoverblik…</p>}
      {query.isError && (
        <>
          <p role="alert">Timeoverblikket kunne ikke hentes.</p>
          <button
            type="button"
            className="min-h-11 rounded-xl border px-3 text-sm"
            onClick={() => void query.refetch()}
          >
            Prøv igen
          </button>
        </>
      )}
      {data && (
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt>Estimeret tid</dt>
            <dd className="font-medium">
              {data.estimatedHours == null
                ? "Intet estimat"
                : formatWorkOrderHours(data.estimatedHours)}
            </dd>
          </div>
          <div>
            <dt>Registreret tid</dt>
            <dd className="font-medium">
              {data.entries ? `${data.minutes} min.` : "Ingen registreringer"}
            </dd>
          </div>
          {remaining !== null && (
            <div>
              <dt>{remaining < 0 ? "Over estimatet" : "Rest af estimatet"}</dt>
              <dd className="font-medium">{formatWorkOrderHours(Math.abs(remaining))}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
