import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
} from "@/services/monitoring/upload-import-service";
import { useAuth } from "@/lib/auth";
import {
  readPendingDroneBatches,
  savePendingDroneBatch,
} from "@/components/project/drone-intake-batch-receipt";
import { DRONE_BATCH_INTAKE, type DroneIntakeMode } from "@/services/monitoring/drone-batch-intake";
import { isReadyForAutomaticCameraPosition } from "@/services/monitoring/drone-image-metadata";
import {
  isMimeAllowed,
  listNeutralDroneBatchFiles,
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
  droneBatchPosition,
  groupDroneBatchItems,
  nextBatchSequence,
  runWithConcurrency,
  selectUniqueBatchFiles,
} from "./drone-before-batch-helpers";
import { validateDroneOriginal } from "@/lib/drone-original-validation.functions";
import { promoteDroneOriginal } from "@/lib/drone-original-promotion.functions";
import {
  isOriginalCheckComplete,
  MAX_ORIGINAL_CHECK_BYTES,
  originalCheckStatusLabel,
  storedOriginalCheckState,
  type OriginalCheckUpload,
  type OriginalCheckState,
} from "./drone-original-check-helpers";
import {
  droneOriginalPromotionStatusLabel,
  processDroneOriginalsSequentially,
  type DroneOriginalProcessingCandidate,
  type DroneOriginalPromotionState,
} from "./drone-original-promotion-helpers";

type QueueStatus = "queued" | "analysing" | "analysed" | "uploading" | "received" | "upload_failed";

interface BatchItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  preview?: { hasGps: boolean; hasUtc: boolean; cameraPositionCandidate: boolean; sha256: string };
  clientMetadata?: Record<string, unknown>;
  analysisError?: string;
  uploadError?: string;
  resumeIntent?: UploadIntent;
  clientRequestId: string;
  batchSequence: number;
  receivedUpload?: OriginalCheckUpload;
  originalCheck?: OriginalCheckState;
  promotion?: DroneOriginalPromotionState;
}

interface DroneBeforeBatchWizardProps {
  intakeMode?: DroneIntakeMode;
  open: boolean;
  onClose: () => void;
  projectId: string;
  onImported?: () => void;
  onCanonicalBatch?: (batch: CanonicalDroneBatch) => void;
}

export interface CanonicalDroneBatch {
  projectId: string;
  batchId: string;
  mediaIds: string[];
  receivedCount: number;
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

function errorMessage(_error: unknown): string {
  return "Filen kunne ikke færdigbehandles. Kontrollér forbindelsen og din adgang, og genoptag med den samme originalfil.";
}

function statusLabel(item: BatchItem): string {
  switch (item.status) {
    case "queued":
      return "Afventer seriens tur";
    case "analysing":
      return "Læser metadata og SHA-256";
    case "analysed":
      return item.analysisError ? "Metadata kunne ikke læses" : "Metadata læst";
    case "uploading":
      return `Uploader ${item.progress}%`;
    case "received":
      if (item.promotion && item.promotion.status !== "awaiting_original")
        return droneOriginalPromotionStatusLabel(item.promotion);
      return item.originalCheck
        ? originalCheckStatusLabel(item.originalCheck)
        : "Modtaget – afventer originalkontrol";
    case "upload_failed":
      return "Upload fejlede";
  }
}

function statusTone(item: BatchItem): string {
  if (item.status === "queued") return "bg-slate-100 text-slate-800";
  if (item.status === "received")
    return item.originalCheck?.status === "raw_original_validated"
      ? "bg-slate-100 text-slate-800"
      : "bg-amber-100 text-amber-900";
  if (item.status === "upload_failed") return "bg-red-100 text-red-800";
  if (item.status === "uploading" || item.status === "analysing") {
    return "bg-sky-100 text-sky-800";
  }
  if (item.analysisError || !item.preview?.cameraPositionCandidate) {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-slate-100 text-slate-800";
}

async function readPreview(
  file: File,
): Promise<Pick<BatchItem, "preview" | "clientMetadata" | "analysisError">> {
  if (
    resolveUploadMime(file) !== "image/jpeg" ||
    !/\.jpe?g$/i.test(file.name) ||
    file.size > MAX_ORIGINAL_CHECK_BYTES
  )
    return {
      analysisError:
        "Metadata- og originalkontrol understøtter JPEG op til 32 MiB. Filen kan stadig modtages.",
    };
  try {
    const result = await parseImage(file);
    const metadata = result.droneMetadata;
    return {
      preview: {
        hasGps: !!metadata.position,
        hasUtc: !!metadata.capture.capturedAtUtc,
        cameraPositionCandidate: isReadyForAutomaticCameraPosition(metadata),
        sha256: metadata.file.sha256,
      },
      clientMetadata: buildImageDetectedMetadata(result),
    };
  } catch (error) {
    return { analysisError: errorMessage(error) };
  }
}

export function NeutralDroneImport({
  projectId,
  disabled,
  onImported,
}: {
  projectId: string;
  disabled?: boolean;
  onImported?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm disabled:opacity-50"
      >
        <FileImage className="h-4 w-4" /> Importer droneoriginaler
      </button>
      <DroneBeforeBatchWizard
        intakeMode="neutral"
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        onImported={onImported}
      />
    </>
  );
}

function NeutralSeriesReceipt({ batch, index }: { batch: CanonicalDroneBatch; index: number }) {
  const [files, setFiles] = useState<Awaited<ReturnType<typeof listNeutralDroneBatchFiles>>>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  async function readFiles() {
    setError(false);
    setLoading(true);
    try {
      setFiles(await listNeutralDroneBatchFiles(batch.projectId, batch.batchId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && !files && !loading) void readFiles();
      }}
    >
      <summary className="cursor-pointer py-1">
        Serie {index + 1} · {batch.receivedCount} modtaget · {batch.mediaIds.length} tilknyttet
      </summary>
      {loading && <p>Henter filnavne…</p>}
      {error && (
        <button type="button" className="underline" onClick={() => void readFiles()}>
          Hent filer igen
        </button>
      )}
      {files && (
        <ol className="max-h-40 overflow-auto">
          {files.map((file) => (
            <li key={file.id}>
              {Number(file.sequence)}. {file.original_file_name}
            </li>
          ))}
        </ol>
      )}
      {files && files.length < batch.receivedCount && (
        <p>Nogle filer er ikke tilgængelige på projektet.</p>
      )}
    </details>
  );
}

function NeutralReceipts({ actorId, projectId }: { actorId: string; projectId: string }) {
  const [receipts] = useState(() => {
    try {
      return readPendingDroneBatches(localStorage, actorId, projectId, "neutral");
    } catch {
      return null;
    }
  });
  if (!receipts) return <p role="status">Kvitteringer fra denne browser kunne ikke læses.</p>;
  if (!receipts.length) return null;
  return (
    <section className="rounded-lg border p-3 text-sm">
      <h3 className="font-medium">Modtagne droneserier</h3>
      {receipts.map((batch, index) => (
        <NeutralSeriesReceipt key={batch.batchId} batch={batch} index={index} />
      ))}
    </section>
  );
}

export function DroneBeforeBatchWizard(props: DroneBeforeBatchWizardProps) {
  const { user } = useAuth();
  return user ? (
    <BatchQueue
      key={`${user.id}:${props.projectId}:${props.intakeMode ?? "before"}`}
      {...props}
      actorId={user.id}
    />
  ) : null;
}

function BatchQueue({
  open,
  onClose,
  projectId,
  onImported,
  onCanonicalBatch,
  intakeMode = "before",
  actorId,
}: DroneBeforeBatchWizardProps & { actorId: string }) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [checkingOriginals, setCheckingOriginals] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState(1);
  const busyRef = useRef(false);
  const validateOriginal = useServerFn(validateDroneOriginal);
  const promoteOriginal = useServerFn(promoteDroneOriginal);
  const inputRef = useRef<HTMLInputElement>(null);
  const batchIdRef = useRef<string | null>(null);
  const runGenerationRef = useRef(0);
  const transfer = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      runGenerationRef.current++;
      transfer.current?.abort();
    },
    [],
  );

  const active =
    processing ||
    checkingOriginals ||
    items.some((item) => item.status === "analysing" || item.status === "uploading");
  const uploadCandidates = items.filter(
    (item) =>
      item.status === "queued" || item.status === "analysed" || item.status === "upload_failed",
  );
  const receivedCount = items.filter((item) => item.status === "received").length;
  const originalRetryCandidates = items.filter(
    (item) =>
      item.receivedUpload &&
      (item.originalCheck?.status === "failed" || item.promotion?.status === "failed"),
  );
  const warningCount = items.filter(
    (item) =>
      item.status !== "queued" &&
      item.status !== "analysing" &&
      (item.analysisError || !item.preview?.cameraPositionCandidate),
  ).length;

  const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const analyse = useCallback(
    async (added: BatchItem[], generation: number) => {
      await runWithConcurrency(added, DRONE_BEFORE_CONCURRENCY, async (item) => {
        if (runGenerationRef.current !== generation) return;
        const preview = await readPreview(item.file);
        if (runGenerationRef.current === generation)
          updateItem(item.id, { ...preview, status: "analysed" });
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
        const batchSequence = firstSequence + accepted.length;
        accepted.push({
          id: createId(intakeMode === "before" ? "before-photo" : "drone-photo"),
          file,
          status: batchSequence <= MAX_DRONE_BEFORE_BATCH_FILES ? "analysing" : "queued",
          progress: 0,
          clientRequestId: createUploadRequestId(),
          batchSequence,
        });
      }

      const messages: string[] = [];
      if (selected.duplicateCount > 0) {
        messages.push(`${selected.duplicateCount} dublet(ter) blev sprunget over`);
      }
      if (invalidCount > 0) {
        messages.push(`${invalidCount} ugyldig(e) billedfil(er) eller filer over 200 MB`);
      }
      setSelectionMessage(messages.length ? `${messages.join(". ")}.` : null);

      if (accepted.length === 0) return;
      if (!batchIdRef.current)
        batchIdRef.current = createId(intakeMode === "before" ? "before-batch" : "drone-batch");
      setItems((current) => [...current, ...accepted]);
      const generation = runGenerationRef.current;
      void analyse(
        accepted.filter((item) => item.status === "analysing"),
        generation,
      );
    },
    [analyse, items, intakeMode],
  );

  const checkReceivedOriginals = async (
    received: DroneOriginalProcessingCandidate[],
    signal: AbortSignal,
    series: number,
    receivedTotal: number,
  ) => {
    setCheckingOriginals(true);
    const canonical = new Set<string>();
    try {
      await processDroneOriginalsSequentially(
        received,
        projectId,
        {
          validate: (input) => {
            signal.throwIfAborted();
            return validateOriginal({ data: input });
          },
          promote: (input) => {
            signal.throwIfAborted();
            return promoteOriginal({ data: input });
          },
        },
        {
          onOriginalCheck: (id, originalCheck) => updateItem(id, { originalCheck }),
          onPromotion: (id, promotion) => {
            updateItem(
              id,
              promotion.status === "canonical"
                ? { promotion, receivedUpload: undefined }
                : { promotion },
            );
            if (promotion.status === "canonical" && promotion.mediaId) {
              canonical.add(promotion.mediaId);
              if (intakeMode === "neutral")
                notifyCanonicalBatch(series, [promotion.mediaId], receivedTotal);
            }
          },
        },
      );
    } finally {
      setCheckingOriginals(false);
    }
    return [...canonical];
  };

  const batchIdFor = (series: number) =>
    series === 1 ? batchIdRef.current! : `${batchIdRef.current}-${series}`;
  const notifyCanonicalBatch = (series: number, mediaIds: string[], receivedTotal: number) => {
    if (
      !batchIdRef.current ||
      receivedTotal === 0 ||
      (intakeMode === "before" && mediaIds.length === 0)
    )
      return;
    const batch = {
      projectId,
      batchId: batchIdFor(series),
      mediaIds: [...new Set(mediaIds)],
      receivedCount: receivedTotal,
    };
    if (intakeMode === "before" && onCanonicalBatch) onCanonicalBatch(batch);
    else {
      try {
        savePendingDroneBatch(localStorage, actorId, batch, intakeMode);
      } catch {
        setSelectionMessage(
          "Originalerne er gemt på sagen. Serien kunne ikke gemmes til genåbning i denne browser.",
        );
      }
    }
  };

  const seriesItems = groupDroneBatchItems(items);
  const alreadyReceived = (series: number) =>
    seriesItems.get(series)?.filter((item) => item.status === "received").length ?? 0;
  const retryOriginalChecks = async () => {
    if (busyRef.current || active || clearing) return;
    busyRef.current = true;
    setProcessing(true);
    const controller = new AbortController();
    transfer.current = controller;
    try {
      for (const [series, group] of groupDroneBatchItems(originalRetryCandidates)) {
        if (controller.signal.aborted) return;
        const canonical = await checkReceivedOriginals(
          group.map((item) => ({
            key: item.id,
            upload: item.receivedUpload!,
            originalCheck: item.originalCheck,
            promotion: item.promotion,
          })),
          controller.signal,
          series,
          alreadyReceived(series),
        );
        if (!controller.signal.aborted)
          notifyCanonicalBatch(series, canonical, alreadyReceived(series));
      }
      if (controller.signal.aborted) return;
      onImported?.();
    } finally {
      busyRef.current = false;
      setProcessing(false);
    }
  };

  const uploadBatch = async () => {
    if (busyRef.current || active || clearing) return;
    busyRef.current = true;
    setProcessing(true);
    const controller = new AbortController();
    transfer.current = controller;

    try {
      for (const [series, candidates] of groupDroneBatchItems(uploadCandidates)) {
        if (controller.signal.aborted) return;
        const received: (DroneOriginalProcessingCandidate & { sequence: number })[] = [];
        await runWithConcurrency(candidates, DRONE_BEFORE_CONCURRENCY, async (item) => {
          if (controller.signal.aborted) return;
          const details =
            item.status === "queued"
              ? await readPreview(item.file)
              : {
                  preview: item.preview,
                  clientMetadata: item.clientMetadata,
                  analysisError: item.analysisError,
                };
          if (controller.signal.aborted) return;
          updateItem(item.id, {
            ...details,
            status: "uploading",
            progress: 0,
            uploadError: undefined,
          });
          try {
            const upload = await uploadFileResumable({
              file: item.file,
              projectId,
              uploadType: "drone_photo",
              userMetadata: {
                intake: {
                  ...DRONE_BATCH_INTAKE[intakeMode],
                  media_kind: "drone_photo",
                  batch_id: batchIdFor(series),
                  batch_sequence: droneBatchPosition(item.batchSequence).sequence,
                },
                // Browser-derived EXIF/XMP/SHA is untrusted evidence. The server
                // must re-extract and populate detected_metadata before use.
                client_preview: details.clientMetadata ?? {
                  metadata_parse_error: details.analysisError ?? "Metadata mangler",
                },
              },
              onProgress: (progress) => {
                updateItem(item.id, {
                  progress: Math.max(0, Math.min(100, Math.round(progress))),
                });
              },
              resumeIntent: item.resumeIntent,
              clientRequestId: item.clientRequestId,
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            const originalCheck = storedOriginalCheckState(upload) ?? { status: "queued" as const };
            // The queue only needs these fields after the server acknowledges the
            // bytes. Raw preview and validation envelopes can each approach 1 MiB.
            const reference: OriginalCheckUpload = {
              id: upload.id,
              project_id: upload.project_id,
              uploaded_by: upload.uploaded_by,
              file_name: upload.file_name,
              original_file_name: upload.original_file_name,
              file_size: upload.file_size,
              mime_type: upload.mime_type,
              upload_type: upload.upload_type,
              storage_path: upload.storage_path,
              intent_request_id: upload.intent_request_id,
              received_at: upload.received_at,
              status: upload.status,
            };
            received.push({
              key: item.id,
              upload: reference,
              originalCheck,
              sequence: item.batchSequence,
            });
            if (intakeMode === "neutral") {
              notifyCanonicalBatch(series, [], alreadyReceived(series) + received.length);
            }
            updateItem(item.id, {
              status: "received",
              progress: 100,
              resumeIntent: undefined,
              receivedUpload: reference,
              clientMetadata: undefined,
              originalCheck,
            });
          } catch (error) {
            updateItem(item.id, {
              status: "upload_failed",
              uploadError: errorMessage(error),
              resumeIntent: error instanceof UploadTransferError ? error.intent : item.resumeIntent,
            });
          }
        });

        if (controller.signal.aborted) return;
        const canonical = await checkReceivedOriginals(
          received.sort((a, b) => a.sequence - b.sequence),
          controller.signal,
          series,
          alreadyReceived(series) + received.length,
        );
        if (controller.signal.aborted) return;
        if (received.length > 0) {
          notifyCanonicalBatch(series, canonical, alreadyReceived(series) + received.length);
          onImported?.();
        }
      }
    } finally {
      busyRef.current = false;
      setProcessing(false);
    }
  };

  const reset = async (): Promise<boolean> => {
    if (busyRef.current || active) return false;
    const pending = items.filter((item) => Boolean(item.resumeIntent));
    if (pending.length > 0) {
      setClearing(true);
      const failedIds = new Set<string>();
      await runWithConcurrency(pending, DRONE_BEFORE_CONCURRENCY, async (item) => {
        try {
          await cancelUploadIntent(item.resumeIntent!.uploadId);
        } catch {
          failedIds.add(item.id);
        }
      });
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
    setVisibleSeries(1);
    setSelectionMessage(null);
    if (inputRef.current) inputRef.current.value = "";
    return true;
  };

  const handleClose = () => {
    if (busyRef.current || active || clearing) return;
    if (uploadCandidates.length || originalRetryCandidates.length) {
      onClose();
      return;
    }
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
  const currentSeries = seriesItems.has(visibleSeries)
    ? visibleSeries
    : seriesItems.keys().next().value;

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Tilføj dronebilleder"
      subtitle={
        intakeMode === "before"
          ? "Billeder til FØR-dokumentation"
          : "Droneoriginaler fra én eller flere optagedatoer"
      }
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={active || clearing}
            className="rounded-lg border bg-card px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {allReceived && originalRetryCandidates.length === 0 ? "Luk billedkø" : "Luk"}
          </button>
          {originalRetryCandidates.length > 0 && (
            <button
              type="button"
              onClick={() => void retryOriginalChecks()}
              disabled={active || clearing}
              className="rounded-lg border bg-card px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Prøv kontrol eller tilknytning igen
            </button>
          )}
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
              : "Upload valgte billeder"}
          </button>
        </>
      }
    >
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
        Upload originalerne til denne sag. Optagedato og GPS læses fra filerne, når de findes.
        Billederne afventer faglig gennemgang.
      </div>

      {intakeMode === "neutral" && open && items.length === 0 && (
        <NeutralReceipts actorId={actorId} projectId={projectId} />
      )}
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 hover:bg-muted/30">
        <FileImage className="h-7 w-7 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium">Vælg originale dronebilleder</div>
        <div className="mt-1 text-center text-xs text-muted-foreground">
          Vælg alle billederne på én gang. De behandles i serier på op til{" "}
          {MAX_DRONE_BEFORE_BATCH_FILES}. JPEG-billeder op til 32 MiB kan behandles her. Andre
          billedformater og større JPEG-filer kan modtages, men afventer behandling.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.tif,.tiff,.dng,.png,.webp,.heic"
          multiple
          className="hidden"
          disabled={active || clearing}
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
          <span className="font-medium">
            {items.length} billeder · {receivedCount} modtaget
          </span>
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
            <div className="font-medium">Alle originaler er modtaget</div>
            <div className="mt-0.5 text-xs">
              {intakeMode === "before"
                ? "Se originalkontrol og tilknytning ved hver fil. Modtagelse, råkontrol og kanonisk registrering gør ikke billederne rapportklare eller afslutter en FØR-runde."
                : "Se originalkontrol og tilknytning ved hver fil. Billederne afventer faglig gennemgang."}
            </div>
          </div>
        </div>
      )}

      {seriesItems.size > 1 && (
        <label className="flex items-center gap-2 text-sm">
          Vis serie
          <select
            value={currentSeries}
            onChange={(event) => setVisibleSeries(Number(event.target.value))}
          >
            {[...seriesItems].map(([series, group]) => (
              <option key={series} value={series}>
                Serie {series} · {group.length} billeder
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
        {(currentSeries ? seriesItems.get(currentSeries) : [])?.map((item) => {
          const { hasGps, hasUtc, cameraPositionCandidate } = item.preview ?? {};
          const canRemove =
            !active &&
            (item.status === "queued" ||
              item.status === "analysed" ||
              item.status === "upload_failed");
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

              {item.status !== "analysing" && item.status !== "queued" && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span className={hasGps ? "text-emerald-700" : "text-amber-800"}>
                    <MapPin className="mr-1 inline h-3 w-3" /> Browser-GPS{" "}
                    {hasGps ? "fundet" : "mangler"}
                  </span>
                  <span className={hasUtc ? "text-emerald-700" : "text-amber-800"}>
                    Browser-UTC {hasUtc ? "fundet" : "mangler"}
                  </span>
                  <span>
                    {item.originalCheck?.sha256
                      ? `Server-SHA-256 ${item.originalCheck.sha256.slice(0, 12)}`
                      : `Foreløbig SHA-256 ${item.preview?.sha256.slice(0, 12) ?? "afventer"}`}
                  </span>
                </div>
              )}

              {item.status !== "analysing" &&
                item.status !== "queued" &&
                !cameraPositionCandidate && (
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
              {item.originalCheck?.error && (
                <div className="mt-2 text-amber-900" role="alert">
                  {item.originalCheck.error}
                </div>
              )}
              {item.promotion?.error && (
                <div className="mt-2 text-amber-900" role="alert">
                  {item.promotion.error}
                </div>
              )}
              {isOriginalCheckComplete(item.originalCheck) && (
                <div className="mt-2 text-muted-foreground">
                  {originalCheckStatusLabel(item.originalCheck!)}.
                  {item.promotion?.status === "canonical" && (
                    <>
                      {" "}
                      Kanonisk mediereference: {item.promotion.mediaId}. Dubletuploads bevarer hver
                      sin originalreference.
                    </>
                  )}
                  {item.originalCheck?.status !== "rejected" && (
                    <>
                      {" "}
                      Faglig billedgennemgang afventer. Ingen georeferering eller
                      rapportgodkendelse.
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
