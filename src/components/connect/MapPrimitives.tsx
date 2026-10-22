import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  PencilLine,
  Square,
  Edit3,
  Ruler,
  UploadCloud,
  Save,
  Download,
  X,
  MapPin,
  Layers as LayersIcon,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileText,
  ArrowRight,
  Send,
  Plus,
  Eye,
  Crosshair,
} from "lucide-react";
import { Card, Pill } from "@/components/ui-bits";
import { Chip, DataQualityScore } from "./Primitives";
import {
  LAYER_DEFS,
  MOCK_SENSORS,
  MOCK_FIELD_OBS,
  MOCK_WATER_SAMPLES,
  MOCK_ZONES_GEO,
  SEARCH_SUGGESTIONS,
  MAP_PROJECTS,
  COVERAGE_METRICS,
  ROUTING_DESTINATIONS,
  type LayerKey,
} from "@/lib/connect-map-data";

// ---------- Map toolbar ----------
type ToolKey = "search" | "boundary" | "zone" | "edit" | "measure" | "upload" | "save" | "export";

export function MapToolbar({
  active,
  onTool,
  areaText,
}: {
  active: ToolKey | null;
  onTool: (t: ToolKey) => void;
  areaText?: string;
}) {
  const tools: { k: ToolKey; label: string; icon: LucideIcon }[] = [
    { k: "search", label: "Søg lokation", icon: Search },
    { k: "boundary", label: "Tegn projektgrænse", icon: Square },
    { k: "zone", label: "Tegn zone", icon: PencilLine },
    { k: "edit", label: "Redigér polygon", icon: Edit3 },
    { k: "measure", label: "Mål areal", icon: Ruler },
    { k: "upload", label: "Upload kortlag", icon: UploadCloud },
    { k: "save", label: "Gem visning", icon: Save },
    { k: "export", label: "Eksportér GeoJSON", icon: Download },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-card border rounded-xl">
      {tools.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.k;
        return (
          <button
            key={t.k}
            onClick={() => onTool(t.k)}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-muted"
            }`}
            title={t.label}
          >
            <Icon className="h-3.5 w-3.5" /> <span className="hidden md:inline">{t.label}</span>
          </button>
        );
      })}
      {areaText && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-leaf/30 text-foreground">
          <Ruler className="h-3 w-3" /> Valgt område: {areaText}
        </span>
      )}
    </div>
  );
}

// ---------- Search box ----------
export function MapSearchBox({ onPick }: { onPick: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = SEARCH_SUGGESTIONS.filter((s) =>
    s.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Søg projekt, adresse, område eller koordinat"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-card border rounded-lg shadow-card overflow-hidden">
          {filtered.map((s) => (
            <li key={s.label}>
              <button
                onClick={() => {
                  onPick(s.label);
                  setQ(s.label);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> {s.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {s.type} · {s.coord}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Layer control ----------
export function LayerControlPanel({
  active,
  onToggle,
}: {
  active: Record<LayerKey, boolean>;
  onToggle: (k: LayerKey, v: boolean) => void;
}) {
  return (
    <div>
      <div className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
        <LayersIcon className="h-4 w-4" /> Lag
      </div>
      <ul className="space-y-1">
        {LAYER_DEFS.map((l) => (
          <li key={l.key} className="rounded-lg border bg-card hover:bg-muted/40">
            <label className="flex items-start gap-2 px-2.5 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!active[l.key]}
                onChange={(e) => onToggle(l.key, e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{l.label}</div>
                <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                  <span>
                    {l.source} · {l.lastUpdated}
                  </span>
                  {l.quality > 0 && <DataQualityScore score={l.quality} />}
                </div>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Map canvas ----------
export type MapSelection =
  | { kind: "zone"; data: (typeof MOCK_ZONES_GEO)[number] }
  | { kind: "sensor"; data: (typeof MOCK_SENSORS)[number] }
  | { kind: "field"; data: (typeof MOCK_FIELD_OBS)[number] }
  | { kind: "water"; data: (typeof MOCK_WATER_SAMPLES)[number] }
  | { kind: "gateway"; data: { id: string; label: string } }
  | { kind: "alert"; data: { id: string; label: string } }
  | { kind: "gap"; data: { label: string } };

export function MapCanvas({
  layers,
  project,
  drawing,
  onPick,
  drawnPoints,
  onCanvasClick,
  onDoubleClick,
}: {
  layers: Record<LayerKey, boolean>;
  project: string;
  drawing: boolean;
  onPick: (s: MapSelection) => void;
  drawnPoints: { x: number; y: number }[];
  onCanvasClick?: (x: number, y: number) => void;
  onDoubleClick?: () => void;
}) {
  const proj = MAP_PROJECTS.find((p) => p.name === project) ?? MAP_PROJECTS[0];
  const [lat0, lng0] = proj.center.split(",").map((s) => parseFloat(s.trim())) as [number, number];

  // viewBox(600x400) <-> lat/lng. ~1km wide, ~0.8km tall around project center.
  const DX = 0.012 / 600; // deg lng per vb unit
  const DY = 0.008 / 400; // deg lat per vb unit
  const vbToLatLng = (x: number, y: number): [number, number] => [
    lat0 - (y - 200) * DY,
    lng0 + (x - 300) * DX,
  ];
  const latLngToVb = (lat: number, lng: number): { x: number; y: number } => ({
    x: 300 + (lng - lng0) / DX,
    y: 200 - (lat - lat0) / DY,
  });
  const pathToLatLngs = (path: string): [number, number][] => {
    const coords = path.match(/[ML]\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/g) ?? [];
    return coords.map((c) => {
      const m = c.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      return vbToLatLng(parseFloat(m![1]), parseFloat(m![2]));
    });
  };

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const baseLayersRef = useRef<{
    sat?: import("leaflet").TileLayer;
    osm?: import("leaflet").TileLayer;
    ortho?: import("leaflet").TileLayer;
    terrain?: import("leaflet").TileLayer;
    labels?: import("leaflet").TileLayer;
  }>({});
  const overlayRef = useRef<import("leaflet").LayerGroup | null>(null);
  const drawingRef = useRef<import("leaflet").LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);

  // init map
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const iconProto = L.Icon.Default.prototype as unknown as Record<string, unknown>;
      delete iconProto["_getIconUrl"];
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      const map = L.map(mapEl.current, {
        zoomControl: true,
        doubleClickZoom: false,
        attributionControl: true,
      }).setView([lat0, lng0], 15);

      baseLayersRef.current.sat = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution:
            "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        },
      );
      baseLayersRef.current.osm = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19, attribution: "&copy; OpenStreetMap" },
      );
      baseLayersRef.current.ortho = L.tileLayer(
        "https://services.datafordeler.dk/GeoDanmarkOrto/orto_foraar_wmts/1.0.0/WMTS/?service=WMTS&request=GetTile&version=1.0.0&layer=orto_foraar_wmts&style=default&tilematrixset=View1&format=image/jpeg&tilematrix={z}&tilerow={y}&tilecol={x}",
        { maxZoom: 19, attribution: "Ortofoto &copy; Datafordeleren / SDFI" },
      );
      baseLayersRef.current.terrain = L.tileLayer(
        "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        { maxZoom: 17, attribution: "&copy; OpenTopoMap (CC-BY-SA)", subdomains: "abc" },
      );
      baseLayersRef.current.labels = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
        { maxZoom: 19, attribution: "&copy; CARTO", subdomains: "abcd", pane: "shadowPane" },
      );

      overlayRef.current = L.layerGroup().addTo(map);
      drawingRef.current = L.layerGroup().addTo(map);

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        if (!onCanvasClick) return;
        const { x, y } = latLngToVb(e.latlng.lat, e.latlng.lng);
        onCanvasClick(x, y);
      });
      map.on("dblclick", () => onDoubleClick?.());

      mapRef.current = map;
      // initial base layer
      baseLayersRef.current.sat.addTo(map);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-center on project change
  useEffect(() => {
    if (mapRef.current) mapRef.current.setView([lat0, lng0], 15);
  }, [lat0, lng0]);

  // swap base layers
  useEffect(() => {
    const map = mapRef.current;
    const bl = baseLayersRef.current;
    if (!map) return;
    const setOn = (layer: import("leaflet").TileLayer | undefined, on: boolean) => {
      if (!layer) return;
      const has = map.hasLayer(layer);
      if (on && !has) layer.addTo(map);
      if (!on && has) map.removeLayer(layer);
    };
    // priority: ortofoto > satellite > terrain > osm
    const useOrtho = !!layers.ortofoto;
    const useSat = !useOrtho && !!layers.satellite;
    const useTerrain = !useOrtho && !useSat && !!layers.terrain;
    const useOsm = !useOrtho && !useSat && !useTerrain && !!layers.basemap;
    setOn(bl.ortho, useOrtho);
    setOn(bl.sat, useSat);
    setOn(bl.terrain, useTerrain);
    setOn(bl.osm, useOsm || (!useOrtho && !useSat && !useTerrain));
    // labels overlay on satellite/ortho for context
    setOn(bl.labels, useSat || useOrtho);
  }, [layers.satellite, layers.ortofoto, layers.terrain, layers.basemap]);

  // render overlays (zones, sensors, etc.)
  useEffect(() => {
    const L = LRef.current;
    const og = overlayRef.current;
    if (!L || !og) return;
    og.clearLayers();

    if (layers.boundary) {
      const ring = pathToLatLngs("M60,60 L520,80 L540,300 L80,340 Z");
      L.polygon(ring, {
        color: "#16a34a",
        weight: 2.5,
        dashArray: "6 4",
        fillOpacity: 0.04,
      }).addTo(og);
    }
    if (layers.zones) {
      MOCK_ZONES_GEO.forEach((z, i) => {
        const ring = pathToLatLngs(z.path);
        const poly = L.polygon(ring, {
          color: "#16a34a",
          weight: 1.5,
          fillColor: "#22c55e",
          fillOpacity: 0.1 + i * 0.04,
        })
          .addTo(og)
          .on("click", () => onPick({ kind: "zone", data: z }));
        poly.bindTooltip(z.name, { direction: "center", className: "text-xs" });
      });
    }
    if (layers.drone) {
      L.polygon(pathToLatLngs("M70,70 L420,75 L440,260 L80,250 Z"), {
        color: "#0ea5e9",
        weight: 1,
        dashArray: "3 3",
        fillOpacity: 0.08,
      }).addTo(og);
    }
    if (layers.satellite) {
      // visual NDVI hint rectangle
      L.rectangle(
        [vbToLatLng(40, 40), vbToLatLng(560, 360)],
        { color: "#84cc16", weight: 0, fillOpacity: 0.07 },
      ).addTo(og);
    }
    if (layers.gaps) {
      [
        { x: 420, y: 235, w: 80, h: 60, label: "Datagap nordøst" },
        { x: 460, y: 90, w: 60, h: 40, label: "Drone gap nordøst" },
      ].forEach((g) => {
        const sw = vbToLatLng(g.x, g.y + g.h);
        const ne = vbToLatLng(g.x + g.w, g.y);
        L.rectangle([sw, ne], {
          color: "#f59e0b",
          weight: 1.5,
          dashArray: "4 3",
          fillOpacity: 0.18,
        })
          .addTo(og)
          .on("click", () => onPick({ kind: "gap", data: { label: g.label } }));
      });
    }
    if (layers.sensors) {
      MOCK_SENSORS.forEach((s) => {
        const [la, ln] = vbToLatLng(s.x, s.y);
        L.circleMarker([la, ln], {
          radius: 6,
          color: "#16a34a",
          fillColor: "#22c55e",
          fillOpacity: 0.9,
          weight: 2,
        })
          .addTo(og)
          .bindTooltip(`${s.id} · ${s.label}`)
          .on("click", () => onPick({ kind: "sensor", data: s }));
      });
    }
    if (layers.gateways) {
      const [la, ln] = vbToLatLng(297, 177);
      L.circleMarker([la, ln], {
        radius: 7,
        color: "#dc2626",
        fillColor: "#ef4444",
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(og)
        .bindTooltip("GW-03 offline")
        .on("click", () =>
          onPick({ kind: "gateway", data: { id: "SKB-GW-03", label: "LoRaWAN Gateway 03" } }),
        );
    }
    if (layers.field) {
      MOCK_FIELD_OBS.forEach((f, i) => {
        const [la, ln] = vbToLatLng(f.x, f.y);
        L.circleMarker([la, ln], {
          radius: 5,
          color: "#15803d",
          fillColor: "#86efac",
          fillOpacity: 0.95,
          weight: 1.5,
        })
          .addTo(og)
          .bindTooltip(`${f.label} · ${f.date}`)
          .on("click", () => onPick({ kind: "field", data: f }));
      });
    }
    if (layers.water) {
      MOCK_WATER_SAMPLES.forEach((w, i) => {
        const [la, ln] = vbToLatLng(w.x, w.y);
        L.circleMarker([la, ln], {
          radius: 5,
          color: "#1d4ed8",
          fillColor: "#3b82f6",
          fillOpacity: 0.95,
          weight: 1.5,
        })
          .addTo(og)
          .bindTooltip(`${w.label} · pH ${w.ph}`)
          .on("click", () => onPick({ kind: "water", data: w }));
      });
    }
    if (layers.alerts) {
      const [la, ln] = vbToLatLng(297, 177);
      L.circleMarker([la, ln], {
        radius: 14,
        color: "#dc2626",
        weight: 1.5,
        fillOpacity: 0.18,
      })
        .addTo(og)
        .bindTooltip("Alert: Sensor Gateway 03 offline");
    }
  }, [layers, onPick]);

  // drawing overlay
  useEffect(() => {
    const L = LRef.current;
    const dg = drawingRef.current;
    if (!L || !dg) return;
    dg.clearLayers();
    if (drawnPoints.length === 0) return;
    const latlngs = drawnPoints.map((p) => vbToLatLng(p.x, p.y));
    L.polyline(latlngs, {
      color: "#16a34a",
      weight: 2,
      dashArray: "4 3",
    }).addTo(dg);
    if (drawnPoints.length >= 3) {
      L.polygon(latlngs, {
        color: "#16a34a",
        weight: 0,
        fillColor: "#22c55e",
        fillOpacity: 0.18,
      }).addTo(dg);
    }
    latlngs.forEach(([la, ln]) =>
      L.circleMarker([la, ln], {
        radius: 3,
        color: "#16a34a",
        fillColor: "#16a34a",
        fillOpacity: 1,
        weight: 1,
      }).addTo(dg),
    );
  }, [drawnPoints]);

  return (
    <div className="relative h-[560px] overflow-hidden">
      <div
        ref={mapEl}
        className={`absolute inset-0 ${drawing ? "cursor-crosshair" : ""}`}
        style={{ zIndex: 0 }}
      />

      {/* Project chip */}
      <div className="absolute top-3 left-3 z-[400] inline-flex items-center gap-1.5 text-xs bg-card/95 border rounded-full px-2.5 py-1 shadow-soft">
        <MapPin className="h-3 w-3 text-primary" /> {proj.name} · {proj.area}
      </div>

      {/* Drawing instruction */}
      {drawing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] inline-flex items-center gap-2 text-xs bg-foreground text-background rounded-full px-3 py-1.5 shadow-card">
          <Crosshair className="h-3.5 w-3.5" /> Klik på kortet for at tegne. Dobbeltklik for at
          afslutte.
        </div>
      )}

      {/* Mini legend */}
      <div className="absolute bottom-3 right-3 z-[400] bg-card/95 border rounded-lg p-2.5 text-[11px] space-y-1 shadow-soft">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Sensor
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "#ef4444" }} /> Gateway /
          Alert
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "#86efac" }} /> Feltobservation
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "#3b82f6" }} /> Vandprøve
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2" style={{ background: "#f59e0b" }} /> Datagap
        </div>
      </div>
    </div>
  );
}


// ---------- Zone card ----------
export function ZoneCard({
  z,
  onOpen,
}: {
  z: (typeof MOCK_ZONES_GEO)[number];
  onOpen: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 hover:shadow-soft transition">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{z.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {z.area} · {z.habitat}
          </div>
        </div>
        <Chip tone={z.risk === "Lav" ? "primary" : "muted"}>Risiko: {z.risk}</Chip>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Sidste obs.: {z.lastObs}</span>
        <DataQualityScore score={z.quality} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">{z.sources} koblede datakilder</div>
      <button
        onClick={onOpen}
        className="mt-3 w-full text-xs rounded-lg border bg-card hover:bg-muted px-3 py-1.5 inline-flex items-center justify-center gap-1.5"
      >
        Åbn zone <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// ---------- Selected map object panel ----------
export function SelectedMapObjectPanel({
  selection,
  onClose,
  onAction,
}: {
  selection: MapSelection | null;
  onClose: () => void;
  onAction: (label: string) => void;
}) {
  if (!selection) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">Intet valgt</div>
        Klik på en zone, sensor, gateway, observation, vandprøve, datagap eller alert på kortet for
        at se detaljer.
      </div>
    );
  }
  const blocks = describeSelection(selection);
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-start justify-between p-4 border-b">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{blocks.kind}</div>
          <div className="text-sm font-semibold mt-0.5">{blocks.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{blocks.subtitle}</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          {blocks.kv.map((row) => (
            <div key={row.k} className="rounded-lg border bg-muted/30 p-2.5">
              <div className="text-[11px] text-muted-foreground">{row.k}</div>
              <div className="text-sm mt-0.5">{row.v}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs font-medium mb-1.5">Koblede moduler</div>
          <div className="flex flex-wrap gap-1.5">
            {blocks.modules.map((m) => (
              <Chip key={m} tone="primary">
                {m}
              </Chip>
            ))}
          </div>
        </div>
        {blocks.related.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">Relateret</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {blocks.related.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="p-3 border-t bg-muted/30 flex flex-wrap gap-1.5">
        {[
          "Kobl datakilde",
          "Send til ESG Ledger",
          "Brug i rapport",
          "Se observationer",
          "Redigér",
        ].map((a) => (
          <button
            key={a}
            onClick={() => onAction(a)}
            className="text-xs rounded-lg border bg-card hover:bg-muted px-2.5 py-1"
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

function describeSelection(s: MapSelection) {
  switch (s.kind) {
    case "zone":
      return {
        kind: "Zone",
        title: s.data.name,
        subtitle: `${s.data.area} · ${s.data.habitat}`,
        kv: [
          { k: "Areal", v: s.data.area },
          { k: "Habitat", v: s.data.habitat },
          { k: "Datakvalitet", v: <DataQualityScore score={s.data.quality} /> },
          { k: "Sidste observation", v: s.data.lastObs },
          { k: "Datakilder", v: `${s.data.sources}` },
          { k: "Risiko", v: s.data.risk },
        ],
        modules: ["Smart Connect", "ESG Ledger", "Impact Exchange", "Reports"],
        related: ["DecisionsIQ anbefaling: Øg overvågning", "Rapport: Kvartalsrapport Q2 2026"],
      };
    case "sensor":
      return {
        kind: "Sensor",
        title: s.data.id,
        subtitle: s.data.label,
        kv: [
          { k: "Zone", v: s.data.zone },
          { k: "Datakvalitet", v: <DataQualityScore score={s.data.quality} /> },
          { k: "Status", v: <Pill tone="success">Online</Pill> },
          { k: "Koordinater", v: "55.252, 9.488" },
        ],
        modules: ["DecisionsIQ", "ESG Ledger"],
        related: ["Live data feed", "Alert: ingen aktive"],
      };
    case "field":
      return {
        kind: "Feltobservation",
        title: s.data.label,
        subtitle: `Observeret ${s.data.date}`,
        kv: [
          { k: "Type", v: "Artsregistrering" },
          { k: "Kilde", v: "Field App" },
          { k: "Verifikation", v: "Afventer" },
          { k: "Koordinater", v: "55.250, 9.491" },
        ],
        modules: ["Impact Exchange"],
        related: ["Verifikationsflow åbent"],
      };
    case "water":
      return {
        kind: "Vandprøve",
        title: s.data.label,
        subtitle: `pH ${s.data.ph}`,
        kv: [
          { k: "pH", v: s.data.ph },
          { k: "Kilde", v: "Lab" },
          { k: "Koordinater", v: "55.251, 9.489" },
          { k: "Verifikation", v: "Verificeret" },
        ],
        modules: ["ESG Ledger", "Reports"],
        related: ["Vandkvalitetsrapport Q2"],
      };
    case "gateway":
      return {
        kind: "Gateway",
        title: s.data.id,
        subtitle: s.data.label,
        kv: [
          { k: "Status", v: <Pill tone="danger">Offline</Pill> },
          { k: "Sidste kontakt", v: "3 t siden" },
          { k: "Connection", v: "LoRaWAN" },
          { k: "Koordinater", v: "55.252, 9.490" },
        ],
        modules: [],
        related: ["Alert ALT-2041 åben"],
      };
    case "alert":
      return {
        kind: "Alert",
        title: s.data.id,
        subtitle: s.data.label,
        kv: [
          { k: "Severity", v: <Pill tone="danger">Kritisk</Pill> },
          { k: "Status", v: "Åben" },
          { k: "Owner", v: "Mikkel Holm" },
          { k: "Oprettet", v: "I dag 09:14" },
        ],
        modules: ["Smart Connect"],
        related: ["Sensor Gateway 03"],
      };
    case "gap":
      return {
        kind: "Datagap",
        title: s.data.label,
        subtitle: "Manglende dækning",
        kv: [
          { k: "Areal", v: "0,9 ha" },
          { k: "Mangler", v: "Drone + felt" },
          { k: "Sidste data", v: "12 dage siden" },
          { k: "Påvirker", v: "Rapportklarhed" },
        ],
        modules: ["Reports"],
        related: ["DecisionsIQ: Prioritér feltbesøg"],
      };
  }
}

// ---------- Polygon draw mock modal ----------
export function PolygonDrawModal({
  open,
  areaText,
  onClose,
  onSave,
}: {
  open: boolean;
  areaText: string;
  onClose: () => void;
  onSave: (z: { name: string; type: string; habitat: string }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Habitat zone");
  const [habitat, setHabitat] = useState("Eng og vådområde");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card rounded-2xl border shadow-card overflow-hidden">
        <div className="p-5 border-b">
          <div className="text-base font-semibold">Ny zone</div>
          <div className="text-xs text-muted-foreground mt-0.5">Beregnet areal: {areaText}</div>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Zonenavn">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Zone E — Strandeng"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Zonetype">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {["Habitat zone", "Buffer", "Måleområde", "Restoration"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Habitattype">
            <select
              value={habitat}
              onChange={(e) => setHabitat(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {["Vandløb", "Eng og vådområde", "Skovkant", "Buffer", "Hav/kyst", "Strandeng"].map(
                (t) => (
                  <option key={t}>{t}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Tilknyt datakilder">
            <div className="flex flex-wrap gap-1.5">
              {["Sensorer", "Drone Q2", "Sentinel-2 NDVI", "Field App", "Vandprøver"].map((s) => (
                <label
                  key={s}
                  className="text-xs rounded-full border px-2.5 py-1 bg-muted/40 inline-flex items-center gap-1.5"
                >
                  <input type="checkbox" defaultChecked={s === "Sensorer"} /> {s}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <div className="p-4 border-t bg-muted/30 flex justify-end gap-2">
          <button onClick={onClose} className="text-xs rounded-lg border bg-card px-3 py-1.5">
            Annullér
          </button>
          <button
            onClick={() => onSave({ name: name || "Ny zone", type, habitat })}
            className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Gem zone
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

// ---------- Area badge ----------
export function AreaMeasurementBadge({ ha }: { ha: number }) {
  const m2 = (ha * 10000).toLocaleString("da-DK");
  const km2 = (ha / 100).toFixed(3);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">Beregnet areal</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{ha.toFixed(1)} ha</div>
      <div className="text-xs text-muted-foreground mt-1">
        {m2} m² · {km2} km²
      </div>
    </div>
  );
}

// ---------- Data coverage panel ----------
export function DataCoveragePanel({ gaps = 3 }: { gaps?: number }) {
  return (
    <div className="space-y-3">
      {COVERAGE_METRICS.map((c) => (
        <div key={c.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">{c.label}</span>
            <span className="font-medium tabular-nums">{c.value}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${c.value}%` }} />
          </div>
        </div>
      ))}
      <div className="rounded-lg border bg-warning/15 px-3 py-2 text-xs flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground" /> {gaps} aktive datagaps
      </div>
    </div>
  );
}

// ---------- Map insight card ----------
export function MapInsightCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-card to-leaf/15 border p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">AI kortinsight</div>
          <p className="text-sm mt-1.5 text-foreground/90">{text}</p>
        </div>
      </div>
    </div>
  );
}

// ====================================================
// ============== UPLOAD CENTER PRIMITIVES ============
// ====================================================

export function UploadDropzone({
  onAdd,
}: {
  onAdd: (files: { name: string; size: string; type: string }[]) => void;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const items = Array.from(list).map((f) => ({
      name: f.name,
      size: prettyBytes(f.size),
      type: guessType(f.name),
    }));
    if (items.length) onAdd(items);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-primary bg-leaf/15" : "border-border bg-muted/30"}`}
    >
      <UploadCloud className="h-8 w-8 mx-auto text-primary" />
      <div className="text-sm font-semibold mt-3">Træk filer hertil eller vælg fra computer</div>
      <div className="text-xs text-muted-foreground mt-1">
        Accepterede: .tif, .geotiff, .geojson, .kml, .zip, .csv, .gpx, .jpg, .png, .pdf
      </div>
      <div className="mt-4 flex justify-center gap-2 flex-wrap">
        <button
          onClick={() => ref.current?.click()}
          className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 inline-flex items-center gap-1.5"
        >
          <UploadCloud className="h-3.5 w-3.5" /> Upload filer
        </button>
        <button
          onClick={() => onAdd([{ name: "imported_zones.geojson", size: "8 KB", type: "GeoJSON" }])}
          className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Importér GeoJSON
        </button>
        <button
          onClick={() =>
            onAdd([{ name: "manuel_feltdata_2026.csv", size: "12 KB", type: "Feltdata" }])
          }
          className="text-xs rounded-lg border bg-card px-3 py-1.5 inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Tilføj manuelt feltdata
        </button>
      </div>
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        accept=".tif,.geotiff,.geojson,.kml,.kmz,.zip,.csv,.gpx,.jpg,.jpeg,.png,.pdf"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function guessType(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".tif") || n.endsWith(".geotiff")) return "GeoTIFF";
  if (n.endsWith(".geojson")) return "GeoJSON";
  if (n.endsWith(".kml") || n.endsWith(".kmz")) return "KML/KMZ";
  if (n.endsWith(".zip")) return "Shapefile ZIP";
  if (n.endsWith(".csv")) return "CSV";
  if (n.endsWith(".gpx")) return "GPX";
  if (n.endsWith(".pdf")) return "PDF";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png")) return "JPG/PNG";
  return "Andet";
}
function prettyBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function FileMetadataPanel({ name, type }: { name: string; type: string }) {
  const fields = [
    "Projekt",
    "Zone",
    "Datatype",
    "Indsamlingsdato",
    "Datakilde / ejer",
    "Metode",
    "Koordinatsystem (EPSG)",
    "Opløsning",
    "Sensor / kameratype",
  ];
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-[11px] text-muted-foreground">{type}</div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {fields.map((f) => (
          <label key={f} className="block">
            <div className="text-[11px] text-muted-foreground mb-1">{f}</div>
            <input
              className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
              placeholder={f}
            />
          </label>
        ))}
        <label className="block sm:col-span-2">
          <div className="text-[11px] text-muted-foreground mb-1">Beskrivelse</div>
          <textarea
            rows={2}
            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
            placeholder="Kort beskrivelse af datasæt og kontekst"
          />
        </label>
        <label className="block sm:col-span-2">
          <div className="text-[11px] text-muted-foreground mb-1">Datakvalitetsnote</div>
          <textarea
            rows={2}
            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
            placeholder="Eventuelle forbehold, kalibrering eller usikkerhed"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Verifikationsstatus:</span>
        <Chip>Afventer</Chip>
      </div>
    </div>
  );
}

export function GeospatialValidationPanel({
  checks,
}: {
  checks?: { label: string; pass: boolean }[];
}) {
  const list = checks ?? [
    { label: "Filformat valid", pass: true },
    { label: "Koordinater detekteret", pass: true },
    { label: "Projektion genkendt (EPSG:25832)", pass: true },
    { label: "Bounds matcher projektområde", pass: false },
    { label: "Påkrævet metadata komplet", pass: false },
    { label: "Lag kan previewes", pass: true },
    { label: "Klar til kortvisning", pass: true },
    { label: "Klar til ESG Ledger", pass: false },
    { label: "Klar til DecisionsIQ", pass: true },
    { label: "Klar til Reports", pass: false },
  ];
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm font-semibold mb-3">Geospatial validering</div>
      <ul className="grid sm:grid-cols-2 gap-1.5 text-xs">
        {list.map((c) => (
          <li key={c.label} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
            {c.pass ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground" />
            )}
            <span className={c.pass ? "" : "text-warning-foreground"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LayerPreviewCard({ coverage = 92 }: { coverage?: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm font-semibold mb-2">Layer preview</div>
      <div className="rounded-lg border bg-gradient-to-br from-leaf/30 via-card to-leaf/10 overflow-hidden">
        <svg viewBox="0 0 200 120" className="w-full h-32">
          <rect width="200" height="120" fill="oklch(0.78 0.16 140 / 0.15)" />
          <path
            d="M20,20 L180,25 L185,100 L25,105 Z"
            fill="none"
            stroke="var(--primary)"
            strokeDasharray="4 3"
          />
          <path d="M30,30 L160,32 L170,90 L35,95 Z" fill="oklch(0.55 0.13 155 / 0.18)" />
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Coverage af projektområde</span>
        <span className="font-medium tabular-nums">{coverage}%</span>
      </div>
      <div className="mt-2 text-[11px] text-warning-foreground inline-flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3" /> Bounds matcher kun delvist projektområdet
      </div>
    </div>
  );
}

export function RoutingDestinationSelector({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (k: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {ROUTING_DESTINATIONS.map((r) => {
        const active = selected.includes(r.key);
        return (
          <button
            key={r.key}
            onClick={() => onToggle(r.key)}
            className={`text-left rounded-xl border p-3 transition ${active ? "border-primary bg-leaf/15" : "bg-card hover:bg-muted/40"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</div>
              </div>
              <span
                className={`h-4 w-4 rounded border grid place-items-center ${active ? "bg-primary border-primary text-primary-foreground" : "bg-card"}`}
              >
                {active && <CheckCircle2 className="h-3 w-3" />}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function UploadQueueTable({
  rows,
  onSelect,
  selectedId,
  onAction,
}: {
  rows: {
    id: string;
    name: string;
    type: string;
    size: string;
    project: string;
    zone: string;
    status: string;
    geo: boolean;
    metaOk: boolean;
    validationNote: string;
  }[];
  onSelect: (id: string) => void;
  selectedId?: string | null;
  onAction: (label: string, id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="px-4 py-3">Filnavn</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Størrelse</th>
              <th className="px-4 py-3">Projekt</th>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Georef.</th>
              <th className="px-4 py-3">Metadata</th>
              <th className="px-4 py-3">Validering</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`hover:bg-muted/40 cursor-pointer ${selectedId === r.id ? "bg-leaf/10" : ""}`}
                onClick={() => onSelect(r.id)}
              >
                <td className="px-4 py-3 font-medium truncate max-w-[260px]">{r.name}</td>
                <td className="px-4 py-3 text-xs">{r.type}</td>
                <td className="px-4 py-3 text-xs tabular-nums">{r.size}</td>
                <td className="px-4 py-3 text-xs">{r.project}</td>
                <td className="px-4 py-3 text-xs">{r.zone}</td>
                <td className="px-4 py-3">
                  <Pill
                    tone={
                      r.status === "Klar" ? "success" : r.status === "Fejl" ? "danger" : "warning"
                    }
                  >
                    {r.status}
                  </Pill>
                </td>
                <td className="px-4 py-3">
                  {r.geo ? <Chip tone="primary">Ja</Chip> : <Chip>Nej</Chip>}
                </td>
                <td className="px-4 py-3">
                  {r.metaOk ? <Chip tone="primary">OK</Chip> : <Chip tone="muted">Mangler</Chip>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.validationNote}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction("Preview on map", r.id);
                    }}
                    className="text-xs rounded-lg border bg-card px-2 py-1 inline-flex items-center gap-1"
                  >
                    <Eye className="h-3 w-3" /> Preview
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  if (!msg) return null;
  setTimeout(onDone, 3500);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background rounded-xl shadow-card px-4 py-3 text-sm flex items-center gap-2 animate-in slide-in-from-bottom">
      <CheckCircle2 className="h-4 w-4 text-success" /> {msg}
    </div>
  );
}
