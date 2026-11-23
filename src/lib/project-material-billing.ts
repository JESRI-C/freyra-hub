import { z } from "zod";
import { billingDecimal } from "./work-time-billing";

const id = z.string().uuid();
const integer = z.number().int();
export const materialBillingSchema = z
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
export const materialBillingColumns = [
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

const quantity = new Intl.NumberFormat("da-DK", { useGrouping: false, maximumFractionDigits: 3 });
type MaterialBillingRow = z.infer<typeof materialBillingSchema>[number];

export function materialBillingRefs(rows: MaterialBillingRow[]) {
  return rows.map((row) => [row.material_version_id, row.price_version_id]);
}

export function materialBillingCsvRow(projectId: string, row: MaterialBillingRow) {
  return {
    projekt_id: projectId,
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
  };
}
