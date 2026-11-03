import { useRef, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { billingDecimal } from "@/lib/work-time-billing";
import { buildCsv, downloadCsv } from "@/services/export-service";
import type { ProjectScope } from "@/services/project-workspace-service";

const id = z.string().uuid();
const integer = z.number().int();
const schema = z
  .array(
    z.object({
      entry_id: id,
      material_version_id: id,
      material_version: integer.positive(),
      action_id: id,
      title: z.string(),
      actor_id: id,
      catalog_id: id.nullable(),
      material: z.string(),
      unit: z.enum(["stk", "kg", "l", "m", "m2", "m3"]),
      registered_at: z.string().datetime({ offset: true }),
      quantity_milli: integer.min(1).max(999999999),
      price_version_id: id.nullable(),
      price_version: integer.positive().nullable(),
      unit_price_ore: integer.nonnegative().max(99999999).nullable(),
      amount_ore: integer.nonnegative().safe().nullable(),
    }),
  )
  .max(5000);
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const input = "mt-1 block min-h-11 w-full rounded-xl border bg-background px-2 text-base";
const size = 20;
const quantity = new Intl.NumberFormat("da-DK", { useGrouping: false, maximumFractionDigits: 3 });
const registeredDate = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeZone: "Europe/Copenhagen",
});
const unitLabel = { stk: "stk.", kg: "kg", l: "l", m: "m", m2: "m²", m3: "m³" };
const columns = [
  "projekt_id",
  "opgave_id",
  "opgave",
  "materialelinje_id",
  "materialeversion_id",
  "materialeversion",
  "udfoerer_id",
  "katalog_id",
  "materiale",
  "enhed",
  "registreret_tidspunkt",
  "maengde",
  "prisversion_id",
  "prisversion",
  "enhedspris_dkk",
  "beloeb_dkk",
  "prisstatus",
];

export function ProjectMaterialBillingExport({
  scope,
  actorId,
  active,
}: {
  scope: ProjectScope;
  actorId: string;
  active: boolean;
}) {
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [through, setThrough] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [rows, setRows] = useState<z.infer<typeof schema>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const inFlight = useRef(false);
  const unpriced = rows?.filter((row) => row.amount_ore === null).length ?? 0;
  const sum = rows?.reduce((total, row) => total + BigInt(row.amount_ore ?? 0), 0n);
  const total = sum?.toString().padStart(3, "0");

  async function calculate() {
    if (!active || inFlight.current) return;
    setRows(undefined);
    setError("");
    if (
      !CalendarDate.safeParse(from).success ||
      !CalendarDate.safeParse(through).success ||
      from > through ||
      Date.parse(through) - Date.parse(from) >= 31 * 86400000
    ) {
      setError("Vælg en periode på højst 31 dage.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const db = createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
      const result = await db.rpc("get_project_material_billing_export", {
        p_organization_id: scope.organizationId,
        p_project_id: scope.projectId,
        p_from: from,
        p_through: through,
      });
      if (result.error)
        throw new Error(
          result.error.code === "54000"
            ? "Udtrækket har over 5.000 linjer. Vælg en kortere periode."
            : "Materialegrundlaget kunne ikke hentes.",
        );
      const parsed = schema.safeParse(result.data);
      if (!parsed.success) throw new Error("Materialegrundlaget kunne ikke bekræftes.");
      setPage(0);
      setRows(parsed.data);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Materialegrundlaget kunne ikke hentes.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function download() {
    if (!active || !rows?.length) return;
    const csv = buildCsv(
      rows.map((row) => ({
        projekt_id: scope.projectId,
        opgave_id: row.action_id,
        opgave: row.title,
        materialelinje_id: row.entry_id,
        materialeversion_id: row.material_version_id,
        materialeversion: row.material_version,
        udfoerer_id: row.actor_id,
        katalog_id: row.catalog_id,
        materiale: row.material,
        enhed: row.unit,
        registreret_tidspunkt: row.registered_at,
        maengde: quantity.format(row.quantity_milli / 1000),
        prisversion_id: row.price_version_id,
        prisversion: row.price_version,
        enhedspris_dkk: row.unit_price_ore === null ? "" : billingDecimal(row.unit_price_ore),
        beloeb_dkk: row.amount_ore === null ? "" : billingDecimal(row.amount_ore),
        prisstatus: row.amount_ore === null ? "Mangler enhedspris" : "Prissat",
      })),
      columns,
    );
    downloadCsv(csv, `freyra-materialegrundlag-${from}-${through}.csv`);
  }

  return (
    <details className="space-y-3 rounded-xl border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        Faktureringsgrundlag for materialer
      </summary>
      <p>
        Vælg datoerne, hvor materialerne først blev registreret. Freyra bruger den seneste mængde og
        enhedsprisen fra første registrering. Beløb vises uden moms.
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void calculate();
        }}
      >
        <fieldset disabled={busy || !active} className="grid gap-2 sm:grid-cols-2">
          <label>
            Materialer fra dato
            <input
              type="date"
              className={input}
              required
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setRows(undefined);
                setError("");
              }}
            />
          </label>
          <label>
            Materialer til og med
            <input
              type="date"
              className={input}
              required
              value={through}
              onChange={(event) => {
                setThrough(event.target.value);
                setRows(undefined);
                setError("");
              }}
            />
          </label>
        </fieldset>
        <button type="submit" className={button} disabled={busy || !active}>
          {busy ? "Henter…" : "Beregn materialegrundlag"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {rows && !rows.length && (
        <p role="status">Ingen materialelinjer med positiv mængde i perioden.</p>
      )}
      {!!rows?.length && (
        <div className="space-y-3">
          <p role="status">
            {rows.length} materialelinjer · {unpriced} uden enhedspris
          </p>
          {total && rows.length > unpriced && (
            <p className="font-medium">
              Prissatte linjer uden moms · {total.slice(0, -2)},{total.slice(-2)} DKK
            </p>
          )}
          {unpriced > 0 && <p>Linjer uden enhedspris er med i CSV-filen med tomme beløbsfelter.</p>}
          <ul className="divide-y rounded-lg border px-3">
            {rows.slice(page * size, (page + 1) * size).map((row) => (
              <li key={row.entry_id} className="space-y-1 break-words py-2">
                <p className="font-medium">
                  {row.material} · {quantity.format(row.quantity_milli / 1000)}{" "}
                  {unitLabel[row.unit]}
                </p>
                <p>
                  {row.title} · {registeredDate.format(new Date(row.registered_at))} · Mængdeversion{" "}
                  {row.material_version}
                </p>
                <p>
                  {row.amount_ore === null || row.unit_price_ore === null
                    ? "Mangler enhedspris ved registrering"
                    : `${billingDecimal(row.amount_ore)} DKK · ${billingDecimal(row.unit_price_ore)} DKK pr. ${unitLabel[row.unit]} · Prisversion ${row.price_version}`}
                </p>
              </li>
            ))}
          </ul>
          {rows.length > size && (
            <nav
              aria-label="Sider med materialegrundlag"
              className="flex flex-wrap items-center gap-2"
            >
              <button
                type="button"
                className={button}
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Forrige
              </button>
              <span role="status">
                Side {page + 1} af {Math.ceil(rows.length / size)}
              </span>
              <button
                type="button"
                className={button}
                disabled={(page + 1) * size >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Næste
              </button>
            </nav>
          )}
          <button type="button" className={button} disabled={!active} onClick={download}>
            Hent materiale-CSV
          </button>
        </div>
      )}
    </details>
  );
}
