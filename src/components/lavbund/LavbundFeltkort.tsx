/**
 * LavbundFeltkort — rigtigt, interaktivt feltkort (Leaflet, satellit-baggrund).
 * Målepunkter vises som farvekodede cirkler efter målt afvandingsklasse
 * (Naturstyrelsens klasseskala, blå=våd → rød=tør) med hover-tooltip og popup.
 * Understøtter klik-placering af nye målepunkter (placing-mode).
 *
 * Punkter uden reel geoposition (ældre/demo-data) fordeles ud fra deres
 * grid-position omkring kortets centrum, så kortet altid kan tegnes.
 */
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker, Polygon as LPolygon, TileLayer } from "leaflet";
import type { WmsOverlay } from "@/components/maps/MapEditorMap";
import "leaflet/dist/leaflet.css";
import { klassificerDybde } from "@/services/lavbundBeregning";
import type { Maalepunkt } from "@/types/lavbund";

export const KLASSE_FARVE: Record<string, string> = {
  "Frit vandspejl": "#1e3a8a",
  Sump: "#2563eb",
  "Våd eng": "#38bdf8",
  "Fugtig eng": "#86efac",
  "Tør eng": "#fcd34d",
  "Tør overjord": "#f97316",
  Mark: "#b91c1c",
};

/**
 * Samme feltnavne som MapEditorMaps WmsOverlay, men med opacity/attribution
 * som krav — feltkortet tegner altid oven på satellitbaggrunden.
 */
export type FeltkortWmsOverlay = Required<
  Pick<WmsOverlay, "url" | "layers" | "opacity" | "attribution">
>;

interface Props {
  maalepunkter: Maalepunkt[];
  senesteDybde: Map<string, number>;
  center: { lat: number; lng: number };
  /** Projektpolygon (koblet kerneprojekt) tegnes som ramme når den findes. */
  polygon?: { type: "Polygon"; coordinates: number[][][] } | null;
  placing?: boolean;
  onPlace?: (pos: { lat: number; lng: number }) => void;
  height?: number;
  /** Valgfrit WMS-lag (fx Kulstof2022) — fejler gracefully hvis endpointet ikke svarer. */
  wmsOverlay?: FeltkortWmsOverlay | null;
}

/** Reel position eller syntetisk spredning omkring centrum ud fra grid-position. */
export function resolvePosition(
  mp: Maalepunkt,
  center: { lat: number; lng: number },
): { lat: number; lng: number } {
  if (mp.lat != null && mp.lng != null) return { lat: mp.lat, lng: mp.lng };
  return {
    lat: center.lat + ((50 - mp.position.y) / 100) * 0.008,
    lng: center.lng + ((mp.position.x - 50) / 100) * 0.014,
  };
}

export function LavbundFeltkort({
  maalepunkter,
  senesteDybde,
  center,
  polygon,
  placing = false,
  onPlace,
  height = 420,
  wmsOverlay = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);
  const polygonRef = useRef<LPolygon | null>(null);
  const wmsRef = useRef<TileLayer | null>(null);
  const [ready, setReady] = useState(false);
  const placingRef = useRef(placing);
  const onPlaceRef = useRef(onPlace);
  useEffect(() => {
    placingRef.current = placing;
    onPlaceRef.current = onPlace;
    const el = containerRef.current;
    if (el) el.style.cursor = placing ? "crosshair" : "";
  }, [placing, onPlace]);

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let alive = true;
    (async () => {
      const L = await import("leaflet");
      if (!alive || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
      });
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles © Esri — Esri, Maxar, Earthstar Geographics", maxZoom: 19 },
      ).addTo(map);
      map.on("click", (ev) => {
        if (!placingRef.current) return;
        const ll = (ev as unknown as { latlng: { lat: number; lng: number } }).latlng;
        onPlaceRef.current?.({ lat: ll.lat, lng: ll.lng });
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

  // ── Projektpolygon ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    (async () => {
      const L = await import("leaflet");
      if (polygonRef.current) {
        map.removeLayer(polygonRef.current);
        polygonRef.current = null;
      }
      const ring = polygon?.coordinates?.[0];
      if (!ring || ring.length < 4) return;
      polygonRef.current = L.polygon(
        ring.map((c) => [c[1], c[0]] as [number, number]),
        { color: "#2BC48A", weight: 2, fillOpacity: 0.06, dashArray: "6 4" },
      ).addTo(map);
    })();
  }, [polygon, ready]);

  // ── WMS-overlay (fx Kulstof2022) ────────────────────────────────────────────
  // Afhængigheder på primitiverne (ikke objekt-identitet), så laget ikke
  // rives ned og genopbygges hvis en kalder sender et nyt objekt pr. render.
  const wmsUrl = wmsOverlay?.url;
  const wmsLayers = wmsOverlay?.layers;
  const wmsOpacity = wmsOverlay?.opacity;
  const wmsAttribution = wmsOverlay?.attribution;
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      if (wmsRef.current) {
        map.removeLayer(wmsRef.current);
        wmsRef.current = null;
      }
      if (!wmsUrl || !wmsLayers) return;
      // Manglende/tavse tiles efterlader blot satellitkortet synligt.
      wmsRef.current = L.tileLayer
        .wms(wmsUrl, {
          layers: wmsLayers,
          format: "image/png",
          transparent: true,
          opacity: wmsOpacity,
          attribution: wmsAttribution,
        })
        .addTo(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [wmsUrl, wmsLayers, wmsOpacity, wmsAttribution, ready]);

  // ── Målepunkts-markører (genopbygges når data ændrer sig) ───────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      const bounds: [number, number][] = [];
      for (const mp of maalepunkter) {
        const pos = resolvePosition(mp, center);
        const dybde = senesteDybde.get(mp.id);
        const klasse = dybde !== undefined ? klassificerDybde(dybde) : null;
        const farve = klasse ? (KLASSE_FARVE[klasse.navn] ?? "#94a3b8") : "#94a3b8";
        const marker = L.circleMarker([pos.lat, pos.lng], {
          radius: mp.type === "kanal_logger" ? 10 : 8,
          color: "#ffffff",
          weight: 2,
          fillColor: farve,
          fillOpacity: 0.95,
        })
          .bindTooltip(
            `${mp.id} · ${dybde !== undefined ? `${dybde.toFixed(2)} m` : "ingen data"}`,
            { direction: "top", sticky: true },
          )
          .bindPopup(
            `<strong>${mp.id}</strong><br/>` +
              `${mp.type === "kanal_logger" ? "Kanal-logger" : "Markpejling"}<br/>` +
              (dybde !== undefined
                ? `Seneste: <strong>${dybde.toFixed(2)} m</strong> under terræn<br/>Klasse: <strong>${klasse?.navn}</strong>`
                : "Ingen målinger endnu") +
              (mp.lat != null ? "" : "<br/><em>Estimeret position — placér med klik</em>"),
          )
          .addTo(map);
        markersRef.current.push(marker);
        bounds.push([pos.lat, pos.lng]);
      }
      if (bounds.length > 0) {
        map.fitBounds(bounds as never, { padding: [40, 40], maxZoom: 16 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [maalepunkter, senesteDybde, center, ready]);

  return (
    <div className="relative">
      <div ref={containerRef} style={{ height }} className="w-full rounded-xl border overflow-hidden" />
      {placing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow-lg border px-4 py-2 text-sm font-medium">
          Klik på kortet for at placere det nye målepunkt
        </div>
      )}
    </div>
  );
}
