// Rene transformationer for matrikel-/markblok-opslag: polygon → WKT/DAWA-
// parametre og WFS/DAWA-properties → visningsdata. Ingen I/O — testbar isoleret.

export type LngLat = [number, number];

/** Sikr at en ring er lukket (første punkt == sidste punkt). */
export function ensureClosedRing(ring: LngLat[]): LngLat[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

/** Byg WKT POLYGON i lng/lat-orden (som CQL INTERSECTS mod EPSG:4326 forventer). */
export function ringToWkt(ring: LngLat[]): string {
  const closed = ensureClosedRing(ring);
  const coords = closed.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${coords}))`;
}

/** Byg DAWA polygon-parameter: JSON-array af ringe med [lng,lat]-par. */
export function ringToDawaPolygonParam(ring: LngLat[]): string {
  const closed = ensureClosedRing(ring);
  return JSON.stringify([closed]);
}

/** Koordinater for Polygon/MultiPolygon (JSON-serialiserbare for server-fns). */
export type PolyCoordinates = number[][][] | number[][][][];

/** Fælles resultatform for områdeopslag. */
export interface AreaFeature {
  id: string;
  label: string;
  areaHa: number | null;
  geometry: { type: string; coordinates: PolyCoordinates } | null;
}

/** Læs et felt fra properties med flere kandidatnavne (API'erne varierer). */
function prop(props: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = props[k];
    if (v != null && String(v).length > 0) return String(v);
  }
  return null;
}

/** Label for et DAWA-jordstykke (matrikel). */
export function jordstykkeLabel(props: Record<string, unknown>): string {
  const mnr = prop(props, "matrikelnr", "matrikelnummer") ?? "?";
  const ejerlav = prop(props, "ejerlavnavn", "ejerlav_navn", "ejerlavsnavn") ?? "";
  return ejerlav ? `Matr.nr. ${mnr}, ${ejerlav}` : `Matr.nr. ${mnr}`;
}

/** Registreret areal (m²) → ha, hvis feltet findes. */
export function jordstykkeAreaHa(props: Record<string, unknown>): number | null {
  const raw = prop(props, "registreretareal", "registreret_areal");
  const m2 = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(m2) || m2 <= 0) return null;
  return Math.round((m2 / 10_000) * 100) / 100;
}

/** Label for en LBST-markblok. */
export function markblokLabel(props: Record<string, unknown>, fallbackId?: string): string {
  const nr = prop(props, "MARKBLOKNR", "markbloknr", "Marknr", "MB_NR") ?? fallbackId ?? "?";
  return `Markblok ${nr}`;
}

/** Markbloks bruttoareal (ha) hvis feltet findes. */
export function markblokAreaHa(props: Record<string, unknown>): number | null {
  const raw = prop(props, "BRUTTOAREAL", "bruttoareal", "AREAL", "areal_ha");
  const ha = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(ha) || ha <= 0) return null;
  return Math.round(ha * 100) / 100;
}

/** Klip en resultatliste ved loftet og markér om der blev skåret fra. */
export function capResults<T>(items: T[], max = 500): { items: T[]; truncated: boolean } {
  if (items.length <= max) return { items, truncated: false };
  return { items: items.slice(0, max), truncated: true };
}

/**
 * Nedsampl en ring til maks `max` punkter (jævnt fordelt, første/sidste bevares)
 * så selv meget detaljerede polygoner kan sendes til opslags-API'erne.
 */
export function downsampleRing(ring: LngLat[], max = 500): LngLat[] {
  if (ring.length <= max) return ring;
  const step = (ring.length - 1) / (max - 1);
  const out: LngLat[] = [];
  for (let i = 0; i < max; i++) {
    out.push(ring[Math.round(i * step)]);
  }
  return out;
}
