import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { ProjectScope } from "@/services/project-workspace-service";
import type { ReportRevision } from "@/lib/report-document";
import { saveWorkflowReport } from "@/services/workflow-report-service";
import { buildWorkflowReportPackage } from "@/lib/workflow-report-package";
import { buildReportImages } from "@/services/report-assets";
import { listReportDocuments, getReportRevisions } from "@/services/report-document-service";
export function WorkflowReportPanel({
  scope,
  selectedRoundId,
  canEdit,
}: {
  scope: ProjectScope;
  selectedRoundId?: string;
  canEdit: boolean;
}) {
  const cache = useQueryClient();
  const [saved, setSaved] = useState<ReportRevision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const archive = useQuery({
    queryKey: ["report-documents", scope.organizationId, scope.projectId, "workflow"],
    queryFn: async () => {
      const documents = await listReportDocuments(scope.organizationId, scope.projectId);
      const revisions = await Promise.all(
        documents.map((document) =>
          getReportRevisions(scope.organizationId, scope.projectId, document.id),
        ),
      );
      return revisions
        .map((rows) => rows[0])
        .filter((row) => row?.content.workflowSnapshot)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    retry: false,
  });
  const current = saved ?? archive.data?.[0];
  return (
    <section aria-label="Før og efter rapport" className="space-y-3 rounded border p-4">
      <h3 className="font-semibold">Før/efter, udførelse og næste opfølgning</h3>
      <p>
        Gem en kladde med faste versioner af handlinger, fotopar, besøg og baseline.
        Dokumentationsreview er særskilt; en gemt kladde er ikke faglig accept.
      </p>
      {canEdit && (
        <Button
          disabled={busy || !archive.isSuccess}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const report = await saveWorkflowReport(scope, selectedRoundId, current);
              setSaved(report);
              await cache.invalidateQueries({ queryKey: ["report-documents"] });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Rapporten kunne ikke gemmes.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {current ? "Gem ny rapportversion" : "Gem før/efter-rapport"}
        </Button>
      )}
      <Link to="/app/reports">Åbn rapportbiblioteket</Link>
      {archive.isError && (
        <p role="alert">Rapportarkivet kunne ikke hentes. Genindlæs før ny version.</p>
      )}
      {current && (
        <div className="space-y-2">
          <p role="status">
            Version {current.version} er gemt. Kilder og input er fastholdt. Status:{" "}
            {current.status}.
          </p>
          <Link
            to="/app/reports/preview"
            search={{ report: current.report_id, version: current.version }}
          >
            Genåbn præcis denne version
          </Link>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const images = await buildReportImages(current);
                const bytes = await buildWorkflowReportPackage(current, images);
                const url = URL.createObjectURL(
                  new Blob([bytes.slice().buffer], { type: "application/zip" }),
                );
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "Freyra-foer-efter-v" + current.version + ".zip";
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Eksporten kunne ikke dannes.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Hent PDF og kildepakke
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
