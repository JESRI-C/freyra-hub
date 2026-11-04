import { createFileRoute } from "@tanstack/react-router";
import { ManagerWorkOrders } from "@/components/project/ManagerWorkOrders";

export const Route = createFileRoute("/app/work-orders")({
  ssr: false,
  head: () => ({ meta: [{ title: "Arbejdsordrer — Freyra" }] }),
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Arbejdsordrer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Planlæg og følg op på tværs af dine projekter.
        </p>
      </header>
      <ManagerWorkOrders />
    </main>
  );
}
