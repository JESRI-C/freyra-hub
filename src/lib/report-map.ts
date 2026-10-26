export function mapPixel(position: [number, number], zoom: number): [number, number] {
  const [lng, rawLat] = position;
  const lat = Math.max(-85.0511, Math.min(85.0511, rawLat));
  const size = 256 * 2 ** zoom;
  return [
    ((lng + 180) / 360) * size,
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2) *
      size,
  ];
}
/** Bounded on-screen tile view, using the same OpenStreetMap provider as LiveProjectMap. */
export function reportMapPlan(positions: [number, number][], width = 1250, height = 620) {
  if (
    !positions.length ||
    positions.some((p) => !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)
  )
    throw new Error("Kortgrundlaget mangler gyldige GPS-positioner.");
  let zoom = 18;
  let projected = positions.map((p) => mapPixel(p, zoom));
  while (zoom > 1) {
    const xs = projected.map((p) => p[0]),
      ys = projected.map((p) => p[1]);
    if (
      Math.max(...xs) - Math.min(...xs) < width - 100 &&
      Math.max(...ys) - Math.min(...ys) < height - 100
    )
      break;
    zoom--;
    projected = positions.map((p) => mapPixel(p, zoom));
  }
  const xs = projected.map((p) => p[0]),
    ys = projected.map((p) => p[1]);
  const left = (Math.min(...xs) + Math.max(...xs) - width) / 2,
    top = (Math.min(...ys) + Math.max(...ys) - height) / 2;
  const tiles: { x: number; y: number; left: number; top: number; url: string }[] = [];
  const count = 2 ** zoom;
  for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++)
    for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) {
      if (y < 0 || y >= count) continue;
      const wrapped = ((x % count) + count) % count;
      tiles.push({
        x: wrapped,
        y,
        left: x * 256 - left,
        top: y * 256 - top,
        url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`,
      });
    }
  if (tiles.length > 32) throw new Error("Kortudsnittet kræver for mange kortfelter.");
  return {
    zoom,
    tiles,
    points: projected.map(([x, y]) => [x - left, y - top] as [number, number]),
  };
}
