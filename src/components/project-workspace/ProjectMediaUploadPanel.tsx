import { useCallback, useEffect, useState, useRef } from "react";
import { UploadCloud, Info, Loader2, CheckCircle, XCircle, Images } from "lucide-react";
import { MEDIA_CATEGORY_LABELS } from "@/lib/platform/media-types";
import type { MediaCategory, ProjectMediaItem } from "@/lib/platform/media-types";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { uploadProjectMedia } from "@/services/project-media-service";
import { DroneBeforeBatchWizard } from "@/components/monitoring/DroneBeforeBatchWizard";
import exifr from "exifr";

interface ProjectMediaUploadPanelProps {
  projectId: string;
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
}: ProjectMediaUploadPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MediaCategory>("field_photo");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [tags, setTags] = useState("");
  const [metadataPending, setMetadataPending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [beforeBatchOpen, setBeforeBatchOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selectionGeneration = useRef(0);
  const mounted = useRef(false);
  const uploadBusy = useRef(false);
  const uploadGeneration = useRef(0);
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
    setTags("");
    setMetadataPending(false);
    setSuccessMsg(null);
    setErrorMsg(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    resetFile();
    uploadGeneration.current++;
    uploadBusy.current = false;
    setIsUploading(false);
    setBeforeBatchOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    return () => {
      mounted.current = false;
      discardPendingWork();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, [projectId, resetFile, discardPendingWork]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    resetFile();
    const generation = selectionGeneration.current;
    if (!file) return;

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
    if (uploadBusy.current || metadataPending) return;
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
      const lat = Number(manualLat);
      const lng = Number(manualLng);
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
    try {
      const result = await uploadProjectMedia({
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
      });
      if (!mounted.current || generation !== selectionGeneration.current) return;
      if (result.error) {
        setErrorMsg(`Upload mislykkedes: ${result.error}`);
      } else if (result.data) {
        resetFile();
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSuccessMsg(`"${result.data.title}" er uploadet og afventer gennemgang.`);
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
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
        <div className="text-base font-semibold">Arbejd med dronefotos</div>
        <p className="text-sm text-muted-foreground">
          Læg originale fotos fra din FØR-flyvning ind samlet. Filerne kontrolleres og gemmes på
          denne sag, før billederne gennemgås.
        </p>
        <button
          type="button"
          onClick={() => setBeforeBatchOpen(true)}
          disabled={isUploading}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Images className="h-4 w-4" /> Importer FØR-dronefotos
        </button>
      </div>

      <DroneBeforeBatchWizard
        open={beforeBatchOpen}
        onClose={() => setBeforeBatchOpen(false)}
        projectId={projectId}
        onImported={onDroneBatchImported}
      />

      {!isSupabaseConfigured && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            Preview mode — filer gemmes ikke i denne session.
          </p>
        </div>
      )}

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Andet foto eller bilag</summary>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">
            Til et enkelt feltfoto eller en PDF. Filen gemmes til gennemgang.
          </p>
          <input
            ref={fileInputRef}
            aria-label="Vælg andet foto eller bilag"
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={isUploading}
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center gap-2 py-6 hover:bg-muted/20 transition disabled:opacity-50"
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
              Vælg billede eller PDF · højst 50 MB
            </span>
          </button>
          {selectedFile && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
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
              disabled={isUploading}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border bg-background text-sm px-3 py-2"
            />
          </label>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              Flere oplysninger (valgfrit)
            </summary>
            <fieldset disabled={isUploading} className="mt-3 space-y-3">
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Kategori</span>
                <select
                  aria-label="Kategori"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as MediaCategory)}
                  className="w-full rounded-lg border bg-background px-3 py-2"
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
                  className="w-full rounded-lg border bg-background px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Tags (kommasepareret)</span>
                <input
                  aria-label="Tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2"
                />
              </label>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Kameraposition (valgfri)
                </div>
                <p className="text-xs text-muted-foreground">
                  Positionen er ikke en verificeret placering af det, billedet viser.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="Breddegrad"
                    value={manualLat}
                    disabled={metadataPending}
                    onChange={(event) => setManualLat(event.target.value)}
                    placeholder="Breddegrad"
                    className="rounded-lg border bg-background text-xs px-3 py-2"
                  />
                  <input
                    aria-label="Længdegrad"
                    value={manualLng}
                    disabled={metadataPending}
                    onChange={(event) => setManualLng(event.target.value)}
                    placeholder="Længdegrad"
                    className="rounded-lg border bg-background text-xs px-3 py-2"
                  />
                </div>
              </div>
            </fieldset>
          </details>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isUploading || metadataPending || !selectedFile}
            className="w-full rounded-xl bg-primary text-primary-foreground text-sm font-medium py-2.5 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploader…
              </>
            ) : (
              "Gem foto eller bilag"
            )}
          </button>
        </div>
      </details>
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
