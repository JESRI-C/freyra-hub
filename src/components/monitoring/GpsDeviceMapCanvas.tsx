import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMapContainerResize } from "@/hooks/use-map-container-resize";
import type { GpsHistoryPoint, GpsMapPoint } from "./GpsDeviceOverview";

const dateTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });

export default function GpsDeviceMapCanvas({
  points,
  selected,
  onSelect,
  history,
}: {
  points: GpsMapPoint[];
  selected: string | null;
  onSelect: (id: string) => void;
  history: GpsHistoryPoint[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap>(null);
  const [leaflet, setLeaflet] = useState<typeof import("leaflet") | null>(null);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const fitted = useRef(false);
  const fittedHistory = useRef<GpsHistoryPoint[]>([]);
  useMapContainerResize(container, map);

  useEffect(() => {
    let disposed = false;
    void import("leaflet")
      .then((L) => {
        if (disposed || !container.current) return;
        map.current = L.map(container.current, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
          maxZoom: 19,
        })
          .on("tileerror", () => {
            if (!disposed) setTileError(true);
          })
          .addTo(map.current);
        setLeaflet(L);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !leaflet || !points.length) return;
    const instance = map.current;
    const group = leaflet.featureGroup().addTo(instance);
    const active = points.find((point) => point.device_id === selected);
    const historyBounds = leaflet.latLngBounds([]);
    for (const point of history) {
      const label = dateTime.format(new Date(point.measured_at));
      const position: [number, number] = [point.latitude, point.longitude];
      historyBounds.extend(position);
      leaflet
        .marker(position, {
          keyboard: true,
          title: label,
          alt: label,
          zIndexOffset: -1000,
          icon: leaflet.divIcon({
            className: "gps-history-point rounded-full border border-white bg-violet-700",
            iconSize: [10, 10],
          }),
        })
        .addTo(group)
        .bindTooltip(label);
    }
    for (const point of points) {
      const label = document.createElement("span");
      label.textContent = point.name;
      const dot = document.createElement("span");
      dot.className = "block h-6 w-6 rounded-full border-2 border-white shadow";
      dot.style.backgroundColor = active === point ? "#0f172a" : "#0369a1";
      const marker = leaflet
        .marker([point.latitude, point.longitude], {
          keyboard: true,
          title: point.name,
          alt: point.name,
          zIndexOffset: active === point ? 1000 : 0,
          icon: leaflet.divIcon({ html: dot, className: "", iconSize: [24, 24] }),
        })
        .addTo(group);
      marker.bindTooltip(label).on("click", () => onSelect(point.device_id));
      if (active === point) marker.openTooltip();
    }
    if (!fitted.current) {
      instance.fitBounds(group.getBounds(), { padding: [28, 28], maxZoom: 15 });
      fitted.current = true;
    }
    if (history.length && fittedHistory.current !== history) {
      instance.fitBounds(historyBounds, { padding: [28, 28], maxZoom: 16 });
    } else if (
      !history.length &&
      active &&
      !instance.getBounds().contains([active.latitude, active.longitude])
    )
      instance.panTo([active.latitude, active.longitude]);
    fittedHistory.current = history;
    return () => {
      group.remove();
    };
  }, [leaflet, points, selected, onSelect, history]);

  return (
    <div>
      <div
        ref={container}
        role="region"
        aria-label="Kort med målte GPS-positioner"
        className="isolate h-64 w-full rounded-lg border bg-muted/30 sm:h-80"
      />
      {failed && <p role="status">Kortet kunne ikke indlæses. Positionerne står i listen.</p>}
      {tileError && (
        <p role="status">Baggrundskortet kunne ikke hentes. GPS-punkterne er stadig vist.</p>
      )}
    </div>
  );
}
