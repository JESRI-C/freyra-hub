import { createFileRoute } from "@tanstack/react-router";
import {
  ManagerWorkOrders,
  type ManagerWorkOrderView,
} from "@/components/project/ManagerWorkOrders";

export const Route = createFileRoute("/app/work-orders")({
  ssr: false,
  head: () => ({ meta: [{ title: "Arbejdsordrer — Freyra" }] }),
  validateSearch: (search: Record<string, unknown>): { view?: ManagerWorkOrderView } =>
    typeof search.view === "string" && ["planning", "board", "list", "map"].includes(search.view)
      ? { view: search.view as ManagerWorkOrderView }
      : {},
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-5 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {view === "planning" ? "Planlæg arbejde" : "Arbejdsordrer"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Planlæg og følg op på tværs af dine projekter.
        </p>
      </header>
      <ManagerWorkOrders
        view={view}
        onViewChange={(nextView) => void navigate({ search: { view: nextView }, replace: true })}
      />
    </main>
  );
}
