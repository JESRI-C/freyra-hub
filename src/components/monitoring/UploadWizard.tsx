// Upload wizard drawer — classify → validate → preview → import.
// Wires the client-side parsers in `upload-import-service` to the
// storage + row insert in `uploads-service`. Renders a compact 4-step
// flow inside the shared Drawer primitive so it can be triggered from
// the Upload center, the Live-data toolbar, or the topbar.
import { useCallback, useMemo, useState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, FileText, Image as ImageIcon, MapPin } from "lucide-react";
import { Drawer } from "@/components/connect/Primitives";
import {
  parseCsv,
  parseExcel,
  parseGeoJson,
  parseKml,
  parseGpx,
  parseImage,
  suggestMapping,
  validateTabular,
  type ParsePreview,
  type ColumnMapping,
  type ValidationSummary,
} from "@/services/monitoring/upload-import-service";
import {
  detectUploadType,
  isMimeAllowed,
  uploadFile,
  MAX_UPLOAD_BYTES,
  type UploadType,
} from "@/services/monitoring/uploads-service";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  onImported?: () => void;
}

type Stage = "select" | "classify" | "validate" | "preview" | "importing" | "done" | "error";

export function UploadWizard({ open, onClose, projectId, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<UploadType>("other");
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setUploadType("other");
    setPreview(null);
    setMapping({});
    setValidation(null);
    setStage("select");
    setError(null);
    setBusy(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const parse = useCallback(async (f: File, t: UploadType) => {
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    try {
      if (t === "csv" || ext === "csv") return await parseCsv(f);
      if (t === "excel" || ext === "xls" || ext === "xlsx") return await parseExcel(f);
      if (t === "geojson" || ext === "geojson" || ext === "json") return await parseGeoJson(f);
      if (t === "kml" || ext === "kml") return await parseKml(f);
      if (t === "gpx" || ext === "gpx") return await parseGpx(f);
      if (t === "image" || t === "drone_photo" || f.type.startsWith("image/")) return await parseImage(f);
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
    return null;
  }, []);

  const handleFile = async (f: File) => {
    setError(null);
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`Filen er for stor. Maks ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    const mime = f.type || "application/octet-stream";
    if (!isMimeAllowed(mime)) {
      setError(`Filtypen ${mime} understøttes ikke.`);
      return;
    }
    const t = detectUploadType(f.name, mime);
    setFile(f);
    setUploadType(t);
    setStage("classify");
    setBusy(true);
    const p = await parse(f, t);
    setPreview(p);
    if (p && p.kind === "tabular") {
      const m = suggestMapping(p.headers);
      setMapping(m);
      setValidation(validateTabular(p, m));
    }
    setBusy(false);
  };

  const startImport = async () => {
    if (!file) return;
    setStage("importing");
    setError(null);
    try {
      const detected: Record<string, unknown> = {};
      if (preview?.kind === "tabular") {
        detected.headers = preview.headers;
        detected.total_rows = preview.totalRows;
        detected.column_mapping = mapping;
        if (validation) detected.validation = validation;
      } else if (preview?.kind === "geo") {
        detected.feature_count = preview.featureCount;
        detected.points = preview.points;
        detected.lines = preview.lines;
        detected.polygons = preview.polygons;
        detected.bbox = preview.bbox;
      } else if (preview?.kind === "image") {
        detected.width = preview.width;
        detected.height = preview.height;
        if (preview.latitude != null) detected.latitude = preview.latitude;
        if (preview.longitude != null) detected.longitude = preview.longitude;
        if (preview.capturedAt) detected.captured_at = preview.capturedAt;
        if (preview.cameraMake) detected.camera_make = preview.cameraMake;
        if (preview.cameraModel) detected.camera_model = preview.cameraModel;
      }
      await uploadFile({
        file,
        projectId,
        uploadType,
        detectedMetadata: detected,
      });
      setStage("done");
      onImported?.();
    } catch (err) {
      setError((err as Error).message);
      setStage("error");
    }
  };

  const canImport = useMemo(() => {
    if (!file || !preview) return false;
    if (preview.kind === "tabular") return preview.totalRows > 0;
    if (preview.kind === "geo") return preview.featureCount > 0;
    return true;
  }, [file, preview]);

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Upload & importer fil"
      subtitle="Klassificér → validér → preview → importer"
      footer={
        <>
          <button onClick={handleClose} className="text-xs rounded-lg border bg-card px-3 py-1.5">
            Luk
          </button>
          {stage !== "done" && stage !== "importing" && (
            <button
              onClick={startImport}
              disabled={!canImport || busy}
              className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <UploadCloud className="h-3.5 w-3.5" /> Importér
            </button>
          )}
          {stage === "done" && (
            <button onClick={reset} className="text-xs rounded-lg border bg-card px-3 py-1.5">
              Ny fil
            </button>
          )}
        </>
      }
    >
      {stage === "select" && !file && (
        <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer hover:bg-muted/30">
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div className="mt-2 text-sm font-medium">Vælg fil eller træk hertil</div>
          <div className="text-xs text-muted-foreground mt-1">
            CSV, Excel, GeoJSON, KML, GPX, billeder, PDF, dokument, drone-media
          </div>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
      )}

      {error && (
        <div className="rounded-lg border bg-destructive/10 border-destructive/30 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {file && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {preview?.kind === "image" ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              ) : preview?.kind === "geo" ? (
                <MapPin className="h-4 w-4 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium">{file.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {Math.round(file.size / 1024)} KB · {uploadType}
                </div>
              </div>
            </div>
            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="mt-3">
            <div className="text-[11px] text-muted-foreground mb-1">Klassificér som</div>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as UploadType)}
              className="w-full rounded-lg border bg-card px-2 py-1.5 text-sm"
            >
              {["image", "video", "audio", "csv", "excel", "geojson", "kml", "gpx", "pdf", "document", "drone_photo", "drone_video", "orthophoto", "sensor_data", "field_observation", "species_observation", "map_layer", "other"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {preview?.kind === "tabular" && (
        <div className="space-y-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-sm font-semibold mb-2">Kolonnemapping</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(["timestamp", "value", "latitude", "longitude", "parameter", "device"] as const).map((k) => (
                <label key={k} className="block">
                  <div className="text-muted-foreground mb-0.5 capitalize">{k}</div>
                  <select
                    value={mapping[k] ?? ""}
                    onChange={(e) => {
                      const next = { ...mapping, [k]: e.target.value || undefined };
                      setMapping(next);
                      if (preview) setValidation(validateTabular(preview, next));
                    }}
                    className="w-full rounded border bg-card px-2 py-1 text-xs"
                  >
                    <option value="">— ingen —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {validation && (
            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="font-semibold mb-2">Validering</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Stat label="Total" value={validation.totalRows} />
                <Stat label="Valide" value={validation.validRows} tone="success" />
                <Stat label="Ugyldige" value={validation.invalidRows} tone={validation.invalidRows > 0 ? "danger" : "muted"} />
              </div>
              {validation.warnings.map((w) => (
                <div key={w} className="mt-2 text-xs text-warning-foreground flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5" /> {w}
                </div>
              ))}
              {validation.errors.map((e) => (
                <div key={e} className="mt-2 text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5" /> {e}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border bg-card p-3">
            <div className="text-sm font-semibold mb-2">Preview (første {preview.sampleRows.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    {preview.headers.slice(0, 6).map((h) => (
                      <th key={h} className="px-2 py-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((r, i) => (
                    <tr key={i} className="border-b">
                      {preview.headers.slice(0, 6).map((h) => (
                        <td key={h} className="px-2 py-1 truncate max-w-[120px]">{String(r[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {preview?.kind === "geo" && (
        <div className="rounded-lg border bg-card p-3 text-sm space-y-2">
          <div className="font-semibold">Geografisk indhold</div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <Stat label="Features" value={preview.featureCount} />
            <Stat label="Points" value={preview.points} />
            <Stat label="Lines" value={preview.lines} />
            <Stat label="Polygoner" value={preview.polygons} />
          </div>
          {preview.bbox && (
            <div className="text-xs text-muted-foreground">
              BBOX: {preview.bbox.map((n) => n.toFixed(4)).join(", ")}
            </div>
          )}
          {preview.errors.map((e) => (
            <div key={e} className="text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5" /> {e}
            </div>
          ))}
        </div>
      )}

      {preview?.kind === "image" && (
        <div className="rounded-lg border bg-card p-3 text-sm space-y-2">
          <div className="font-semibold">Billed-metadata</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Bredde" value={preview.width ?? "—"} />
            <Stat label="Højde" value={preview.height ?? "—"} />
            <Stat label="GPS lat" value={preview.latitude != null ? preview.latitude.toFixed(5) : "—"} tone={preview.latitude != null ? "success" : "muted"} />
            <Stat label="GPS lng" value={preview.longitude != null ? preview.longitude.toFixed(5) : "—"} tone={preview.longitude != null ? "success" : "muted"} />
          </div>
          {preview.capturedAt && <div className="text-xs text-muted-foreground">Taget: {new Date(preview.capturedAt).toLocaleString()}</div>}
          {(preview.cameraMake || preview.cameraModel) && (
            <div className="text-xs text-muted-foreground">Kamera: {preview.cameraMake} {preview.cameraModel}</div>
          )}
          {preview.latitude == null && (
            <div className="text-xs text-warning-foreground flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5" /> Ingen GPS i EXIF — filen får ingen kortplacering før den tagges manuelt.
            </div>
          )}
        </div>
      )}

      {stage === "importing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Uploader og opretter kø-post…
        </div>
      )}

      {stage === "done" && (
        <div className="rounded-xl border bg-success/10 p-4 text-sm flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
          <div>
            <div className="font-semibold">Fil uploadet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Filen ligger nu i upload-køen med status "Afventer validering". Åbn Upload center for at godkende og route til map/Ledger/DecisionsIQ.
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: string | number; tone?: "muted" | "success" | "danger" }) {
  const cls = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
