import { createFileRoute, Link } from "@tanstack/react-router";
import { CustomerWorkspace } from "@/components/project/CustomerWorkspace";
import {
  ManagerWorkOrders,
  type ManagerWorkOrderView,
} from "@/components/project/ManagerWorkOrders";

export const Route = createFileRoute("/app/work-orders")({
  ssr: false,
  head: () => ({ meta: [{ title: "Arbejdsordrer — Freyra" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: ManagerWorkOrderView | "customers" } =>
    typeof search.view === "string" &&
    ["planning", "board", "list", "map", "customers"].includes(search.view)
      ? { view: search.view as ManagerWorkOrderView | "customers" }
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
          {view === "customers"
            ? "Kunder og sager"
            : view === "planning"
              ? "Planlæg arbejde"
              : "Arbejdsordrer"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view === "customers"
            ? "Saml kunden, kontaktpersonerne og grundlaget for jeres sager."
            : "Planlæg og følg op på tværs af dine projekter."}
        </p>
        <nav aria-label="Arbejdsområder" className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            className="inline-flex min-h-11 items-center rounded-xl border px-4"
            to="/app/work-orders"
            search={{ view: "planning" }}
          >
            Planlægning
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-xl border px-4"
            to="/app/work-orders"
            search={{ view: "customers" }}
          >
            Kunder og sager
          </Link>
        </nav>
      </header>
      {view === "customers" ? (
        <CustomerWorkspace />
      ) : (
        <ManagerWorkOrders
          view={view}
          onViewChange={(nextView) => void navigate({ search: { view: nextView }, replace: true })}
        />
      )}
    </main>
  );
}
