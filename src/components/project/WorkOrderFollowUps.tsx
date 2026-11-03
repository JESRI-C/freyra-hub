import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { listFieldJobSchedule } from "@/services/field-job-cards-service";
import { scheduleLabel } from "@/lib/work-order-schedule-label";
import type { ProjectScope } from "@/services/project-workspace-service";

const pageSize = 20;
const rows = z
  .array(
    z.object({
      id: z.string().uuid(),
      action_id: z.string().uuid(),
      title: z.string().min(1).max(160),
      source_plan_version: z.number().int().positive(),
    }),
  )
  .max(pageSize + 1);

export function WorkOrderFollowUps({
  actorId,
  scope,
  actionId,
}: {
  actorId: string;
  scope: ProjectScope;
  actionId: string;
}) {
  const [open, setOpen] = useState(false);
  const followUps = useInfiniteQuery({
    queryKey: ["work-order-follow-ups", actorId, scope, actionId],
    enabled: open,
    initialPageParam: null as string | null,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      let query = client
        .from("work_order_plan_versions")
        .select("id,action_id,title:plan->>title,source_plan_version")
        .eq("organization_id", scope.organizationId)
        .eq("project_id", scope.projectId)
        .eq("source_action_id", actionId)
        .eq("version", 1);
      if (pageParam) query = query.gt("id", pageParam);
      const result = await query
        .order("id")
        .limit(pageSize + 1)
        .abortSignal(signal);
      if (result.error) throw new Error("Opfølgende opgaver kunne ikke hentes.");
      return rows.parse(result.data);
    },
    getNextPageParam: (page) => (page.length > pageSize ? page[pageSize - 1].id : undefined),
  });
  const items = followUps.data?.pages.flatMap((page) => page.slice(0, pageSize)) ?? [];
  const schedule = useQuery({
    queryKey: ["field-job-schedule", actorId, scope],
    queryFn: () => listFieldJobSchedule(scope),
    enabled: open && items.length > 0,
    retry: false,
  });
  const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
  return (
    <details
      className="space-y-2 rounded-xl border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Opfølgende opgaver</summary>
      {open && followUps.isPending && <p role="status">Henter opfølgende opgaver…</p>}
      {open && followUps.isError && (
        <div>
          <p role="alert">Opfølgende opgaver kunne ikke hentes.</p>
          <button type="button" className={button} onClick={() => void followUps.refetch()}>
            Prøv igen
          </button>
        </div>
      )}
      {open &&
        followUps.isSuccess &&
        (items.length === 0 ? (
          <p className="text-sm">Ingen opfølgende opgaver med gemt plan.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((row) => (
              <li key={row.id}>
                <Link
                  to="/app/projects/$slug"
                  params={{ slug: scope.projectId }}
                  search={{ tab: "handlinger", task: row.action_id, work: "plan" }}
                  className="block min-h-11 rounded-lg border px-3 py-2 text-sm [overflow-wrap:anywhere]"
                >
                  <span className="block font-medium text-primary">{row.title}</span>
                  <span className="block text-muted-foreground">
                    {schedule.isSuccess && <>{scheduleLabel(schedule.data[row.action_id])} · </>}
                    Bygger på planversion {row.source_plan_version}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
      {open && items.length > 0 && schedule.isError && (
        <div>
          <p role="alert">De planlagte datoer kunne ikke hentes.</p>
          <button type="button" className={button} onClick={() => void schedule.refetch()}>
            Hent datoer igen
          </button>
        </div>
      )}
      {open && followUps.hasNextPage && !followUps.isError && (
        <button
          type="button"
          className={button}
          disabled={followUps.isFetching}
          onClick={() => void followUps.fetchNextPage()}
        >
          Vis flere opfølgende opgaver
        </button>
      )}
    </details>
  );
}
