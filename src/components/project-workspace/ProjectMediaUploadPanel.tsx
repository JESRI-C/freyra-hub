import { useState } from "react";
import { UploadCloud, Info } from "lucide-react";
import { MEDIA_CATEGORY_LABELS } from "@/lib/platform/media-types";
import type { MediaCategory } from "@/lib/platform/media-types";

interface ProjectMediaUploadPanelProps {
  projectId: string;
  projectCentroid?: { lat: number; lng: number };
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

export function ProjectMediaUploadPanel({
  projectId: _projectId,
  projectCentroid,
}: ProjectMediaUploadPanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MediaCategory>("field_photo");
  const [isReportReady, setIsReportReady] = useState(false);
  const [useCentroid, setUseCentroid] = useState(!!projectCentroid);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [simulationMsg, setSimulationMsg] = useState<string | null>(null);

  const handleSubmit = () => {
    setSimulationMsg(
      `Simulation: "${title || "Uden titel"}" ville blive uploadet i kategorien "${MEDIA_CATEGORY_LABELS[category]}".`,
    );
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="text-sm font-semibold">Upload medie</div>

      {/* Dropzone — visual only */}
      <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center gap-2 py-8 cursor-not-allowed opacity-60">
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground text-center">
          Træk billeder hertil eller klik for at vælge
        </p>
        <p className="text-[10px] text-muted-foreground/60">JPG, PNG, TIFF · max 50 MB</p>
      </div>

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
        title="Upload bliver koblet til Supabase Storage i næste fase."
        className="w-full rounded-xl bg-primary text-primary-foreground text-sm font-medium py-2.5 hover:opacity-90 transition"
      >
        Upload billede (simulation)
      </button>

      {simulationMsg && (
        <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
          {simulationMsg}
        </p>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-800">
          Upload er i simuleringstilstand. Filer gemmes ikke endnu — Supabase Storage kobles til i
          næste fase.
        </p>
      </div>
    </div>
  );
}
