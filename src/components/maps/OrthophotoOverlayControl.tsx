import { useEffect, useMemo, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import { decodeOrthophoto } from "@/services/monitoring/orthophoto-raster";

/** Browser-only derived preview. It never writes or re-encodes the stored original. */
export function OrthophotoOverlayControl({
  map,
  items,
  projectId,
}: {
  map: LeafletMap | null;
  items: ProjectMediaItem[];
  projectId: string;
}) {
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(
    () =>
      items.filter(
        (item) => item.projectId === projectId && item.metadata?.asset_type === "orthophoto",
      ),
    [items, projectId],
  );
  const item = candidates.find((candidate) => candidate.id === selected);
  useEffect(() => {
    if (!map || !item) {
      setMessage(null);
      return;
    }
    const controller = new AbortController();
    let layer: import("leaflet").ImageOverlay | undefined;
    let cancelled = false;
    setBusy(true);
    setMessage(null);
    void (async () => {
      if (!item.url)
        throw new Error(
          "Privat original kan ikke åbnes. Genindlæs for at forny den autoriserede filadgang.",
        );
      const url = new URL(item.url, window.location.href);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("Ugyldig original-URL.");
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok)
        throw new Error(
          `Privat GeoTIFF kunne ikke hentes (${response.status}). Genindlæs for at forny filadgang.`,
        );
      const size = Number(response.headers.get("content-length"));
      if (size > 200 * 1024 * 1024) throw new Error("Previewgrænse 200 MB overskredet.");
      const raster = await decodeOrthophoto(await response.arrayBuffer());
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = raster.width;
      canvas.height = raster.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Browseren kan ikke tegne rasterpreview.");
      const pixels = context.createImageData(raster.width, raster.height);
      pixels.data.set(raster.rgba);
      context.putImageData(pixels, 0, 0);
      const L = await import("leaflet");
      if (cancelled) return;
      layer = L.imageOverlay(canvas.toDataURL("image/png"), raster.bounds, {
        opacity: 0.8,
        interactive: false,
      }).addTo(map);
      map.fitBounds(raster.bounds);
      setMessage(
        `Rasterpreview · ${raster.crs} · ${raster.width}×${raster.height}. Målenøjagtighed er ikke godkendt.`,
      );
    })()
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (layer) map.removeLayer(layer);
    };
  }, [map, item]);
  if (!candidates.length) return null;
  return (
    <div className="absolute bottom-12 left-3 z-[1000] max-w-[300px] rounded-lg border bg-white p-2 shadow text-xs">
      <label>
        Ortofoto
        <select
          aria-label="Vis importeret ortofoto"
          className="block w-full border rounded p-1 mt-1 text-black"
          value={selected}
          disabled={!map}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Intet rasteroverlay</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </label>
      {busy && <p>Indlæser privat GeoTIFF…</p>}
      {message && (
        <p role="status" className="mt-1 text-amber-800">
          {message}
        </p>
      )}
    </div>
  );
}
