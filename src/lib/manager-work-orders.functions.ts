import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listManagedWorkOrders } from "@/services/manager-work-orders-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";
import { parseWorkOrderInput } from "./work-order-access";
import { ManagerWorkOrderInputSchema } from "./manager-work-orders";

export const listManagerWorkOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(ManagerWorkOrderInputSchema, raw))
  .handler(({ data, context }) =>
    listManagedWorkOrders(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
