import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, CheckCircle2, AlertCircle, X } from "lucide-react";
import { PageHeader, Card, CardHeader, Pill } from "@/components/ui-bits";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MapEditorMap } from "@/components/maps/MapEditorMap";
import { SpeciesIdentifier } from "@/components/nature/SpeciesIdentifier";
import { useMapEditor } from "@/hooks/useMapEditor";
import { useNdvi } from "@/hooks/useNdvi";
import { useFullAnalysis } from "@/hooks/useFullAnalysis";
import { getProjects } from "@/services/projects-service";
import { ZONE_TYPE_LABELS, type Zone, type ZoneType } from "@/services/zones-service";
import {
  buildProjectGeoJSON,
  buildMetricsCsv,
  buildZonesCsv,
  downloadGeoJSON,
  downloadCsv,
} from "@/services/export-service";

export const Route = createFileRoute("/app/connect/map")({
  head: () => ({ meta: [{ title: "Kort & zoner — GoFreyra" }] }),
  component: Page,
});

const SKALLEBAEK_SLUG = "skallebaek-biodiversity-pilot";

function Page() {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 5 * 60 * 1000,
  });

  const projects = projectsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const project = useMemo(() => {
    if (!projects.length) return null;
    if (selectedId) return projects.find((p) => p.id === selectedId) ?? null;
    return (
      projects.find((p) => p.slug === SKALLEBAEK_SLUG) ??
      projects.find((p) => p.geometry_centroid_lat && p.geometry_centroid_lng) ??
      projects[0]
    );
  }, [projects, selectedId]);

  const { ndvi } = useNdvi(
    project?.id ?? "",
    project?.geometry_centroid_lat ?? null,
    project?.geometry_centroid_lng ?? null,
  );

  const map = useMapEditor(project, ndvi);
  const analysis = useFullAnalysis(project);

  const lat = project?.geometry_centroid_lat ?? null;
  const lng = project?.geometry_centroid_lng ?? null;
  const hasGeometry = !!project && lat != null && lng != null;

  const handleExportGeoJSON = () => {
    if (!project) return;
    const gj = buildProjectGeoJSON({
      project,
      zones: map.zones,
      sensors: map.sensors,
      paragraph3Areas: map.paragraph3Areas,
      watercourses: map.watercourseFeatures,
      analysis: analysis.summary,
    });
    downloadGeoJSON(gj, project.slug ?? "projekt");
  };

  const handleExportMetricsCsv = async () => {
    if (!project) return;
    const csv = await buildMetricsCsv(project, analysis.summary);
    downloadCsv(csv, `${project.slug ?? "projekt"}-metrics.csv`);
  };

  const handleExportZonesCsv = () => {
    if (!project || map.zones.length === 0) return;
    downloadCsv(buildZonesCsv(map.zones), `${project.slug ?? "projekt"}-zoner.csv`);
  };

  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-4">
      <PageHeader
        title="Kort & zoner"
        description="Geospatialt arbejdsrum — tegn projektgrænse og zoner, slå lag til/fra og se datadækning."
      />

      {/* Fejl- og succes-bannere */}
      {map.lastError && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{map.lastError}</span>
          <button onClick={map.clearError} aria-label="Luk">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {map.boundarySaved && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Projektgrænse gemt — areal og centroid er opdateret.
        </div>
      )}

      <div className="grid lg:grid-cols-[280px_1fr_320px] gap-4">
        {/* ── Left panel ───────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Projekt</div>
            <select
              value={project?.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
              disabled={!projects.length}
            >
              {!projects.length && <option value="">Indlæser…</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {project && (
              <div className="text-[11px] text-muted-foreground mt-2 space-y-0.5">
                <div className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lat != null && lng != null
                    ? `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`
                    : "Ingen koordinater"}
                </div>
                <div>Areal: {project.geometry_area_ha?.toFixed(1) ?? "—"} ha</div>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold">Kortlag</div>
            <LayerToggle
              label="IoT sensorer"
              checked={map.showSensors}
              onChange={map.setShowSensors}
            />
            <LayerToggle
              label="§3 natur"
              checked={map.showParagraph3}
              onChange={map.setShowParagraph3}
            />
            <LayerToggle
              label="Vandløb"
              checked={map.showWatercourses}
              onChange={map.setShowWatercourses}
            />
            <LayerToggle
              label="NDVI overlay"
              checked={map.showNdviOverlay}
              onChange={map.setShowNdviOverlay}
            />
          </Card>

          <SpeciesIdentifier project={project} />
        </div>

        {/* ── Center: toolbar + map ────────────────────────────────── */}
        <div className="space-y-3">

          <div className="rounded-xl border bg-card overflow-hidden">
            {hasGeometry && project ? (
              <MapEditorMap
                projectId={project.id}
                projectName={project.name}
                lat={lat!}
                lng={lng!}
                areaHa={project.geometry_area_ha ?? undefined}
                boundaryGeoJSON={project.geometry_polygon as never}
                zones={map.zones}
                sensors={map.sensors}
                showSensors={map.showSensors}
                showParagraph3={map.showParagraph3}
                showWatercourses={map.showWatercourses}
                showNdviOverlay={map.showNdviOverlay}
                ndviValue={ndvi}
                drawMode={map.drawMode}
                onDrawModeChange={map.setDrawMode}
                onZoneCreated={map.handleZoneCreated}
                onZoneClicked={map.setSelectedZone}
                onBoundaryDrawn={map.handleBoundaryDrawn}
                paragraph3Areas={map.paragraph3Areas}
                watercourseFeatures={map.watercourseFeatures}
                height={540}
              />
            ) : (
              <div className="h-[540px] grid place-items-center text-sm text-muted-foreground">
                {projectsQuery.isLoading
                  ? "Indlæser projekter…"
                  : "Vælg et projekt med koordinater for at se kortet."}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Datadækning" subtitle="Status pr. datakilde" />
            <div className="px-5 pb-5 space-y-3">
              <CoverageBar label="IoT sensorer" value={map.coverage.sensor} />
              <CoverageBar label="Satellit (NDVI)" value={map.coverage.satellite} />
              <CoverageBar label="§3 natur" value={map.coverage.nature} />
              <CoverageBar label="Feltobservationer" value={map.coverage.field} />
            </div>
          </Card>

          {ndvi != null && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Aktuel NDVI</div>
              <div className="text-2xl font-semibold mt-1">{ndvi.toFixed(2)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Sentinel-2 — opdateres automatisk
              </div>
            </Card>
          )}

          {/* ── Fuld miljøanalyse ─────────────────────────────────────── */}
          <Card>
            <CardHeader title="Miljøanalyse" subtitle="Satellit, natur, klima og vand" />
            <div className="px-5 pb-5 space-y-3">
              <button
                onClick={analysis.run}
                disabled={analysis.isRunning || !hasGeometry}
                className="w-full text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2.5 font-medium disabled:opacity-50"
              >
                {analysis.isRunning ? analysis.stepLabel : "▶ Kør fuld analyse"}
              </button>

              {analysis.error && (
                <div className="text-xs text-destructive">{analysis.error}</div>
              )}

              {analysis.summary && (
                <div className="space-y-2 text-sm">
                  <ResultRow label="NDVI" value={analysis.summary.ndviValue?.toFixed(2) ?? "—"} />
                  <ResultRow
                    label="Biodiversitet"
                    value={analysis.summary.biodiversityScore != null
                      ? `${analysis.summary.biodiversityScore}/100 · ${analysis.summary.biodiversityClass}`
                      : "—"}
                  />
                  <ResultRow
                    label="§3-natur"
                    value={analysis.summary.p3OverlapHa != null ? `${analysis.summary.p3OverlapHa} ha` : "—"}
                  />
                  <ResultRow
                    label="Arter"
                    value={analysis.summary.speciesCount != null
                      ? `${analysis.summary.speciesCount} (${analysis.summary.redListedCount ?? 0} rødlistede)`
                      : "—"}
                  />
                  <ResultRow
                    label="CO₂-binding"
                    value={analysis.summary.annualCO2 != null ? `${analysis.summary.annualCO2} t/år` : "—"}
                  />
                  <ResultRow
                    label="Vandrisiko"
                    value={analysis.summary.waterRisk ?? "—"}
                  />
                  <div className="text-[11px] text-muted-foreground pt-1">
                    Gennemført på {analysis.durationS}s — gemt i databasen
                    {analysis.stepsFailed.length > 0 && ` · ${analysis.stepsFailed.length} trin fejlede`}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* ── Dataudtræk ────────────────────────────────────────────── */}
          <Card>
            <CardHeader title="Dataudtræk" subtitle="Download projektets data" />
            <div className="px-5 pb-5 space-y-2">
              <button
                onClick={handleExportGeoJSON}
                disabled={!project}
                className="w-full text-sm rounded-lg border px-3 py-2 hover:bg-muted text-left disabled:opacity-50"
              >
                ⬇ GeoJSON — grænse, zoner, sensorer, §3, vandløb
              </button>
              <button
                onClick={handleExportMetricsCsv}
                disabled={!project}
                className="w-full text-sm rounded-lg border px-3 py-2 hover:bg-muted text-left disabled:opacity-50"
              >
                ⬇ CSV — indikatorer og analyseresultater
              </button>
              <button
                onClick={handleExportZonesCsv}
                disabled={!project || map.zones.length === 0}
                className="w-full text-sm rounded-lg border px-3 py-2 hover:bg-muted text-left disabled:opacity-50"
              >
                ⬇ CSV — zoner med areal
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Zone list ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Zoner"
          subtitle={`${map.zones.length} zone${map.zones.length === 1 ? "" : "r"} registreret`}
        />
        <div className="px-5 pb-5">
          {map.zones.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Ingen zoner endnu. Brug "Tegn zone" til at oprette den første.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {map.zones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => map.setSelectedZone(zone)}
                  className="rounded-xl border p-3 text-left hover:bg-muted transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{zone.name}</div>
                    <Pill tone="default">{ZONE_TYPE_LABELS[zone.area_type]}</Pill>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {zone.area_ha?.toFixed(2) ?? "—"} ha
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── New zone dialog ────────────────────────────────────────── */}
      <NewZoneDialog
        open={!!map.newZoneState}
        areaHa={map.newZoneState?.area_ha ?? 0}
        defaultName={map.newZoneState?.name ?? ""}
        isSaving={map.isSavingZone}
        onCancel={map.cancelNewZone}
        onConfirm={(name, type) => map.confirmCreateZone(name, type)}
      />

      {/* ── Zone detail dialog (rediger/slet) ──────────────────────── */}
      <ZoneDetailDialog
        zone={map.selectedZone}
        isUpdating={map.isUpdatingZone}
        isDeleting={map.isDeletingZone}
        onClose={() => map.setSelectedZone(null)}
        onSave={(id, name, type) => map.updateZone(id, { name, area_type: type })}
        onDelete={(id) => map.deleteZone(id)}
      />
    </main>
  );
}

// ─── UI bits ─────────────────────────────────────────────────────────────────

function LayerToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-sm cursor-pointer">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function CoverageBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const tone =
    pct >= 75 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function NewZoneDialog({
  open,
  areaHa,
  defaultName,
  isSaving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  areaHa: number;
  defaultName: string;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (name: string, type: ZoneType) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<ZoneType>("nature");

  // sync default name when dialog opens
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setType("nature");
    }
  }, [open, defaultName]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ny zone</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">
            Beregnet areal: <span className="text-foreground font-medium">{areaHa.toFixed(2)} ha</span>
          </div>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Navn</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
              placeholder="Zone navn"
            />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Type</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ZoneType)}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
            >
              {Object.entries(ZONE_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <button
            onClick={onCancel}
            className="text-sm rounded-lg border px-3 py-2 hover:bg-muted"
          >
            Annullér
          </button>
          <button
            disabled={isSaving || !name.trim()}
            onClick={() => onConfirm(name.trim(), type)}
            className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50"
          >
            {isSaving ? "Gemmer…" : "Gem zone"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZoneDetailDialog({
  zone,
  isUpdating,
  isDeleting,
  onClose,
  onSave,
  onDelete,
}: {
  zone: Zone | null;
  isUpdating: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onSave: (id: string, name: string, type: ZoneType) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ZoneType>("nature");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (zone) {
      setName(zone.name);
      setType(zone.area_type);
      setConfirmDelete(false);
    }
  }, [zone]);

  if (!zone) return null;

  return (
    <Dialog open={!!zone} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redigér zone</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">
            Areal: <span className="text-foreground font-medium">{zone.area_ha?.toFixed(2) ?? "—"} ha</span>
            <span className="mx-2">·</span>
            Oprettet: {new Date(zone.created_at).toLocaleDateString("da-DK")}
          </div>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Navn</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Type</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ZoneType)}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
            >
              {Object.entries(ZONE_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-xs text-destructive">Slet permanent?</span>
              <button
                disabled={isDeleting}
                onClick={() => onDelete(zone.id)}
                className="text-sm rounded-lg bg-destructive text-destructive-foreground px-3 py-2 disabled:opacity-50"
              >
                {isDeleting ? "Sletter…" : "Ja, slet"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm rounded-lg border px-3 py-2 hover:bg-muted"
              >
                Nej
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm rounded-lg border border-destructive/40 text-destructive px-3 py-2 hover:bg-destructive/10 mr-auto"
            >
              Slet zone
            </button>
          )}
          <button
            onClick={onClose}
            className="text-sm rounded-lg border px-3 py-2 hover:bg-muted"
          >
            Annullér
          </button>
          <button
            disabled={isUpdating || !name.trim()}
            onClick={() => onSave(zone.id, name.trim(), type)}
            className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50"
          >
            {isUpdating ? "Gemmer…" : "Gem ændringer"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
