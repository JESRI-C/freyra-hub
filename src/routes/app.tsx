import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalContextBar } from "@/components/GlobalContextBar";
import { ProjectContextBoundary } from "@/components/ProjectContextBoundary";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { user, orgId, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen flex bg-background">
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-card focus:p-3"
      >
        Gå til indhold
      </a>
      <AppSidebar />
      <div id="workspace-content" tabIndex={-1} className="flex-1 min-w-0 flex flex-col">
        <ProjectContextBoundary>
          {orgId ? (
            <>
              <GlobalContextBar />
              <Outlet />
            </>
          ) : (
            <Navigate to="/select" />
          )}
        </ProjectContextBoundary>
      </div>
    </div>
  );
}
