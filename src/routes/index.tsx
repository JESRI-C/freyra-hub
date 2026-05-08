import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, projectId } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (!projectId) return <Navigate to="/select" />;
  return <Navigate to="/app/overview" />;
}
