import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { shiftProjectWorkOrderSeries } from "@/lib/work-order-plan.functions";
import { scheduleLabel } from "@/lib/work-order-schedule-label";
import type { ProjectScope } from "@/services/project-workspace-service";

type SeriesPlan = {
  actionId: string;
  planVersionId: string;
  start: string;
  end: string | null;
};

export function WorkOrderSeriesShift({
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
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  const cache = useQueryClient();
  const shift = useServerFn(shiftProjectWorkOrderSeries);
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
    if (!basis || !preview?.every((row) => row.valid) || !reason.trim() || disabled || busy.current)
      return;
    busy.current = true;
    onSaving(true);
    setError("");
    try {
      const signature = JSON.stringify([basis, offset, reason.trim()]);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const count = await shift({
        data: {
          ...scope,
          seriesId,
          expectedActorId: actorId,
          days: offset,
          reason: reason.trim(),
          requestId: attempt.current.id,
          expectedPlans: Object.fromEntries(
            basis.map((plan) => [plan.actionId, plan.planVersionId]),
          ),
        },
      });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["field-job-schedule", actorId, scope] }),
        cache.invalidateQueries({ queryKey: ["work-order-plan-history", actorId, scope] }),
      ]);
      setBasis(undefined);
      setMessage(count + " opgaver er flyttet.");
    } catch {
      setError(
        "Flytningen kunne ikke bekræftes. Prøv igen, eller genindlæs og kontrollér ændrede datoer, opgavestatus og reservationer.",
      );
    } finally {
      busy.current = false;
      onSaving(false);
    }
  }

  return (
    <div className="my-2 space-y-2 text-sm">
      {message && <p role="status">{message}</p>}
      {!basis ? (
        <button
          type="button"
          className="min-h-11 rounded-xl border px-3"
          disabled={disabled}
          onClick={() => {
            setBasis(plans);
            setDays("");
            setReason("");
            setError("");
            setMessage("");
          }}
        >
          Flyt hele serien
        </button>
      ) : (
        <fieldset disabled={disabled} className="space-y-2 rounded-xl border p-3">
          <legend className="font-medium">Flyt hele serien</legend>
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
          <label className="block">
            Årsag til flytningen
            <input
              className="block min-h-11 w-full rounded-xl border px-3"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {preview?.every((row) => row.valid) && (
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
              disabled={!preview?.every((row) => row.valid) || !reason.trim()}
              onClick={() => void save()}
            >
              Gem nye datoer
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
