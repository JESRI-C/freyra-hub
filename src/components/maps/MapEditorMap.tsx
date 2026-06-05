/**
 * MapEditorMap — Komplet interaktivt korteditor
 *
 * Features:
 *   - Tegn projektgrænse og zoner (Geoman drawing)
 *   - Skift baselayer: OSM / Ortofoto (Dataforsyningen WMS) / Terræn
 *   - Overlay-lag: §3 natur, vandløb, NDVI, sensorer, zoner
 *   - Mål areal og afstande
 *   - Klik på zone/sensor for detaljer
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import type { Zone, ZoneType, GeoJsonPolygon } from "@/services/zones-service";
import { ZONE_TYPE_COLORS, ZONE_TYPE_LABELS, calculatePolygonArea } from "@/services/zones-service";
import type { IoTSensor } from "@/services/iot-simulation-service";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DrawMode = "none" | "boundary" | "zone" | "measure";
export type BaseLayer = "osm" | "ortofoto" | "terrain" | "satellite";

export interface MapEditorMapProps {
  // Projekt
  projectId: string;
  projectName: string;
  lat: number;
  lng: number;
  areaHa?: number;
  boundaryGeoJSON?: GeoJsonPolygon | null;

  // Zoner
  zones?: Zone[];
  onZoneCreated?: (geojson: GeoJsonPolygon, areaHa: number) => void;
  onZoneClicked?: (zone: Zone) => void;

  // Lag
  sensors?: IoTSensor[];
  showSensors?: boolean;
  showParagraph3?: boolean;
  showWatercourses?: boolean;
  showNdviOverlay?: boolean;
  ndviValue?: number | null;

  // Drawing
  drawMode?: DrawMode;
  onDrawModeChange?: (mode: DrawMode) => void;
  onBoundaryDrawn?: (geojson: GeoJsonPolygon, areaHa: number) => void;
  onMeasurement?: (areaHa: number, perimeterM: number) => void;

  // WFS live data
  paragraph3Areas?: Array<{ id: string; natureType: string; geojson: GeoJsonPolygon | null }>;
  watercourseFeatures?: Array<{ id: string; name?: string; coordinates: number[][] }>;

  height?: number;
  className?: string;
}

// ─── Layer URLs ────────────────────────────────────────────────────────────────

const BASE_LAYERS = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    label: "Standardkort",
  },
  ortofoto: {
    // Dataforsyningen WMS ortofoto — gratis, ingen nøgle til standard tiles
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    wms: true,
    wmsUrl: "https://services.datafordeler.dk/GeoDanmarkOrto/orto_foraar/1.0.0/WMS",
    wmsLayers: "orto_foraar",
    attribution: '© SDFI / Dataforsyningen',
    label: "Ortofoto",
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>',
    label: "Terræn",
  },
  satellite: {
    // ESRI World Imagery (gratis)
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, GIS User Community',
    label: "Satellit",
  },
};

const STATUS_COLORS: Record<IoTSensor["status"], string> = {
  online: "#2BC48A",
  warning: "#F59E0B",
  offline: "#EF4444",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function MapEditorMap({
  projectId,
  projectName,
  lat,
  lng,
  areaHa,
  boundaryGeoJSON,
  zones = [],
  onZoneCreated,
  onZoneClicked,
  sensors = [],
  showSensors = true,
  showParagraph3 = true,
  showWatercourses = true,
  showNdviOverlay = false,
  ndviValue,
  drawMode = "none",
  onDrawModeChange,
  onBoundaryDrawn,
  onMeasurement,
  paragraph3Areas = [],
  watercourseFeatures = [],
  height = 540,
  className,
}: MapEditorMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const baseLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const p3LayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const wlLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const zoneLayersRef = useRef<Map<string, import("leaflet").Layer>>(new Map());
  const sensorGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const boundaryLayerRef = useRef<import("leaflet").GeoJSON | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("satellite");
  const [measureResult, setMeasureResult] = useState<{ areaHa: number; perimeterM: number } | null>(null);
  const [initialized, setInitialized] = useState(false);

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      // Fix Leaflet icon URLs
      const iconProto = L.Icon.Default.prototype as unknown as Record<string, unknown>;
      delete iconProto["_getIconUrl"];
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        center: [lat, lng],
        zoom: 15,
      });

      // Base layer
      const bl = BASE_LAYERS[baseLayer];
      baseLayerRef.current = L.tileLayer(bl.url, { attribution: bl.attribution, maxZoom: 20 }).addTo(map);

      mapInstance.current = map;

      // Load Geoman drawing plugin
      try {
        await import("@geoman-io/leaflet-geoman-free");
        // @ts-ignore — geoman attaches to map
        if (map.pm) {
          // @ts-ignore
          map.pm.setLang("da");
          // @ts-ignore
          map.pm.addControls({ position: "topleft", drawMarker: false, drawCircle: false, drawCircleMarker: false, drawPolyline: false, drawRectangle: true, drawPolygon: true, editMode: true, dragMode: true, cutPolygon: false, removalMode: true });

          // Listen for drawn shapes
          // @ts-ignore
          map.on("pm:create", async (e: { layer: import("leaflet").Layer; shape: string }) => {
            const layer = e.layer as import("leaflet").Polygon;
            // @ts-ignore
            const geoJSON = layer.toGeoJSON();
            const polygon: GeoJsonPolygon = {
              type: "Polygon",
              coordinates: (geoJSON.geometry as GeoJsonPolygon).coordinates,
            };
            const ha = await calculatePolygonArea(polygon);
            setMeasureResult({ areaHa: ha, perimeterM: 0 });

            if (e.shape === "Polygon" || e.shape === "Rectangle") {
              onDrawModeChange?.("none");
              if (drawMode === "boundary") {
                onBoundaryDrawn?.(polygon, ha);
              } else if (drawMode === "zone") {
                onZoneCreated?.(polygon, ha);
              } else if (drawMode === "measure") {
                onMeasurement?.(ha, 0);
              }
            }
          });
        }
      } catch {
        // Geoman ikke tilgængeligt — brug basal kortfunktionalitet
      }

      setInitialized(true);
    })();

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Skift base layer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current!;
      if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
      const bl = BASE_LAYERS[baseLayer];
      baseLayerRef.current = L.tileLayer(bl.url, { attribution: bl.attribution, maxZoom: 20 }).addTo(map);
      baseLayerRef.current.bringToBack();
    })();
  }, [baseLayer, initialized]);

  // ── Vis projektgrænse ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current!;
      if (boundaryLayerRef.current) map.removeLayer(boundaryLayerRef.current);
      if (!boundaryGeoJSON) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = L.geoJSON(
        { type: "Feature", geometry: boundaryGeoJSON, properties: {} } as any,
        { style: { color: "#2BC48A", weight: 3, fillColor: "#2BC48A", fillOpacity: 0.12, dashArray: undefined } },
      )
        .bindPopup(`<strong>${projectName}</strong><br/>${areaHa ? `${areaHa} ha` : ""}`)
        .addTo(map);
      boundaryLayerRef.current = layer;
      map.fitBounds(layer.getBounds(), { padding: [32, 32] });
    })();
  }, [boundaryGeoJSON, projectName, areaHa, initialized]);

  // ── Vis zoner ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current!;

      // Fjern gamle zonelag
      zoneLayersRef.current.forEach((layer) => map.removeLayer(layer));
      zoneLayersRef.current.clear();

      for (const zone of zones) {
        if (!zone.geojson) continue;
        const colors = ZONE_TYPE_COLORS[zone.area_type as ZoneType] ?? ZONE_TYPE_COLORS.pilot_area;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layer = L.geoJSON(
          { type: "Feature", geometry: zone.geojson, properties: {} } as any,
          {
            style: {
              color: colors.stroke,
              weight: 2,
              fillColor: colors.fill,
              fillOpacity: 0.25,
            },
          },
        )
          .bindPopup(
            `<strong>${zone.name}</strong><br/>` +
            `${ZONE_TYPE_LABELS[zone.area_type as ZoneType]}<br/>` +
            `${zone.area_ha ? `${zone.area_ha} ha` : ""}`,
          )
          .on("click", () => onZoneClicked?.(zone))
          .addTo(map);
        zoneLayersRef.current.set(zone.id, layer);
      }
    })();
  }, [zones, initialized, onZoneClicked]);

  // ── §3-naturelag ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current!;
      if (p3LayerRef.current) map.removeLayer(p3LayerRef.current);
      if (!showParagraph3 || paragraph3Areas.length === 0) return;

      const group = L.layerGroup().addTo(map);
      p3LayerRef.current = group;

      paragraph3Areas.forEach((area) => {
        if (!area.geojson) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        L.geoJSON(
          { type: "Feature", geometry: area.geojson, properties: {} } as any,
          { style: { color: "#16a34a", weight: 1.5, fillColor: "#22c55e", fillOpacity: 0.3, dashArray: "4 2" } },
        )
          .bindPopup(`<strong>§3 ${area.natureType}</strong>`)
          .addTo(group);
      });
    })();
  }, [showParagraph3, paragraph3Areas, initialized]);

  // ── Vandløbslag ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current!;
      if (wlLayerRef.current) map.removeLayer(wlLayerRef.current);
      if (!showWatercourses || watercourseFeatures.length === 0) return;

      const group = L.layerGroup().addTo(map);
      wlLayerRef.current = group;

      watercourseFeatures.forEach((wc) => {
        if (wc.coordinates.length < 2) return;
        const latLngs = wc.coordinates.map((c) => [c[1], c[0]] as [number, number]);
        L.polyline(latLngs, { color: "#3B82F6", weight: 2.5, opacity: 0.8 })
          .bindPopup(`<strong>Vandløb</strong>${wc.name ? `<br/>${wc.name}` : ""}`)
          .addTo(group);
      });
    })();
  }, [showWatercourses, watercourseFeatures, initialized]);

  // ── NDVI overlay ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized || !showNdviOverlay || !boundaryGeoJSON || ndviValue === null || ndviValue === undefined) return;
    // NDVI visualiseres som en farvet polygon overlay oven på kortet
    // Farve: rød (lav NDVI) → gul → grøn (høj NDVI)
    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current!;
      const ndviColor = ndviValue >= 0.6 ? "#22c55e" :
                        ndviValue >= 0.4 ? "#84cc16" :
                        ndviValue >= 0.2 ? "#eab308" :
                        ndviValue >= 0.0 ? "#f97316" : "#ef4444";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      L.geoJSON(
        { type: "Feature", geometry: boundaryGeoJSON, properties: {} } as any,
        { style: { color: "transparent", fillColor: ndviColor, fillOpacity: 0.35 } },
      )
        .bindPopup(`<strong>NDVI: ${ndviValue.toFixed(2)}</strong><br/>${ndviValue >= 0.5 ? "Tæt vegetation" : ndviValue >= 0.3 ? "Moderat vegetation" : "Lav vegetation"}`)
        .addTo(map);
    })();
  }, [showNdviOverlay, ndviValue, boundaryGeoJSON, initialized]);

  // ── Sensor-markører ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current!;
      if (sensorGroupRef.current) map.removeLayer(sensorGroupRef.current);
      if (!showSensors || sensors.length === 0) return;

      const group = L.layerGroup().addTo(map);
      sensorGroupRef.current = group;

      sensors.forEach((s) => {
        const color = STATUS_COLORS[s.status];
        const icon = L.divIcon({
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([s.coordinates.lat, s.coordinates.lng], { icon })
          .bindPopup(
            `<strong>${s.label}</strong><br/>` +
            `Værdi: ${s.latestValue} ${s.unit}<br/>` +
            `Batteri: ${s.batteryPercent}%<br/>` +
            `Status: ${s.status}`,
          )
          .addTo(group);
      });
    })();
  }, [showSensors, sensors, initialized]);

  // ── Drawing mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !initialized) return;
    const map = mapInstance.current;
    // @ts-ignore — geoman API
    if (!map.pm) return;

    // @ts-ignore
    map.pm.disableDraw();

    if (drawMode === "boundary" || drawMode === "zone" || drawMode === "measure") {
      // @ts-ignore
      map.pm.enableDraw("Polygon", {
        snappable: true,
        snapDistance: 15,
        allowSelfIntersection: false,
      });
    }
  }, [drawMode, initialized]);

  const handleBaseLayerChange = useCallback((layer: BaseLayer) => {
    setBaseLayer(layer);
  }, []);

  return (
    <div className={`relative rounded-xl overflow-hidden border ${className ?? ""}`} style={{ height }}>
      {/* Map container */}
      <div ref={mapRef} className="h-full w-full" />

      {/* Base layer switcher */}
      <div className="absolute top-2 left-2 z-[1000] flex flex-col gap-1">
        {(Object.entries(BASE_LAYERS) as [BaseLayer, typeof BASE_LAYERS[BaseLayer]][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => handleBaseLayerChange(key)}
            className={`text-[11px] font-medium px-2 py-1 rounded shadow-sm border transition-colors ${
              baseLayer === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {cfg.label}
          </button>
        ))}
      </div>

      {/* Area measurement result */}
      {measureResult && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-xl shadow border px-4 py-2 text-sm">
          <span className="font-semibold">{measureResult.areaHa} ha</span>
          <span className="text-muted-foreground ml-2">tegnet areal</span>
          <button
            onClick={() => setMeasureResult(null)}
            className="ml-3 text-xs text-muted-foreground hover:text-foreground"
          >×</button>
        </div>
      )}

      {/* NDVI legend */}
      {showNdviOverlay && ndviValue !== null && ndviValue !== undefined && (
        <div className="absolute bottom-3 right-3 z-[1000] bg-white rounded-xl shadow border px-3 py-2 text-xs">
          <div className="font-medium mb-1">NDVI {ndviValue.toFixed(2)}</div>
          <div className="flex gap-1 items-center">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span className="text-muted-foreground">0</span>
            <div className="flex-1 h-1.5 rounded bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 mx-1" />
            <span className="text-muted-foreground">1</span>
            <div className="w-3 h-3 rounded-sm bg-green-500" />
          </div>
        </div>
      )}

      {/* Project label */}
      <div className="absolute top-2 right-2 z-[1000]">
        <div className="bg-white/90 backdrop-blur rounded-lg shadow border px-3 py-1.5 text-xs font-medium">
          {projectName} {areaHa ? `· ${areaHa} ha` : ""}
        </div>
      </div>
    </div>
  );
}
