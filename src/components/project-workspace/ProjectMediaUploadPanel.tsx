import { useState, useRef } from "react";
import { UploadCloud, Info, Loader2, CheckCircle, XCircle } from "lucide-react";
import { MEDIA_CATEGORY_LABELS } from "@/lib/platform/media-types";
import type { MediaCategory, ProjectMediaItem } from "@/lib/platform/media-types";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { uploadProjectMedia } from "@/services/project-media-service";
import exifr from "exifr";

interface ProjectMediaUploadPanelProps {
  projectId: string;
  projectCentroid?: { lat: number; lng: number };
  onUploadComplete?: (item: ProjectMediaItem) => void;
}

const CATEGORIES: MediaCategory[] = [
  "field_photo",
  "drone_image",
  "before_after",
  "biodiversity_observation",
  "water_observation",
  "soil_observation",
  "document_scan",
  "satellite_snapshot",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectMediaUploadPanel({
  projectId,
  projectCentroid,
  onUploadComplete,
}: ProjectMediaUploadPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MediaCategory>("field_photo");
  const [isReportReady, setIsReportReady] = useState(false);
  const [useCentroid, setUseCentroid] = useState(!!projectCentroid);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [tags, setTags] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    setSelectedFile(file);
    setSuccessMsg(null);
    setErrorMsg(null);

    // Generate image preview
    if (file.type.startsWith("image/")) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } else {
      setPreviewUrl(null);
    }

    // Extract EXIF GPS data
    try {
      const gps = await exifr.gps(file);
      if (gps && gps.latitude != null && gps.longitude != null) {
        setManualLat(String(gps.latitude));
        setManualLng(String(gps.longitude));
        setUseCentroid(false);
      }
    } catch {
      // No EXIF or GPS data — not an error
    }
  };

  const handleDropzoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setErrorMsg("Vælg venligst en fil før upload.");
      return;
    }
    if (!title.trim()) {
      setErrorMsg("Udfyld venligst en titel.");
      return;
    }

    setIsUploading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    let coordinates:
      | { lat: number; lng: number; altitudeM?: number; accuracyM?: number }
      | undefined;

    if (useCentroid && projectCentroid) {
      coordinates = { lat: projectCentroid.lat, lng: projectCentroid.lng };
    } else if (manualLat && manualLng) {
      const lat = parseFloat(manualLat);
      const lng = parseFloat(manualLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        coordinates = { lat, lng };
      }
    }

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const result = await uploadProjectMedia({
      projectId,
      file: selectedFile,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      source: "field_upload",
      isReportReady,
      tags: tagList,
      coordinates,
    });

    setIsUploading(false);

    if (result.error) {
      setErrorMsg(`Upload mislykkedes: ${result.error}`);
    } else if (result.data) {
      setSuccessMsg(`"${result.data.title}" er uploadet.`);
      onUploadComplete?.(result.data);
      // Reset form
      setSelectedFile(null);
      setPreviewUrl(null);
      setTitle("");
      setDescription("");
      setCategory("field_photo");
      setIsReportReady(false);
      setManualLat("");
      setManualLng("");
      setTags("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="text-sm font-semibold">Upload medie</div>

      {/* Preview mode banner */}
      {!isSupabaseConfigured && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800">
            Preview mode — filer gemmes ikke i denne session.
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Dropzone */}
      <div
        onClick={handleDropzoneClick}
        className="rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center gap-2 py-6 cursor-pointer hover:bg-muted/20 transition"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Forhåndsvisning"
            className="max-h-32 rounded-lg object-contain"
          />
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              Træk billeder hertil eller klik for at vælge
            </p>
            <p className="text-[10px] text-muted-foreground/60">JPG, PNG, TIFF, PDF · max 50 MB</p>
          </>
        )}
      </div>

      {/* File info */}
      {selectedFile && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          <span className="font-medium text-foreground">{selectedFile.name}</span>
          {" · "}
          {formatFileSize(selectedFile.size)}
        </div>
      )}

      {/* Category */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Kategori</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MediaCategory)}
          className="w-full rounded-lg border bg-background text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MEDIA_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Titel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Beskriv billedet kort..."
          className="w-full rounded-lg border bg-background text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Beskrivelse</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Yderligere detaljer om billedet..."
          rows={2}
          className="w-full rounded-lg border bg-background text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {/* Tags */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Tags (kommasepareret)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="fx padde, vandhul, §3"
          className="w-full rounded-lg border bg-background text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Report ready toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Rapportklar</span>
        <button
          type="button"
          onClick={() => setIsReportReady((v) => !v)}
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
            isReportReady ? "bg-emerald-500" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow mt-0.5 transition-transform ${
              isReportReady ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Coordinates */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Koordinater</label>
        {projectCentroid && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={useCentroid}
              onChange={(e) => setUseCentroid(e.target.checked)}
              className="rounded"
            />
            Brug projektets centroid ({projectCentroid.lat.toFixed(4)},{" "}
            {projectCentroid.lng.toFixed(4)})
          </label>
        )}
        {!useCentroid && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              placeholder="Breddegrad"
              className="rounded-lg border bg-background text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              placeholder="Længdegrad"
              className="rounded-lg border bg-background text-xs px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isUploading}
        className="w-full rounded-xl bg-primary text-primary-foreground text-sm font-medium py-2.5 hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploader…
          </>
        ) : (
          "Upload billede"
        )}
      </button>

      {/* Success message */}
      {successMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-800">{successMsg}</p>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-800">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
