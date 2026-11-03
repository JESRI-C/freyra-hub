import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { workOrderSeriesDates, type RecurrenceInterval } from "@/lib/work-order-recurrence";
import { scheduleLabel } from "@/lib/work-order-schedule-label";
import { createProjectWorkOrderSeries } from "@/lib/work-order-plan.functions";
import type { WorkOrderPlanVersion } from "@/lib/work-order-plan";
import type { ProjectScope } from "@/services/project-workspace-service";

export function WorkOrderSeries({
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
  const [interval, setInterval] = useState<RecurrenceInterval>("weekly");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(0);
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  const inFlight = useRef(false);
  const create = useServerFn(createProjectWorkOrderSeries);
  const cache = useQueryClient();
  const { plannedStart, plannedEnd } = source.plan;
  const dates = plannedStart
    ? workOrderSeriesDates(firstDate, count, interval, plannedStart, plannedEnd)
    : [];
  const valid = dates.length === count;

  async function save() {
    if (!valid || inFlight.current || created) return;
    inFlight.current = true;
    setBusy(true);
    onSaving(true);
    setError("");
    try {
      const signature = firstDate + ":" + count + ":" + interval;
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const ids = await create({
        data: {
          ...scope,
          sourcePlanVersionId: source.id,
          expectedActorId: actorId,
          firstDate,
          interval,
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
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Opret gentagne opgaver</summary>
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
            Gentagelse
            <select
              className="block min-h-11 w-full rounded-xl border bg-background px-3"
              value={interval}
              onChange={(event) => setInterval(event.target.value as RecurrenceInterval)}
            >
              <option value="daily">Hver dag</option>
              <option value="weekly">Hver uge</option>
              <option value="fortnightly">Hver anden uge</option>
              <option value="monthly">Hver måned</option>
            </select>
          </label>
          {interval === "monthly" && (
            <p className="text-sm text-muted-foreground">
              Hvis måneden er kortere, bruges månedens sidste dag.
            </p>
          )}
          <label className="block text-sm">
            Antal opgaver
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
              {dates.map((plan) => (
                <li key={plan.start}>{scheduleLabel(plan)}</li>
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
