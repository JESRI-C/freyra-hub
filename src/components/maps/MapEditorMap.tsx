/**
 * MapEditorMap — Komplet interaktiv korteditor
 *
 * Tegning: leaflet-draw (stabil, battle-tested)
 *   - Tegn projektgrænse (gemmes på projektet)
 *   - Tegn zone (åbner gem-dialog)
 *   - Mål areal (ha + omkreds, gemmes ikke)
 *   - Redigér tegnede former (træk i hjørnepunkter)
 * Lag: 4 base layers + zoner + §3 + vandløb + NDVI + sensorer
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import type { Zone, ZoneType, GeoJsonPolygon } from "@/services/zones-service";
import { ZONE_TYPE_COLORS, ZONE_TYPE_LABELS, calculatePolygonArea } from "@/services/zones-service";
import type { IoTSensor } from "@/services/iot-simulation-service";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DrawMode = "none" | "boundary" | "zone" | "measure";
export type BaseLayer = "satellite" | "osm" | "terrain" | "topo";

export interface WmsOverlay {
  id: string;
  url: string;
  layers: string;
  opacity?: number;
  format?: string;
  transparent?: boolean;
  attribution?: string;
}

export interface MapEditorMapProps {
  projectId: string;
  projectName: string;
  lat: number;
  lng: number;
  areaHa?: number | null;
  boundaryGeoJSON?: GeoJsonPolygon | null;
  zones?: Zone[];
  sensors?: IoTSensor[];
  showSensors?: boolean;
  showParagraph3?: boolean;
  showWatercourses?: boolean;
  showNdviOverlay?: boolean;
  ndviValue?: number | null;
  paragraph3Areas?: Array<{ id: string; natureType: string; geojson: GeoJsonPolygon | null }>;
  watercourseFeatures?: Array<{ id: string; name?: string; coordinates: number[][] }>;
  drawMode?: DrawMode;
  onDrawModeChange?: (mode: DrawMode) => void;
  onZoneCreated?: (geojson: GeoJsonPolygon, areaHa: number) => void;
  onZoneClicked?: (zone: Zone) => void;
  onBoundaryDrawn?: (geojson: GeoJsonPolygon, areaHa: number) => void;
  onMeasurement?: (areaHa: number, perimeterM: number) => void;
  /** External center commands (e.g. from address search). Changes trigger flyTo. */
  centerOverride?: { lat: number; lng: number; zoom?: number } | null;
  /** Extra WMS layers to overlay on the map (e.g. cadastre, field blocks). */
  wmsOverlays?: WmsOverlay[];
  /** Marker to pin at a chosen location (address / place search result). */
  addressMarker?: { lat: number; lng: number; label: string } | null;
  /** When set, map clicks trigger onFeaturePicked instead of drawing. */
  pickMode?: "markblok" | "matrikel" | null;
  onFeaturePicked?: (latlng: { lat: number; lng: number }) => void;
  /** Preview polygon for a picked feature (shown before confirm). */
  previewPolygon?: GeoJsonPolygon | null;
  height?: number;
  className?: string;
}

// ─── Base layers ──────────────────────────────────────────────────────────────

const BASE_LAYERS: Record<BaseLayer, { url: string; attribution: string; label: string; maxZoom: number }> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Esri, Maxar, Earthstar Geographics",
    label: "Satellit",
    maxZoom: 19,
  },
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    label: "Kort",
    maxZoom: 19,
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
    label: "Terræn",
    maxZoom: 19,
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>',
    label: "Topografi",
    maxZoom: 17,
  },
};

const SENSOR_COLORS: Record<IoTSensor["status"], string> = {
  online: "#10b981",
  warning: "#f59e0b",
  offline: "#ef4444",
};

const DRAW_STYLES: Record<Exclude<DrawMode, "none">, { color: string; fillOpacity: number; dashArray?: string }> = {
  boundary: { color: "#2BC48A", fillOpacity: 0.15 },
  zone:     { color: "#f59e0b", fillOpacity: 0.2 },
  measure:  { color: "#6366f1", fillOpacity: 0.12, dashArray: "5 5" },
};

// ─── Geometri-hjælpere ────────────────────────────────────────────────────────

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function polygonPerimeterM(latLngs: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < latLngs.length - 1; i++) {
    total += haversineM(latLngs[i][0], latLngs[i][1], latLngs[i + 1][0], latLngs[i + 1][1]);
  }
  return Math.round(total);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function MapEditorMap({
  projectId: _projectId,
  projectName,
  lat,
  lng,
  areaHa,
  boundaryGeoJSON,
  zones = [],
  sensors = [],
  showSensors = true,
  showParagraph3 = true,
  showWatercourses = true,
  showNdviOverlay = false,
  ndviValue,
  paragraph3Areas = [],
  watercourseFeatures = [],
  drawMode: drawModeProp,
  onDrawModeChange,
  onZoneCreated,
  onZoneClicked,
  onBoundaryDrawn,
  onMeasurement,
  centerOverride,
  wmsOverlays,
  addressMarker,
  pickMode,
  onFeaturePicked,
  previewPolygon,
  height = 540,
  className,
}: MapEditorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<{
    base: import("leaflet").TileLayer | null;
    boundary: import("leaflet").GeoJSON | null;
    zones: import("leaflet").FeatureGroup | null;
    p3: import("leaflet").FeatureGroup | null;
    wl: import("leaflet").FeatureGroup | null;
    ndvi: import("leaflet").GeoJSON | null;
    sensors: import("leaflet").FeatureGroup | null;
    drawn: import("leaflet").FeatureGroup | null;
    activeDrawer: {
      disable: () => void;
      deleteLastVertex?: () => void;
      completeShape?: () => void;
      _markers?: unknown[];
    } | null;
    editHandler: { enable: () => void; disable: () => void; save: () => void } | null;
    wms: Map<string, import("leaflet").TileLayer.WMS>;
    addressMarker: import("leaflet").Marker | null;
    preview: import("leaflet").GeoJSON | null;
  }>({
    base: null, boundary: null, zones: null, p3: null, wl: null,
    ndvi: null, sensors: null, drawn: null, activeDrawer: null, editHandler: null,
    wms: new Map(),
    addressMarker: null,
    preview: null,
  });

  // Intern mode-state, synkroniseret med evt. controlled prop
  const [internalMode, setInternalMode] = useState<DrawMode>("none");
  const drawMode = drawModeProp ?? internalMode;
  const drawModeRef = useRef<DrawMode>(drawMode);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);

  const [isEditing, setIsEditing] = useState(false);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("satellite");
  const [measurement, setMeasurement] = useState<{ areaHa: number; perimeterM: number } | null>(null);
  const [ready, setReady] = useState(false);
  // Live-tæller for punkter under tegning
  const [drawingPoints, setDrawingPoints] = useState(0);

  const setMode = useCallback((mode: DrawMode) => {
    setInternalMode(mode);
    onDrawModeChange?.(mode);
    setDrawingPoints(0);
  }, [onDrawModeChange]);

  // Tegn-værktøjslinje-handlers
  const undoLastVertex = useCallback(() => {
    layersRef.current.activeDrawer?.deleteLastVertex?.();
    setDrawingPoints((n) => Math.max(0, n - 1));
  }, []);
  const finishShape = useCallback(() => {
    layersRef.current.activeDrawer?.completeShape?.();
  }, []);
  const cancelDrawing = useCallback(() => {
    layersRef.current.activeDrawer?.disable();
    layersRef.current.activeDrawer = null;
    setDrawingPoints(0);
    setMode("none");
  }, [setMode]);


  // Refs holder friske callbacks + pickMode så map-event listeners ikke skal genregistreres
  const pickModeRef = useRef(pickMode);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  const onPickRef = useRef(onFeaturePicked);
  useEffect(() => { onPickRef.current = onFeaturePicked; }, [onFeaturePicked]);



  // Holder callbacks friske i event handlers
  const callbacksRef = useRef({ onZoneCreated, onBoundaryDrawn, onMeasurement, onZoneClicked });
  useEffect(() => {
    callbacksRef.current = { onZoneCreated, onBoundaryDrawn, onMeasurement, onZoneClicked };
  }, [onZoneCreated, onBoundaryDrawn, onMeasurement, onZoneClicked]);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let alive = true;

    (async () => {
      const L = await import("leaflet");
      // leaflet-draw er et legacy-plugin der kræver global L
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).L = (L as any).default ?? L;
      try {
        await import("leaflet-draw");
        // Patch known leaflet-draw bug: readableArea references undefined `type`
        // in Leaflet 1.8+, which crashes when adding a 2nd polygon vertex.
        const readableAreaFix = function (area: number, isMetric: boolean | unknown[], precision?: Record<string, number>) {
          const p = { km: 2, ha: 2, m: 2, ...(precision || {}) };
          let str = "";
          const metric = Array.isArray(isMetric) ? isMetric : (isMetric ? ["km", "ha", "m"] : []);
          if (metric.length) {
            if (area >= 1_000_000 && metric.indexOf("km") !== -1) str = (area * 1e-6).toFixed(p.km) + " km²";
            else if (area >= 10_000 && metric.indexOf("ha") !== -1) str = (area * 1e-4).toFixed(p.ha) + " ha";
            else str = area.toFixed(p.m) + " m²";
          } else {
            const yards = area / 0.836127;
            if (yards >= 3097600) str = (yards / 3097600).toFixed(p.km) + " mi²";
            else if (yards >= 4840) str = (yards / 4840).toFixed(p.ha) + " acres";
            else str = Math.ceil(yards).toString() + " yd²";
          }
          return str;
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyL = L as any;
        anyL.GeometryUtil = anyL.GeometryUtil ?? {};
        anyL.GeometryUtil.readableArea = readableAreaFix;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const winL = (window as any).L;
        if (winL && winL !== anyL) {
          winL.GeometryUtil = winL.GeometryUtil ?? {};
          winL.GeometryUtil.readableArea = readableAreaFix;
        }
      } catch {
        // tegning utilgængelig — kortet og lagene virker stadig
      }
      if (!alive || !containerRef.current) return;

      const proto = L.Icon.Default.prototype as unknown as Record<string, unknown>;
      delete proto["_getIconUrl"];
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      const bl = BASE_LAYERS["satellite"];
      layersRef.current.base = L.tileLayer(bl.url, { attribution: bl.attribution, maxZoom: bl.maxZoom }).addTo(map);

      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      layersRef.current.drawn = drawnItems;

      // ── Tegnet form færdig ─────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const LDraw = (window as any).L?.Draw;
      if (LDraw) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on(LDraw.Event.CREATED, async (e: any) => {
        const mode = drawModeRef.current;
        const layer = e.layer as import("leaflet").Polygon;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gj = (layer as any).toGeoJSON() as { geometry: GeoJsonPolygon };
        const polygon = gj.geometry;
        const ha = await calculatePolygonArea(polygon);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ring: [number, number][] = ((layer as any).getLatLngs()[0] as Array<{ lat: number; lng: number }>)
          .map((ll) => [ll.lat, ll.lng] as [number, number]);
        const perimeterM = polygonPerimeterM([...ring, ring[0]]);

        const style = DRAW_STYLES[mode === "none" ? "zone" : mode];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (layer as any).setStyle?.({ ...style, weight: 2, fillColor: style.color });

        drawnItems.addLayer(layer);
        layer.bindPopup(
          `<strong>${ha} ha</strong><br/>${(perimeterM / 1000).toFixed(2)} km omkreds`,
        ).openPopup();

        setMeasurement({ areaHa: ha, perimeterM });

        const cb = callbacksRef.current;
        if (mode === "boundary") cb.onBoundaryDrawn?.(polygon, ha);
        else if (mode === "zone") cb.onZoneCreated?.(polygon, ha);
        else if (mode === "measure") cb.onMeasurement?.(ha, perimeterM);

        layersRef.current.activeDrawer = null;
        setInternalMode("none");
        onDrawModeChange?.("none");
      });

      // Live tælling af tegnede vertices
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on((LDraw as any).Event?.DRAWSTART ?? "draw:drawstart", () => setDrawingPoints(0));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on((LDraw as any).Event?.DRAWVERTEX ?? "draw:drawvertex", (e: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const n = (e?.layers as any)?.getLayers?.().length ?? 0;
        setDrawingPoints(n);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on((LDraw as any).Event?.DRAWSTOP ?? "draw:drawstop", () => setDrawingPoints(0));
      }

      // ── Klik-vælg (markblok / matrikel) ────────────────────────────────────
      map.on("click", (ev) => {
        if (!pickModeRef.current) return;
        const cb = onPickRef.current;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ll = (ev as any).latlng as { lat: number; lng: number };
        cb?.({ lat: ll.lat, lng: ll.lng });
      });


      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Aktivér/deaktivér tegneværktøj når mode skifter ──────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const map = mapRef.current!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const GL = (window as any).L; // global L med Draw-plugin

      // Stop eksisterende tegning
      layersRef.current.activeDrawer?.disable();
      layersRef.current.activeDrawer = null;

      if (drawMode === "none" || !GL?.Draw) return;

      const style = DRAW_STYLES[drawMode];
      const drawer = new GL.Draw.Polygon(map, {
        allowIntersection: false,
        showArea: true,
        shapeOptions: { ...style, weight: 2, fillColor: style.color },
      });
      drawer.enable();
      layersRef.current.activeDrawer = drawer;
    })();
  }, [drawMode, ready]);

  // ── Redigér tegnede former ────────────────────────────────────────────────────
  const toggleEdit = useCallback(() => {
    const map = mapRef.current;
    const drawnItems = layersRef.current.drawn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GL = (window as any).L;
    if (!map || !drawnItems || !GL?.EditToolbar) return;

    if (isEditing) {
      layersRef.current.editHandler?.save();
      layersRef.current.editHandler?.disable();
      layersRef.current.editHandler = null;
      setIsEditing(false);
    } else {
      const handler = new GL.EditToolbar.Edit(map, {
        featureGroup: drawnItems,
        selectedPathOptions: { maintainColor: true, dashArray: "10 10" },
      });
      handler.enable();
      layersRef.current.editHandler = handler;
      setIsEditing(true);
    }
  }, [isEditing]);

  const clearDrawings = useCallback(() => {
    layersRef.current.drawn?.clearLayers();
    setMeasurement(null);
  }, []);

  // ── Skift base layer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.base) map.removeLayer(layersRef.current.base);
      const bl = BASE_LAYERS[baseLayer];
      layersRef.current.base = L.tileLayer(bl.url, { attribution: bl.attribution, maxZoom: bl.maxZoom }).addTo(map);
      layersRef.current.base.bringToBack();
    })();
  }, [baseLayer, ready]);

  // ── Projektgrænse ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.boundary) map.removeLayer(layersRef.current.boundary);
      if (!boundaryGeoJSON) return;
      const layer = L.geoJSON(
        { type: "Feature", geometry: boundaryGeoJSON, properties: {} } as never,
        { style: { color: "#2BC48A", weight: 3, fillColor: "#2BC48A", fillOpacity: 0.08 } },
      ).bindPopup(`<strong>${projectName}</strong>${areaHa ? `<br/>${areaHa} ha` : ""}`).addTo(map);
      layersRef.current.boundary = layer;
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    })();
  }, [boundaryGeoJSON, projectName, areaHa, ready]);

  // ── Zoner (ryd tegninger når en zone er gemt) ────────────────────────────────
  const prevZoneCount = useRef(zones.length);
  useEffect(() => {
    if (zones.length > prevZoneCount.current) {
      layersRef.current.drawn?.clearLayers();
      setMeasurement(null);
    }
    prevZoneCount.current = zones.length;
  }, [zones.length]);

  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.zones) map.removeLayer(layersRef.current.zones);
      const group = new L.FeatureGroup().addTo(map);
      layersRef.current.zones = group;
      zones.forEach((zone) => {
        if (!zone.geojson) return;
        const c = ZONE_TYPE_COLORS[zone.area_type as ZoneType] ?? ZONE_TYPE_COLORS.pilot_area;
        L.geoJSON(
          { type: "Feature", geometry: zone.geojson, properties: {} } as never,
          { style: { color: c.stroke, weight: 2, fillColor: c.fill, fillOpacity: 0.3 } },
        )
          .bindPopup(
            `<strong>${zone.name}</strong><br/>${ZONE_TYPE_LABELS[zone.area_type as ZoneType]}` +
            `${zone.area_ha ? `<br/>${zone.area_ha} ha` : ""}`,
          )
          .on("click", () => callbacksRef.current.onZoneClicked?.(zone))
          .addTo(group);
      });
    })();
  }, [zones, ready]);

  // ── §3 natur ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.p3) map.removeLayer(layersRef.current.p3);
      if (!showParagraph3) return;
      const group = new L.FeatureGroup().addTo(map);
      layersRef.current.p3 = group;
      paragraph3Areas.forEach((a) => {
        if (!a.geojson) return;
        L.geoJSON(
          { type: "Feature", geometry: a.geojson, properties: {} } as never,
          { style: { color: "#15803d", weight: 1.5, fillColor: "#22c55e", fillOpacity: 0.35, dashArray: "4 2" } },
        ).bindPopup(`§3 ${a.natureType}`).addTo(group);
      });
    })();
  }, [showParagraph3, paragraph3Areas, ready]);

  // ── Vandløb ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.wl) map.removeLayer(layersRef.current.wl);
      if (!showWatercourses) return;
      const group = new L.FeatureGroup().addTo(map);
      layersRef.current.wl = group;
      watercourseFeatures.forEach((wc) => {
        if (wc.coordinates.length < 2) return;
        L.polyline(wc.coordinates.map((c) => [c[1], c[0]] as [number, number]), {
          color: "#3B82F6", weight: 2.5, opacity: 0.85,
        }).bindPopup(wc.name ?? "Vandløb").addTo(group);
      });
    })();
  }, [showWatercourses, watercourseFeatures, ready]);

  // ── NDVI overlay ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.ndvi) {
        map.removeLayer(layersRef.current.ndvi);
        layersRef.current.ndvi = null;
      }
      if (!showNdviOverlay || ndviValue == null || !boundaryGeoJSON) return;
      const color = ndviValue >= 0.6 ? "#16a34a" : ndviValue >= 0.4 ? "#65a30d" :
                    ndviValue >= 0.2 ? "#ca8a04" : "#dc2626";
      layersRef.current.ndvi = L.geoJSON(
        { type: "Feature", geometry: boundaryGeoJSON, properties: {} } as never,
        { style: { color: "transparent", fillColor: color, fillOpacity: 0.4 } },
      ).bindPopup(`NDVI: ${ndviValue.toFixed(2)}`).addTo(map);
    })();
  }, [showNdviOverlay, ndviValue, boundaryGeoJSON, ready]);

  // ── Sensorer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.sensors) map.removeLayer(layersRef.current.sensors);
      if (!showSensors) return;
      const group = new L.FeatureGroup().addTo(map);
      layersRef.current.sensors = group;
      sensors.forEach((s) => {
        L.marker([s.coordinates.lat, s.coordinates.lng], {
          icon: L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${SENSOR_COLORS[s.status]};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
            className: "", iconSize: [14, 14], iconAnchor: [7, 7],
          }),
        }).bindPopup(
          `<strong>${s.label}</strong><br/>${s.latestValue} ${s.unit}<br/>🔋 ${s.batteryPercent}%`,
        ).addTo(group);
      });
    })();
  }, [showSensors, sensors, ready]);

  // ── Center override (from address search) ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready || !centerOverride) return;
    mapRef.current.flyTo(
      [centerOverride.lat, centerOverride.lng],
      centerOverride.zoom ?? 16,
      { duration: 0.8 },
    );
  }, [centerOverride, ready]);

  // ── WMS overlays (matrikelskel, markblokke, etc.) ────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      const active = new Set((wmsOverlays ?? []).map((o) => o.id));
      // Remove overlays that are no longer active
      layersRef.current.wms.forEach((layer, id) => {
        if (!active.has(id)) {
          map.removeLayer(layer);
          layersRef.current.wms.delete(id);
        }
      });
      // Add new overlays
      (wmsOverlays ?? []).forEach((o) => {
        if (layersRef.current.wms.has(o.id)) return;
        const layer = L.tileLayer.wms(o.url, {
          layers: o.layers,
          format: o.format ?? "image/png",
          transparent: o.transparent ?? true,
          opacity: o.opacity ?? 0.7,
          attribution: o.attribution,
        });
        layer.addTo(map);
        layersRef.current.wms.set(o.id, layer);
      });
    })();
  }, [wmsOverlays, ready]);

  // ── Adressemarkør (fra søgning) ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.addressMarker) {
        map.removeLayer(layersRef.current.addressMarker);
        layersRef.current.addressMarker = null;
      }
      if (!addressMarker) return;
      const m = L.marker([addressMarker.lat, addressMarker.lng])
        .bindPopup(`<strong>${addressMarker.label}</strong>`)
        .addTo(map);
      m.openPopup();
      layersRef.current.addressMarker = m;
    })();
  }, [addressMarker, ready]);

  // ── Preview polygon (fra markblok/matrikel klik) ──────────────────────────
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current!;
      if (layersRef.current.preview) {
        map.removeLayer(layersRef.current.preview);
        layersRef.current.preview = null;
      }
      if (!previewPolygon) return;
      const layer = L.geoJSON(
        { type: "Feature", geometry: previewPolygon, properties: {} } as never,
        { style: { color: "#f59e0b", weight: 2.5, dashArray: "6 4", fillColor: "#f59e0b", fillOpacity: 0.2 } },
      ).addTo(map);
      layersRef.current.preview = layer;
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    })();
  }, [previewPolygon, ready]);

  // ── Cursor for pick-mode ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode]);




  // ─── UI ─────────────────────────────────────────────────────────────────────
  const toolBtn = (active: boolean, activeCls: string) =>
    `text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
      active ? activeCls : "bg-card border-border hover:bg-muted/50"
    }`;

  return (
    <div className={`flex flex-col ${className ?? ""}`} style={{ height }}>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-card border-b flex-wrap">
        <span className="text-xs text-muted-foreground">Tegn:</span>
        <button
          onClick={() => setMode(drawMode === "boundary" ? "none" : "boundary")}
          className={toolBtn(drawMode === "boundary", "bg-emerald-600 text-white border-emerald-600")}
        >
          ⬠ Projektgrænse
        </button>
        <button
          onClick={() => setMode(drawMode === "zone" ? "none" : "zone")}
          className={toolBtn(drawMode === "zone", "bg-amber-500 text-white border-amber-500")}
        >
          ⬠ Zone
        </button>
        <button
          onClick={() => setMode(drawMode === "measure" ? "none" : "measure")}
          className={toolBtn(drawMode === "measure", "bg-violet-600 text-white border-violet-600")}
        >
          📐 Mål areal
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        <button onClick={toggleEdit} className={toolBtn(isEditing, "bg-blue-600 text-white border-blue-600")}>
          ✏️ {isEditing ? "Gem redigering" : "Redigér"}
        </button>
        <button onClick={clearDrawings} className={toolBtn(false, "")}>
          🗑 Ryd tegninger
        </button>

        {drawMode !== "none" && (
          <button
            onClick={() => setMode("none")}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium"
          >
            ✕ Stop
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Baggrund:</span>
          {(Object.keys(BASE_LAYERS) as BaseLayer[]).map((key) => (
            <button
              key={key}
              onClick={() => setBaseLayer(key)}
              className={toolBtn(baseLayer === key, "bg-zinc-800 text-white border-zinc-800")}
            >
              {BASE_LAYERS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Kort ───────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full" />

        {drawMode !== "none" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/98 backdrop-blur rounded-xl shadow-lg border px-3 py-2 flex items-center gap-2 flex-wrap max-w-[95%]">
            <span className="text-sm font-medium text-foreground pr-1">
              {drawMode === "boundary" && "Tegning aktiv — klik på kortet for at tilføje punkter"}
              {drawMode === "zone" && "Tegn zone — klik punkter"}
              {drawMode === "measure" && "Tegn måleområde"}
            </span>
            <span className="text-xs text-muted-foreground border-l pl-2">
              {drawingPoints} punkt{drawingPoints === 1 ? "" : "er"}
            </span>
            <div className="w-px h-4 bg-border" />
            <button
              onClick={undoLastVertex}
              disabled={drawingPoints === 0}
              className="text-xs px-2.5 py-1 rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >↶ Fortryd punkt</button>
            <button
              onClick={finishShape}
              disabled={drawingPoints < 3}
              className="text-xs px-2.5 py-1 rounded-md border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >✓ Afslut flade</button>
            <button
              onClick={cancelDrawing}
              className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
            >✕ Annuller</button>
          </div>
        )}

        {pickMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-50 border border-amber-300 rounded-xl shadow-lg px-4 py-2 text-sm font-medium text-amber-900">
            Klik på kortet for at vælge {pickMode === "markblok" ? "markblok" : "matrikel"}
          </div>
        )}


        {measurement && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-xl shadow-lg border px-5 py-3 flex items-center gap-4">
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-700">{measurement.areaHa} ha</div>
              <div className="text-xs text-muted-foreground">Areal</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-xl font-bold">{(measurement.perimeterM / 1000).toFixed(2)} km</div>
              <div className="text-xs text-muted-foreground">Omkreds</div>
            </div>
            <button
              onClick={() => setMeasurement(null)}
              className="ml-2 text-muted-foreground hover:text-foreground text-lg leading-none"
            >×</button>
          </div>
        )}

        {showNdviOverlay && ndviValue != null && (
          <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 rounded-xl shadow border px-3 py-2 text-xs">
            <div className="font-semibold mb-1">NDVI: {ndviValue.toFixed(2)}</div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">0</span>
              <div className="w-20 h-2 rounded bg-gradient-to-r from-red-500 via-yellow-400 to-green-600" />
              <span className="text-muted-foreground">1</span>
            </div>
          </div>
        )}

        <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur rounded-lg shadow border px-3 py-1.5 text-xs font-medium">
          {projectName}{areaHa ? ` · ${areaHa} ha` : ""}
        </div>
      </div>
    </div>
  );
}
