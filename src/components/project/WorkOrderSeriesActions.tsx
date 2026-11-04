import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelProjectWorkOrderSeries,
  shiftProjectWorkOrderSeries,
} from "@/lib/work-order-plan.functions";
import { scheduleLabel } from "@/lib/work-order-schedule-label";
import type { ProjectScope } from "@/services/project-workspace-service";

type SeriesPlan = {
  actionId: string;
  planVersionId: string;
  start: string;
  end: string | null;
  cancelled: boolean;
};

export function WorkOrderSeriesActions({
  actorId,
  scope,
  seriesId,
  plans,
  disabled,
  onSaving,
}: {
  actorId: string;
  scope: ProjectScope;
  seriesId: string;
  plans: SeriesPlan[];
  disabled: boolean;
  onSaving: (saving: boolean) => void;
}) {
  const [basis, setBasis] = useState<SeriesPlan[]>();
  const [cancelling, setCancelling] = useState(false);
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  const cache = useQueryClient();
  const shift = useServerFn(shiftProjectWorkOrderSeries);
  const cancel = useServerFn(cancelProjectWorkOrderSeries);
  const offset = Number(days);
  const validOffset = Number.isInteger(offset) && offset !== 0 && Math.abs(offset) <= 3660;

  function moved(value: string) {
    const date = new Date(value + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999
      ? date.toISOString().slice(0, 10)
      : null;
  }

  const preview = validOffset
    ? basis?.map(({ start, end }) => ({
        start: moved(start),
        end: end ? moved(end) : null,
        valid: Boolean(moved(start) && (!end || moved(end))),
      }))
    : undefined;

  async function save() {
    if (
      !basis ||
      (!cancelling && !preview?.every((row) => row.valid)) ||
      !reason.trim() ||
      disabled ||
      busy.current
    )
      return;
    busy.current = true;
    onSaving(true);
    setError("");
    try {
      const signature = JSON.stringify([basis, cancelling ? "cancel" : offset, reason.trim()]);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const data = {
        ...scope,
        seriesId,
        expectedActorId: actorId,
        reason: reason.trim(),
        requestId: attempt.current.id,
        expectedPlans: Object.fromEntries(basis.map((plan) => [plan.actionId, plan.planVersionId])),
      };
      const count = cancelling
        ? await cancel({ data })
        : await shift({ data: { ...data, days: offset } });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["field-job-schedule", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["field-job-actions", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-plan-history", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["work-order-lifecycle", actorId] }),
        cache.invalidateQueries({ queryKey: ["work-order-log", actorId] }),
        cache.invalidateQueries({ queryKey: ["my-work-orders", actorId] }),
      ]);
      setBasis(undefined);
      setMessage(count + (cancelling ? " opgaver er aflyst." : " opgaver er flyttet."));
    } catch {
      setError(
        (cancelling ? "Aflysningen" : "Flytningen") +
          " kunne ikke bekræftes. Prøv igen, eller genindlæs og kontrollér ændrede datoer, opgavestatus og reservationer.",
      );
    } finally {
      busy.current = false;
      onSaving(false);
    }
  }

  function begin(cancelSeries: boolean) {
    setBasis(plans);
    setCancelling(cancelSeries);
    setDays("");
    setReason("");
    setError("");
    setMessage("");
  }
  return (
    <div className="my-2 space-y-2 text-sm">
      {message && <p role="status">{message}</p>}
      {!basis ? (
        <div className="flex flex-wrap gap-2">
          {plans.every((plan) => !plan.cancelled) && (
            <button
              type="button"
              className="min-h-11 rounded-xl border px-3"
              disabled={disabled}
              onClick={() => begin(false)}
            >
              Flyt hele serien
            </button>
          )}
          {plans.some((plan) => !plan.cancelled) && (
            <button
              type="button"
              className="min-h-11 rounded-xl border px-3"
              disabled={disabled}
              onClick={() => begin(true)}
            >
              Aflys hele serien
            </button>
          )}
        </div>
      ) : (
        <fieldset disabled={disabled} className="space-y-2 rounded-xl border p-3">
          <legend className="font-medium">
            {cancelling ? "Aflys hele serien" : "Flyt hele serien"}
          </legend>
          {!cancelling && (
            <>
              <label className="block">
                Antal kalenderdage
                <input
                  className="block min-h-11 w-full rounded-xl border px-3"
                  type="number"
                  min={-3660}
                  max={3660}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
              </label>
              <p className="text-muted-foreground">
                Brug et negativt tal for at flytte opgaverne til en tidligere dato.
              </p>
            </>
          )}
          <label className="block">
            {cancelling ? "Årsag til aflysningen" : "Årsag til flytningen"}
            <input
              className="block min-h-11 w-full rounded-xl border px-3"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {cancelling && (
            <p>{basis.length} opgaver får status Aflyst. Datoer og historik bevares.</p>
          )}
          {!cancelling && preview?.every((row) => row.valid) && (
            <ol aria-label="Nye datoer for serien" className="list-decimal pl-5">
              {preview.map((row, index) => (
                <li key={basis[index].actionId}>{scheduleLabel(row)}</li>
              ))}
            </ol>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl border px-3 disabled:opacity-50"
              disabled={(!cancelling && !preview?.every((row) => row.valid)) || !reason.trim()}
              onClick={() => void save()}
            >
              {cancelling ? "Bekræft aflysning" : "Gem nye datoer"}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl border px-3"
              onClick={() => setBasis(undefined)}
            >
              Fortryd
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
