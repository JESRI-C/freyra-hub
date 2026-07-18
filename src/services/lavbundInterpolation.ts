/**
 * Interpolation af vandstandskort ud fra punktmålinger — nærmeste-punkt-
 * princippet (samme konvention som arealfordelingen i beregningsmotoren:
 * hvert målepunkt repræsenterer sit opland). Interpolationen er
 * retningsgivende og skal feltvalideres, jf. metodeafsnittet i rapporten.
 *
 * Ren og testbar: ingen Leaflet/DOM — komponenten tegner resultatet på et
 * canvas og lægger det som billed-overlay på kortet.
 */
import { klassificerDybde } from "@/services/lavbundBeregning";

export interface VandstandsPunkt {
  lat: number;
  lng: number;
  dybdeM: number;
}

export interface GridBounds {
  nord: number;
  syd: number;
  oest: number;
  vest: number;
}

export interface VandstandsGrid {
  bounds: GridBounds;
  cols: number;
  rows: number;
  /** Rækkevis (nord→syd), null = uden for projektpolygonen. */
  klasseNavne: (string | null)[];
}

/** Punkt-i-polygon (ray casting) på en WGS84-ring [[lng,lat], ...]. */
export function iPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inde = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = [ring[i][0], ring[i][1]];
    const [xj, yj] = [ring[j][0], ring[j][1]];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inde = !inde;
    }
  }
  return inde;
}

/** Dybden i nærmeste målepunkt (afstand i grader, lng-skaleret med cos(lat)). */
export function naermesteDybde(punkter: VandstandsPunkt[], lat: number, lng: number): number | null {
  let bedst = Infinity;
  let dybde: number | null = null;
  const kLng = Math.cos((lat * Math.PI) / 180);
  for (const p of punkter) {
    const dLat = p.lat - lat;
    const dLng = (p.lng - lng) * kLng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bedst) {
      bedst = d;
      dybde = p.dybdeM;
    }
  }
  return dybde;
}

/** Bounds omkring punkterne (evt. udvidet af polygonring) med margin. */
export function beregnBounds(
  punkter: VandstandsPunkt[],
  polygonRing?: number[][] | null,
  marginFraktion = 0.15,
): GridBounds | null {
  const lats: number[] = punkter.map((p) => p.lat);
  const lngs: number[] = punkter.map((p) => p.lng);
  for (const [lng, lat] of polygonRing ?? []) {
    lats.push(lat);
    lngs.push(lng);
  }
  if (lats.length === 0) return null;
  const nord = Math.max(...lats);
  const syd = Math.min(...lats);
  const oest = Math.max(...lngs);
  const vest = Math.min(...lngs);
  const mLat = Math.max((nord - syd) * marginFraktion, 0.0004);
  const mLng = Math.max((oest - vest) * marginFraktion, 0.0006);
  return { nord: nord + mLat, syd: syd - mLat, oest: oest + mLng, vest: vest - mLng };
}

/**
 * Byg klassegrid: hver celle får afvandingsklassen for nærmeste målepunkt.
 * Med polygonring klippes cellerne til projektområdet (null udenfor).
 */
export function bygVandstandsGrid(
  punkter: VandstandsPunkt[],
  opts?: { polygonRing?: number[][] | null; cols?: number; rows?: number },
): VandstandsGrid | null {
  if (punkter.length < 3) return null; // for få punkter til et meningsfuldt kort
  const bounds = beregnBounds(punkter, opts?.polygonRing);
  if (!bounds) return null;
  const cols = opts?.cols ?? 96;
  const rows = opts?.rows ?? 64;
  const klasseNavne: (string | null)[] = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const lat = bounds.nord - ((r + 0.5) / rows) * (bounds.nord - bounds.syd);
    for (let c = 0; c < cols; c++) {
      const lng = bounds.vest + ((c + 0.5) / cols) * (bounds.oest - bounds.vest);
      if (opts?.polygonRing && !iPolygon(lat, lng, opts.polygonRing)) {
        klasseNavne[r * cols + c] = null;
        continue;
      }
      const dybde = naermesteDybde(punkter, lat, lng);
      klasseNavne[r * cols + c] = dybde === null ? null : klassificerDybde(dybde).navn;
    }
  }
  return { bounds, cols, rows, klasseNavne };
}
