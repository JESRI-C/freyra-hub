/**
 * Sentinel-2 NDVI Service
 * Bruger Element84 Earth Search STAC API — gratis, ingen nøgle krævet.
 * https://earth-search.aws.element84.com/v1
 *
 * Sentinel-2 L2A scener gemmes som Cloud Optimized GeoTIFF (COG) på AWS S3.
 * B04 = Rød (665nm), B08 = NIR (842nm)
 * NDVI = (NIR - Rød) / (NIR + Rød)  →  range -1 til 1 (vegetation > 0.2)
 */

const STAC_BASE = "https://earth-search.aws.element84.com/v1";
const COLLECTION = "sentinel-2-l2a";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SentinelScene {
  id: string;
  datetime: string;
  cloudCover: number;
  platform: string;
  tileName: string;
  b04Url: string | null; // Red band COG
  b08Url: string | null; // NIR band COG
  thumbnailUrl: string | null;
  bbox: [number, number, number, number];
  epsg: number | null; // UTM-zone for scenens COG'er (EPSG:326xx)
}

export interface NdviResult {
  ndvi: number;
  confidence: "high" | "medium" | "low";
  method: "sentinel2_computed" | "sentinel2_estimated" | "preview";
  sceneId: string;
  sceneDate: string;
  cloudCover: number;
  fetchedAt: string;
}

export interface SentinelQueryResult {
  scenes: SentinelScene[];
  bestScene: SentinelScene | null;
  ndvi: NdviResult | null;
  error?: string;
}

// ─── Scene discovery ──────────────────────────────────────────────────────────

/**
 * Finder de nyeste Sentinel-2 scener for et koordinat.
 * Returnerer scener sorteret efter dato (nyeste først), max 90 dage tilbage.
 */
export async function findScenes(
  lat: number,
  lng: number,
  options: { maxCloudCover?: number; limit?: number; daysBack?: number } = {},
): Promise<SentinelScene[]> {
  const { maxCloudCover = 30, limit = 5, daysBack = 90 } = options;

  const delta = 0.05; // ~5km boks
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta];
  const end = new Date();
  const start = new Date(Date.now() - daysBack * 86400_000);

  const body = {
    collections: [COLLECTION],
    bbox,
    datetime: `${start.toISOString()}/${end.toISOString()}`,
    query: { "eo:cloud_cover": { lte: maxCloudCover } },
    sortby: [{ field: "datetime", direction: "desc" }],
    limit,
    fields: {
      include: [
        "id",
        "properties.datetime",
        "properties.eo:cloud_cover",
        "properties.platform",
        "properties.s2:mgrs_tile",
        "properties.proj:epsg",
        "assets.B04",
        "assets.B08",
        "assets.red",
        "assets.nir",
        "assets.thumbnail",
        "assets.overview",
        "bbox",
      ],
    },
  };

  const res = await fetch(`${STAC_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Element84 STAC ${res.status}: ${res.statusText}`);

  const json = (await res.json()) as {
    features: Array<{
      id: string;
      bbox: [number, number, number, number];
      properties: {
        datetime: string;
        "eo:cloud_cover": number;
        platform: string;
        "s2:mgrs_tile"?: string;
        "proj:epsg"?: number;
      };
      assets: Record<string, { href: string; type?: string }>;
    }>;
  };

  return (json.features ?? []).map((f) => ({
    id: f.id,
    datetime: f.properties.datetime,
    cloudCover: f.properties["eo:cloud_cover"] ?? 0,
    platform: f.properties.platform ?? "sentinel-2",
    tileName: f.properties["s2:mgrs_tile"] ?? "–",
    b04Url: f.assets?.["B04"]?.href ?? f.assets?.["red"]?.href ?? null,
    b08Url: f.assets?.["B08"]?.href ?? f.assets?.["nir"]?.href ?? null,
    thumbnailUrl:
      f.assets?.["thumbnail"]?.href ??
      f.assets?.["overview"]?.href ??
      null,
    bbox: f.bbox,
    epsg: f.properties["proj:epsg"] ?? null,
  }));
}

// ─── NDVI beregning ───────────────────────────────────────────────────────────

/**
 * Beregner NDVI fra Sentinel-2 bånd.
 *
 * Primær vej: ÆGTE båndmatematik — geotiff.js læser et pixel-vindue omkring
 * projektets centroid fra B04/B08 COG'erne (HTTP range requests mod et
 * overview-niveau) og beregner median-NDVI af reflektansværdierne.
 *
 * Hvis bånd-læsning fejler (netværk/CORS/timeout), falder vi tilbage til
 * thumbnail-analyse og til sidst metadata-estimat — tydeligt markeret med
 * method: "sentinel2_estimated" og lavere confidence.
 */
export async function computeNdvi(
  scene: SentinelScene,
  point?: { lat: number; lng: number },
): Promise<NdviResult> {
  const base: Omit<NdviResult, "ndvi" | "confidence" | "method"> = {
    sceneId: scene.id,
    sceneDate: scene.datetime,
    cloudCover: scene.cloudCover,
    fetchedAt: new Date().toISOString(),
  };

  // Forsøg 1: Ægte bånddata fra S3 COG (median-NDVI omkring punktet)
  if (scene.b04Url && scene.b08Url) {
    try {
      const { computeWindowNdvi } = await import("./ndvi-band-math");
      const lat = point?.lat ?? (scene.bbox[1] + scene.bbox[3]) / 2;
      const lng = point?.lng ?? (scene.bbox[0] + scene.bbox[2]) / 2;
      const ndvi = await computeWindowNdvi(scene.b04Url, scene.b08Url, lat, lng, scene.epsg);
      if (ndvi !== null) {
        return { ...base, ndvi, confidence: "high", method: "sentinel2_computed" };
      }
    } catch {
      // netværk/CORS/timeout — prøv estimat
    }
  }

  // Forsøg 2: Estimat baseret på thumbnail farveanalyse
  if (scene.thumbnailUrl) {
    try {
      const ndvi = await estimateNdviFromThumbnail(scene.thumbnailUrl);
      if (ndvi !== null) {
        return { ...base, ndvi, confidence: "medium", method: "sentinel2_estimated" };
      }
    } catch {
      // thumbnail ikke tilgængeligt
    }
  }

  // Fallback: Statistisk estimat fra skydækning og årstid
  const ndvi = estimateNdviFromMetadata(scene);
  return { ...base, ndvi, confidence: "low", method: "sentinel2_estimated" };
}

/**
 * Simpel thumbnail-analyse: grøn kanal stærk → høj NDVI.
 * Bruges som fallback når direkte bånddata ikke er tilgængeligt.
 */
async function estimateNdviFromThumbnail(thumbnailUrl: string): Promise<number | null> {
  // Kun muligt i browser-kontekst med canvas
  if (typeof document === "undefined") return null;

  const img = await loadImage(thumbnailUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let totalR = 0, totalG = 0, totalB = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
    count++;
  }

  if (count === 0) return null;

  const r = totalR / count / 255;
  const g = totalG / count / 255;
  const b = totalB / count / 255;

  // Simpel vegetationsestimering fra RGB (ikke præcist men realistisk)
  // Grøn vegetation: g > r og g > b
  const vegetationRatio = g > 0 ? (g - Math.max(r, b)) / g : 0;
  return Math.max(0, Math.min(0.8, vegetationRatio * 1.5));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Statistisk NDVI-estimat baseret på breddegrad og årstid.
 * Dansk vegetation: NDVI ~0.3-0.7 afhængigt af sæson.
 */
function estimateNdviFromMetadata(scene: SentinelScene): number {
  const month = new Date(scene.datetime).getMonth(); // 0-11
  // Dansk vegetationskurve: lav om vinteren, høj om sommeren
  const seasonalFactor = Math.max(0, Math.sin(((month - 2) / 12) * Math.PI * 2));
  const baseNdvi = 0.25 + seasonalFactor * 0.45;
  // Skydækning reducerer pålidelighed men påvirker ikke NDVI direkte
  return Math.round(baseNdvi * 100) / 100;
}

// ─── Fuld pipeline: find + beregn + gem ───────────────────────────────────────

/**
 * Komplet Sentinel-2 NDVI pipeline for et projekt.
 * 1. Find nyeste klare scene (< 30% skydækning)
 * 2. Beregn NDVI
 * 3. Returnér struktureret resultat klar til at gemme i calculated_metrics
 */
export async function runNdviPipeline(
  lat: number,
  lng: number,
  options?: { maxCloudCover?: number; daysBack?: number },
): Promise<SentinelQueryResult> {
  try {
    const scenes = await findScenes(lat, lng, { maxCloudCover: 30, limit: 10, ...options });

    if (scenes.length === 0) {
      // Prøv igen med højere skydækning-tolerance
      const fallbackScenes = await findScenes(lat, lng, { maxCloudCover: 80, limit: 5, daysBack: 180 });
      if (fallbackScenes.length === 0) {
        return { scenes: [], bestScene: null, ndvi: null, error: "Ingen scener fundet inden for 180 dage" };
      }
      const best = fallbackScenes[0];
      const ndvi = await computeNdvi(best, { lat, lng });
      return { scenes: fallbackScenes, bestScene: best, ndvi };
    }

    const best = scenes[0];
    const ndvi = await computeNdvi(best, { lat, lng });
    return { scenes, bestScene: best, ndvi };
  } catch (err) {
    return {
      scenes: [],
      bestScene: null,
      ndvi: null,
      error: err instanceof Error ? err.message : "Ukendt fejl",
    };
  }
}
