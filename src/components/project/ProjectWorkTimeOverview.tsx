import { ProjectApprovedTimeExport } from "./ProjectApprovedTimeExport";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDate } from "@/lib/action-execution";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { formatWorkOrderHours, WorkOrderEstimatedHoursSchema } from "@/lib/work-order-plan";
import type { ProjectScope } from "@/services/project-workspace-service";

const rowSchema = z.object({
  action_id: z.string().uuid(),
  title: z.string(),
  minutes: z.number().int().nonnegative(),
  entries: z.number().int().nonnegative(),
  pending_entries: z.number().int().nonnegative(),
  pending_date: CalendarDate.nullable(),
  estimated_hours: WorkOrderEstimatedHoursSchema.nullable(),
});
const pageSize = 100;
const displaySize = 40;
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

export function ProjectWorkTimeOverview({
  scope,
  actorId,
  locked,
  active,
  onOpen,
}: {
  scope: ProjectScope;
  actorId: string;
  locked: boolean;
  active: boolean;
  onOpen: (actionId: string, reviewDate?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(displaySize);
  const [onlyOver, setOnlyOver] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const query = useQuery({
    queryKey: ["project-work-time", actorId, scope],
    retry: false,
    enabled: active,
    queryFn: async ({ signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const rows: z.infer<typeof rowSchema>[] = [];
      let after: string | null = null;
      for (;;) {
        signal.throwIfAborted();
        const { data, error } = await client
          .rpc("list_project_work_order_time", {
            p_organization_id: scope.organizationId,
            p_project_id: scope.projectId,
            p_after_action_id: after,
          })
          .abortSignal(signal);
        if (error) throw new Error("Projektets timer kunne ikke hentes.");
        const page = z.array(rowSchema).max(pageSize).parse(data);
        rows.push(...page);
        if (page.length < pageSize) return rows;
        after = page[page.length - 1].action_id;
      }
    },
  });
  const rows = query.isSuccess ? query.data : [];
  const term = search.trim().toLocaleLowerCase("da");
  const visible = rows.filter(
    (row) =>
      row.title.toLocaleLowerCase("da").includes(term) &&
      (!onlyPending || row.pending_entries > 0) &&
      (!onlyOver || (row.estimated_hours !== null && row.minutes / 60 > row.estimated_hours)),
  );
  const pending = visible.reduce((sum, row) => sum + row.pending_entries, 0);
  const recorded = visible.filter((row) => row.entries > 0);
  const estimated = visible.filter((row) => row.estimated_hours !== null);
  return (
    <section aria-label="Projektets timer" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Projektets timer</h3>
        {query.isSuccess && (
          <button
            type="button"
            className={button}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Henter timer…" : "Opdater timer"}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Se estimater og registreret tid. Åbn en opgave med timer, der afventer, for at gennemgå dem.
        Godkendte timer kan bruges i faktureringsgrundlaget.
      </p>
      <ProjectApprovedTimeExport scope={scope} actorId={actorId} active={active && !locked} />
      {query.isPending && <p role="status">Henter projektets timer…</p>}
      {query.isError && (
        <div>
          <p role="alert">Projektets timer kunne ikke hentes.</p>
          <button type="button" className={button} onClick={() => void query.refetch()}>
            Prøv igen
          </button>
        </div>
      )}
      {query.isSuccess && (
        <>
          <label className="block text-sm">
            Find opgave efter titel
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(displaySize);
              }}
              className="mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 text-base"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyOver}
              onChange={(e) => {
                setOnlyOver(e.target.checked);
                setLimit(displaySize);
              }}
            />
            Kun opgaver over estimatet
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(event) => {
                setOnlyPending(event.target.checked);
                setLimit(displaySize);
              }}
            />
            Kun opgaver med tid, der afventer godkendelse
          </label>
          <dl className="grid gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt>Registreret i udvalget</dt>
              <dd className="font-semibold">
                {recorded.length
                  ? formatWorkOrderHours(recorded.reduce((sum, row) => sum + row.minutes, 0) / 60)
                  : "Ingen registreringer"}
              </dd>
            </div>
            <div>
              <dt>Estimeret i udvalget</dt>
              <dd className="font-semibold">
                {estimated.length
                  ? formatWorkOrderHours(
                      estimated.reduce((sum, row) => sum + (row.estimated_hours ?? 0), 0),
                    )
                  : "Ingen estimater"}
              </dd>
            </div>
          </dl>
          <p role="status" className="text-sm">
            {visible.length} opgaver · {visible.length - recorded.length} uden registrering ·{" "}
            {visible.length - estimated.length} uden estimat · {pending} afventer godkendelse
          </p>
          {!visible.length && <p className="text-sm">Ingen opgaver matcher dit udvalg.</p>}
          <ul className="space-y-2">
            {visible.slice(0, limit).map((row) => (
              <li key={row.action_id}>
                <button
                  type="button"
                  disabled={locked}
                  className={button + " w-full p-3 text-left"}
                  onClick={() => onOpen(row.action_id, row.pending_date ?? undefined)}
                >
                  <span className="block font-medium">{row.title}</span>
                  <span className="block text-muted-foreground">
                    {row.entries ? `${row.minutes} min. registreret` : "Ingen registrering"}
                    {" · "}
                    {row.estimated_hours == null
                      ? "Intet estimat"
                      : formatWorkOrderHours(row.estimated_hours) + " estimeret"}
                  </span>
                  {row.entries > 0 && (
                    <span className="mt-1 block font-medium">
                      {row.pending_entries
                        ? `${row.pending_entries} afventer · Gennemgå timer`
                        : "Alle registreringer godkendt"}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {visible.length > limit && (
            <button type="button" className={button} onClick={() => setLimit(limit + displaySize)}>
              Vis flere opgaver
            </button>
          )}
        </>
      )}
    </section>
  );
}
