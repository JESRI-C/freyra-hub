import { registerProcessingJob } from "@/services/monitoring/drone-jobs-service";
import { useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import {
  MEDIA_CATEGORY_LABELS,
  type MediaCategory,
  type ProjectMediaItem,
} from "@/lib/platform/media-types";
import { uploadProjectMedia } from "@/services/project-media-service";
import { createSurvey, listFlights, type DroneFlight } from "@/services/monitoring/drone-service";
import { runBatch, type FileProgress, type SurveyPhase } from "@/services/monitoring/drone-ingest";

interface Props {
  projectId: string;
  projectCentroid?: { lat: number; lng: number };
  onUploadComplete?: (item: ProjectMediaItem) => void;
}
const statuses = {
  pending: "Afventer",
  uploading: "Uploader",
  uploaded: "Gemt",
  duplicate: "Allerede gemt",
  failed: "Fejl",
};
export function ProjectMediaUploadPanel({ projectId, onUploadComplete }: Props) {
  // Keying by project makes changing the active project abandon only this local selection.
  return <UploadForm key={projectId} projectId={projectId} onUploadComplete={onUploadComplete} />;
}
function UploadForm({ projectId, onUploadComplete }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<MediaCategory>("drone_image");
  const [phase, setPhase] = useState<SurveyPhase>("before");
  const [date, setDate] = useState("");
  const [flightId, setFlightId] = useState<string | null>(null);
  const [flights, setFlights] = useState<DroneFlight[]>([]);
  const [assetType, setAssetType] = useState<"original" | "orthophoto">("original");
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobMessage, setJobMessage] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const drone = category === "drone_image";
  async function upload() {
    if (!files.length || !projectId || busy) return;
    setBusy(true);
    setError(null);
    try {
      let surveyId = flightId;
      if (drone && !surveyId) {
        const survey = await createSurvey(projectId, phase, date);
        surveyId = survey.id;
        setFlightId(survey.id);
      }
      await runBatch(
        files,
        async (file) => {
          const result = await uploadProjectMedia({
            projectId,
            file,
            title: file.name,
            description,
            category,
            source: drone ? "drone" : "field_upload",
            isReportReady: false,
            tags: [],
            flightId: surveyId ?? undefined,
            assetType,
          });
          if (!result.data || result.error)
            throw new Error(result.error ?? "Filen blev ikke gemt.");
          onUploadComplete?.(result.data);
          return {
            item: result.data,
            duplicate: !!result.duplicate,
            missingGps: !result.data.coordinates,
          };
        },
        setProgress,
        progress,
      );
      if (surveyId) {
        const job = await registerProcessingJob(projectId, surveyId);
        setJobMessage(`Behandlingsjob ${job.id}: ${job.status}. ${job.error ?? ""}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold">Upload originaler i en samlet flyvning</h3>
      <p className="text-xs text-muted-foreground">
        Filer bevares uændrede i privat lager. GPS, kameraretning og tidspunkt læses pr. fil.
        Manglende GPS giver ingen kortplacering. Et fotopunkt er ikke et målfast ortofoto.
      </p>
      <label className="block text-xs">
        Kategori
        <select
          className="w-full border rounded p-2 bg-background"
          value={category}
          disabled={busy || !!flightId}
          onChange={(e) => setCategory(e.target.value as MediaCategory)}
        >
          {Object.entries(MEDIA_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {drone && (
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            className="text-xs underline"
            onClick={() => {
              void listFlights(projectId)
                .then(setFlights)
                .catch((e) => setError(String(e)));
            }}
          >
            Hent eksisterende flyvninger for at fortsætte en upload
          </button>
          {!!flights.length && (
            <label className="block text-xs">
              Flyvning
              <select
                className="w-full border rounded p-2 bg-background"
                disabled={busy}
                value={flightId ?? ""}
                onChange={(e) => {
                  setFlightId(e.target.value || null);
                  setProgress([]);
                }}
              >
                <option value="">Ny flyvning</option>
                {flights.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.flown_at.slice(0, 10)} · {f.purpose ?? "Ukendt fase"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!flightId && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                Fase
                <select
                  className="w-full border rounded p-2 bg-background"
                  disabled={busy}
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as SurveyPhase)}
                >
                  <option value="before">Før</option>
                  <option value="after">Efter</option>
                  <option value="follow_up">Opfølgning</option>
                </select>
              </label>
              <label className="text-xs">
                Flyvedato
                <input
                  className="w-full border rounded p-2 bg-background"
                  disabled={busy}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="block text-xs">
            Indhold
            <select
              className="w-full border rounded p-2 bg-background"
              disabled={busy}
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as "original" | "orthophoto")}
            >
              <option value="original">Originalfotos / video / XMP</option>
              <option value="orthophoto">Eksisterende ortofoto (GeoTIFF)</option>
            </select>
          </label>
          {assetType === "orthophoto" && (
            <p className="text-xs text-amber-700">
              Original GeoTIFF gemmes som importeret ortofoto. CRS, georeferering og målenøjagtighed
              skal valideres før arealanalyse.
            </p>
          )}
        </div>
      )}
      <label className="block text-xs">
        Beskrivelse
        <textarea
          className="w-full border rounded p-2 bg-background"
          disabled={busy}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="flex flex-col items-center border-2 border-dashed rounded-lg p-5 cursor-pointer">
        <UploadCloud className="h-6 w-6" />
        <span className="text-xs mt-2">Vælg alle filer fra flyvningen · maks. 200 MB pr. fil</span>
        <input
          type="file"
          multiple
          disabled={busy}
          className="mt-3 text-xs max-w-full"
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setProgress([]);
            setError(null);
          }}
        />
      </label>
      <p className="text-xs">
        {files.length} filer valgt. Genvalg af samme filer og flyvning fortsætter efter kontrol af
        SHA-256.
      </p>
      <button
        type="button"
        onClick={() => void upload()}
        disabled={busy || !files.length || !projectId || (drone && !flightId && !date)}
        className="w-full rounded-lg bg-primary text-primary-foreground p-2 text-sm disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
        {progress.some((p) => p.status === "failed")
          ? "Prøv fejlede filer igen"
          : "Upload alle filer"}
      </button>
      {jobMessage && <p className="text-xs text-amber-700">{jobMessage}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {!!progress.length && (
        <ul className="max-h-64 overflow-y-auto text-xs space-y-2" aria-live="polite">
          {progress.map((p, i) => (
            <li key={i}>
              <strong>{p.name}</strong>: {statuses[p.status]}
              {p.missingGps ? " · GPS mangler" : ""}
              {p.error ? ` · ${p.error}` : ""}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Fotogrammetri er blokeret, indtil en autoriseret worker er konfigureret. Upload opretter
        ikke et færdigt ortofoto eller analyseresultat.
      </p>
    </div>
  );
}
