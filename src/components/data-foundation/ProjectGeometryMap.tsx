import { useEffect, useRef, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, Map as LeafletMap, PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ProjectGeometry } from "@/lib/supabase/types";
import type { BufferZonesGeoJSON } from "@/services/geo-service";
import { MapPin, AlertTriangle } from "lucide-react";

interface ProjectGeometryMapProps {
  geometry: ProjectGeometry;
  projectName: string;
  height?: number;
}

type ActiveBuffer = "none" | "100m" | "500m" | "1000m";

const BUFFER_STYLES: Record<Exclude<ActiveBuffer, "none">, PathOptions> = {
  "100m": { color: "#2BC48A", weight: 1.5, fillOpacity: 0.08, dashArray: "4 4" },
  "500m": { color: "#3B82F6", weight: 1.5, fillOpacity: 0.06, dashArray: "4 4" },
  "1000m": { color: "#8B5CF6", weight: 1.5, fillOpacity: 0.04, dashArray: "4 4" },
};

export function ProjectGeometryMap({
  geometry,
  projectName,
  height = 360,
}: ProjectGeometryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const bufferDataRef = useRef<BufferZonesGeoJSON | null>(null);
  const bufferLayerRef = useRef<LeafletGeoJSON | null>(null);

  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer>("none");

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    if (!geometry.hasValidGeometry && !geometry.centroid) return;

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      const iconProto = L.Icon.Default.prototype as unknown as Record<string, unknown>;
      delete iconProto["_getIconUrl"];
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (geometry.hasValidGeometry && geometry.polygon) {
        const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

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
            .bindPopup(`<strong>${projectName}</strong>`);
        }

        map.fitBounds(poly.getBounds(), { padding: [32, 32] });
        mapInstance.current = map;
      } else if (geometry.centroid) {
        const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        }).addTo(map);
        map.setView([geometry.centroid.lat, geometry.centroid.lng], 14);
        L.marker([geometry.centroid.lat, geometry.centroid.lng])
          .addTo(map)
          .bindPopup(`<strong>${projectName}</strong><br/>Estimeret position`)
          .openPopup();
        mapInstance.current = map;
      }

      const { buildBufferZonesGeoJSON } = await import("@/services/geo-service");
      if (!cancelled) {
        bufferDataRef.current = await buildBufferZonesGeoJSON(geometry);
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [geometry, projectName]);

  useEffect(() => {
    if (!mapInstance.current) return;

    const map = mapInstance.current;

    if (bufferLayerRef.current) {
      map.removeLayer(bufferLayerRef.current);
      bufferLayerRef.current = null;
    }

    if (activeBuffer === "none" || !bufferDataRef.current) return;

    const geojsonFeature =
      bufferDataRef.current[
        activeBuffer === "100m"
          ? "buffer100m"
          : activeBuffer === "500m"
            ? "buffer500m"
            : "buffer1000m"
      ];

    if (!geojsonFeature) return;

    (async () => {
      const L = await import("leaflet");
      if (!mapInstance.current) return;
      const layer = L.geoJSON(geojsonFeature, {
        style: BUFFER_STYLES[activeBuffer],
      }).addTo(mapInstance.current);
      bufferLayerRef.current = layer;
    })();
  }, [activeBuffer]);

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

  return (
    <div className="relative rounded-xl overflow-hidden border" style={{ height }}>
      <div ref={mapRef} className="h-full w-full" />

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

      <div className="absolute bottom-3 left-3 z-[1000] flex gap-1">
        {(["none", "100m", "500m", "1000m"] as ActiveBuffer[]).map((buf) => (
          <button
            key={buf}
            onClick={() => setActiveBuffer(buf)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full shadow-sm border transition-colors ${
              activeBuffer === buf
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {buf === "none" ? "Ingen" : buf === "1000m" ? "1km" : buf}
          </button>
        ))}
      </div>
    </div>
  );
}
