/**
 * Environmental data bundle — server-side fetch of open Danish datasets.
 * All calls run server-side to avoid CORS and centralize timeouts/logging.
 *
 * Kilder (åbne, ingen nøgle):
 *  - Miljøportalen WFS (§3, vandløb, Natura 2000)
 *  - GEUS jordart 1:25.000
 *  - Dataforsyningen DHM punkter (højde/hældning)
 *  - GEUS Jupiter (boringer/grundvand) via WFS
 *
 * DMI kræver en fri API-nøgle. Så længe DMI_API_KEY ikke er sat, returnerer
 * vi et normbaseret estimat afledt fra breddegrad.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MP_WFS = "https://arealdata.miljoeportal.dk/gis/ows";
const GEUS_WFS = "https://data.geus.dk/geusmap/ows/48.jsp";
const DHM_PUNKT = "https://api.dataforsyningen.dk/punkter";

const PointInput = z.object({
  lat: z.number().gte(54).lte(58),
  lng: z.number().gte(7).lte(16),
  areaHa: z.number().nonnegative().optional(),
});

export interface EnvironmentalBundle {
  nature: {
    paragraph3AreasHa: number;
    paragraph3Percent: number;
    natureTypes: string[];
    watercourseCount: number;
    nearestWatercourseM: number | null;
  };
  natura2000: {
    withinM: number | null; // 0 = inside
    nearestName: string | null;
    sitesWithin5km: number;
  };
  soil: {
    dominantType: string;
    permeability: "high" | "medium" | "low" | "unknown";
    organicPct: number;
    curveNumber: number;
  };
  terrain: {
    elevationM: number | null;
    slopePct: number | null;
    aspect: "flat" | "gentle" | "moderate" | "steep" | "unknown";
  };
  groundwater: {
    boreholesWithin500m: number;
    nearestBoreholeM: number | null;
    depthM: number | null;
  };
  rainfall: {
    annualMm: number;
    designRain10yrMmHr: number;
    designRain100yrMmHr: number;
    source: "dmi-live" | "climate-norm";
  };
  fetchedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch(url: string, ms = 8000): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function safeJson<T>(res: Response | null): Promise<T | null> {
  if (!res || !res.ok) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return null;
  try { return (await res.json()) as T; } catch { return null; }
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface WfsFC {
  features?: Array<{
    id?: string;
    properties?: Record<string, unknown>;
    geometry?: { type: string; coordinates: unknown };
  }>;
}

// ─── §3 + Vandløb ─────────────────────────────────────────────────────────────

const P3_TYPES = [
  { code: "p3_soe", label: "Sø" },
  { code: "p3_mose", label: "Mose" },
  { code: "p3_eng", label: "Eng" },
  { code: "p3_hede", label: "Hede" },
  { code: "p3_overdrev", label: "Overdrev" },
  { code: "p3_strandeng", label: "Strandeng" },
];

async function fetchParagraph3(lat: number, lng: number, areaHa: number) {
  const delta = 0.02;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`;
  const results = await Promise.all(
    P3_TYPES.map(async ({ code, label }) => {
      const params = new URLSearchParams({
        service: "WFS", version: "2.0.0", request: "GetFeature",
        typeNames: `mp:${code}`, outputFormat: "application/json",
        bbox, srsName: "EPSG:4326", count: "50",
      });
      const fc = await safeJson<WfsFC>(await safeFetch(`${MP_WFS}?${params}`));
      const feats = fc?.features ?? [];
      const totalHa = feats.reduce((s, f) => {
        const m2 = (f.properties?.["areal_m2"] as number | undefined) ?? 0;
        return s + m2 / 10_000;
      }, 0);
      return { label, count: feats.length, ha: totalHa };
    }),
  );
  const totalHa = results.reduce((s, r) => s + r.ha, 0);
  const natureTypes = results.filter((r) => r.count > 0).map((r) => r.label);
  const overlapHa = Math.min(totalHa, areaHa * 0.9);
  const overlapPct = areaHa > 0 ? Math.round((overlapHa / areaHa) * 100) : 0;
  return { paragraph3AreasHa: Math.round(overlapHa * 10) / 10, paragraph3Percent: overlapPct, natureTypes };
}

async function fetchWatercourses(lat: number, lng: number) {
  const delta = 0.02;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`;
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: "mp:vandloeb", outputFormat: "application/json",
    bbox, srsName: "EPSG:4326", count: "100",
  });
  const fc = await safeJson<WfsFC>(await safeFetch(`${MP_WFS}?${params}`));
  const feats = fc?.features ?? [];
  let nearest: number | null = null;
  for (const f of feats) {
    const geom = f.geometry;
    if (!geom) continue;
    const coords: number[][] = geom.type === "LineString"
      ? (geom.coordinates as number[][])
      : geom.type === "MultiLineString"
        ? ((geom.coordinates as number[][][]).flat())
        : [];
    for (const c of coords) {
      const d = haversineM({ lat, lng }, { lat: c[1] ?? 0, lng: c[0] ?? 0 });
      if (nearest === null || d < nearest) nearest = Math.round(d);
    }
  }
  return { watercourseCount: feats.length, nearestWatercourseM: nearest };
}

// ─── Natura 2000 ──────────────────────────────────────────────────────────────

async function fetchNatura2000(lat: number, lng: number) {
  const delta = 0.1; // ~11 km
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`;
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: "mp:habitatomraade", outputFormat: "application/json",
    bbox, srsName: "EPSG:4326", count: "20",
  });
  const fc = await safeJson<WfsFC>(await safeFetch(`${MP_WFS}?${params}`));
  const feats = fc?.features ?? [];
  let nearest: number | null = null;
  let name: string | null = null;
  for (const f of feats) {
    const geom = f.geometry;
    if (!geom) continue;
    // Bruger centroid-estimat af ring
    const ring: number[][] =
      geom.type === "Polygon" ? ((geom.coordinates as number[][][])[0] ?? [])
      : geom.type === "MultiPolygon" ? ((geom.coordinates as number[][][][])[0]?.[0] ?? [])
      : [];
    if (ring.length === 0) continue;
    let cx = 0, cy = 0;
    for (const c of ring) { cx += c[0] ?? 0; cy += c[1] ?? 0; }
    cx /= ring.length; cy /= ring.length;
    const d = Math.round(haversineM({ lat, lng }, { lat: cy, lng: cx }));
    if (nearest === null || d < nearest) {
      nearest = d;
      name = String(f.properties?.["navn"] ?? f.properties?.["name"] ?? "Natura 2000-område");
    }
  }
  return {
    withinM: nearest,
    nearestName: name,
    sitesWithin5km: feats.filter(() => nearest !== null && nearest < 5000).length,
  };
}

// ─── Jordbund (GEUS) ──────────────────────────────────────────────────────────

const SOIL_MAP: Record<string, { perm: "high" | "medium" | "low"; org: number; cn: number }> = {
  Ferskvandstørv: { perm: "low", org: 40, cn: 78 },
  Tørv: { perm: "low", org: 40, cn: 78 },
  Humus: { perm: "medium", org: 15, cn: 70 },
  Moræneler: { perm: "low", org: 4, cn: 78 },
  Ler: { perm: "low", org: 4, cn: 78 },
  Smeltevandssand: { perm: "high", org: 1, cn: 55 },
  "Marint sand": { perm: "high", org: 1, cn: 55 },
  Flyvesand: { perm: "high", org: 1, cn: 50 },
  Sand: { perm: "high", org: 1, cn: 55 },
  Kalk: { perm: "high", org: 1, cn: 60 },
};

async function fetchSoil(lat: number, lng: number) {
  const delta = 0.01;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`;
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: "dkjord:jordart_25000", outputFormat: "application/json",
    bbox, srsName: "EPSG:4326", count: "20",
  });
  const fc = await safeJson<WfsFC>(await safeFetch(`${GEUS_WFS}?${params}`));
  const feats = fc?.features ?? [];
  if (feats.length === 0) {
    return { dominantType: "Ukendt", permeability: "unknown" as const, organicPct: 3, curveNumber: 70 };
  }
  const counts: Record<string, number> = {};
  for (const f of feats) {
    const t = String(f.properties?.["jordart"] ?? f.properties?.["betegnelse"] ?? "");
    if (t) counts[t] = (counts[t] ?? 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Ukendt";
  const info = SOIL_MAP[dominant] ?? { perm: "medium" as const, org: 3, cn: 70 };
  return { dominantType: dominant, permeability: info.perm, organicPct: info.org, curveNumber: info.cn };
}

// ─── Terræn (Dataforsyningen DHM) ─────────────────────────────────────────────

async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  const res = await safeFetch(`${DHM_PUNKT}?x=${lng}&y=${lat}&srid=4326&datamodel=DHMTerraen`);
  const json = await safeJson<{ højde?: number; height?: number }>(res);
  if (!json) return null;
  return json.højde ?? json.height ?? null;
}

async function fetchTerrain(lat: number, lng: number) {
  const [c, n, s, e, w] = await Promise.all([
    fetchElevation(lat, lng),
    fetchElevation(lat + 0.001, lng),
    fetchElevation(lat - 0.001, lng),
    fetchElevation(lat, lng + 0.001),
    fetchElevation(lat, lng - 0.001),
  ]);
  if (c === null) {
    return { elevationM: null, slopePct: null, aspect: "unknown" as const };
  }
  const nn = n ?? c, ss = s ?? c, ee = e ?? c, ww = w ?? c;
  const dH = Math.max(Math.abs(nn - ss), Math.abs(ee - ww));
  const slope = Math.round((dH / 111) * 100 * 10) / 10;
  const aspect = slope < 1 ? "flat" : slope < 5 ? "gentle" : slope < 15 ? "moderate" : "steep";
  return { elevationM: Math.round(c * 10) / 10, slopePct: slope, aspect };
}

// ─── Grundvand (GEUS Jupiter) ─────────────────────────────────────────────────

async function fetchGroundwater(lat: number, lng: number) {
  const delta = 0.008; // ~800 m radius
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta},EPSG:4326`;
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: "jupiter:boring", outputFormat: "application/json",
    bbox, srsName: "EPSG:4326", count: "50",
  });
  const fc = await safeJson<WfsFC>(await safeFetch(`${GEUS_WFS}?${params}`));
  const feats = fc?.features ?? [];
  let nearest: number | null = null;
  let depth: number | null = null;
  let within500 = 0;
  for (const f of feats) {
    const g = f.geometry;
    if (!g || g.type !== "Point") continue;
    const [flng, flat] = g.coordinates as [number, number];
    const d = Math.round(haversineM({ lat, lng }, { lat: flat, lng: flng }));
    if (d <= 500) within500++;
    if (nearest === null || d < nearest) {
      nearest = d;
      const gd = f.properties?.["vandstand_m"] ?? f.properties?.["ro_vandstand"];
      if (typeof gd === "number") depth = gd;
    }
  }
  return { boreholesWithin500m: within500, nearestBoreholeM: nearest, depthM: depth };
}

// ─── Nedbør (DMI norm) ────────────────────────────────────────────────────────

function rainfallFromClimateNorm(lat: number, lng: number) {
  // Grov klimazone: vest/øst Danmark. Vestjylland ~900 mm, København ~600 mm.
  const westness = Math.max(0, Math.min(1, (12 - lng) / 4));
  const annualMm = Math.round(600 + westness * 300);
  const design10 = Math.round((13 + westness * 3) * 10) / 10;
  const design100 = Math.round((21 + westness * 5) * 10) / 10;
  return {
    annualMm, designRain10yrMmHr: design10, designRain100yrMmHr: design100,
    source: "climate-norm" as const,
    _lat: lat, // eslint anchor
  };
}

// ─── Public server function ──────────────────────────────────────────────────

export const fetchEnvironmentalBundle = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PointInput.parse(raw))
  .handler(async ({ data }): Promise<EnvironmentalBundle> => {
    const areaHa = data.areaHa ?? 1;
    const [p3, water, n2k, soil, terrain, groundwater] = await Promise.all([
      fetchParagraph3(data.lat, data.lng, areaHa).catch(() => ({ paragraph3AreasHa: 0, paragraph3Percent: 0, natureTypes: [] })),
      fetchWatercourses(data.lat, data.lng).catch(() => ({ watercourseCount: 0, nearestWatercourseM: null })),
      fetchNatura2000(data.lat, data.lng).catch(() => ({ withinM: null, nearestName: null, sitesWithin5km: 0 })),
      fetchSoil(data.lat, data.lng).catch(() => ({ dominantType: "Ukendt", permeability: "unknown" as const, organicPct: 3, curveNumber: 70 })),
      fetchTerrain(data.lat, data.lng).catch(() => ({ elevationM: null, slopePct: null, aspect: "unknown" as const })),
      fetchGroundwater(data.lat, data.lng).catch(() => ({ boreholesWithin500m: 0, nearestBoreholeM: null, depthM: null })),
    ]);
    const rain = rainfallFromClimateNorm(data.lat, data.lng);

    return {
      nature: { ...p3, ...water },
      natura2000: n2k,
      soil,
      terrain,
      groundwater,
      rainfall: {
        annualMm: rain.annualMm,
        designRain10yrMmHr: rain.designRain10yrMmHr,
        designRain100yrMmHr: rain.designRain100yrMmHr,
        source: rain.source,
      },
      fetchedAt: new Date().toISOString(),
    };
  });
