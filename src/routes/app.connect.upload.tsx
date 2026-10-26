import { createFileRoute, Link } from "@tanstack/react-router";
import { useConnectContext } from "@/lib/connect-context";
import { ProjectMediaUploadPanel } from "@/components/project-workspace/ProjectMediaUploadPanel";
export const Route = createFileRoute("/app/connect/upload")({ component: UploadPage });
function UploadPage() {
  const { projectId, project } = useConnectContext();
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Originalfiler - {project?.name ?? "Vælg projekt"}</h1>
      {projectId ? (
        <ProjectMediaUploadPanel projectId={projectId} />
      ) : (
        <Link to="/select" className="underline">
          Vælg organisation og projekt
        </Link>
      )}
      <p className="text-sm text-muted-foreground">
        Fotogrammetri og målegrundlag kræver en konfigureret worker og faglig kontrol. En upload er
        ikke en færdig analyse.
      </p>
    </main>
  );
}
