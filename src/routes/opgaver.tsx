import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { MyWorkOrders } from "@/components/project/MyWorkOrders";
import { WorkOrderActionIdSchema } from "@/lib/work-order-access";
export const Route = createFileRoute("/opgaver")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mine opgaver — Freyra" }] }),
  validateSearch: (
    search,
  ): { job?: string; mode?: "finish"; booking?: string; equipment?: string } => {
    const equipment = z.string().uuid().safeParse(search.equipment);
    const booking = z.string().uuid().safeParse(search.booking);
    const job = WorkOrderActionIdSchema.safeParse(search.job);
    return job.success
      ? {
          job: job.data.toLowerCase(),
          ...(booking.success ? { booking: booking.data.toLowerCase() } : {}),
          ...(search.mode === "finish" ? { mode: "finish" as const } : {}),
        }
      : equipment.success
        ? { equipment: equipment.data.toLowerCase() }
        : {};
  },
  component: PersonalOrdersPage,
});

function PersonalOrdersPage() {
  const { job, mode, booking, equipment } = Route.useSearch();
  return (
    <MyWorkOrders
      linkedActionId={job}
      completionIntent={mode === "finish"}
      linkedBookingId={booking}
      scannedEquipmentId={equipment}
    />
  );
}
