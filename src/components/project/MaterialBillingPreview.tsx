import { useState } from "react";
import type { z } from "zod";
import type { materialBillingSchema } from "@/lib/project-material-billing";
import { billingDecimal } from "@/lib/work-time-billing";

const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const size = 20;
const quantity = new Intl.NumberFormat("da-DK", { useGrouping: false, maximumFractionDigits: 3 });
const registeredDate = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeZone: "Europe/Copenhagen",
});
const unitLabel = { stk: "stk.", kg: "kg", l: "l", m: "m", m2: "m²", m3: "m³" };
export function MaterialBillingPreview({ rows }: { rows: z.infer<typeof materialBillingSchema> }) {
  const [requestedPage, setPage] = useState(0);
  const unpriced = rows?.filter((row) => row.amount_ore === null).length ?? 0;
  const sum = rows?.reduce((total, row) => total + BigInt(row.amount_ore ?? 0), 0n);
  const total = sum?.toString().padStart(3, "0");

  const page = Math.min(requestedPage, Math.max(0, Math.ceil(rows.length / size) - 1));
  return (
    <>
      {!rows.length && <p role="status">Ingen materialelinjer med positiv mængde i perioden.</p>}
      {!!rows.length && (
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
        </div>
      )}
    </>
  );
}
