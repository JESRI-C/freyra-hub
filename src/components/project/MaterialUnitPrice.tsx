import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { billingDecimal, parseHourlyRateOre } from "@/lib/work-time-billing";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

const table = "project_material_unit_prices";
const fields = "id,version,unit_price_ore,created_at";
const priceSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  unit_price_ore: z.number().int().nonnegative().max(99999999).nullable(),
  created_at: z.string().datetime({ offset: true }),
});
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";

export function MaterialUnitPrice({
  scope,
  actorId,
  catalogId,
  unitLabel,
  disabled,
  onEditing,
}: {
  scope: ProjectScope;
  actorId: string;
  catalogId: string;
  unitLabel: string;
  disabled: boolean;
  onEditing: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState<{ text: string; base: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef<{ id: string; ore: number | null; version: number } | undefined>(
    undefined,
  );
  useWorkOrderEditorLock(!!draft || busy, onEditing);
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const scoped = () =>
    db()
      .from(table)
      .select(fields)
      .eq("organization_id", scope.organizationId)
      .eq("project_id", scope.projectId)
      .eq("catalog_id", catalogId);
  const prices = useQuery({
    queryKey: ["material-unit-prices", actorId, scope, catalogId],
    retry: false,
    queryFn: async () => {
      const result = await scoped().order("version", { ascending: false }).limit(21);
      if (result.error) throw new Error("Enhedsprisen kunne ikke hentes.");
      return z.array(priceSchema).parse(result.data);
    },
  });
  const latest = prices.data?.[0];
  const display = (ore: number | null | undefined) =>
    ore == null ? "Ingen enhedspris" : billingDecimal(ore) + " DKK pr. " + unitLabel;

  async function save() {
    if (disabled || !draft || inFlight.current) return;
    const ore = parseHourlyRateOre(draft.text);
    if (ore === null && (draft.text.trim() || !draft.base)) {
      setError("Angiv en pris med højst seks cifre og to decimaler.");
      return;
    }
    const version = draft.base + 1;
    if (attempt.current?.version !== version || attempt.current.ore !== ore)
      attempt.current = { id: crypto.randomUUID(), ore, version };
    const id = attempt.current.id;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await db()
        .from(table)
        .insert({
          id,
          version,
          unit_price_ore: ore,
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          catalog_id: catalogId,
        })
        .select(fields)
        .single();
      const recovered = result.error ? await scoped().eq("id", id).maybeSingle() : result;
      const receipt = priceSchema.safeParse(recovered.data);
      if (
        !receipt.success ||
        receipt.data.id !== id ||
        receipt.data.version !== version ||
        receipt.data.unit_price_ore !== ore
      )
        throw new Error(
          result.error?.code === "40001" || result.error?.code === "23505"
            ? "Prisen er ændret. Fortryd for at hente den nyeste version."
            : "Prisen kunne ikke bekræftes. Prøv igen.",
        );
      attempt.current = undefined;
      setDraft(undefined);
      setMessage(ore === null ? "Enhedsprisen er fjernet." : "Enhedsprisen er gemt.");
      await prices.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Prisen kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Materialets enhedspris"
      className="w-full min-w-0 space-y-2 rounded-lg bg-muted/40 p-3"
    >
      <h4 className="font-semibold">Enhedspris uden moms</h4>
      {prices.isPending && <p role="status">Henter enhedspris…</p>}
      {prices.isError && (
        <button type="button" className={button} onClick={() => void prices.refetch()}>
          Hent enhedspris igen
        </button>
      )}
      {prices.isSuccess && (
        <p>
          {display(latest?.unit_price_ore)}
          {latest && " · Version " + latest.version}
        </p>
      )}
      {!draft && prices.isSuccess && (
        <button
          type="button"
          className={button}
          disabled={busy || disabled}
          onClick={() => {
            setError("");
            setMessage("");
            setDraft({
              text: latest?.unit_price_ore == null ? "" : billingDecimal(latest.unit_price_ore),
              base: latest?.version ?? 0,
            });
          }}
        >
          {latest?.unit_price_ore == null ? "Angiv enhedspris" : "Ret enhedspris"}
        </button>
      )}
      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || disabled} className="space-y-2">
            <label className="block">
              Pris i DKK pr. {unitLabel}
              <input
                className="mt-1 block min-h-11 w-full rounded-xl border bg-background px-3 text-base"
                inputMode="decimal"
                maxLength={9}
                value={draft.text}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              />
            </label>
            {!!draft.base && <p>Gem et tomt felt for at fjerne den aktuelle pris.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={button}>
                {busy ? "Gemmer…" : "Gem enhedspris"}
              </button>
              <button
                type="button"
                className={button}
                onClick={() => {
                  attempt.current = undefined;
                  setDraft(undefined);
                  setError("");
                  void prices.refetch();
                }}
              >
                Fortryd prisændring
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {prices.data && prices.data.length > 1 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3">Seneste tidligere priser</summary>
          <ol className="space-y-1">
            {prices.data.slice(1).map((price) => (
              <li key={price.id}>
                Version {price.version} · {display(price.unit_price_ore)}
              </li>
            ))}
          </ol>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
