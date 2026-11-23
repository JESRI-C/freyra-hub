import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import {
  equipmentRentalRateSchema,
  equipmentDailyPriceInput,
  formatEquipmentDailyPrice,
  parseEquipmentDailyPrice,
} from "@/lib/equipment-rental-rate";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

type Props = {
  actorId: string;
  organizationId: string;
  equipmentId: string;
  disabled: boolean;
  onEditing?: (value: boolean) => void;
};
const button = "min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50";
const dateTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });
const saveReceipt = equipmentRentalRateSchema.extend({
  recorded_version: z.number().int().positive(),
});

export function EquipmentRentalRate(props: Props) {
  return (
    <RentalRateEditor
      key={`${props.actorId}:${props.organizationId}:${props.equipmentId}`}
      {...props}
    />
  );
}

function RentalRateEditor({ actorId, organizationId, equipmentId, disabled, onEditing }: Props) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ version: number; text: string; missing: boolean }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const writing = useRef(false);
  const attempt = useRef<{ signature: string; requestId: string } | undefined>(undefined);
  const key = ["equipment-rental-rate", actorId, organizationId, equipmentId];
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  useWorkOrderEditorLock(!!draft || busy, onEditing);
  const rate = useQuery({
    queryKey: key,
    enabled: open,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await db()
        .rpc("read_work_equipment_rental_rate", {
          p_organization_id: organizationId,
          p_equipment_id: equipmentId,
        })
        .abortSignal(signal);
      if (result.error) throw new Error("Dagsprisen kunne ikke hentes.");
      return equipmentRentalRateSchema.parse(result.data);
    },
  });
  async function save() {
    if (!draft || busy || writing.current || disabled || !rate.data?.can_edit) return;
    const minor = draft.missing ? null : parseEquipmentDailyPrice(draft.text);
    if (minor === undefined) {
      setError(
        "Angiv en pris fra 0 til 9.999.999,99 kr. med højst to decimaler og uden tusindtalsseparator.",
      );
      return;
    }
    const signature = JSON.stringify([draft.version, minor]);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, requestId: crypto.randomUUID() };
    writing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await db().rpc("set_work_equipment_rental_rate", {
        p_organization_id: organizationId,
        p_equipment_id: equipmentId,
        p_expected_version: draft.version,
        p_daily_price_minor: minor,
        p_request_id: attempt.current.requestId,
      });
      if (result.error)
        throw new Error(
          ["PT409", "40001"].includes(result.error.code)
            ? "Prisen er ændret siden din rettelse begyndte. Hent den aktuelle pris og begynd igen."
            : result.error.code === "42501"
              ? "Du har ikke adgang til at ændre organisationens dagspriser."
              : "Gemningen kunne ikke bekræftes. Prøv samme ændring igen.",
        );
      const receipt = saveReceipt.parse(result.data);
      if (
        receipt.equipment_id !== equipmentId ||
        receipt.organization_id !== organizationId ||
        receipt.recorded_version !== draft.version + 1 ||
        receipt.version < receipt.recorded_version
      )
        throw new Error("Gemningen kunne ikke bekræftes. Prøv samme ændring igen.");
      cache.setQueryData(key, receipt);
      setDraft(undefined);
      attempt.current = undefined;
      setNotice("Prisændringen er registreret.");
      await cache.invalidateQueries({ queryKey: key });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Dagsprisen kunne ikke gemmes.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (busy || disabled) return;
    const result = await rate.refetch();
    if (result.isSuccess) {
      setDraft(undefined);
      attempt.current = undefined;
      setError("");
      setNotice("");
    }
  }
  return (
    <details
      className="rounded-lg border p-2"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Dagspris på udstyr</summary>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Organisationens aktuelle listepris. Prisen ændrer ikke tidligere udlån eller
            fakturagrundlag.
          </p>
          {rate.isPending && <p role="status">Henter dagspris…</p>}
          {rate.isError && <p role="alert">Dagsprisen kunne ikke hentes.</p>}
          {rate.data && (
            <>
              <p className="font-medium">
                {formatEquipmentDailyPrice(rate.data.daily_price_minor)}
              </p>
              {rate.data.changed_at && (
                <p className="text-xs text-muted-foreground">
                  Version {rate.data.version} · ændret{" "}
                  {dateTime.format(new Date(rate.data.changed_at))}
                </p>
              )}
              {!rate.data.can_edit && (
                <p className="text-sm">
                  Organisationens ejer eller administrator kan ændre dagsprisen.
                </p>
              )}
              {rate.data.can_edit && !draft && (
                <button
                  type="button"
                  className={button}
                  disabled={disabled || busy}
                  onClick={() => {
                    const value = rate.data;
                    if (!value?.can_edit) return;
                    setDraft({
                      version: value.version,
                      text:
                        value.daily_price_minor === null
                          ? ""
                          : equipmentDailyPriceInput(value.daily_price_minor),
                      missing: value.daily_price_minor === null,
                    });
                    setError("");
                    setNotice("");
                    attempt.current = undefined;
                  }}
                >
                  Redigér dagspris
                </button>
              )}
              {draft && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.missing}
                      disabled={disabled || busy}
                      onChange={(event) => setDraft({ ...draft, missing: event.target.checked })}
                    />
                    Ingen dagspris
                  </label>
                  <label className="block">
                    Dagspris i DKK
                    <input
                      className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3 text-base"
                      type="text"
                      inputMode="decimal"
                      maxLength={10}
                      value={draft.text}
                      disabled={disabled || busy || draft.missing}
                      onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={button} disabled={disabled || busy}>
                      {busy ? "Gemmer dagspris…" : "Gem dagspris"}
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={disabled || busy}
                      onClick={() => void reload()}
                    >
                      Hent aktuel pris og luk rettelsen
                    </button>
                  </div>
                </form>
              )}
              {rate.data.history.length > 0 && (
                <section aria-label="Seneste prisændringer" className="space-y-2">
                  <h5 className="font-medium">Seneste {rate.data.history.length} prisændringer</h5>
                  <ul className="space-y-1 text-xs">
                    {rate.data.history.map((row) => (
                      <li key={row.version}>
                        Version {row.version} · {formatEquipmentDailyPrice(row.daily_price_minor)} ·{" "}
                        {dateTime.format(new Date(row.changed_at))}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          {!draft && (
            <button
              type="button"
              className={button}
              disabled={disabled || busy || rate.isFetching}
              onClick={() => void reload()}
            >
              Hent dagspris igen
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
    </details>
  );
}
