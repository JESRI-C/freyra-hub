import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalContextBar } from "@/components/GlobalContextBar";
import { DEMO_MODE, isMunicipalRoute } from "@/lib/demo-mode";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { user, orgId, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (!orgId) return <Navigate to="/select" />;

  if (DEMO_MODE && !isMunicipalRoute(path)) return <Navigate to="/app/projects" />;

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <GlobalContextBar />
        <Outlet />
      </div>
    </div>
  );
}
