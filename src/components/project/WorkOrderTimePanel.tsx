import { useRef, useState } from "react";
import { workOrderUsageConflict } from "@/lib/work-order-usage-conflict";
import {
  clearPendingUsage,
  pendingUsageKey,
  readPendingUsage,
  storePendingUsage,
  usageAttempt,
} from "@/lib/work-order-pending-usage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

const table = "work_order_time_versions";
const fields = "id,version,minutes,reason";
const rowSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  minutes: z.number().int().min(0).max(1440),
  reason: z.string(),
  work_order_time_approvals: z.object({ time_id: z.string().uuid() }).nullable().optional(),
});
const pendingTime = usageAttempt.extend({
  date: CalendarDate,
  minutes: rowSchema.shape.minutes,
  reason: z.string().max(1000),
  base: z.number().int().nonnegative(),
});
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 text-base";

export function WorkOrderTimePanel({
  scope,
  actorId,
  actionId,
  canWrite,
  onEditing,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  canWrite: boolean;
  onEditing: (editing: boolean) => void;
}) {
  const cache = useQueryClient();
  const pendingKey = pendingUsageKey("time", { ...scope, actorId, actionId });
  const [pending, setPending] = useState(() =>
    canWrite ? readPendingUsage(pendingKey, pendingTime) : undefined,
  );
  const [date, setDate] = useState(() => pending?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [draft, setDraft] = useState<{ minutes: string; reason: string; base: number } | undefined>(
    () =>
      pending
        ? { minutes: String(pending.minutes), reason: pending.reason, base: pending.base }
        : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  useWorkOrderEditorLock(!!draft || busy, onEditing);
  const key = ["work-order-time", actorId, scope, actionId, date];
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const scoped = () =>
    db()
      .from(table)
      .select(fields + ",work_order_time_approvals(time_id)")
      .eq("organization_id", scope.organizationId)
      .eq("project_id", scope.projectId)
      .eq("action_id", actionId)
      .eq("actor_id", actorId)
      .eq("work_date", date);
  const time = useQuery({
    queryKey: key,
    enabled: CalendarDate.safeParse(date).success,
    retry: false,
    queryFn: async () => {
      const result = await scoped().order("version", { ascending: false }).limit(21);
      if (result.error) throw new Error("Timerne kunne ikke hentes.");
      return z.array(rowSchema).parse(result.data);
    },
  });
  const latest = time.data?.[0];

  async function save() {
    if (!canWrite || !draft || inFlight.current || (!pending && !time.isSuccess)) return;
    const minutes = Number(draft.minutes);
    const reason = draft.reason.trim();
    if (!/^\d{1,4}$/.test(draft.minutes) || minutes > 1440 || (!draft.base && minutes === 0)) {
      setError(
        draft.base ? "Angiv 0 til 1.440 hele minutter." : "Angiv 1 til 1.440 hele minutter.",
      );
      return;
    }
    if (draft.base && !reason) {
      setError("Angiv en årsag til rettelsen.");
      return;
    }
    const attempt = pending ?? { id: crypto.randomUUID(), date, minutes, reason, base: draft.base };
    const id = attempt.id;
    const version = attempt.base + 1;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      storePendingUsage(pendingKey, pendingTime, attempt);
      setPending(attempt);
      const result = await db()
        .from(table)
        .insert({
          id,
          version,
          minutes: attempt.minutes,
          reason: attempt.reason,
          action_id: actionId,
          project_id: scope.projectId,
          organization_id: scope.organizationId,
          work_date: attempt.date,
        })
        .select(fields)
        .single();
      const recovered = result.error ? await scoped().eq("id", id).maybeSingle() : result;
      const row = rowSchema.safeParse(recovered.data);
      if (
        !row.success ||
        row.data.id !== id ||
        row.data.version !== version ||
        row.data.minutes !== attempt.minutes ||
        row.data.reason !== attempt.reason
      ) {
        const conflict =
          !recovered.error && !recovered.data && workOrderUsageConflict(result.error);
        if (conflict) {
          clearPendingUsage(pendingKey, id);
          setPending(undefined);
        }
        if (conflict === "cancelled")
          throw new Error("Opgaven er aflyst. Du kan stadig se tidligere timer.");
        if (conflict === "changed")
          throw new Error(
            "Tiden er ændret. Fortryd, og hent den nyeste registrering før en rettelse.",
          );
        throw new Error("Registreringen kunne ikke bekræftes. Prøv igen.");
      }
      cache.setQueryData<z.infer<typeof rowSchema>[]>(key, (old) =>
        [row.data, ...(old ?? []).filter((item) => item.id !== id)].slice(0, 21),
      );
      void cache.invalidateQueries({ queryKey: key });
      void cache.invalidateQueries({
        queryKey: ["work-order-time-summary", actorId, scope, actionId],
      });
      void cache.invalidateQueries({ queryKey: ["project-work-time", actorId, scope] });
      clearPendingUsage(pendingKey, id);
      setPending(undefined);
      setDraft(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Tiden kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Mine registrerede timer"
      className="space-y-3 rounded-xl border bg-card p-3 text-sm"
    >
      <h3 className="font-semibold">Min tid på opgaven</h3>
      <p>
        Angiv dagens samlede arbejdstid på denne opgave. En rettelse bliver gemt som en ny version.
      </p>
      <label className="block">
        Dato for arbejdet
        <input
          type="date"
          className={control}
          value={date}
          disabled={!!draft || busy}
          onChange={(event) => {
            setDate(event.target.value);
            setError("");
          }}
        />
      </label>
      {time.isPending && date && <p role="status">Henter registreret tid…</p>}
      {time.isError && (
        <button type="button" className={button} onClick={() => void time.refetch()}>
          Hent timer igen
        </button>
      )}
      {time.isSuccess && (
        <p role="status">
          {latest
            ? `${latest.minutes} min. · Version ${latest.version}`
            : "Ingen tid registreret på datoen."}
        </p>
      )}
      {time.isSuccess && latest && (
        <p>{latest.work_order_time_approvals ? "Godkendt" : "Afventer godkendelse"}</p>
      )}
      {!draft && canWrite && time.isSuccess && (
        <button
          type="button"
          className={button}
          onClick={() => {
            setDraft({
              minutes: latest?.minutes.toString() ?? "",
              reason: "",
              base: latest?.version ?? 0,
            });
          }}
        >
          {latest ? "Ret registreret tid" : "Registrér tid"}
        </button>
      )}
      {draft && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="space-y-2" disabled={busy || !canWrite}>
            <label className="block">
              Arbejdstid i minutter
              <input
                className={control}
                inputMode="numeric"
                required
                readOnly={!!pending}
                maxLength={4}
                value={draft.minutes}
                onChange={(event) => setDraft({ ...draft, minutes: event.target.value })}
              />
            </label>
            {!!draft.base && (
              <label className="block">
                Årsag til rettelse
                <textarea
                  className={control}
                  required
                  readOnly={!!pending}
                  maxLength={1000}
                  value={draft.reason}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                />
              </label>
            )}
            <button type="submit" className={button + " bg-primary text-primary-foreground"}>
              {busy ? "Gemmer…" : "Gem tid"}
            </button>
          </fieldset>
          <button
            type="button"
            className={button}
            disabled={busy || !!pending}
            onClick={() => {
              setDraft(undefined);
              setError("");
              void time.refetch();
            }}
          >
            Fortryd
          </button>
        </form>
      )}
      {pending && !busy && (
        <p role="status">
          Registreringen er gemt på denne enhed. Tryk Gem tid for at bekræfte den.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {time.isSuccess && time.data.length > 1 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2">Tidligere versioner</summary>
          <ul className="space-y-2">
            {time.data.slice(1).map((row) => (
              <li key={row.id}>
                Version {row.version} · {row.minutes} min.
                {row.work_order_time_approvals && <p>Godkendt</p>}
                {row.reason && <p>{row.reason}</p>}
              </li>
            ))}
          </ul>
          {time.data.length === 21 && <p>Viser op til 20 tidligere versioner for datoen.</p>}
        </details>
      )}
    </section>
  );
}
