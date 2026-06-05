import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Hexagon, Ruler, Square, MapPin } from "lucide-react";
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
import { useMapEditor } from "@/hooks/useMapEditor";
import { useNdvi } from "@/hooks/useNdvi";
import { getProjects } from "@/services/projects-service";
import { ZONE_TYPE_LABELS, type ZoneType } from "@/services/zones-service";

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

  const lat = project?.geometry_centroid_lat ?? null;
  const lng = project?.geometry_centroid_lng ?? null;
  const hasGeometry = !!project && lat != null && lng != null;

  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-4">
      <PageHeader
        title="Kort & zoner"
        description="Geospatialt arbejdsrum — tegn projektgrænse og zoner, slå lag til/fra og se datadækning."
      />

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
        </div>

        {/* ── Center: toolbar + map ────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
            <ToolButton
              active={map.drawMode === "boundary"}
              onClick={() => map.setDrawMode("boundary")}
              icon={<Square className="h-3.5 w-3.5" />}
              label="Tegn projektgrænse"
            />
            <ToolButton
              active={map.drawMode === "zone"}
              onClick={() => map.setDrawMode("zone")}
              icon={<Hexagon className="h-3.5 w-3.5" />}
              label="Tegn zone"
            />
            <ToolButton
              active={map.drawMode === "measure"}
              onClick={() => map.setDrawMode("measure")}
              icon={<Ruler className="h-3.5 w-3.5" />}
              label="Mål areal"
            />
            <ToolButton
              active={map.drawMode === "none"}
              onClick={() => map.setDrawMode("none")}
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Stop tegning"
            />
            <div className="ml-auto text-[11px] text-muted-foreground pr-2">
              {map.drawMode !== "none"
                ? `Aktivt værktøj: ${map.drawMode}`
                : "Vælg et værktøj for at tegne"}
            </div>
          </div>

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
        onCancel={() => map.setDrawMode("none")}
        onConfirm={(name, type) => map.confirmCreateZone(name, type)}
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

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
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
  useMemo(() => {
    if (open) setName(defaultName);
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
