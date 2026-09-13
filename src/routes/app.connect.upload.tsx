import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Images,
  Loader2,
  MapPin,
  Plus,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import { Card, PageHeader } from "@/components/ui-bits";
import { Chip, Section } from "@/components/connect/Primitives";
import { DroneBeforeBatchWizard } from "@/components/monitoring/DroneBeforeBatchWizard";
import { UploadWizard } from "@/components/monitoring/UploadWizard";
import { useConnectContext } from "@/lib/connect-context";
import {
  getUploadDownloadUrl,
  isUploadDownloadAvailable,
  listUploads,
  uploadStatusLabel,
} from "@/services/monitoring/uploads-service";
import { parseDroneUploadMapPoint } from "@/services/monitoring/drone-upload-map-service";

export const Route = createFileRoute("/app/connect/upload")({
  component: Page,
});

function Page() {
  const { project, projectId } = useConnectContext();
  const [genericWizardOpen, setGenericWizardOpen] = useState(false);
  const [beforeBatchOpen, setBeforeBatchOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  const uploadsQuery = useQuery({
    queryKey: ["monitoring-uploads", projectId],
    queryFn: () => (projectId ? listUploads({ projectId, limit: 200 }) : Promise.resolve([])),
    enabled: Boolean(projectId),
  });

  const uploads = uploadsQuery.data ?? [];
  const pendingTransfer = uploads.filter(
    (upload) => upload.status === "draft" && !upload.received_at,
  ).length;
  const awaitingValidation = uploads.filter(
    (upload) =>
      ["awaiting_validation", "validating"].includes(upload.status) ||
      (upload.status === "draft" && Boolean(upload.received_at)),
  ).length;

  const handleDownload = async (uploadId: string) => {
    if (!projectId) return;
    setDownloadingId(uploadId);
    setDownloadErrors((current) => {
      const next = { ...current };
      delete next[uploadId];
      return next;
    });

    try {
      const signedUrl = await getUploadDownloadUrl({ uploadId, projectId });
      const link = document.createElement("a");
      link.href = signedUrl;
      link.download = "";
      link.referrerPolicy = "no-referrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setDownloadErrors((current) => ({
        ...current,
        [uploadId]: "Downloadlinket kunne ikke oprettes. Kontrollér din adgang, og prøv igen.",
      }));
    } finally {
      setDownloadingId((current) => (current === uploadId ? null : current));
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-4 p-6">
      <PageHeader
        title="Upload center"
        description="Modtag originale dronefiler, kortlag, feltdata og dokumentation i projektets valideringskø."
      />

      <Card className="bg-gradient-to-br from-card to-leaf/15 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold">Projektbundet dataindtag</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {project
                  ? `Valgt projekt: ${project.name}. Filer aktiveres ikke automatisk, men afventer dokumenteret servervalidering.`
                  : "Vælg et projekt i Monitoring & Field Data, før du starter en samlet FØR-runde."}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="primary">{uploads.length} filer</Chip>
            {pendingTransfer > 0 && <Chip tone="muted">{pendingTransfer} ikke modtaget</Chip>}
            <Chip tone="muted">{awaitingValidation} afventer validering</Chip>
            {project?.slug && (
              <Link
                to="/app/projects/map/$slug"
                params={{ slug: project.slug }}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs"
              >
                <MapPin className="h-3.5 w-3.5" /> Se fotopunkter
              </Link>
            )}
            <button
              type="button"
              onClick={() => setGenericWizardOpen(true)}
              disabled={!projectId}
              title={projectId ? "Upload en enkelt projektfil" : "Vælg først et projekt"}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Enkelt fil
            </button>
            <button
              type="button"
              onClick={() => setBeforeBatchOpen(true)}
              disabled={!projectId}
              title={projectId ? "Importer FØR-dronefotos" : "Vælg først et projekt"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Images className="h-3.5 w-3.5" /> FØR-dronefotos
            </button>
          </div>
        </div>
      </Card>

      {!projectId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Batchimport er blokeret, fordi intet projekt er valgt. Vælg projektet i modulvælgeren, så
          alle 120 billeder bindes til den rigtige sag.
        </div>
      )}

      <Section
        title="Live upload-kø"
        subtitle={
          uploadsQuery.isLoading
            ? "Henter…"
            : projectId
              ? `${uploads.length} projektbundne filer i backend (op til 200 vises)`
              : "Vælg et projekt for at hente upload-køen"
        }
      >
        <Card>
          {uploadsQuery.isError && (
            <div className="border-b bg-red-50 px-4 py-3 text-sm text-red-800">
              Upload-køen kunne ikke hentes: {String(uploadsQuery.error)}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3">Filnavn</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Størrelse</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Kameraposition</th>
                  <th className="px-4 py-3">Tidspunkt</th>
                  <th className="px-4 py-3 text-right">Original</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {uploads.map((upload) => {
                  const pointResult = projectId
                    ? parseDroneUploadMapPoint(upload, projectId)
                    : { reason: "wrong_project" as const };
                  const downloadAvailable = isUploadDownloadAvailable(upload);
                  return (
                    <tr key={upload.id}>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {upload.original_file_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Chip>{upload.upload_type}</Chip>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {Math.round(upload.file_size / 1024)} KB
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Chip tone={upload.status === "imported" ? "primary" : "muted"}>
                          {upload.status === "draft" && upload.received_at
                            ? "Historisk fil · afventer validering"
                            : uploadStatusLabel(upload.status)}
                        </Chip>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {"point" in pointResult ? (
                          <span className="inline-flex items-center gap-1 text-violet-700">
                            <MapPin className="h-3.5 w-3.5" /> GPS-kandidat
                            <span title="Browseraflæst og ubekræftet">
                              <ShieldAlert className="h-3 w-3" />
                            </span>
                          </span>
                        ) : upload.upload_type === "drone_photo" ? (
                          <span className="text-muted-foreground">Ikke kortklar</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {upload.received_at ? (
                          <>Modtaget {new Date(upload.received_at).toLocaleString()}</>
                        ) : (
                          <>Intent oprettet {new Date(upload.created_at).toLocaleString()}</>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <button
                          type="button"
                          onClick={() => void handleDownload(upload.id)}
                          disabled={!downloadAvailable || downloadingId !== null}
                          aria-label={`Hent originalfilen ${upload.original_file_name}`}
                          aria-busy={downloadingId === upload.id}
                          title={
                            downloadAvailable
                              ? "Opret et sikkert downloadlink, som udløber efter fem minutter"
                              : "Filen kan først hentes, når overførslen er modtaget og afsluttet"
                          }
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {downloadingId === upload.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Hent
                        </button>
                        {downloadErrors[upload.id] && (
                          <p
                            className="mt-1 max-w-56 text-left text-[11px] text-red-700"
                            role="alert"
                          >
                            {downloadErrors[upload.id]}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!uploadsQuery.isLoading && uploads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {projectId
                        ? "Ingen uploads endnu. Start med en enkelt fil eller en samlet FØR-runde."
                        : "Ingen projektkø kan vises uden et valgt projekt."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <UploadWizard
        open={genericWizardOpen}
        onClose={() => setGenericWizardOpen(false)}
        projectId={projectId}
        onImported={() => void uploadsQuery.refetch()}
      />

      {projectId && (
        <DroneBeforeBatchWizard
          open={beforeBatchOpen}
          onClose={() => setBeforeBatchOpen(false)}
          projectId={projectId}
          onImported={() => void uploadsQuery.refetch()}
        />
      )}
    </main>
  );
}
