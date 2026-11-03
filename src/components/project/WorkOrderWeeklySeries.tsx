import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDate } from "@/lib/action-execution";
import { createProjectWorkOrderWeeklySeries } from "@/lib/work-order-plan.functions";
import type { WorkOrderPlanVersion } from "@/lib/work-order-plan";
import type { ProjectScope } from "@/services/project-workspace-service";

function shiftDate(date: string, days: number) {
  const shifted = new Date(date + "T00:00:00Z");
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().split("T")[0];
}

export function WorkOrderWeeklySeries({
  source,
  scope,
  actorId,
  onSaving,
}: {
  source: WorkOrderPlanVersion;
  scope: ProjectScope;
  actorId: string;
  onSaving: (saving: boolean) => void;
}) {
  const [firstDate, setFirstDate] = useState("");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(0);
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  const inFlight = useRef(false);
  const create = useServerFn(createProjectWorkOrderWeeklySeries);
  const cache = useQueryClient();
  const { plannedStart, plannedEnd } = source.plan;
  const duration =
    plannedStart && plannedEnd
      ? (Date.parse(plannedEnd) - Date.parse(plannedStart)) / 86_400_000
      : 0;
  const dates =
    plannedStart &&
    CalendarDate.safeParse(firstDate).success &&
    firstDate > (plannedEnd ?? plannedStart) &&
    firstDate <= "9999-10-01"
      ? Array.from({ length: count }, (_, index) => {
          const start = shiftDate(firstDate, index * 7);
          return { start, end: plannedEnd ? shiftDate(firstDate, index * 7 + duration) : null };
        })
      : [];
  const valid = dates.length === count && (dates.at(-1)?.end?.length ?? 10) === 10;

  async function save() {
    if (!valid || inFlight.current || created) return;
    inFlight.current = true;
    setBusy(true);
    onSaving(true);
    setError("");
    try {
      const signature = firstDate + ":" + count;
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const ids = await create({
        data: {
          ...scope,
          sourcePlanVersionId: source.id,
          expectedActorId: actorId,
          firstDate,
          count,
          requestId: attempt.current.id,
        },
      });
      setCreated(ids.length);
      await Promise.all(
        [
          ["field-job-actions", actorId, scope],
          ["field-job-schedule", actorId, scope],
          ["work-order-follow-ups", actorId, scope, source.action_id],
          ["project-workspace"],
          ["actions", scope.projectId],
        ].map((queryKey) => cache.invalidateQueries({ queryKey })),
      );
    } catch {
      setError("Serien kunne ikke bekræftes. Prøv igen med de samme datoer.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      onSaving(false);
    }
  }

  return (
    <details className="rounded-xl border p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Opret ugentlig serie</summary>
      <p className="text-sm text-muted-foreground">
        Opret særskilte arbejdsopgaver med arbejdsgrundlag fra planversion {source.version}. Vælg
        ansvarlig på hver ny opgave.
      </p>
      {created > 0 ? (
        <p role="status">
          {created} arbejdsopgaver er oprettet. Find dem under Opfølgende opgaver eller i Kalender.
        </p>
      ) : (
        <fieldset disabled={busy} className="mt-2 space-y-2">
          <label className="block text-sm">
            Første dato efter kildeplanens periode
            <input
              type="date"
              className="block min-h-11 w-full rounded-xl border bg-background px-3"
              value={firstDate}
              onChange={(event) => setFirstDate(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Antal ugentlige opgaver
            <select
              className="block min-h-11 w-full rounded-xl border bg-background px-3"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {Array.from({ length: 11 }, (_, index) => (
                <option key={index + 2}>{index + 2}</option>
              ))}
            </select>
          </label>
          {firstDate && !valid && (
            <p className="text-sm">Vælg en gyldig dato efter kildeplanens periode.</p>
          )}
          {valid && (
            <ul aria-label="Datoer for nye opgaver" className="list-disc pl-5 text-sm">
              {dates.map(({ start, end }) => (
                <li key={start}>
                  {start}
                  {end && end !== start ? " til " + end : ""}
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            className="min-h-11 rounded-xl border bg-card px-4 text-sm font-medium disabled:opacity-50"
            disabled={!valid}
            onClick={() => void save()}
          >
            {busy ? "Opretter serie…" : "Opret " + count + " opgaver"}
          </button>
        </fieldset>
      )}
    </details>
  );
}
