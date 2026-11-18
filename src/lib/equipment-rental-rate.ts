import { z } from "zod";

const amount = z.number().int().min(0).max(999999999).nullable();
const date = z.string().datetime({ offset: true });
export const equipmentRentalRateSchema = z.object({
  equipment_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  daily_price_minor: amount,
  currency: z.literal("DKK"),
  can_edit: z.boolean(),
  changed_at: date.nullable(),
  changed_by: z.string().uuid().nullable(),
  history: z
    .array(
      z.object({
        version: z.number().int().positive(),
        daily_price_minor: amount,
        changed_at: date,
        changed_by: z.string().uuid(),
      }),
    )
    .max(20),
});

/** Parse a DKK catalogue price without floating-point rounding or thousands separators. */
export function parseEquipmentDailyPrice(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,7})(?:[,.](\d{1,2}))?$/);
  if (!match) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
export function equipmentDailyPriceInput(minor: number) {
  return `${Math.floor(minor / 100)},${String(minor % 100).padStart(2, "0")}`;
}
export function formatEquipmentDailyPrice(minor: number | null) {
  return minor === null
    ? "Ingen dagspris angivet"
    : new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(minor / 100) +
        " pr. dag";
}
