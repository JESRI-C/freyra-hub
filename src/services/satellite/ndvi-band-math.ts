/**
 * Ægte NDVI-båndmatematik for Sentinel-2 L2A Cloud-Optimized GeoTIFFs.
 *
 * Læser et lille pixel-vindue omkring projektets centroid direkte fra B04
 * (rød) og B08 (NIR) COG'erne via HTTP range requests (geotiff.js) og beregner
 * median-NDVI af faktiske reflektansværdier — ingen thumbnails, ingen estimater.
 *
 * Scenerne ligger i UTM (EPSG:326xx), så centroid konverteres med standard
 * Krüger-serien (WGS84). Rene hjælpefunktioner er eksporteret til test.
 */

// ─── WGS84 → UTM (Krüger-serie) ───────────────────────────────────────────────

const A = 6378137; // WGS84 semi-major
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);

export interface UtmPoint {
  easting: number;
  northing: number;
  zone: number;
}

/** Konverter WGS84 lat/lng til UTM (nordlig halvkugle). */
export function latLngToUtm(lat: number, lng: number, zone: number): UtmPoint {
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const lng0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180; // central meridian

  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const tanLat = Math.tan(latR);

  const n = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = EP2 * cosLat * cosLat;
  const a = cosLat * (lngR - lng0);

  const m =
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * latR -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * latR) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * latR) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * latR));

  const easting =
    K0 *
      n *
      (a +
        ((1 - t + c) * a * a * a) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120) +
    500000;

  const northing =
    K0 *
    (m +
      n *
        tanLat *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));

  return { easting, northing, zone };
}

// ─── Pixel-vindue ────────────────────────────────────────────────────────────

export interface PixelWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Beregn et pixel-vindue (halfSize pixels til hver side) omkring et punkt i
 * billedets CRS. Returnerer null hvis punktet ligger uden for billedet.
 * bbox: [minX, minY, maxX, maxY] i CRS-enheder (meter for UTM).
 */
export function pixelWindow(
  bbox: [number, number, number, number],
  width: number,
  height: number,
  x: number,
  y: number,
  halfSize = 8,
): PixelWindow | null {
  const [minX, minY, maxX, maxY] = bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return null;
  const px = Math.floor(((x - minX) / (maxX - minX)) * width);
  const py = Math.floor(((maxY - y) / (maxY - minY)) * height);
  const x0 = Math.max(0, px - halfSize);
  const y0 = Math.max(0, py - halfSize);
  const x1 = Math.min(width, px + halfSize);
  const y1 = Math.min(height, py + halfSize);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

// ─── NDVI ────────────────────────────────────────────────────────────────────

/**
 * Median-NDVI over to samhørende bånd-arrays (rød + NIR). Nodata (0) og
 * urealistiske reflektanser filtreres fra. Returnerer null uden gyldige pixels.
 */
export function medianNdviFromBands(
  red: ArrayLike<number>,
  nir: ArrayLike<number>,
): number | null {
  const n = Math.min(red.length, nir.length);
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = red[i];
    const ir = nir[i];
    if (r <= 0 || ir <= 0 || r > 16000 || ir > 16000) continue; // nodata/outliers
    values.push((ir - r) / (ir + r));
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Math.round(median * 1000) / 1000;
}

// ─── COG-læsning ─────────────────────────────────────────────────────────────

/** Vælg et overview-billede med håndterbar bredde (~40-160 m/pixel). */
export function pickOverviewIndex(widths: number[], maxWidth = 1500): number {
  let best = widths.length - 1; // mindste overview som udgangspunkt
  for (let i = 0; i < widths.length; i++) {
    if (widths[i] <= maxWidth) {
      best = i;
      break; // widths er sorteret faldende (fuld opløsning først)
    }
  }
  return best;
}

/**
 * Beregn ægte NDVI for et punkt fra B04/B08 COG-URL'er.
 * Returnerer null hvis noget fejler (caller falder tilbage til estimat).
 */
export async function computeWindowNdvi(
  b04Url: string,
  b08Url: string,
  lat: number,
  lng: number,
  epsg: number | null,
  timeoutMs = 20000,
): Promise<number | null> {
  if (!epsg || epsg < 32601 || epsg > 32660) return null; // kun nordlig UTM
  const zone = epsg - 32600;
  const { easting, northing } = latLngToUtm(lat, lng, zone);

  const work = (async () => {
    const { fromUrl } = await import("geotiff");
    const [redTiff, nirTiff] = await Promise.all([fromUrl(b04Url), fromUrl(b08Url)]);

    async function readWindow(tiff: Awaited<ReturnType<typeof fromUrl>>): Promise<ArrayLike<number> | null> {
      const count = await tiff.getImageCount();
      const widths: number[] = [];
      const images = [];
      for (let i = 0; i < count; i++) {
        const img = await tiff.getImage(i);
        images.push(img);
        widths.push(img.getWidth());
      }
      const idx = pickOverviewIndex(widths);
      const image = images[idx];
      const bbox = image.getBoundingBox() as [number, number, number, number];
      const win = pixelWindow(bbox, image.getWidth(), image.getHeight(), easting, northing);
      if (!win) return null;
      const rasters = await image.readRasters({
        window: [win.x0, win.y0, win.x1, win.y1],
        samples: [0],
      });
      return rasters[0] as ArrayLike<number>;
    }

    const [red, nir] = await Promise.all([readWindow(redTiff), readWindow(nirTiff)]);
    if (!red || !nir) return null;
    return medianNdviFromBands(red, nir);
  })();

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
