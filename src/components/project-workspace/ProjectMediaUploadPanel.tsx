import { useCallback, useEffect, useState, useRef } from "react";
import { UploadCloud, Info, Loader2, CheckCircle, XCircle, Images, Camera } from "lucide-react";
import { MEDIA_CATEGORY_LABELS } from "@/lib/platform/media-types";
import type { MediaCategory, ProjectMediaItem } from "@/lib/platform/media-types";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { uploadProjectMedia } from "@/services/project-media-service";
import { DroneBeforeBatchWizard } from "@/components/monitoring/DroneBeforeBatchWizard";
import exifr from "exifr";
import { useAuth } from "@/lib/auth";

interface ProjectMediaUploadPanelProps {
  projectId: string;
  fieldPhotosOnly?: boolean;
  accessPending?: boolean;
  /** Retained for callers; a project centre is never a file's position. */
  projectCentroid?: { lat: number; lng: number };
  onUploadComplete?: (item: ProjectMediaItem) => void;
  onDroneBatchImported?: () => void;
}

const CATEGORIES: MediaCategory[] = [
  "field_photo",
  "before_after",
  "biodiversity_observation",
  "water_observation",
  "soil_observation",
  "document_scan",
  "satellite_snapshot",
];

const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectMediaUploadPanel({
  projectId,
  onUploadComplete,
  onDroneBatchImported,
  fieldPhotosOnly = false,
  accessPending = false,
}: ProjectMediaUploadPanelProps) {
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MediaCategory>("field_photo");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [positionReason, setPositionReason] = useState("");
  const [tags, setTags] = useState("");
  const [metadataPending, setMetadataPending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [beforeBatchOpen, setBeforeBatchOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selectionGeneration = useRef(0);
  const mounted = useRef(false);
  const uploadBusy = useRef(false);
  const uploadGeneration = useRef(0);
  const uploadRequest = useRef({ payload: "", id: "" });
  const transferController = useRef<AbortController | null>(null);
  const discardPendingWork = useCallback(() => {
    selectionGeneration.current++;
    uploadGeneration.current++;
  }, []);

  const resetFile = useCallback(() => {
    selectionGeneration.current++;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setSelectedFile(null);
    setPreviewUrl(null);
    setTitle("");
    setDescription("");
    setCategory("field_photo");
    setManualLat("");
    setManualLng("");
    setPositionReason("");
    setTags("");
    setMetadataPending(false);
    setSuccessMsg(null);
    setErrorMsg(null);
    setUploadProgress(null);
    uploadRequest.current = { payload: "", id: "" };
  }, []);

  useEffect(() => {
    mounted.current = true;
    resetFile();
    uploadGeneration.current++;
    uploadBusy.current = false;
    setIsUploading(false);
    setBeforeBatchOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    return () => {
      transferController.current?.abort();
      mounted.current = false;
      discardPendingWork();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, [projectId, user?.id, fieldPhotosOnly, resetFile, discardPendingWork]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    resetFile();
    const generation = selectionGeneration.current;
    if (!file) return;

    if (fieldPhotosOnly && !file.type.startsWith("image/")) {
      setErrorMsg("Feltadgangen kan uploade fotos. Bed en redaktør om at tilføje andre bilag.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_MEDIA_FILE_BYTES) {
      setErrorMsg("Filen er større end 50 MB.");
      event.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setErrorMsg(`Filtypen ${file.type || "ukendt"} understøttes ikke.`);
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    setTitle(file.name.replace(/\.[^.]+$/, "") || file.name);
    setCategory(file.type === "application/pdf" ? "document_scan" : "field_photo");
    if (!file.type.startsWith("image/")) return;

    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setMetadataPending(true);
    try {
      const gps = await exifr.gps(file);
      if (!mounted.current || generation !== selectionGeneration.current) return;
      if (
        gps &&
        Number.isFinite(gps.latitude) &&
        Number.isFinite(gps.longitude) &&
        Math.abs(gps.latitude) <= 90 &&
        Math.abs(gps.longitude) <= 180
      ) {
        setManualLat(String(gps.latitude));
        setManualLng(String(gps.longitude));
      }
    } catch {
      // A missing or unreadable camera position leaves this file unpositioned.
    } finally {
      if (mounted.current && generation === selectionGeneration.current) setMetadataPending(false);
    }
  };

  const handleSubmit = async () => {
    if (uploadBusy.current || metadataPending || accessPending) return;
    if (!selectedFile) {
      setErrorMsg("Vælg venligst en fil før upload.");
      return;
    }
    if (!title.trim()) {
      setErrorMsg("Udfyld venligst en titel.");
      return;
    }

    let coordinates: { lat: number; lng: number } | undefined;
    if (manualLat.trim() || manualLng.trim()) {
      const lat = Number(manualLat.replace(",", "."));
      const lng = Number(manualLng.replace(",", "."));
      if (
        !manualLat.trim() ||
        !manualLng.trim() ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      ) {
        setErrorMsg("Angiv gyldig breddegrad og længdegrad, eller lad begge felter være tomme.");
        return;
      }
      coordinates = { lat, lng };
    }

    const generation = selectionGeneration.current;
    const uploadToken = ++uploadGeneration.current;
    uploadBusy.current = true;
    setIsUploading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    setUploadProgress(null);
    const controller = new AbortController();
    transferController.current = controller;
    try {
      const uploadInput = {
        projectId,
        file: selectedFile,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        source: "field_upload",
        isReportReady: false,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        coordinates,
        positionCorrectionReason: positionReason,
      } as const;
      const identity = JSON.stringify({
        ...uploadInput,
        file: [selectedFile.name, selectedFile.size, selectedFile.lastModified],
      });
      if (uploadRequest.current.payload !== identity)
        uploadRequest.current = { payload: identity, id: crypto.randomUUID() };
      const result = await uploadProjectMedia({
        ...uploadInput,
        tags: [...uploadInput.tags],
        uploadRequestId: uploadRequest.current.id,
        signal: controller.signal,
        onProgress: (percent) => {
          if (mounted.current && generation === selectionGeneration.current)
            setUploadProgress(percent);
        },
      });
      if (!mounted.current || generation !== selectionGeneration.current) return;
      if (result.error) {
        setErrorMsg(`Upload mislykkedes: ${result.error}`);
      } else if (result.data) {
        resetFile();
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        setSuccessMsg(
          result.fieldPhotoReceipt?.status === "verified"
            ? `"${result.data.title}" er modtaget. Serverens checksum matcher originalen; fotoet afventer faglig gennemgang.`
            : `"${result.data.title}" er uploadet og afventer gennemgang.`,
        );
        onUploadComplete?.(result.data);
      }
    } catch {
      if (mounted.current && generation === selectionGeneration.current)
        setErrorMsg("Upload mislykkedes. Din valgte fil er bevaret; prøv igen.");
    } finally {
      if (mounted.current && uploadToken === uploadGeneration.current) {
        uploadBusy.current = false;
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="min-w-0 rounded-xl border bg-card p-3 sm:p-5 space-y-4">
      {!fieldPhotosOnly && (
        <DroneBeforeBatchWizard
          open={beforeBatchOpen}
          onClose={() => setBeforeBatchOpen(false)}
          projectId={projectId}
          onImported={onDroneBatchImported}
        />
      )}

      {!isSupabaseConfigured && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            Preview mode — filer gemmes ikke i denne session.
          </p>
        </div>
      )}

      <details open className="min-w-0 rounded-lg border p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">
          {fieldPhotosOnly ? "Feltfoto" : "Feltfoto eller bilag"}
        </summary>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">
            {fieldPhotosOnly
              ? "Tag et foto eller vælg et fra telefonen. Filen gemmes til gennemgang."
              : "Til et enkelt feltfoto eller en PDF. Filen gemmes til gennemgang."}
          </p>
          <input
            ref={fileInputRef}
            aria-label="Vælg andet foto eller bilag"
            type="file"
            accept={fieldPhotosOnly ? "image/*" : "image/*,application/pdf"}
            className="hidden"
            disabled={isUploading || accessPending}
            onChange={handleFileChange}
          />
          <input
            ref={cameraInputRef}
            aria-label="Tag feltfoto med kamera"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={isUploading || accessPending}
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading || accessPending}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-medium text-primary-foreground disabled:opacity-50"
          >
            <Camera className="h-5 w-5" aria-hidden="true" /> Tag foto
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || accessPending}
            className="min-h-12 w-full rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center gap-2 px-2 py-4 hover:bg-muted/20 transition disabled:opacity-50"
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Forhåndsvisning"
                className="max-h-32 rounded-lg object-contain"
              />
            ) : (
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {fieldPhotosOnly
                ? "Vælg billede · højst 50 MB"
                : "Vælg billede eller PDF · højst 50 MB"}
            </span>
          </button>
          {selectedFile && (
            <div className="break-all text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <span className="font-medium text-foreground">{selectedFile.name}</span> ·{" "}
              {formatFileSize(selectedFile.size)}
            </div>
          )}
          {metadataPending && (
            <p className="text-xs text-muted-foreground">Læser billedets kameraposition …</p>
          )}
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            <span>Titel</span>
            <input
              aria-label="Titel"
              type="text"
              value={title}
              disabled={isUploading || accessPending}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-11 w-full min-w-0 rounded-lg border bg-background text-base sm:text-sm px-3 py-2"
            />
          </label>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              Flere oplysninger (valgfrit)
            </summary>
            <fieldset disabled={isUploading || accessPending} className="mt-3 space-y-3">
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Kategori</span>
                <select
                  aria-label="Kategori"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as MediaCategory)}
                  className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base sm:text-sm"
                >
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {MEDIA_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Beskrivelse</span>
                <textarea
                  aria-label="Beskrivelse"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base sm:text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Tags (kommasepareret)</span>
                <input
                  aria-label="Tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-base sm:text-sm"
                />
              </label>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Observationssted (valgfrit)
                </div>
                <p className="text-xs text-muted-foreground">
                  Originalens GPS bevares. En ændret placering gemmes separat med begrundelse og
                  afstandsregel. Uden original GPS markeres stedet som manuelt placeret.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="Breddegrad"
                    value={manualLat}
                    disabled={metadataPending}
                    onChange={(event) => setManualLat(event.target.value)}
                    placeholder="Breddegrad"
                    inputMode="decimal"
                    className="min-h-11 min-w-0 rounded-lg border bg-background text-base sm:text-sm px-3 py-2"
                  />
                  <input
                    aria-label="Længdegrad"
                    value={manualLng}
                    disabled={metadataPending}
                    onChange={(event) => setManualLng(event.target.value)}
                    placeholder="Længdegrad"
                    inputMode="decimal"
                    className="min-h-11 min-w-0 rounded-lg border bg-background text-base sm:text-sm px-3 py-2"
                  />
                </div>
                <label className="block">
                  Begrundelse for manuel placering
                  <input
                    aria-label="Begrundelse for manuel placering"
                    maxLength={2000}
                    value={positionReason}
                    onChange={(event) => setPositionReason(event.target.value)}
                    className="min-h-11 w-full min-w-0 rounded border bg-background p-2 text-base sm:text-sm"
                  />
                </label>
              </div>
            </fieldset>
          </details>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isUploading || accessPending || metadataPending || !selectedFile}
            className="min-h-12 w-full rounded-xl bg-primary text-primary-foreground text-base font-medium px-3 py-3 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                {uploadProgress === null
                  ? "Forbereder upload…"
                  : uploadProgress >= 100
                    ? "Kontrollerer original…"
                    : `Uploader ${Math.round(uploadProgress)} %…`}
              </>
            ) : (
              "Gem foto eller bilag"
            )}
          </button>
          {isUploading && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => transferController.current?.abort()}
            >
              Sæt overførsel på pause
            </button>
          )}
        </div>
      </details>
      {!fieldPhotosOnly && (
        <details className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
          <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">
            Dronefotos og samlet import
          </summary>
          <p className="text-sm text-muted-foreground">
            Læg originale fotos fra din FØR-flyvning ind samlet. Filerne kontrolleres og gemmes på
            denne sag, før billederne gennemgås.
          </p>
          <button
            type="button"
            onClick={() => setBeforeBatchOpen(true)}
            disabled={isUploading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Images className="h-4 w-4" /> Importer FØR-dronefotos
          </button>
        </details>
      )}
      {successMsg && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2"
        >
          <CheckCircle className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800">{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2"
        >
          <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-800">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
