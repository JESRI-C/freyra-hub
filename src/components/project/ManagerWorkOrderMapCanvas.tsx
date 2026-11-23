import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMapContainerResize } from "@/hooks/use-map-container-resize";
import { managerMapSourceLabel, type ManagerMapFeature } from "./manager-work-order-map-data";
import type { ManagerMapViewport } from "./ManagerWorkOrderMap";

export default function ManagerWorkOrderMapCanvas({
  features,
  selectedActionId,
  onSelect,
  viewport,
  onViewport,
}: {
  features: ManagerMapFeature[];
  selectedActionId: string | null;
  onSelect: (actionId: string, projectId: string) => void;
  viewport: ManagerMapViewport | null;
  onViewport: (viewport: ManagerMapViewport) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const tiles = useRef<TileLayer | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const saveViewport = useRef(onViewport);
  saveViewport.current = onViewport;
  const initialViewport = useRef(viewport);
  const fitted = useRef(false);
  const fittedBounds = useRef<string | null>(null);
  useMapContainerResize(container, map);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    void import("leaflet")
      .then((L) => {
        if (disposed || !container.current) return;
        const instance = L.map(container.current, { scrollWheelZoom: false, zoomControl: true });
        map.current = instance;
        instance.on("moveend", () => {
          if (disposed) return;
          const center = instance.getCenter();
          saveViewport.current({ lat: center.lat, lng: center.lng, zoom: instance.getZoom() });
        });
        tiles.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
          maxZoom: 19,
        })
          .on("tileerror", () => {
            if (!disposed) setTileFailed(true);
          })
          .addTo(instance);
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      tiles.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    let disposed = false;
    let group: import("leaflet").FeatureGroup | undefined;
    void import("leaflet").then((L) => {
      if (disposed || !map.current) return;
      group = L.featureGroup().addTo(map.current);
      const points = new Map<string, ManagerMapFeature[]>();
      for (const feature of features) {
        const geometry = feature.location.geometry;
        if (geometry.type === "Point") {
          const key = geometry.coordinates.join(":");
          points.set(key, [...(points.get(key) ?? []), feature]);
        } else {
          const label = document.createElement("span");
          label.textContent = `${feature.title} · ${managerMapSourceLabel(feature.location)}`;
          L.polyline(
            geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            {
              color: feature.color,
              weight: feature.actionId === selectedActionId ? 6 : 3,
            },
          )
            .bindTooltip(label)
            .on("click", () => select.current(feature.actionId, feature.projectId))
            .addTo(group);
        }
      }
      for (const samePosition of points.values()) {
        const jobs = [
          ...new Map(samePosition.map((feature) => [feature.actionId, feature])).values(),
        ];
        const first = jobs[0];
        const [lng, lat] = (first.location.geometry as { coordinates: [number, number] })
          .coordinates;
        const icon = document.createElement("span");
        icon.className =
          "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow";
        icon.style.backgroundColor = jobs.length > 1 ? "#475569" : first.color;
        icon.textContent = jobs.length > 1 ? String(jobs.length) : "";
        if (jobs.some((job) => job.actionId === selectedActionId))
          icon.style.outline = "3px solid #0f172a";
        const marker = L.marker([lat, lng], {
          keyboard: true,
          title:
            jobs.length > 1
              ? `${jobs.length} arbejdsordrer på samme position`
              : `${first.title} · ${managerMapSourceLabel(first.location)}`,
          icon: L.divIcon({ html: icon, className: "", iconSize: [32, 32], iconAnchor: [16, 16] }),
        }).addTo(group);
        if (jobs.length === 1)
          marker.on("click", () => select.current(first.actionId, first.projectId));
        else {
          const choices = document.createElement("div");
          const heading = document.createElement("strong");
          heading.textContent = "Vælg arbejdsordre";
          choices.append(heading);
          for (const job of jobs) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "block min-h-11 w-full border-b py-2 text-left";
            button.textContent = `${job.title} · ${job.projectName}`;
            button.onclick = () => select.current(job.actionId, job.projectId);
            choices.append(button);
          }
          marker.bindPopup(choices);
        }
      }
    });
    return () => {
      disposed = true;
      group?.remove();
    };
  }, [features, selectedActionId, ready]);

  useEffect(() => {
    if (!ready || !map.current || features.length === 0) return;
    const positions = features.flatMap(({ location }) =>
      location.geometry.type === "Point"
        ? [location.geometry.coordinates]
        : location.geometry.coordinates,
    );
    const latLngs = positions.map(([lng, lat]): [number, number] => [lat, lng]);
    let south = Infinity,
      west = Infinity,
      north = -Infinity,
      east = -Infinity;
    for (const [lat, lng] of latLngs) {
      south = Math.min(south, lat);
      west = Math.min(west, lng);
      north = Math.max(north, lat);
      east = Math.max(east, lng);
    }
    const bounds = [south, west, north, east].join(":");
    if (fittedBounds.current === bounds) return;
    fittedBounds.current = bounds;
    if (!fitted.current && initialViewport.current) {
      const { lat, lng, zoom } = initialViewport.current;
      map.current.setView([lat, lng], zoom, { animate: false });
      fitted.current = true;
      return;
    }
    map.current.fitBounds(latLngs, { padding: [30, 30], maxZoom: 17, animate: false });
    fitted.current = true;
  }, [features, ready]);

  return (
    <div className="min-w-0 space-y-2">
      {failed && (
        <p role="alert" className="rounded-xl border p-4 text-sm">
          Kortet kunne ikke åbnes. Vælg stadig en arbejdsordre i listen ved kortet.
        </p>
      )}
      {tileFailed && (
        <div role="alert" className="rounded-xl border bg-card p-3 text-sm">
          <p>
            Dele af baggrundskortet kunne ikke indlæses. Opgavernes gemte positioner og opgavelisten
            kan stadig bruges.
          </p>
          <button
            type="button"
            className="mt-2 min-h-11 rounded-lg border px-3 font-medium"
            onClick={() => {
              setTileFailed(false);
              tiles.current?.redraw();
            }}
          >
            Prøv baggrundskort igen
          </button>
        </div>
      )}
      {!ready && !failed && (
        <p role="status" className="text-sm">
          Henter kort…
        </p>
      )}
      <div
        ref={container}
        role="region"
        aria-label="Kort over indlæste arbejdsordrer"
        className={`relative z-0 w-full rounded-xl border ${failed ? "hidden" : "h-[360px] sm:h-[480px]"}`}
      />
    </div>
  );
}
