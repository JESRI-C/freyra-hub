import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui-bits";
import { Section } from "@/components/connect/Primitives";
import {
  MapToolbar, MapSearchBox, LayerControlPanel, MapCanvas, ZoneCard,
  SelectedMapObjectPanel, PolygonDrawModal, AreaMeasurementBadge,
  DataCoveragePanel, MapInsightCard, Toast,
  type MapSelection,
} from "@/components/connect/MapPrimitives";
import { LAYER_DEFS, MAP_PROJECTS, MOCK_ZONES_GEO, type LayerKey } from "@/lib/connect-map-data";

export const Route = createFileRoute("/app/connect/map")({
  component: Page,
});

function Page() {
  const [project, setProject] = useState(MAP_PROJECTS[0].name);
  const [active, setActive] = useState<Record<LayerKey, boolean>>(
    Object.fromEntries(LAYER_DEFS.map((l) => [l.key, l.defaultOn])) as Record<LayerKey, boolean>
  );
  const [tool, setTool] = useState<any>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<{ x: number; y: number }[]>([]);
  const [drawArea, setDrawArea] = useState<number>(0);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [zones, setZones] = useState(MOCK_ZONES_GEO);
  const [toast, setToast] = useState<string | null>(null);

  const projects = MAP_PROJECTS;
  const projectArea = useMemo(() => projects.find((p) => p.name === project)?.area ?? "—", [project, projects]);

  const handleTool = (t: typeof tool) => {
    setTool(t);
    if (t === "zone" || t === "boundary") {
      setDrawing(true);
      setDrawnPoints([]);
      setDrawArea(0);
    } else {
      setDrawing(false);
    }
    if (t === "save") setToast("Kortvisning gemt på projektet");
    if (t === "export") setToast("GeoJSON eksporteret (mock)");
    if (t === "upload") setToast("Åbn Upload center for at tilføje kortlag");
    if (t === "measure") {
      setDrawing(true);
      setDrawnPoints([]);
      setDrawArea(0);
      setTool("zone");
    }
  };

  const finishDraw = () => {
    if (drawnPoints.length >= 3) setShowZoneModal(true);
    setDrawing(false);
  };

  return (
    <main className="p-6 max-w-[1500px] w-full mx-auto space-y-4">
      <PageHeader
        title="Kort & zoner"
        description="Geospatialt arbejdsrum — projekter, zoner, sensorer, uploadede lag og dækning."
      />

      <div className="grid lg:grid-cols-[280px_1fr_340px] gap-4">
        {/* Left panel */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1.5">Projekt</div>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm"
            >
              {projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <div className="text-[11px] text-muted-foreground mt-1.5">Areal: {projectArea}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <LayerControlPanel active={active} onToggle={(k, v) => setActive({ ...active, [k]: v })} />
          </div>
        </div>

        {/* Center */}
        <div className="space-y-3">
          <MapSearchBox onPick={(s) => setToast(`Centreret på ${s}`)} />
          <MapToolbar active={tool} onTool={handleTool} areaText={drawArea > 0 ? `${drawArea.toFixed(1)} ha` : undefined} />
          <div className="rounded-xl border bg-card overflow-hidden">
            <MapCanvas
              layers={active}
              project={project}
              drawing={drawing}
              onPick={(s) => !drawing && setSelection(s)}
              drawnPoints={drawnPoints}
              onCanvasClick={(x, y) => {
                const next = [...drawnPoints, { x, y }];
                setDrawnPoints(next);
                setDrawArea(mockArea(next));
              }}
              onDoubleClick={finishDraw}
            />
          </div>
          {drawArea > 0 && <AreaMeasurementBadge ha={drawArea} />}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <SelectedMapObjectPanel
            selection={selection}
            onClose={() => setSelection(null)}
            onAction={(a) => setToast(`${a} udført (mock)`)}
          />
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold mb-3">Datadækning</div>
            <DataCoveragePanel gaps={3} />
          </div>
        </div>
      </div>

      <Section title="Zoner" subtitle="Klik for at se detaljer i højre panel">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {zones.map((z) => (
            <ZoneCard key={z.name} z={z} onOpen={() => setSelection({ kind: "zone", data: z })} />
          ))}
        </div>
      </Section>

      <MapInsightCard text="Zone C har lav feltdata-dækning og bør prioriteres ved næste besigtigelse. Drone coverage mangler i det nordøstlige hjørne, hvilket påvirker rapportklarhed for biodiversitet." />

      <PolygonDrawModal
        open={showZoneModal}
        areaText={`${drawArea.toFixed(1)} ha`}
        onClose={() => { setShowZoneModal(false); setDrawnPoints([]); setDrawArea(0); }}
        onSave={(z) => {
          setZones([
            ...zones,
            {
              name: `Zone ${String.fromCharCode(65 + zones.length)} — ${z.habitat}`,
              path: pointsToPath(drawnPoints),
              area: `${drawArea.toFixed(1)} ha`,
              habitat: z.habitat,
              quality: 80,
              lastObs: "Lige nu",
              sources: 1,
              risk: "Lav",
            },
          ]);
          setShowZoneModal(false);
          setDrawnPoints([]);
          setDrawArea(0);
          setToast(`Zone "${z.name}" gemt — ${drawArea.toFixed(1)} ha`);
        }}
      />

      <Toast msg={toast} onDone={() => setToast(null)} />
    </main>
  );
}

// Shoelace area in viewBox px → mock ha
function mockArea(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2 / 240; // scale to plausible ha
}

function pointsToPath(pts: { x: number; y: number }[]) {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ") + " Z";
}
