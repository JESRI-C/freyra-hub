import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CustomerCommandSchema, CustomerQuerySchema } from "./work-customers";
import { parseWorkOrderInput } from "./work-order-access";
import { commandWorkCustomers, queryWorkCustomers } from "@/services/work-customers-service";
import type { WorkOrderRequestClient } from "@/services/work-order-access-service";

export const getWorkCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(CustomerQuerySchema, raw))
  .handler(({ data, context }) =>
    queryWorkCustomers(context.supabase as unknown as WorkOrderRequestClient, context.userId, data),
  );

export const saveWorkCustomerCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseWorkOrderInput(CustomerCommandSchema, raw))
  .handler(({ data, context }) =>
    commandWorkCustomers(
      context.supabase as unknown as WorkOrderRequestClient,
      context.userId,
      data,
    ),
  );
