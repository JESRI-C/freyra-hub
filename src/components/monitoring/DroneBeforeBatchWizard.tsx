import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  Loader2,
  MapPin,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Drawer } from "@/components/connect/Primitives";
import {
  buildImageDetectedMetadata,
  parseImage,
  type ImagePreview,
} from "@/services/monitoring/upload-import-service";
import { isReadyForAutomaticCameraPosition } from "@/services/monitoring/drone-image-metadata";
import {
  isMimeAllowed,
  MAX_UPLOAD_BYTES,
  createUploadRequestId,
  cancelUploadIntent,
  resolveUploadMime,
  type UploadIntent,
  UploadTransferError,
  uploadFileResumable,
} from "@/services/monitoring/uploads-service";
import {
  DRONE_BEFORE_CONCURRENCY,
  MAX_DRONE_BEFORE_BATCH_FILES,
  nextBatchSequence,
  runWithConcurrency,
  selectUniqueBatchFiles,
} from "./drone-before-batch-helpers";

type QueueStatus = "analysing" | "analysed" | "uploading" | "received" | "upload_failed";

interface BatchItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  preview?: ImagePreview;
  clientMetadata?: Record<string, unknown>;
  analysisError?: string;
  uploadError?: string;
  resumeIntent?: UploadIntent;
  clientRequestId: string;
  batchSequence: number;
}

interface DroneBeforeBatchWizardProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onImported?: () => void;
}

function createId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusLabel(item: BatchItem): string {
  switch (item.status) {
    case "analysing":
      return "Læser metadata og SHA-256";
    case "analysed":
      return item.analysisError ? "Metadata kunne ikke læses" : "Metadata læst";
    case "uploading":
      return `Uploader ${item.progress}%`;
    case "received":
      return "Modtaget – afventer servervalidering";
    case "upload_failed":
      return "Upload fejlede";
  }
}

function statusTone(item: BatchItem): string {
  if (item.status === "received") return "bg-emerald-100 text-emerald-800";
  if (item.status === "upload_failed") return "bg-red-100 text-red-800";
  if (item.status === "uploading" || item.status === "analysing") {
    return "bg-sky-100 text-sky-800";
  }
  if (
    item.analysisError ||
    !item.preview?.droneMetadata.position ||
    !item.preview?.droneMetadata.capture.capturedAtUtc ||
    !item.preview ||
    !isReadyForAutomaticCameraPosition(item.preview.droneMetadata)
  ) {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-slate-100 text-slate-800";
}

export function DroneBeforeBatchWizard({
  open,
  onClose,
  projectId,
  onImported,
}: DroneBeforeBatchWizardProps) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const batchIdRef = useRef<string | null>(null);
  const runGenerationRef = useRef(0);

  const active = items.some((item) => item.status === "analysing" || item.status === "uploading");
  const uploadCandidates = items.filter(
    (item) => item.status === "analysed" || item.status === "upload_failed",
  );
  const receivedCount = items.filter((item) => item.status === "received").length;
  const warningCount = items.filter(
    (item) =>
      item.status !== "analysing" &&
      (item.analysisError ||
        !item.preview?.droneMetadata.position ||
        !item.preview?.droneMetadata.capture.capturedAtUtc ||
        (item.preview && !isReadyForAutomaticCameraPosition(item.preview.droneMetadata))),
  ).length;

  const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const analyse = useCallback(
    async (added: BatchItem[], generation: number) => {
      await runWithConcurrency(added, DRONE_BEFORE_CONCURRENCY, async (item) => {
        try {
          const preview = await parseImage(item.file);
          if (runGenerationRef.current !== generation) return;
          updateItem(item.id, {
            status: "analysed",
            preview,
            clientMetadata: buildImageDetectedMetadata(preview),
          });
        } catch (error) {
          if (runGenerationRef.current !== generation) return;
          updateItem(item.id, {
            status: "analysed",
            analysisError: errorMessage(error),
          });
        }
      });
    },
    [updateItem],
  );

  const handleFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      const selected = selectUniqueBatchFiles({
        existing: items.map((item) => item.file),
        incoming,
      });
      const accepted: BatchItem[] = [];
      let invalidCount = 0;
      const firstSequence = nextBatchSequence(items.map((item) => item.batchSequence));

      for (const file of selected.accepted) {
        const mime = resolveUploadMime(file);
        const imageType = mime.startsWith("image/") && isMimeAllowed(mime);
        if (!imageType || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
          invalidCount += 1;
          continue;
        }
        accepted.push({
          id: createId("before-photo"),
          file,
          status: "analysing",
          progress: 0,
          clientRequestId: createUploadRequestId(),
          batchSequence: firstSequence + accepted.length,
        });
      }

      const messages: string[] = [];
      if (selected.duplicateCount > 0) {
        messages.push(`${selected.duplicateCount} dublet(ter) blev sprunget over`);
      }
      if (selected.capacityRejectedCount > 0) {
        messages.push(
          `${selected.capacityRejectedCount} fil(er) overskred grænsen på ${MAX_DRONE_BEFORE_BATCH_FILES}`,
        );
      }
      if (invalidCount > 0) {
        messages.push(`${invalidCount} ugyldig(e) billedfil(er) eller filer over 200 MB`);
      }
      setSelectionMessage(messages.length ? `${messages.join(". ")}.` : null);

      if (accepted.length === 0) return;
      if (!batchIdRef.current) batchIdRef.current = createId("before-batch");
      setItems((current) => [...current, ...accepted]);
      const generation = runGenerationRef.current;
      void analyse(accepted, generation);
    },
    [analyse, items],
  );

  const uploadBatch = async () => {
    const batchId = batchIdRef.current ?? createId("before-batch");
    batchIdRef.current = batchId;
    let successes = 0;
    const candidates = [...uploadCandidates];

    await runWithConcurrency(candidates, DRONE_BEFORE_CONCURRENCY, async (item) => {
      updateItem(item.id, { status: "uploading", progress: 0, uploadError: undefined });
      try {
        await uploadFileResumable({
          file: item.file,
          projectId,
          uploadType: "drone_photo",
          userMetadata: {
            intake: {
              schema_version: "gofreyra.drone-before-intake/v1",
              phase: "BEFORE",
              media_kind: "drone_photo",
              batch_id: batchId,
              batch_sequence: item.batchSequence,
            },
            // Browser-derived EXIF/XMP/SHA is untrusted evidence. The server
            // must re-extract and populate detected_metadata before use.
            client_preview: item.clientMetadata ?? {
              metadata_parse_error: item.analysisError ?? "Metadata mangler",
            },
          },
          onProgress: (progress) => {
            updateItem(item.id, {
              progress: Math.max(0, Math.min(100, Math.round(progress))),
            });
          },
          resumeIntent: item.resumeIntent,
          clientRequestId: item.clientRequestId,
        });
        successes += 1;
        updateItem(item.id, { status: "received", progress: 100, resumeIntent: undefined });
      } catch (error) {
        updateItem(item.id, {
          status: "upload_failed",
          uploadError: errorMessage(error),
          resumeIntent: error instanceof UploadTransferError ? error.intent : item.resumeIntent,
        });
      }
    });

    if (successes > 0) onImported?.();
  };

  const reset = async (): Promise<boolean> => {
    const pending = items.filter((item) => Boolean(item.resumeIntent));
    if (pending.length > 0) {
      setClearing(true);
      const failedIds = new Set<string>();
      await Promise.all(
        pending.map(async (item) => {
          try {
            await cancelUploadIntent(item.resumeIntent!.uploadId);
          } catch {
            failedIds.add(item.id);
          }
        }),
      );
      setClearing(false);
      if (failedIds.size > 0) {
        setItems((current) => current.filter((item) => failedIds.has(item.id)));
        setSelectionMessage(
          `${failedIds.size} upload-intent(s) kunne ikke lukkes og er derfor beholdt i køen.`,
        );
        return false;
      }
    }
    runGenerationRef.current += 1;
    batchIdRef.current = null;
    setItems([]);
    setSelectionMessage(null);
    if (inputRef.current) inputRef.current.value = "";
    return true;
  };

  const handleClose = () => {
    if (active || clearing) return;
    void reset().then((cleared) => {
      if (cleared) onClose();
    });
  };

  const removeItem = async (item: BatchItem) => {
    if (item.resumeIntent) {
      setClearing(true);
      try {
        await cancelUploadIntent(item.resumeIntent.uploadId);
      } catch (cancelError) {
        updateItem(item.id, {
          uploadError: `Upload-intent kunne ikke lukkes: ${errorMessage(cancelError)}`,
        });
        setClearing(false);
        return;
      }
      setClearing(false);
    }
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  };

  const allReceived = items.length > 0 && receivedCount === items.length;
  const summary = useMemo(
    () => `${items.length}/${MAX_DRONE_BEFORE_BATCH_FILES} billeder · ${receivedCount} modtaget`,
    [items.length, receivedCount],
  );

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Importer FØR-dronefotos"
      subtitle="Fast fase: FØR · Fast medietype: drone_photo"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={active || clearing}
            className="rounded-lg border bg-card px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Luk
          </button>
          {items.length > 0 && !active && (
            <button
              type="button"
              onClick={() => void reset()}
              disabled={clearing}
              className="rounded-lg border bg-card px-3 py-1.5 text-xs"
            >
              Ryd kø
            </button>
          )}
          <button
            type="button"
            onClick={() => void uploadBatch()}
            disabled={active || uploadCandidates.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
          >
            {items.some((item) => item.status === "uploading") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UploadCloud className="h-3.5 w-3.5" />
            )}
            {items.some((item) => item.status === "upload_failed")
              ? "Prøv fejlede igen"
              : "Upload kø"}
          </button>
        </>
      }
    >
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
        Billederne bindes til det valgte projekt og modtages som en FØR-runde. Browserens EXIF, XMP,
        GPS, UTC og SHA-256 er foreløbig, ubetroet metadata. Serveren skal validere originalerne,
        før de må bruges som dokumenteret position, analyse eller rapportbevis.
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 hover:bg-muted/30">
        <FileImage className="h-7 w-7 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium">Vælg op til 200 originale dronebilleder</div>
        <div className="mt-1 text-center text-xs text-muted-foreground">
          Metadata og SHA-256 læses to ad gangen. Upload kører også højst to ad gangen.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.tif,.tiff,.dng,.png,.webp,.heic"
          multiple
          className="hidden"
          disabled={active || clearing || items.length >= MAX_DRONE_BEFORE_BATCH_FILES}
          onChange={(event) => {
            if (event.target.files) handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {selectionMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {selectionMessage}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium">{summary}</span>
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} kræver kontrol
            </span>
          )}
        </div>
      )}

      {allReceived && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Modtaget – afventer servervalidering</div>
            <div className="mt-0.5 text-xs">
              Ingen billeder kaldes kort- eller analyseklar, før serverkontrollen er bestået.
            </div>
          </div>
        </div>
      )}

      <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => {
          const metadata = item.preview?.droneMetadata;
          const hasGps = Boolean(metadata?.position);
          const hasUtc = Boolean(metadata?.capture.capturedAtUtc);
          const cameraPositionCandidate = metadata
            ? isReadyForAutomaticCameraPosition(metadata)
            : false;
          const canRemove = item.status === "analysed" || item.status === "upload_failed";
          return (
            <div key={item.id} className="rounded-lg border bg-card p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium" title={item.file.name}>
                    {item.file.name}
                  </div>
                  <div className="text-muted-foreground">{formatFileSize(item.file.size)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${statusTone(item)}`}>
                    {statusLabel(item)}
                  </span>
                  {canRemove && (
                    <button
                      type="button"
                      aria-label={`Fjern ${item.file.name}`}
                      onClick={() => void removeItem(item)}
                      disabled={clearing}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {(item.status === "uploading" || item.status === "received") && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}

              {item.status !== "analysing" && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span className={hasGps ? "text-emerald-700" : "text-amber-800"}>
                    <MapPin className="mr-1 inline h-3 w-3" /> GPS {hasGps ? "fundet" : "mangler"}
                  </span>
                  <span className={hasUtc ? "text-emerald-700" : "text-amber-800"}>
                    UTC {hasUtc ? "fundet" : "mangler"}
                  </span>
                  <span>
                    SHA-256 {metadata?.file.sha256 ? metadata.file.sha256.slice(0, 12) : "afventer"}
                  </span>
                </div>
              )}

              {item.status !== "analysing" && !cameraPositionCandidate && (
                <div className="mt-2 rounded-md bg-amber-50 p-2 text-amber-900">
                  Originalen må modtages, men billedet er ikke klar til automatisk kortposition.
                  Projektets centrum bruges aldrig som erstatning for manglende GPS eller UTC.
                </div>
              )}
              {item.analysisError && (
                <div className="mt-2 text-red-700">Metadatafejl: {item.analysisError}</div>
              )}
              {item.uploadError && (
                <div className="mt-2 text-red-700">Uploadfejl: {item.uploadError}</div>
              )}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
