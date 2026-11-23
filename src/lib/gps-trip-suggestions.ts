import { haversineDistance } from "@/services/geo-service";

type MeasuredPosition = {
  id: string;
  measured_at: string;
  latitude: number;
  longitude: number;
};

const MOVE_METRES = 100;
const STOP_MS = 10 * 60_000;
const MAX_GAP_MS = 15 * 60_000;

export function suggestGpsTrips(points: MeasuredPosition[]) {
  const sorted = points
    .map((point) => ({ ...point, time: Date.parse(point.measured_at) }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((left, right) => left.time - right.time);
  type Point = (typeof sorted)[number];
  const suggestions: { start: Point; end: Point }[] = [];
  let previous = sorted[0];
  let anchor = previous;
  let start: Point | undefined;

  function finish() {
    if (start && anchor.time > start.time) suggestions.push({ start, end: anchor });
    start = undefined;
  }

  for (const current of sorted.slice(1)) {
    if (current.time === previous.time) continue;
    if (current.time - previous.time > MAX_GAP_MS) {
      finish();
      anchor = current;
    } else {
      const displacement = haversineDistance(
        { lat: anchor.latitude, lng: anchor.longitude },
        { lat: current.latitude, lng: current.longitude },
      );
      if (displacement >= MOVE_METRES) {
        start ??= previous;
        anchor = current;
      } else if (current.time - anchor.time >= STOP_MS) {
        finish();
        anchor = current;
      }
    }
    previous = current;
  }
  finish();
  return suggestions.reverse();
}
