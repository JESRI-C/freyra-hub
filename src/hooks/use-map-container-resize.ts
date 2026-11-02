import { useEffect, type RefObject } from "react";
import type { Map as LeafletMap } from "leaflet";

/** Leaflet's window resize listener misses a retained panel becoming visible. */
export function useMapContainerResize(
  container: RefObject<HTMLDivElement | null>,
  map: RefObject<Pick<LeafletMap, "invalidateSize"> | null>,
) {
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      if (entries.some((entry) => entry.contentRect.width > 0 && entry.contentRect.height > 0))
        map.current?.invalidateSize({ animate: false, pan: false });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [container, map]);
}
