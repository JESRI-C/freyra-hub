import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

const units = ["stk", "kg", "l", "m", "m2", "m3"] as const;
const unitLabel = { stk: "stk.", kg: "kg", l: "l", m: "m", m2: "m²", m3: "m³" };
const table = "work_order_material_versions";
const rowSchema = z.object({
  id: z.string().uuid(),
  entry_id: z.string().uuid(),
  actor_id: z.string().uuid(),
  material: z.string(),
  unit: z.enum(units),
  version: z.number().int().positive(),
  quantity_milli: z.number().int().min(0).max(999999999),
  reason: z.string(),
});
type Row = z.infer<typeof rowSchema>;
const quantityFormat = new Intl.NumberFormat("da-DK", { useGrouping: false });
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 text-base";
const pageSize = 50;
const historyPageSize = 20;
const historyFields = "id,version,quantity_milli,reason,created_at";
const historyRowSchema = rowSchema
  .pick({
    id: true,
    version: true,
    quantity_milli: true,
    reason: true,
  })
  .extend({ created_at: z.string().datetime({ offset: true }) });
const historyDate = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function MaterialHistory({
  row,
  scope,
  actionId,
  actorId,
}: {
  row: Row;
  scope: ProjectScope;
  actionId: string;
  actorId: string;
}) {
  const [open, setOpen] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ["work-order-material-history", actorId, scope, actionId, row.entry_id, row.version],
    enabled: open,
    retry: false,
    initialPageParam: row.version,
    queryFn: async ({ pageParam, signal }) => {
      const client = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const result = await client
        .from(table)
        .select(historyFields)
        .eq("organization_id", scope.organizationId)
        .eq("project_id", scope.projectId)
        .eq("action_id", actionId)
        .eq("entry_id", row.entry_id)
        .lt("version", pageParam)
        .order("version", { ascending: false })
        .limit(historyPageSize)
        .abortSignal(signal);
      if (result.error) throw new Error("Tidligere versioner kunne ikke hentes.");
      return z.array(historyRowSchema).max(historyPageSize).parse(result.data);
    },
    getNextPageParam: (lastPage) => {
      const lastVersion = lastPage.at(-1)?.version;
      return lastPage.length === historyPageSize && lastVersion !== 1 ? lastVersion : undefined;
    },
  });

  return (
    <details className="mt-2 border-t" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-3 font-medium">
        Tidligere versioner ({row.version - 1})
      </summary>
      {open && history.isPending && <p role="status">Henter tidligere versioner…</p>}
      {open && history.isError && <p role="alert">Tidligere versioner kunne ikke hentes.</p>}
      {history.data && (
        <ol className="space-y-2">
          {history.data.pages.flat().map((item) => (
            <li key={item.id} className="rounded-lg bg-muted/40 p-2">
              <p className="font-medium">
                Version {item.version} · {quantityFormat.format(item.quantity_milli / 1000)}{" "}
                {unitLabel[row.unit]}
              </p>
              <time dateTime={item.created_at}>
                {historyDate.format(new Date(item.created_at))}
              </time>
              {item.reason && <p>{item.reason}</p>}
            </li>
          ))}
        </ol>
      )}
      {open && (history.hasNextPage || history.isError) && (
        <button
          type="button"
          className={button + " mt-2"}
          disabled={history.isFetching}
          onClick={() => {
            if (history.hasNextPage) void history.fetchNextPage();
            else void history.refetch();
          }}
        >
          {history.isError ? "Prøv igen" : "Vis ældre versioner"}
        </button>
      )}
    </details>
  );
}

export function WorkOrderMaterials({
  scope,
  actionId,
  actorId,
  canWrite = false,
  onEditing,
}: {
  scope: ProjectScope;
  actionId: string;
  actorId: string;
  canWrite?: boolean;
  onEditing?: (editing: boolean) => void;
}) {
  const [draft, setDraft] = useState<{
    material: string;
    unit: Row["unit"];
    quantity: string;
    reason: string;
    base?: Row;
  }>();
  const [cursor, setCursor] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  useWorkOrderEditorLock(!!draft || busy, onEditing);
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const key = ["work-order-materials", actorId, scope, actionId];
  const rows = useQuery({
    queryKey: [...key, cursor.at(-1)],
    retry: false,
    queryFn: async () => {
      const result = await db().rpc("list_work_order_material_usage", {
        p_organization_id: scope.organizationId,
        p_project_id: scope.projectId,
        p_action_id: actionId,
        p_after_entry_id: cursor.at(-1) ?? null,
      });
      if (result.error) throw new Error("Materialerne kunne ikke hentes.");
      return z.array(rowSchema).max(pageSize).parse(result.data);
    },
  });

  async function save() {
    if (!canWrite || !draft || inFlight.current) return;
    const material = draft.material.trim();
    const reason = draft.reason.trim();
    const quantity = draft.quantity.trim();
    const quantityMilli = Math.round(Number(quantity.replace(",", ".")) * 1000);
    if (
      !material ||
      !/^\d{1,6}(?:[,.]\d{1,3})?$/.test(quantity) ||
      (!draft.base && !quantityMilli)
    ) {
      setError("Angiv et materiale og en gyldig mængde med højst tre decimaler.");
      return;
    }
    if (draft.base && !reason) {
      setError("Angiv en årsag til rettelsen.");
      return;
    }
    const signature = JSON.stringify([draft.base?.id, material, draft.unit, quantityMilli, reason]);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, id: crypto.randomUUID() };
    const id = attempt.current.id;
    const payload = {
      id,
      entry_id: draft.base?.entry_id ?? id,
      action_id: actionId,
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      material,
      unit: draft.unit,
      quantity_milli: quantityMilli,
      version: (draft.base?.version ?? 0) + 1,
      reason,
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const client = db();
      const result = await client.from(table).insert(payload).select().single();
      const recovered = result.error
        ? await client.from(table).select().match(payload).eq("actor_id", actorId).maybeSingle()
        : result;
      const receipt = rowSchema.safeParse(recovered.data);
      if (!receipt.success || receipt.data.id !== id || receipt.data.actor_id !== actorId)
        throw new Error(
          result.error?.code === "40001" || result.error?.code === "23505"
            ? "Registreringen er ændret. Fortryd og hent den nyeste version."
            : "Registreringen kunne ikke bekræftes. Prøv igen.",
        );
      setDraft(undefined);
      attempt.current = null;
      setMessage("Materialeforbrug gemt.");
      await rows.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Materialet kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Materialeforbrug"
      className="min-w-0 space-y-3 rounded-xl border bg-card p-3 text-sm"
    >
      <h3 className="font-semibold">Materialeforbrug</h3>
      <p>
        Se det registrerede forbrug på opgaven. Mængder kan rettes med en årsag og gemmes som en ny
        version.
      </p>
      {rows.isPending && <p role="status">Henter materialer…</p>}
      {rows.isError && (
        <button
          type="button"
          className={button}
          disabled={!!draft || busy}
          onClick={() => void rows.refetch()}
        >
          Prøv at hente materialer igen
        </button>
      )}
      {rows.isSuccess && !rows.data.length && (
        <p>
          {cursor.length
            ? "Ingen flere registreringer."
            : "Der er endnu ingen registrerede materialer."}
        </p>
      )}
      {rows.data && (
        <ul className="space-y-2">
          {rows.data.map((row) => (
            <li key={row.entry_id} className="break-words rounded-lg border p-3">
              <p className="font-medium">{row.material}</p>
              <p>
                {quantityFormat.format(row.quantity_milli / 1000)} {unitLabel[row.unit]} · Version{" "}
                {row.version}
              </p>
              {row.reason && <p>Årsag til rettelse · {row.reason}</p>}
              {row.version > 1 && (
                <MaterialHistory row={row} scope={scope} actionId={actionId} actorId={actorId} />
              )}
              {canWrite && row.actor_id === actorId && (
                <button
                  type="button"
                  className={button + " mt-2"}
                  disabled={!!draft || busy}
                  onClick={() => {
                    setError("");
                    setMessage("");
                    setDraft({
                      material: row.material,
                      unit: row.unit,
                      quantity: quantityFormat.format(row.quantity_milli / 1000),
                      reason: "",
                      base: row,
                    });
                  }}
                >
                  Ret mængde
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(cursor.length > 0 || rows.data?.length === pageSize) && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={!cursor.length || !!draft || busy}
            onClick={() => setCursor(cursor.slice(0, -1))}
          >
            Forrige side
          </button>
          <button
            type="button"
            className={button}
            disabled={rows.data?.length !== pageSize || !!draft || busy}
            onClick={() => {
              const last = rows.data?.at(-1);
              if (last) setCursor([...cursor, last.entry_id]);
            }}
          >
            Næste side
          </button>
        </div>
      )}
      {canWrite && !draft && (
        <button
          type="button"
          className={button}
          disabled={busy || !rows.isSuccess}
          onClick={() => {
            setError("");
            setMessage("");
            setDraft({ material: "", unit: "stk", quantity: "", reason: "" });
          }}
        >
          Registrér materiale
        </button>
      )}
      {canWrite && draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="min-w-0 space-y-2" disabled={busy}>
            <label className="block">
              Materiale
              <input
                className={control}
                required
                maxLength={120}
                value={draft.material}
                readOnly={!!draft.base}
                onChange={(event) => setDraft({ ...draft, material: event.target.value })}
              />
            </label>
            <label className="block">
              Enhed
              <select
                className={control}
                value={draft.unit}
                disabled={!!draft.base}
                onChange={(event) =>
                  setDraft({ ...draft, unit: z.enum(units).parse(event.target.value) })
                }
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unitLabel[unit]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Mængde
              <input
                className={control}
                required
                inputMode="decimal"
                maxLength={10}
                value={draft.quantity}
                onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
              />
            </label>
            {draft.base && (
              <label className="block">
                Årsag til rettelse
                <input
                  className={control}
                  required
                  maxLength={1000}
                  value={draft.reason}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={button + " bg-primary text-primary-foreground"}>
                {busy ? "Gemmer…" : "Gem materiale"}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => {
                  attempt.current = null;
                  setDraft(undefined);
                  setError("");
                  void rows.refetch();
                }}
              >
                Fortryd
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
