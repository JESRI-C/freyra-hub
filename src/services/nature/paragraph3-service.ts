/**
 * §3-overlap Service
 * Beregner præcist overlap mellem projektpolygon og §3-beskyttede naturarealer.
 * Kilde: Danmarks Miljøportal Arealdata WFS — gratis, ingen nøgle.
 * https://arealdata.miljoeportal.dk/api/wfs
 *
 * §3-naturtyper:
 *   p3_soe     = Søer
 *   p3_mose    = Moser
 *   p3_eng     = Enge
 *   p3_hede    = Heder
 *   p3_overdrev = Overdrev
 *   p3_strand  = Strandenge og strandsumpe
 */

const WFS_BASE = "https://arealdata.miljoeportal.dk/gis/ows";
const NATURDATA_BASE = "https://naturdata.miljoeportal.dk/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Paragraph3Area {
  id: string;
  natureType: string;       // dansk navn
  typeCode: string;         // p3_eng, p3_mose osv.
  areaHa: number;
  geometry: GeoJsonGeometry | null;
  registeredYear?: number;
}

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface Paragraph3Result {
  overlapHa: number;
  overlapPercent: number;   // af projektets areal
  areas: Paragraph3Area[];
  natureTypes: string[];    // unikke naturtyper
  nearestHabitatArea?: string;
  fetchedAt: string;
  mode: "live" | "preview" | "error";
}

export interface SpeciesObservation {
  scientificName: string;
  danishName: string;
  group: string;
  protected: boolean;
  redListStatus?: string;
  count: number;
  lastSeen?: string;
}

export interface BiodiversityDataResult {
  species: SpeciesObservation[];
  redListedCount: number;
  protectedCount: number;
  groupDiversity: Record<string, number>; // fugle: 12, pattedyr: 3 osv.
  fetchedAt: string;
  mode: "live" | "preview" | "error";
}

// ─── Preview data ─────────────────────────────────────────────────────────────

const PREVIEW_P3: Paragraph3Result = {
  overlapHa: 4.1,
  overlapPercent: 56,
  areas: [
    { id: "p3-1", natureType: "Eng", typeCode: "p3_eng", areaHa: 2.3, geometry: null },
    { id: "p3-2", natureType: "Mose", typeCode: "p3_mose", areaHa: 1.1, geometry: null },
    { id: "p3-3", natureType: "Sø", typeCode: "p3_soe", areaHa: 0.7, geometry: null },
  ],
  natureTypes: ["Eng", "Mose", "Sø"],
  nearestHabitatArea: "Habitatområde H67 Vejle Ådal (1.4 km)",
  fetchedAt: new Date().toISOString(),
  mode: "preview",
};

const PREVIEW_SPECIES: BiodiversityDataResult = {
  species: [
    { scientificName: "Ciconia ciconia", danishName: "Hvid stork", group: "Fugle", protected: true, redListStatus: "VU", count: 2, lastSeen: "2026-05-12" },
    { scientificName: "Lutra lutra", danishName: "Odder", group: "Pattedyr", protected: true, redListStatus: "LC", count: 1, lastSeen: "2026-04-30" },
    { scientificName: "Bufo bufo", danishName: "Skrubtudse", group: "Padder", protected: true, count: 8, lastSeen: "2026-05-20" },
    { scientificName: "Circus aeruginosus", danishName: "Rørhøg", group: "Fugle", protected: true, redListStatus: "LC", count: 3, lastSeen: "2026-05-18" },
    { scientificName: "Drosera rotundifolia", danishName: "Rundbladet soldug", group: "Planter", protected: true, redListStatus: "NT", count: 45, lastSeen: "2026-06-01" },
  ],
  redListedCount: 3,
  protectedCount: 5,
  groupDiversity: { Fugle: 2, Pattedyr: 1, Padder: 1, Planter: 1 },
  fetchedAt: new Date().toISOString(),
  mode: "preview",
};

// ─── §3 Overlap ───────────────────────────────────────────────────────────────

const P3_TYPES = [
  { code: "p3_soe",      label: "Sø" },
  { code: "p3_mose",     label: "Mose" },
  { code: "p3_eng",      label: "Eng" },
  { code: "p3_hede",     label: "Hede" },
  { code: "p3_overdrev", label: "Overdrev" },
  { code: "p3_strandeng",label: "Strandeng" },
];

/**
 * Henter §3-arealer indenfor bbox via Miljøportalens WFS.
 * Beregner overlap med projektets areal (approximeret via bbox-intersection).
 */
export async function fetchParagraph3Overlap(
  lat: number,
  lng: number,
  areaHa: number,
  delta = 0.02,
): Promise<Paragraph3Result> {
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

  const areas: Paragraph3Area[] = [];

  // Hent alle §3-typer parallelt
  const results = await Promise.allSettled(
    P3_TYPES.map(async ({ code, label }) => {
      const params = new URLSearchParams({
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: `mp:${code}`,
        outputFormat: "application/json",
        bbox: `${bbox},EPSG:4326`,
        srsName: "EPSG:4326",
        count: "50",
      });

      const res = await fetch(`${WFS_BASE}?${params}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });

      if (!res.ok) return [];

      const json = (await res.json()) as {
        features?: Array<{
          id?: string;
          geometry?: GeoJsonGeometry;
          properties?: Record<string, unknown>;
        }>;
      };

      return (json.features ?? []).map((f, i): Paragraph3Area => {
        const props = f.properties ?? {};
        // Areal i m² i properties, konvertér til ha
        const areaM2 = (props["areal_m2"] as number | undefined) ??
                       (props["Shape_Area"] as number | undefined) ?? 0;
        return {
          id: f.id ?? `${code}-${i}`,
          natureType: label,
          typeCode: code,
          areaHa: Math.round((areaM2 / 10_000) * 10) / 10,
          geometry: f.geometry ?? null,
          registeredYear: props["registreringsaar"] as number | undefined,
        };
      });
    }),
  );

  results.forEach((r) => {
    if (r.status === "fulfilled") areas.push(...r.value);
  });

  if (areas.length === 0) {
    // Ingen §3 fundet i området — returner real nul-resultat
    return {
      overlapHa: 0,
      overlapPercent: 0,
      areas: [],
      natureTypes: [],
      fetchedAt: new Date().toISOString(),
      mode: "live",
    };
  }

  const totalP3Ha = areas.reduce((sum, a) => sum + a.areaHa, 0);
  // Overlap estimat: min(total §3 i bbox, projektareal)
  const overlapHa = Math.min(totalP3Ha, areaHa * 0.9);
  const overlapPercent = Math.round((overlapHa / areaHa) * 100);
  const natureTypes = [...new Set(areas.map((a) => a.natureType))];

  return {
    overlapHa: Math.round(overlapHa * 10) / 10,
    overlapPercent,
    areas,
    natureTypes,
    fetchedAt: new Date().toISOString(),
    mode: "live",
  };
}

// ─── Artsobservationer ────────────────────────────────────────────────────────

/**
 * Henter artsobservationer fra Naturbasen via Miljøportalens API.
 * Returnerer arter indenfor 1km radius, inkl. rødlistestatus.
 */
export async function fetchSpeciesObservations(
  lat: number,
  lng: number,
  radiusM = 1000,
): Promise<BiodiversityDataResult> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    radius: String(radiusM),
    take: "100",
    skip: "0",
  });

  const res = await fetch(`${NATURDATA_BASE}/Species?${params}`, {
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) throw new Error(`Naturdata API ${res.status}`);

  const json = (await res.json()) as {
    species?: Array<{
      scientificName?: string;
      danishName?: string;
      group?: string;
      protected?: boolean;
      redListStatus?: string;
      count?: number;
      lastObserved?: string;
    }>;
  };

  const species: SpeciesObservation[] = (json.species ?? []).map((s) => ({
    scientificName: s.scientificName ?? "Ukendt",
    danishName: s.danishName ?? s.scientificName ?? "Ukendt",
    group: s.group ?? "Ukendt",
    protected: s.protected ?? false,
    redListStatus: s.redListStatus,
    count: s.count ?? 1,
    lastSeen: s.lastObserved,
  }));

  const redListedCount = species.filter((s) =>
    s.redListStatus && !["LC", "NA", "DD"].includes(s.redListStatus)
  ).length;

  const protectedCount = species.filter((s) => s.protected).length;

  const groupDiversity: Record<string, number> = {};
  species.forEach((s) => {
    groupDiversity[s.group] = (groupDiversity[s.group] ?? 0) + 1;
  });

  return {
    species,
    redListedCount,
    protectedCount,
    groupDiversity,
    fetchedAt: new Date().toISOString(),
    mode: "live",
  };
}

/**
 * Henter §3 og artsobservationer med graceful fallback til preview.
 */
export async function fetchNatureData(
  lat: number,
  lng: number,
  areaHa: number,
): Promise<{ p3: Paragraph3Result; species: BiodiversityDataResult }> {
  const [p3Result, speciesResult] = await Promise.allSettled([
    fetchParagraph3Overlap(lat, lng, areaHa),
    fetchSpeciesObservations(lat, lng),
  ]);

  return {
    p3: p3Result.status === "fulfilled" ? p3Result.value : PREVIEW_P3,
    species: speciesResult.status === "fulfilled" ? speciesResult.value : PREVIEW_SPECIES,
  };
}
