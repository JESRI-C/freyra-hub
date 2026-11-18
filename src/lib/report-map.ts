import { z } from "zod";
import type { ReportContent } from "./report-document";

export const REPORT_MAP_WIDTH = 1250;
export const REPORT_MAP_HEIGHT = 620;
const MERCATOR_LIMIT = 85.0511;

export const ReportMapViewportSchema = z.object({
  center: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-MERCATOR_LIMIT).max(MERCATOR_LIMIT),
  ]),
  zoom: z.number().int().min(1).max(18),
});
export type ReportMapViewport = z.infer<typeof ReportMapViewportSchema>;
type Position = [number, number];

/** Sources printed on each of the three existing map types, before optional atlas points. */
export function reportMapGeometry(
  content: Pick<ReportContent, "natureSurvey" | "bridgeObservations" | "sources">,
) {
  const rings = (content.natureSurvey?.areas ?? []).map(({ geometry }) => geometry.coordinates);
  const bridges = content.bridgeObservations ?? [];
  const points: Position[] = rings.length
    ? rings.map((polygon) => polygon[0][0])
    : bridges.length
      ? bridges.map(({ longitude, latitude }) => [longitude, latitude])
      : content.sources.flatMap(({ position }) => (position ? [position] : []));
  return { rings, points };
}

export function mapPixel(position: [number, number], zoom: number): [number, number] {
  const [lng, rawLat] = position;
  const lat = Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, rawLat));
  const size = 256 * 2 ** zoom;
  return [
    ((lng + 180) / 360) * size,
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2) *
      size,
  ];
}

function pixelPosition(x: number, y: number, zoom: number): Position {
  const size = 256 * 2 ** zoom;
  const lng = (((((x * 360) / size) % 360) + 360) % 360) - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI;
  return [lng, Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, lat))];
}

export function offsetReportMap(
  view: ReportMapViewport,
  dx: number,
  dy: number,
): ReportMapViewport {
  const [x, y] = mapPixel(view.center, view.zoom);
  return { center: pixelPosition(x + dx, y + dy, view.zoom), zoom: view.zoom };
}

export function isOnReportMap(
  [x, y]: Position,
  width = REPORT_MAP_WIDTH,
  height = REPORT_MAP_HEIGHT,
) {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function validReportMapPosition([lng, lat]: Position) {
  return (
    Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90
  );
}

export function placeReportMapLabels(
  points: Position[],
  width = REPORT_MAP_WIDTH,
  height = REPORT_MAP_HEIGHT,
  clip = false,
) {
  const labels: { index: number; left: number; top: number; width: number; height: number }[] = [];
  const directions = [
    [1, -1],
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const labelHeight = 24;
  const occupied = new Uint8Array(width * height);
  const reserve = (left: number, top: number, right: number, bottom: number) => {
    for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) {
      occupied.fill(1, y * width + Math.max(0, left), y * width + Math.min(width, right));
    }
  };
  for (const [x, y] of points) {
    if (clip && !isOnReportMap([x, y], width, height)) continue;
    reserve(Math.floor(x) - 9, Math.floor(y) - 9, Math.ceil(x) + 10, Math.ceil(y) + 10);
  }

  for (const [index, [x, y]] of points.entries()) {
    if (clip && !isOnReportMap([x, y], width, height)) continue;
    const labelWidth = String(index + 1).length * 12 + 8;
    const positions = [12, 28, 44, 60].flatMap((distance) =>
      directions.map(([dx, dy]) => ({
        left: Math.round(x + dx * distance - (dx < 0 ? labelWidth : dx === 0 ? labelWidth / 2 : 0)),
        top: Math.round(
          y + dy * distance - (dy < 0 ? labelHeight : dy === 0 ? labelHeight / 2 : 0),
        ),
      })),
    );
    const position = positions.find(({ left, top }) => {
      if (left < 2 || top < 2 || left + labelWidth > width - 2 || top + labelHeight > height - 2)
        return false;
      for (let row = top; row < top + labelHeight; row++) {
        const start = row * width + left;
        if (occupied.subarray(start, start + labelWidth).includes(1)) return false;
      }
      return true;
    });
    if (position) {
      const { left, top } = position;
      reserve(left - 2, top - 2, left + labelWidth + 2, top + labelHeight + 2);
      labels.push({ index, ...position, width: labelWidth, height: labelHeight });
    }
  }
  return labels;
}
/** Bounded on-screen tile view, using the same OpenStreetMap provider as LiveProjectMap. */
export function reportMapPlan(
  positions: Position[],
  width = REPORT_MAP_WIDTH,
  height = REPORT_MAP_HEIGHT,
  viewport?: ReportMapViewport,
) {
  if ((!positions.length && !viewport) || !positions.every(validReportMapPosition))
    throw new Error("Kortgrundlaget mangler gyldige GPS-positioner.");
  if (viewport) ReportMapViewportSchema.parse(viewport);
  let zoom = viewport?.zoom ?? 18;
  let center: Position;
  if (viewport) {
    center = mapPixel(viewport.center, zoom);
  } else {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const position of positions) {
      const [x, y] = mapPixel(position, zoom);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    let scale = 1;
    while (
      zoom > 1 &&
      ((maxX - minX) * scale >= width - 100 || (maxY - minY) * scale >= height - 100)
    ) {
      zoom--;
      scale /= 2;
    }
    center = [((minX + maxX) * scale) / 2, ((minY + maxY) * scale) / 2];
  }
  const left = center[0] - width / 2,
    top = center[1] - height / 2;
  const projected = positions.map((p) => mapPixel(p, zoom));
  const tiles: { x: number; y: number; column: number; left: number; top: number; url: string }[] =
    [];
  const count = 2 ** zoom;
  for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++)
    for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) {
      if (y < 0 || y >= count) continue;
      const wrapped = ((x % count) + count) % count;
      tiles.push({
        x: wrapped,
        y,
        column: x,
        left: x * 256 - left,
        top: y * 256 - top,
        url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`,
      });
    }
  if (tiles.length > 32) throw new Error("Kortudsnittet kræver for mange kortfelter.");
  const centerY = top + height / 2;
  const centerLat = Math.atan(Math.sinh(Math.PI * (1 - (2 * centerY) / (256 * count))));
  const metersPerPixel = (2 * Math.PI * 6378137 * Math.cos(centerLat)) / (256 * count);
  const targetMeters = metersPerPixel * 160;
  const magnitude = 10 ** Math.floor(Math.log10(targetMeters));
  const scaleMeters = ([5, 2, 1].find((step) => step * magnitude <= targetMeters) ?? 1) * magnitude;
  return {
    zoom,
    viewport: viewport ?? { center: pixelPosition(left + width / 2, centerY, zoom), zoom },
    tiles,
    points: projected.map(([x, y]): Position => {
      const world = 256 * count;
      const wrappedX = viewport ? x - Math.round((x - center[0]) / world) * world : x;
      return [wrappedX - left, y - top];
    }),
    scale: { meters: scaleMeters, pixels: scaleMeters / metersPerPixel },
  };
}
