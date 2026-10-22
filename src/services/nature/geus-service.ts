/**
 * GEUS Jorddata Service
 * Henter jordbundstype og geologiske data fra GEUS (Danmarks Geologiske Undersøgelse).
 * API: https://data.geus.dk/geusmap/ows/48.jsp (WFS, gratis, ingen nøgle)
 *
 * Jordbundstyper relevante for CO₂ og vandkvalitet:
 *   - Organisk jord (tørv/mose): høj CO₂-lagring, høj filterkapacitet
 *   - Lerjord: moderat CO₂, lav infiltration → vandkvalitetsrisiko
 *   - Sandjord: lav CO₂, høj infiltration men lav filtration
 *   - Humusjord: høj CO₂-potentiale
 */

const GEUS_WFS = "https://data.geus.dk/geusmap/ows/48.jsp";
const DATAFORSYNINGEN_API = "https://api.dataforsyningen.dk";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SoilClass =
  | "organic"      // Tørv, mose — høj C-lagring
  | "clay"         // Lerjord — moderat
  | "sandy_clay"   // Leret sandjord
  | "sand"         // Sandjord — lav C-lagring
  | "humus"        // Humusjord
  | "chalk"        // Kalk
  | "unknown";

export interface SoilProfile {
  dominantClass: SoilClass;
  organicContent: number;    // % organisk indhold (estimat)
  drainageClass: "well" | "moderate" | "poor" | "very_poor";
  infiltrationRate: "high" | "medium" | "low";
  carbonDensity: number;     // t C/ha (overjordisk + rodzone estimat)
  soilLabel: string;
  fetchedAt: string;
  mode: "live" | "preview";
}

export interface TerrainProfile {
  elevationM: number;
  slopePercent: number;      // gennemsnitlig hældning i projektområdet
  aspect: "flat" | "gentle" | "moderate" | "steep";
  fetchedAt: string;
  mode: "live" | "preview";
}

// ─── Soil class mapping ───────────────────────────────────────────────────────

// GEUS jordbundsklasse → vores klassifikation
const GEUS_CLASS_MAP: Record<string, SoilClass> = {
  "Ferskvandstørv":     "organic",
  "Havtørv":            "organic",
  "Tørv":               "organic",
  "Humus":              "humus",
  "Humusjord":          "humus",
  "Moræneler":          "clay",
  "Ler":                "clay",
  "Ishavsler":          "clay",
  "Glaciofluvialt ler": "sandy_clay",
  "Smeltevandssand":    "sand",
  "Marint sand":        "sand",
  "Flyvesand":          "sand",
  "Sand":               "sand",
  "Kalk":               "chalk",
  "Kridt":              "chalk",
};

const SOIL_PROFILES: Record<SoilClass, Omit<SoilProfile, "fetchedAt" | "mode" | "dominantClass">> = {
  organic:    { organicContent: 40, drainageClass: "very_poor", infiltrationRate: "low",    carbonDensity: 180, soilLabel: "Organisk jord / tørv" },
  humus:      { organicContent: 15, drainageClass: "moderate",  infiltrationRate: "medium", carbonDensity: 85,  soilLabel: "Humusjord" },
  clay:       { organicContent: 4,  drainageClass: "poor",      infiltrationRate: "low",    carbonDensity: 45,  soilLabel: "Lerjord" },
  sandy_clay: { organicContent: 3,  drainageClass: "moderate",  infiltrationRate: "medium", carbonDensity: 35,  soilLabel: "Leret sandjord" },
  sand:       { organicContent: 1,  drainageClass: "well",      infiltrationRate: "high",   carbonDensity: 18,  soilLabel: "Sandjord" },
  chalk:      { organicContent: 1,  drainageClass: "well",      infiltrationRate: "high",   carbonDensity: 12,  soilLabel: "Kalkjord" },
  unknown:    { organicContent: 3,  drainageClass: "moderate",  infiltrationRate: "medium", carbonDensity: 35,  soilLabel: "Ukendt jordbund" },
};

const PREVIEW_SOIL: SoilProfile = {
  dominantClass: "sandy_clay",
  ...SOIL_PROFILES["sandy_clay"],
  fetchedAt: new Date().toISOString(),
  mode: "preview",
};

const PREVIEW_TERRAIN: TerrainProfile = {
  elevationM: 12,
  slopePercent: 2.4,
  aspect: "gentle",
  fetchedAt: new Date().toISOString(),
  mode: "preview",
};

// ─── GEUS jordbund ────────────────────────────────────────────────────────────

export async function fetchSoilProfile(lat: number, lng: number): Promise<SoilProfile> {
  try {
    const bbox = `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`;
    const params = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: "dkjord:jordart_25000",  // Jordartskort 1:25.000
      outputFormat: "application/json",
      bbox: `${bbox},EPSG:4326`,
      srsName: "EPSG:4326",
      count: "5",
    });

    const res = await fetch(`${GEUS_WFS}?${params}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`GEUS WFS ${res.status}`);

    const json = (await res.json()) as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };

    const features = json.features ?? [];
    if (features.length === 0) return PREVIEW_SOIL;

    // Find dominerende jordbundstype
    const typeCounts: Record<string, number> = {};
    features.forEach((f) => {
      const type = String(f.properties?.["jordart"] ?? f.properties?.["betegnelse"] ?? "");
      if (type) typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    });

    const dominant = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const soilClass = GEUS_CLASS_MAP[dominant] ?? "unknown";
    const profile = SOIL_PROFILES[soilClass];

    return {
      dominantClass: soilClass,
      ...profile,
      soilLabel: dominant || profile.soilLabel,
      fetchedAt: new Date().toISOString(),
      mode: "live",
    };
  } catch {
    return PREVIEW_SOIL;
  }
}

// ─── Terrain fra Dataforsyningen ──────────────────────────────────────────────

export async function fetchTerrainProfile(lat: number, lng: number): Promise<TerrainProfile> {
  try {
    // Dataforsyningen højdemodel punkt-forespørgsel (ingen nøgle nødvendig for basic)
    const res = await fetch(
      `${DATAFORSYNINGEN_API}/punkter?x=${lng}&y=${lat}&srid=4326&datamodel=DHMNedboer`,
      { signal: AbortSignal.timeout(8_000) },
    );

    if (!res.ok) throw new Error(`Dataforsyningen ${res.status}`);
    const json = await res.json() as { højde?: number; height?: number };
    const elevation = json.højde ?? json.height ?? 0;

    // Simpel hældningsestimering fra omgivende punkter
    const [n, s, e, w] = await Promise.all([
      fetchElevation(lat + 0.001, lng),
      fetchElevation(lat - 0.001, lng),
      fetchElevation(lat, lng + 0.001),
      fetchElevation(lat, lng - 0.001),
    ]);

    const dH = Math.max(Math.abs(n - s), Math.abs(e - w));
    const dX = 111; // ~111m pr. 0.001 grader
    const slopePercent = Math.round((dH / dX) * 100 * 10) / 10;

    const aspect = slopePercent < 1 ? "flat" :
                   slopePercent < 5 ? "gentle" :
                   slopePercent < 15 ? "moderate" : "steep";

    return {
      elevationM: Math.round(elevation * 10) / 10,
      slopePercent,
      aspect,
      fetchedAt: new Date().toISOString(),
      mode: "live",
    };
  } catch {
    return PREVIEW_TERRAIN;
  }
}

async function fetchElevation(lat: number, lng: number): Promise<number> {
  const res = await fetch(
    `${DATAFORSYNINGEN_API}/punkter?x=${lng}&y=${lat}&srid=4326&datamodel=DHMNedboer`,
    { signal: AbortSignal.timeout(5_000) },
  );
  if (!res.ok) return 0;
  const json = await res.json() as { højde?: number; height?: number };
  return json.højde ?? json.height ?? 0;
}
