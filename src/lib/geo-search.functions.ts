/**
 * Geo-search server functions.
 * All calls run server-side so we (a) avoid browser CORS surprises against
 * public Danish geodata endpoints and (b) can add credential-based sources
 * (Datafordeler matrikel) without leaking secrets into the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AUTOCOMPLETE_URL = "https://api.dataforsyningen.dk/autocomplete";

// Landbrugsstyrelsens markblok-WFS (åbne data). Hvis endpoint navnene
// ændrer sig kan de justeres her uden UI-ændringer.
const LBST_WFS = "https://kort.lbst.dk/service";

// Datafordeleren matrikel-WFS. Kræver service-bruger.
const DAF_MATRIKEL_WFS =
  "https://services.datafordeler.dk/MATRIKEL/MatrikelGaeldendeOgForeloebigWFS/1.0.0/WFS";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SearchInput = z.object({ q: z.string().trim().min(1).max(120) });
const ResolveInput = z.object({ href: z.string().url() });
const PointInput = z.object({
  lat: z.number().gte(54).lte(58),
  lng: z.number().gte(7).lte(16),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlaceSuggestion {
  tekst: string;
  type: string;
  href?: string;
  lat?: number;
  lng?: number;
}

export interface PickedFeature {
  source: "markblok" | "matrikel";
  label: string;
  properties: Record<string, string | number | null>;
  geometry: { type: "Polygon"; coordinates: number[][][] };
  areaHa: number;
  attribution: string;
  disclaimer: string;
}

interface WfsFeatureCollection {
  features?: Array<{
    id?: string;
    properties?: Record<string, unknown>;
    geometry?: { type: string; coordinates: unknown };
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON, men returner null hvis serveren svarer med HTML e.l. */
async function safeJson<T>(res: Response): Promise<T | null> {
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!ct.includes("json")) {
    // Endpoint svarede med HTML/tekst — typisk fordi WFS-URL'en er flyttet
    // eller kræver andre parametre. Log serverside og lad kaldet fejle blødt.
    console.warn(`[geo-search] Ikke-JSON respons (${ct || "ukendt"}):`, text.slice(0, 200));
    return null;
  }
  try { return JSON.parse(text) as T; } catch { return null; }
}

function ringAreaHa(coords: number[][]): number {
  if (coords.length < 4) return 0;
  // Shoelace with equirectangular scaling at first vertex latitude.
  const lat0 = coords[0]?.[1] ?? 55;
  const mPerLat = 111_320;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  let a = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i] as [number, number];
    const [x2, y2] = coords[i + 1] as [number, number];
    a += x1 * mPerLng * (y2 * mPerLat) - x2 * mPerLng * (y1 * mPerLat);
  }
  return Math.abs(a) / 2 / 10_000;
}

function polygonFromWfsGeometry(
  geom: { type: string; coordinates: unknown } | undefined,
): { type: "Polygon"; coordinates: number[][][] } | null {
  if (!geom) return null;
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates as number[][][] };
  }
  if (geom.type === "MultiPolygon") {
    // Return the largest ring as a single Polygon for now — MultiPolygon
    // storage requires a schema change (project_boundaries table).
    const polys = geom.coordinates as number[][][][];
    let best: number[][][] | null = null;
    let bestArea = 0;
    for (const p of polys) {
      const ring = p[0];
      if (!ring) continue;
      const a = ringAreaHa(ring);
      if (a > bestArea) {
        bestArea = a;
        best = p;
      }
    }
    return best ? { type: "Polygon", coordinates: best } : null;
  }
  return null;
}

// ─── Public endpoints ────────────────────────────────────────────────────────

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SearchInput.parse(raw))
  .handler(async ({ data }): Promise<PlaceSuggestion[]> => {
    const url = `${AUTOCOMPLETE_URL}?q=${encodeURIComponent(data.q)}&per_side=8&fuzzy=`;
    const res = await safeFetch(url);
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      tekst: string;
      type: string;
      data?: {
        href?: string;
        x?: number;
        y?: number;
      };
    }>;
    return items.map((it) => ({
      tekst: it.tekst,
      type: it.type,
      href: it.data?.href,
      lat: it.data?.y,
      lng: it.data?.x,
    }));
  });

export const resolvePlace = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ResolveInput.parse(raw))
  .handler(async ({ data }): Promise<{ lat: number; lng: number } | null> => {
    const res = await safeFetch(data.href);
    if (!res.ok) return null;
    const detail = (await res.json()) as {
      adgangspunkt?: { koordinater?: [number, number] };
      visueltcenter?: [number, number];
    };
    const coords = detail.adgangspunkt?.koordinater ?? detail.visueltcenter;
    if (!coords) return null;
    return { lng: coords[0], lat: coords[1] };
  });

export const pickMarkblok = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PointInput.parse(raw))
  .handler(async ({ data }): Promise<PickedFeature | null> => {
    const params = new URLSearchParams({
      SERVICENAME: "marker_wfs_v3",
      SERVICE: "WFS",
      VERSION: "2.0.0",
      REQUEST: "GetFeature",
      TYPENAMES: "Markblokke",
      SRSNAME: "EPSG:4326",
      COUNT: "1",
      OUTPUTFORMAT: "application/json",
      CQL_FILTER: `INTERSECTS(geom, POINT(${data.lng} ${data.lat}))`,
    });
    const res = await safeFetch(`${LBST_WFS}?${params}`);
    if (!res.ok) return null;
    const fc = await safeJson<WfsFeatureCollection>(res);
    const f = fc?.features?.[0];
    const poly = polygonFromWfsGeometry(f?.geometry);
    if (!f || !poly) return null;
    const props = f.properties ?? {};
    const label = String(
      (props["MARKBLOKNR"] ?? props["Marknr"] ?? props["MB_NR"] ?? f.id ?? "Markblok"),
    );
    return {
      source: "markblok",
      label: `Markblok ${label}`,
      properties: normalizeProps(props),
      geometry: poly,
      areaHa: Math.round(ringAreaHa(poly.coordinates[0] ?? []) * 100) / 100,
      attribution: "© Landbrugsstyrelsen / Styrelsen for Grøn Arealomlægning og Vandmiljø",
      disclaimer:
        "Markblokke er en offentlig arealreference og ikke en juridisk ejendomsgrænse.",
    };
  });

export const pickMatrikel = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => PointInput.parse(raw))
  .handler(async ({ data }): Promise<PickedFeature | null> => {
    const user = process.env.DATAFORDELER_USER;
    const pass = process.env.DATAFORDELER_PASS;
    if (!user || !pass) {
      throw new Error(
        "Matrikel-opslag kræver DATAFORDELER_USER og DATAFORDELER_PASS på serveren.",
      );
    }
    const params = new URLSearchParams({
      username: user,
      password: pass,
      SERVICE: "WFS",
      VERSION: "2.0.0",
      REQUEST: "GetFeature",
      TYPENAMES: "mat:Jordstykke_Gaeldende",
      SRSNAME: "EPSG:4326",
      COUNT: "1",
      OUTPUTFORMAT: "application/json",
      CQL_FILTER: `INTERSECTS(geometri, POINT(${data.lng} ${data.lat}))`,
    });
    const res = await safeFetch(`${DAF_MATRIKEL_WFS}?${params}`);
    if (!res.ok) return null;
    const fc = await safeJson<WfsFeatureCollection>(res);
    const f = fc?.features?.[0];
    const poly = polygonFromWfsGeometry(f?.geometry);
    if (!f || !poly) return null;
    const props = f.properties ?? {};
    const mnr = String(props["matrikelnummer"] ?? "?");
    const ejerlav = String(props["ejerlavsnavn"] ?? props["ejerlavskode"] ?? "?");
    return {
      source: "matrikel",
      label: `Matr.nr. ${mnr}, ${ejerlav}`,
      properties: normalizeProps(props),
      geometry: poly,
      areaHa: Math.round(ringAreaHa(poly.coordinates[0] ?? []) * 100) / 100,
      attribution: "© Geodatastyrelsen / Datafordeleren",
      disclaimer:
        "Matrikeldata vises som digital reference. Endelig præcis grænse kræver landinspektørfaglig vurdering.",
    };
  });

function normalizeProps(
  props: Record<string, unknown>,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) out[k] = null;
    else if (typeof v === "number") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}
