import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { formatWorkOrderHours } from "@/lib/work-order-plan";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

const table = "project_work_availability_versions";
const receipt = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  hours: z.number().min(0).max(24),
});
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

export function ProjectWorkAvailability({
  scope,
  actorId,
  personId,
  date,
  estimated,
  unknown,
  onEditing,
}: {
  scope: ProjectScope;
  actorId: string;
  personId: string;
  date: string;
  estimated: number;
  unknown: number;
  onEditing: (editing: boolean) => void;
}) {
  const cache = useQueryClient();
  const key = ["project-work-availability", actorId, scope, personId, date];
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const scoped = () =>
    db()
      .from(table)
      .select("id,version,hours")
      .eq("organization_id", scope.organizationId)
      .eq("project_id", scope.projectId)
      .eq("person_id", personId)
      .eq("work_date", date);
  const current = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await scoped().order("version", { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw new Error("Tilgængeligheden kunne ikke hentes.");
      return receipt.nullable().parse(result.data);
    },
    retry: false,
  });
  const [draft, setDraft] = useState<{ value: string; base: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef<{ id: string; hours: number } | undefined>(undefined);
  useWorkOrderEditorLock(!!draft || busy, onEditing);
  const input = useRef<HTMLInputElement>(null);
  const editing = !!draft;
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  async function save() {
    if (!draft || inFlight.current || !current.isSuccess) return;
    const raw = draft.value.trim();
    const hours = Number(raw.replace(",", "."));
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw) || hours > 24) {
      setError("Angiv mellem 0 og 24 timer med højst to decimaler.");
      return;
    }
    if (attempt.current?.hours !== hours) attempt.current = { id: crypto.randomUUID(), hours };
    const id = attempt.current.id;
    const version = draft.base + 1;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await db()
        .from(table)
        .insert({
          id,
          hours,
          version,
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          person_id: personId,
          work_date: date,
        })
        .select("id,version,hours")
        .single();
      const recovered = result.error ? await scoped().eq("id", id).maybeSingle() : result;
      const row = receipt.safeParse(recovered.data);
      if (
        !row.success ||
        row.data.id !== id ||
        row.data.version !== version ||
        row.data.hours !== hours
      ) {
        if (result.error?.code === "40001" || result.error?.code === "23505")
          throw new Error(
            "Timerne er ændret. Fortryd, og hent den seneste version før en ny ændring.",
          );
        throw new Error("Timerne kunne ikke bekræftes. Prøv igen.");
      }
      cache.setQueryData(key, row.data);
      void cache.invalidateQueries({ queryKey: key });
      setDraft(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Timerne kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const available = current.data?.hours;
  return (
    <section
      aria-label="Tilgængelig tid"
      className="space-y-2 rounded-xl border bg-card p-3 text-sm"
    >
      <h4 className="font-semibold">Tilgængelig tid på projektet</h4>
      {current.isPending && <p role="status">Henter tilgængelig tid…</p>}
      {current.isError && (
        <button type="button" className={button} onClick={() => void current.refetch()}>
          Hent tilgængelig tid igen
        </button>
      )}
      {current.isSuccess && (
        <p>
          {available == null
            ? "Ingen timer angivet"
            : formatWorkOrderHours(available) + " til rådighed"}
          {" · "}
          {formatWorkOrderHours(estimated)} estimeret
          {unknown > 0 && ` · ${unknown} uden estimat`}
        </p>
      )}
      {available != null && (estimated > available || unknown === 0) && (
        <p className="font-medium">
          {estimated > available
            ? formatWorkOrderHours(estimated - available) + " over de tilgængelige timer"
            : formatWorkOrderHours(available - estimated) + " ledig estimeret tid"}
        </p>
      )}
      {current.isSuccess && !draft && (
        <button
          type="button"
          className={button}
          onClick={() => {
            attempt.current = undefined;
            setDraft({
              value: available?.toString().replace(".", ",") ?? "",
              base: current.data?.version ?? 0,
            });
          }}
        >
          Angiv tilgængelige timer
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
          <label className="block">
            Tilgængelige timer på datoen
            <input
              ref={input}
              value={draft.value}
              inputMode="decimal"
              required
              maxLength={5}
              className="mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 text-base"
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className={button + " bg-primary text-primary-foreground"}
              disabled={busy}
            >
              {busy ? "Gemmer…" : "Gem timer"}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => {
                setDraft(undefined);
                setError("");
                void current.refetch();
              }}
            >
              Fortryd
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
