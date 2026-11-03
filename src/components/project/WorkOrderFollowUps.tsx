import { WorkOrderSeriesActions } from "./WorkOrderSeriesActions";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { listFieldJobSchedule } from "@/services/field-job-cards-service";
import { RecurrenceInterval, recurrenceLabels } from "@/lib/work-order-recurrence";
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
      series: z
        .object({
          series_id: z.string().uuid(),
          position: z.number().int().min(1).max(12),
          member_count: z.number().int().min(2).max(12),
          cadence: RecurrenceInterval,
        })
        .nullish(),
    }),
  )
  .max(pageSize + 1);

export function WorkOrderFollowUps({
  actorId,
  scope,
  actionId,
  canShift,
  shiftDisabled,
  onSeriesSaving,
}: {
  actorId: string;
  scope: ProjectScope;
  actionId: string;
  canShift: boolean;
  shiftDisabled: boolean;
  onSeriesSaving: (saving: boolean) => void;
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
        .select(
          "id,action_id,title:plan->>title,source_plan_version,series:work_order_series_members(series_id,position,member_count,cadence)",
        )
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
  const groups = new Map<string, typeof items>();
  for (const row of items) {
    const key = row.series ? "series:" + row.series.series_id : "plan:" + row.id;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
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
          <ul className="space-y-2">
            {[...groups].map(([key, group]) => {
              const series = group[0].series;
              const ordered = group.sort(
                (a, b) => (a.series?.position ?? 0) - (b.series?.position ?? 0),
              );
              const plans = schedule.isSuccess
                ? ordered.flatMap((row) => {
                    const plan = schedule.data[row.action_id];
                    return plan?.start && plan.planVersionId
                      ? [
                          {
                            actionId: row.action_id,
                            planVersionId: plan.planVersionId,
                            start: plan.start,
                            end: plan.end,
                            cancelled: plan.cancelled,
                          },
                        ]
                      : [];
                  })
                : [];
              return (
                <li key={key} className={series ? "rounded-xl border p-2" : undefined}>
                  {series && (
                    <p className="mb-2 px-1 text-sm font-medium">
                      {recurrenceLabels[series.cadence]} · {series.member_count} opgaver
                      {group.length < series.member_count && " · " + group.length + " vist"}
                    </p>
                  )}
                  {canShift && series && plans.length === series.member_count && (
                    <WorkOrderSeriesActions
                      actorId={actorId}
                      scope={scope}
                      seriesId={series.series_id}
                      plans={plans}
                      disabled={shiftDisabled}
                      onSaving={onSeriesSaving}
                    />
                  )}
                  <ul className="space-y-1">
                    {ordered.map((row) => (
                      <li key={row.id}>
                        <Link
                          to="/app/projects/$slug"
                          params={{ slug: scope.projectId }}
                          search={{ tab: "handlinger", task: row.action_id, work: "plan" }}
                          className="block min-h-11 rounded-lg border px-3 py-2 text-sm [overflow-wrap:anywhere]"
                        >
                          <span className="block font-medium text-primary">
                            {row.series && `${row.series.position}. `}
                            {row.title}
                          </span>
                          <span className="block text-muted-foreground">
                            {schedule.data?.[row.action_id]?.cancelled && "Aflyst · "}
                            {schedule.isSuccess && (
                              <>{scheduleLabel(schedule.data[row.action_id])} · </>
                            )}
                            Bygger på planversion {row.source_plan_version}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
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
