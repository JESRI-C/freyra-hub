import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { canViewDevelopment } from "@/lib/development-access";

const Board = lazy(() =>
  import("./SkyhostDevelopmentBoard").then((module) => ({
    default: module.SkyhostDevelopmentBoard,
  })),
);

export function DevelopmentWorkspace() {
  const { currentOrg, loading, refreshing } = useAuth();
  if (loading || refreshing)
    return (
      <p role="status" className="p-6">
        Kontrollerer adgang…
      </p>
    );
  if (!canViewDevelopment(currentOrg?.role))
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Produktudvikling</h1>
        <p className="mt-2">Udviklingstavlen er til organisationens ejer og administrator.</p>
      </main>
    );
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          Henter udviklingstavle…
        </p>
      }
    >
      <Board />
    </Suspense>
  );
}
