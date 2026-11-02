import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { readProjectWorkOrderExecutionBinding } from "@/lib/work-order-execution.functions";
import { workOrderExecutionGapLabels } from "@/lib/work-order-execution";
import type { WorkOrderScope } from "@/lib/work-order-access";

/** The selected immutable revision, rather than the latest execution or current plan. */
export function WorkOrderExecutionReference({
  scope,
  actorId,
  revisionId,
}: {
  scope: WorkOrderScope;
  actorId: string;
  revisionId: string;
}) {
  const [opened, setOpened] = useState(false);
  const read = useServerFn(readProjectWorkOrderExecutionBinding);
  const query = useQuery({
    queryKey: ["work-order-execution-reference", actorId, scope, revisionId],
    queryFn: () =>
      read({ data: { ...scope, expectedActorId: actorId, previousRevisionId: revisionId } }),
    enabled: opened,
    retry: false,
  });
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
        Se tilknyttet udførelse
      </summary>
      {opened && (
        <div className="space-y-2 rounded-xl border p-3 text-sm">
          {query.isPending && <p role="status">Henter den gemte udførelse…</p>}
          {query.isError && (
            <>
              <p role="alert">{query.error.message}</p>
              <button
                type="button"
                className="min-h-11 rounded-xl border px-4 py-2 disabled:opacity-50"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Hent udførelsen igen
              </button>
            </>
          )}
          {!query.isError && query.data && (
            <>
              <p className="font-medium">
                Udførelse version {query.data.version} · arbejdsgrundlag version{" "}
                {query.data.plan_version}
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Faktisk start</dt>
                  <dd>{date(query.data.actual_start)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Faktisk slut</dt>
                  <dd>{date(query.data.actual_end)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Faktisk metode</dt>
                  <dd>{query.data.actual_method ?? "Ukendt"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Dækning</dt>
                  <dd>
                    {
                      { unknown: "Ukendt", limited: "Begrænset", documented: "Dokumenteret" }[
                        query.data.coverage
                      ]
                    }
                  </dd>
                </div>
              </dl>
              {query.data.documentation_gaps.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  {query.data.documentation_gaps.map((gap) => (
                    <li key={gap}>{workOrderExecutionGapLabels[gap]}</li>
                  ))}
                </ul>
              )}
              {query.data.deviation_reason && (
                <p>Begrundelse for afvigelse: {query.data.deviation_reason}</p>
              )}
            </>
          )}
        </div>
      )}
    </details>
  );
}
function date(value: string | null) {
  return value ? value.split("-").reverse().join(".") : "Ukendt";
}
