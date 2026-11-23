import type {
  ManagerWorkOrder,
  ManagerWorkOrderInput,
  ManagerWorkOrderPage,
} from "@/lib/manager-work-orders";

export const WORK_ORDER_EXPORT_LIMIT = 1_000;
export const WORK_ORDER_EXPORT_LIMIT_MESSAGE =
  "Afgræns udvalget til højst 1.000 arbejdsordrer før eksport.";

export async function readManagerWorkOrderExport(
  load: (input: { data: ManagerWorkOrderInput }) => Promise<ManagerWorkOrderPage>,
  scope: Pick<ManagerWorkOrderInput, "organizationId" | "expectedActorId" | "filters">,
  signal: AbortSignal,
): Promise<ManagerWorkOrder[]> {
  const orders = new Map<string, ManagerWorkOrder>();
  let cursor: string | null = null;
  let selectionToken: string | null = null;
  let matchingJobs = 0;
  do {
    signal.throwIfAborted();
    const page = await load({ data: { ...scope, cursor, selectionToken, pageSize: 50 } });
    signal.throwIfAborted();
    if (selectionToken === null) {
      matchingJobs = page.totals.matchingJobs;
      if (matchingJobs > WORK_ORDER_EXPORT_LIMIT) throw new Error(WORK_ORDER_EXPORT_LIMIT_MESSAGE);
      selectionToken = page.selectionToken;
    }
    if (page.selectionToken !== selectionToken || page.totals.matchingJobs !== matchingJobs) {
      throw new Error("Arbejdsordreudvalget ændrede sig under eksporten. Prøv igen.");
    }
    for (const item of page.items) {
      if (orders.has(item.action_id)) throw new Error("Arbejdsordreudvalget indeholder dubletter.");
      orders.set(item.action_id, item);
    }
    if (
      orders.size > matchingJobs ||
      (page.nextCursor &&
        (page.nextCursor === cursor || !page.items.length || orders.size >= matchingJobs))
    )
      throw new Error("Arbejdsordreudvalget kunne ikke hentes komplet.");
    cursor = page.nextCursor;
  } while (cursor);
  if (orders.size !== matchingJobs)
    throw new Error("Arbejdsordreudvalget kunne ikke hentes komplet.");
  return [...orders.values()];
}
