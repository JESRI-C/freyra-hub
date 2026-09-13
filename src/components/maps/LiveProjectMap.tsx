import { useEffect, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ProjectGeometry } from "@/lib/supabase/types";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import { MEDIA_CATEGORY_LABELS } from "@/lib/platform/media-types";
import type { DroneUploadMapPoint } from "@/services/monitoring/drone-upload-map-service";
import type { BufferZonesGeoJSON } from "@/services/geo-service";
import type { IoTSensor } from "@/services/iot-simulation-service";
import { SENSOR_TYPE_LABELS } from "@/services/iot-simulation-service";
import { MapPin, AlertTriangle, Thermometer, Wind, CloudRain, Leaf } from "lucide-react";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DmiData {
  temperature?: number;
  windSpeed?: number;
  precipitation?: number;
  observedAt?: string;
  mode: string;
}

interface MiljoeportalData {
  registrations?: { speciesName: string; danishName?: string; protected: boolean }[];
  nearestProtectedArea?: string;
  mode: string;
}

interface CopernicusData {
  scenes?: { datetime: string; cloudCover: number; platform: string }[];
  latestNdviEstimate?: number;
  mode: string;
}

/** GeoJSON FeatureCollection for et natur-lag (§3, vandløb). */
export interface NatureLayerGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: string | number;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>;
}

export interface LiveProjectMapProps {
  geometry: ProjectGeometry;
  projectName: string;
  projectId: string;
  height?: number;
  mediaItems?: ProjectMediaItem[];
  droneUploadPoints?: DroneUploadMapPoint[];
  sensors?: IoTSensor[];
  dmiData?: DmiData;
  miljoeportalData?: MiljoeportalData;
  copernicusData?: CopernicusData;
  /** §3-beskyttet natur — vises når sat (send null/undefined for at skjule). */
  paragraph3GeoJSON?: NatureLayerGeoJSON | null;
  /** Vandløb — vises når sat (send null/undefined for at skjule). */
  watercoursesGeoJSON?: NatureLayerGeoJSON | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type ActiveBuffer = "none" | "100m" | "500m" | "1000m";

const BUFFER_STYLES: Record<Exclude<ActiveBuffer, "none">, PathOptions> = {
  "100m": { color: "#2BC48A", weight: 1.5, fillOpacity: 0.08, dashArray: "4 4" },
  "500m": { color: "#3B82F6", weight: 1.5, fillOpacity: 0.06, dashArray: "4 4" },
  "1000m": { color: "#8B5CF6", weight: 1.5, fillOpacity: 0.04, dashArray: "4 4" },
};

const STATUS_COLORS: Record<IoTSensor["status"], string> = {
  online: "#2BC48A",
  warning: "#F59E0B",
  offline: "#EF4444",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sensorDivIconHtml(status: IoTSensor["status"]): string {
  const color = STATUS_COLORS[status];
  return `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>`;
}

function formatLastSeen(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Leaflet accepts a DOM node, which keeps database-controlled text out of HTML strings. */
function popupContent(title: string, rows: string[], note?: string): HTMLDivElement {
  const container = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  container.append(heading);

  for (const row of rows) {
    const lineBreak = document.createElement("br");
    const line = document.createElement("span");
    line.textContent = row;
    container.append(lineBreak, line);
  }

  if (note) {
    const lineBreak = document.createElement("br");
    const detail = document.createElement("small");
    detail.textContent = note;
    container.append(lineBreak, detail);
  }
  return container;
}

// ─── DMI overlay ─────────────────────────────────────────────────────────────

function DmiOverlay({ data }: { data: DmiData }) {
  const isLive = data.mode === "live";
  return (
    <div className="absolute top-2 right-2 z-[1000] bg-white rounded-xl shadow border border-gray-100 p-2.5 min-w-[160px]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-gray-700">DMI vejr</span>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            isLive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {isLive ? "LIVE" : "PREVIEW"}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {data.temperature !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Thermometer className="h-3.5 w-3.5 text-orange-400" />
            {data.temperature} °C
          </div>
        )}
        {data.windSpeed !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Wind className="h-3.5 w-3.5 text-sky-400" />
            {data.windSpeed} m/s
          </div>
        )}
        {data.precipitation !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <CloudRain className="h-3.5 w-3.5 text-blue-400" />
            {data.precipitation} mm
          </div>
        )}
        {data.observedAt && (
          <div className="text-[10px] text-gray-400 mt-0.5">
            {new Date(data.observedAt).toLocaleString("da-DK", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layer toggle pill button ─────────────────────────────────────────────────

function PillBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-2.5 py-1 rounded-full shadow-sm border transition-colors ${
        active
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LiveProjectMap({
  geometry,
  projectName,
  projectId,
  height = 480,
  mediaItems,
  droneUploadPoints,
  sensors,
  dmiData,
  miljoeportalData: _miljoeportalData,
  copernicusData,
  paragraph3GeoJSON,
  watercoursesGeoJSON,
}: LiveProjectMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const bufferDataRef = useRef<BufferZonesGeoJSON | null>(null);
  const bufferLayerRef = useRef<LeafletGeoJSON | null>(null);
  const mediaLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  // Sensor markers are stored as individual marker refs — we just store the
  // marker layer group instance here.
  const sensorGroupRef = useRef<import("leaflet").LayerGroup | null>(null);
  const paragraph3LayerRef = useRef<LeafletGeoJSON | null>(null);
  const watercoursesLayerRef = useRef<LeafletGeoJSON | null>(null);

  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer>("none");
  const [showMedia, setShowMedia] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const [showDmi, setShowDmi] = useState(true);
  // Async Leaflet-init: natur-lags-effekten må først køre når kortet findes.
  const [mapReady, setMapReady] = useState(false);

  // ── Initial map setup ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    if (!geometry.hasValidGeometry && !geometry.centroid) return;

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      // Fix default icon paths for bundlers
      const iconProto = L.Icon.Default.prototype as unknown as Record<string, unknown>;
      delete iconProto["_getIconUrl"];
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      const tileAttrib = '© <a href="https://openstreetmap.org">OpenStreetMap</a>';

      if (geometry.hasValidGeometry && geometry.polygon) {
        const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false });
        L.tileLayer(tileUrl, { attribution: tileAttrib, maxZoom: 19 }).addTo(map);

        const ring = geometry.polygon.coordinates[0] ?? [];
        const latLngs = ring.map((c) => [c[1] ?? 0, c[0] ?? 0] as [number, number]);
        const poly = L.polygon(latLngs, {
          color: "#2BC48A",
          weight: 2.5,
          opacity: 0.9,
          fillColor: "#2BC48A",
          fillOpacity: 0.15,
        }).addTo(map);

        if (geometry.centroid) {
          L.marker([geometry.centroid.lat, geometry.centroid.lng])
            .addTo(map)
            .bindPopup(popupContent(projectName, []));
        }

        map.fitBounds(poly.getBounds(), { padding: [32, 32] });
        mapInstance.current = map;
      } else if (geometry.centroid) {
        const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false });
        L.tileLayer(tileUrl, { attribution: tileAttrib }).addTo(map);
        map.setView([geometry.centroid.lat, geometry.centroid.lng], 14);
        L.marker([geometry.centroid.lat, geometry.centroid.lng])
          .addTo(map)
          .bindPopup(popupContent(projectName, ["Estimeret position"]))
          .openPopup();
        mapInstance.current = map;
      }

      if (!mapInstance.current || cancelled) return;
      const map = mapInstance.current;

      // ── IoT sensor markers ────────────────────────────────────────────────
      if (sensors && sensors.length > 0) {
        const group = L.layerGroup().addTo(map);
        sensorGroupRef.current = group;
        for (const sensor of sensors) {
          const icon = L.divIcon({
            html: sensorDivIconHtml(sensor.status),
            className: "",
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          L.marker([sensor.coordinates.lat, sensor.coordinates.lng], { icon })
            .addTo(group)
            .bindPopup(
              popupContent(sensor.label, [
                `${SENSOR_TYPE_LABELS[sensor.type]}: ${sensor.latestValue} ${sensor.unit}`,
                `🔋 ${sensor.batteryPercent}%`,
                `📡 Sidst set: ${formatLastSeen(sensor.lastSeen)}`,
              ]),
            );
        }
      }

      // ── Buffer zones pre-calculation ─────────────────────────────────────
      const { buildBufferZonesGeoJSON } = await import("@/services/geo-service");
      if (!cancelled) {
        bufferDataRef.current = await buildBufferZonesGeoJSON(geometry);
      }
      if (!cancelled) setMapReady(true);
    })();

    return () => {
      cancelled = true;
      setMapReady(false);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, projectName, projectId]);

  // ── Buffer zone toggle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    if (bufferLayerRef.current) {
      map.removeLayer(bufferLayerRef.current);
      bufferLayerRef.current = null;
    }
    if (activeBuffer === "none" || !bufferDataRef.current) return;

    const key =
      activeBuffer === "100m"
        ? "buffer100m"
        : activeBuffer === "500m"
          ? "buffer500m"
          : "buffer1000m";
    const feature = bufferDataRef.current[key];
    if (!feature) return;

    (async () => {
      const L = await import("leaflet");
      if (!mapInstance.current) return;
      const layer = L.geoJSON(feature, { style: BUFFER_STYLES[activeBuffer] }).addTo(
        mapInstance.current,
      );
      bufferLayerRef.current = layer;
    })();
  }, [activeBuffer]);

  // ── Media + provisional drone camera points — synced after async queries ──
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapInstance.current) return;

      if (mediaLayerRef.current) {
        map.removeLayer(mediaLayerRef.current);
        mediaLayerRef.current = null;
      }

      const geoItems = (mediaItems ?? []).filter((item) => Boolean(item.coordinates));
      const uploadPoints = droneUploadPoints ?? [];
      if (!showMedia || (geoItems.length === 0 && uploadPoints.length === 0)) return;

      const group = L.layerGroup().addTo(map);
      mediaLayerRef.current = group;

      for (const item of geoItems) {
        if (!item.coordinates) continue;
        const icon = L.divIcon({
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#F59E0B;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:8px;">📷</div>',
          className: "",
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        L.marker([item.coordinates.lat, item.coordinates.lng], { icon })
          .addTo(group)
          .bindPopup(
            popupContent(
              item.title,
              [MEDIA_CATEGORY_LABELS[item.category]],
              new Date(item.capturedAt ?? item.uploadedAt).toLocaleDateString("da-DK"),
            ),
          );
      }

      for (const point of uploadPoints) {
        const icon = L.divIcon({
          html: '<div style="width:18px;height:18px;border-radius:50%;background:#7C3AED;border:2px dashed white;box-shadow:0 1px 5px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:9px;">📷</div>',
          className: "",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const details = [
          "FØR · ubekræftet kameraposition",
          new Date(point.capturedAt).toLocaleString("da-DK"),
        ];
        if (point.cameraLabel) details.push(point.cameraLabel);
        if (point.altitudeM != null) details.push(`Højde: ${point.altitudeM.toFixed(1)} m`);
        L.marker([point.coordinates.lat, point.coordinates.lng], { icon })
          .addTo(group)
          .bindPopup(
            popupContent(
              point.fileName,
              details,
              "Browseraflæst GPS, som behandles som ubekræftet i dette kortlag. Punktet er ikke et billed-footprint eller rapportbevis.",
            ),
          );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, mediaItems, droneUploadPoints, showMedia]);

  // ── Natur-lag (§3 + vandløb) — synces med props ───────────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapInstance.current) return;

      if (paragraph3LayerRef.current) {
        map.removeLayer(paragraph3LayerRef.current);
        paragraph3LayerRef.current = null;
      }
      if (paragraph3GeoJSON && paragraph3GeoJSON.features.length > 0) {
        paragraph3LayerRef.current = L.geoJSON(paragraph3GeoJSON as never, {
          style: { color: "#16A34A", weight: 1.5, fillColor: "#22C55E", fillOpacity: 0.25 },
          onEachFeature: (feature, layer) => {
            const t = (feature.properties as Record<string, unknown>)["natureType"];
            layer.bindPopup(popupContent("§3 beskyttet natur", [String(t ?? "Naturareal")]));
          },
        }).addTo(map);
      }

      if (watercoursesLayerRef.current) {
        map.removeLayer(watercoursesLayerRef.current);
        watercoursesLayerRef.current = null;
      }
      if (watercoursesGeoJSON && watercoursesGeoJSON.features.length > 0) {
        watercoursesLayerRef.current = L.geoJSON(watercoursesGeoJSON as never, {
          style: { color: "#0EA5E9", weight: 2, opacity: 0.85 },
          onEachFeature: (feature, layer) => {
            const navn = (feature.properties as Record<string, unknown>)["navn"];
            layer.bindPopup(popupContent("Vandløb", navn ? [String(navn)] : []));
          },
        }).addTo(map);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, paragraph3GeoJSON, watercoursesGeoJSON]);

  // ── Show/hide sensor layer ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !sensorGroupRef.current) return;
    const map = mapInstance.current;
    if (showSensors) {
      map.addLayer(sensorGroupRef.current);
    } else {
      map.removeLayer(sensorGroupRef.current);
    }
  }, [showSensors]);

  // ─── No geometry fallback ─────────────────────────────────────────────────
  if (!geometry.hasValidGeometry && !geometry.centroid) {
    return (
      <div
        style={{ height }}
        className="rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 bg-muted/20 text-muted-foreground"
      >
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <p className="text-sm">Ingen geometri registreret</p>
        <p className="text-xs">Upload en GeoJSON-polygon for at aktivere kortvisning</p>
      </div>
    );
  }

  const mediaCount =
    (mediaItems ?? []).filter((item) => Boolean(item.coordinates)).length +
    (droneUploadPoints?.length ?? 0);
  const hasMedia = mediaCount > 0;
  const hasSensors = (sensors ?? []).length > 0;

  return (
    <div className="relative rounded-xl overflow-hidden border" style={{ height }}>
      <div ref={mapRef} className="h-full w-full" />

      {/* ── Status badge top-left ─────────────────────────────────────────── */}
      <div className="absolute top-2 left-2 z-[1000]">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm ${
            geometry.hasValidGeometry
              ? "bg-white text-emerald-700 border border-emerald-200"
              : "bg-white text-amber-700 border border-amber-200"
          }`}
        >
          <MapPin className="h-3 w-3" />
          {geometry.hasValidGeometry
            ? `Polygon · ${geometry.areaHa != null ? `${geometry.areaHa} ha` : "areal ukendt"}`
            : "Kun centroid"}
        </span>
      </div>

      {/* ── DMI overlay top-right ─────────────────────────────────────────── */}
      {dmiData && showDmi && <DmiOverlay data={dmiData} />}

      {/* ── Copernicus NDVI badge (top-right, below DMI if both shown) ──────── */}
      {copernicusData?.latestNdviEstimate !== undefined && (
        <div
          className={`absolute z-[999] bg-white rounded-xl shadow border border-gray-100 px-2.5 py-1.5 flex items-center gap-1.5 ${
            dmiData && showDmi ? "top-[110px]" : "top-2"
          } right-2`}
        >
          <Leaf className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold text-gray-700">
            NDVI {copernicusData.latestNdviEstimate.toFixed(2)}
          </span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 ${
              copernicusData.mode === "live"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {copernicusData.mode === "live" ? "LIVE" : "PREVIEW"}
          </span>
        </div>
      )}

      {/* ── Layer + buffer toggles bottom-left ──────────────────────────────── */}
      <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap gap-1">
        {/* Buffer zones */}
        {(["none", "100m", "500m", "1000m"] as ActiveBuffer[]).map((buf) => (
          <PillBtn key={buf} active={activeBuffer === buf} onClick={() => setActiveBuffer(buf)}>
            {buf === "none" ? "Ingen zone" : buf === "1000m" ? "1km" : buf}
          </PillBtn>
        ))}

        {/* Divider */}
        <span className="w-px bg-gray-200 mx-0.5 self-stretch" />

        {/* Media toggle */}
        {hasMedia && (
          <PillBtn active={showMedia} onClick={() => setShowMedia((v) => !v)}>
            Fotos · {mediaCount}
          </PillBtn>
        )}

        {/* IoT sensor toggle */}
        {hasSensors && (
          <PillBtn active={showSensors} onClick={() => setShowSensors((v) => !v)}>
            IoT-sensorer
          </PillBtn>
        )}

        {/* DMI toggle */}
        {dmiData && (
          <PillBtn active={showDmi} onClick={() => setShowDmi((v) => !v)}>
            DMI vejr
          </PillBtn>
        )}
      </div>
    </div>
  );
}
