import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/demo-mode";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, projectId, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (!projectId) return <Navigate to="/select" />;
  return <Navigate to={DEMO_MODE ? "/app/projects" : "/app/overview"} />;
}
