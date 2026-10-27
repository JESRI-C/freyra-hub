import type { ProjectMediaItem } from "@/lib/platform/media-types";

/** Only source-specific, finite WGS84 positions from this project can become map points. */
export function getPhotoMapPoints(items: ProjectMediaItem[], projectId: string) {
  return items
    .filter((item) => {
      const p = item.coordinates;
      return (
        item.projectId === projectId &&
        p &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lng) <= 180
      );
    })
    .map((item) => ({
      item,
      position: [item.coordinates!.lat, item.coordinates!.lng] as [number, number],
    }));
}
