import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalContextBar } from "@/components/GlobalContextBar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, projectId, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (!projectId) return <Navigate to="/select" />;

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
