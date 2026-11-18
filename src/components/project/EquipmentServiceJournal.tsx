import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { ProjectScope } from "@/services/project-workspace-service";

const kinds = { inspection: "Tilsyn", service: "Service" };
const conditions = {
  ready: "Klar til brug",
  needs_service: "Kræver service",
  out_of_service: "Ude af drift",
};
const journal = z.object({
  can_record: z.boolean(),
  can_schedule: z.boolean(),
  next_service_on: CalendarDate.nullable(),
  days_until_service: z.number().int().nullable(),
  reports: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.enum(["inspection", "service"]),
      condition: z.enum(["ready", "needs_service", "out_of_service"]),
      recorded_at: z.string().datetime({ offset: true }),
      note: z.string(),
      next_service_on: CalendarDate.nullable(),
    }),
  ),
});
const dateTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });
const control = "mt-1 block min-h-11 w-full rounded-lg border bg-background px-2";
const button = "min-h-11 rounded-lg border px-3 disabled:opacity-50";

export function EquipmentServiceJournal({
  bookingId,
  actionId,
  actorId,
  scope,
  disabled = false,
}: {
  bookingId: string;
  actionId: string;
  actorId: string;
  scope: ProjectScope;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const [kind, setKind] = useState<keyof typeof kinds>("inspection");
  const [condition, setCondition] = useState<keyof typeof conditions>("ready");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const writing = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  const cache = useQueryClient();
  const key = ["equipment-service-journal", actorId, scope, actionId, bookingId, limit];
  const client = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const args = {
    p_organization_id: scope.organizationId,
    p_project_id: scope.projectId,
    p_action_id: actionId,
    p_booking_id: bookingId,
    p_limit: limit,
  };
  const history = useQuery({
    queryKey: key,
    enabled: open,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await client().rpc("equipment_service_journal", args).abortSignal(signal);
      if (result.error) throw result.error;
      return journal.parse(result.data);
    },
  });
  const data = history.isSuccess ? history.data : undefined;
  const canSave =
    data?.can_record && !disabled && note.trim() && (!due || CalendarDate.safeParse(due).success);

  async function save() {
    if (!canSave || writing.current) return;
    const draft = {
      p_kind: kind,
      p_condition: condition,
      p_note: note.trim(),
      p_next_service_on: data?.can_schedule && due ? due : null,
    };
    const signature = JSON.stringify(draft);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, id: crypto.randomUUID() };
    writing.current = true;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await client().rpc("equipment_service_journal", {
        ...args,
        ...draft,
        p_report_id: attempt.current.id,
      });
      if (result.error) throw result.error;
      cache.setQueryData(key, journal.parse(result.data));
      void cache.invalidateQueries({ queryKey: ["equipment-service-journal", actorId] });
      void cache.invalidateQueries({ queryKey: ["project-equipment-service-reminders", actorId] });
      attempt.current = undefined;
      setNote("");
      setDue("");
      setSaved(true);
    } catch {
      setError("Rapporten kunne ikke bekræftes. Kontrollér adgangen, og prøv igen.");
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  return (
    <details className="space-y-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        Status og servicejournal
      </summary>
      {open && history.isPending && <p role="status">Henter servicejournal…</p>}
      {open && history.isError && (
        <p role="alert">
          Servicejournalen kunne ikke hentes.
          <button type="button" className={button} onClick={() => void history.refetch()}>
            Prøv igen
          </button>
        </p>
      )}
      {open && data && (
        <>
          <p className="font-medium">
            {data.reports[0]
              ? conditions[data.reports[0].condition]
              : "Status endnu ikke registreret"}
          </p>
          {data.next_service_on && data.days_until_service !== null && (
            <p className={data.days_until_service <= 7 ? "font-semibold" : undefined}>
              {data.days_until_service < 0
                ? "Servicefristen er overskredet"
                : data.days_until_service === 0
                  ? "Service forfalder i dag"
                  : data.days_until_service <= 7
                    ? "Service forfalder snart"
                    : "Næste service"}
              {" · "}
              {data.next_service_on}
            </p>
          )}
          {!!data.reports.length && (
            <ul className="space-y-2">
              {data.reports.map((report) => (
                <li key={report.id} className="rounded-lg border p-2">
                  <p>
                    {kinds[report.kind]} · {conditions[report.condition]} ·{" "}
                    {dateTime.format(new Date(report.recorded_at))}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{report.note}</p>
                  {report.next_service_on && <p>Servicefrist {report.next_service_on}</p>}
                </li>
              ))}
            </ul>
          )}
          {data.reports.length === limit && limit < 200 && (
            <button type="button" className={button} onClick={() => setLimit(limit + 20)}>
              Vis flere rapporter
            </button>
          )}
          {data.can_record && (
            <fieldset
              className="grid gap-2 rounded-lg border p-2 sm:grid-cols-2"
              disabled={disabled || saving}
            >
              <legend className="px-1 font-medium">Registrér rapport</legend>
              <label>
                Type
                <select
                  className={control}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as keyof typeof kinds)}
                >
                  {Object.entries(kinds).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vurdering
                <select
                  className={control}
                  value={condition}
                  onChange={(event) => setCondition(event.target.value as keyof typeof conditions)}
                >
                  {Object.entries(conditions).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                Bemærkning
                <textarea
                  className={control}
                  rows={3}
                  maxLength={2000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              {data.can_schedule && (
                <label>
                  Ny servicefrist (valgfri)
                  <input
                    className={control}
                    type="date"
                    value={due}
                    onChange={(event) => setDue(event.target.value)}
                  />
                </label>
              )}
              <button
                type="button"
                className={button + " sm:col-span-2"}
                disabled={!canSave || saving}
                onClick={() => void save()}
              >
                {saving ? "Gemmer…" : "Gem rapport"}
              </button>
            </fieldset>
          )}
          {saved && <p role="status">Rapporten er gemt.</p>}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </details>
  );
}
