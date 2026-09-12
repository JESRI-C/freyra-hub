/**
 * Adapter for named Danish watercourses from SDFI's public Danske Stednavne API.
 *
 * The endpoint is deliberately fixed here. Callers only provide a bounded name
 * query or an object UUID, so this adapter cannot be turned into an SSRF proxy.
 */

export const OFFICIAL_WATERCOURSE_SEARCH_ENDPOINT = "https://api.dataforsyningen.dk/stednavne2";
export const OFFICIAL_WATERCOURSE_GEOMETRY_ENDPOINT = "https://api.dataforsyningen.dk/steder";

export const OFFICIAL_WATERCOURSE_ATTRIBUTION = "SDFI / Dataforsyningen — Danske Stednavne";
export const OFFICIAL_WATERCOURSE_DISCLAIMER =
  "Officiel navngivet referencegeometri. Kommunens vandløbsregulativ og seneste kontrol- eller as-built-opmåling er facit for juridisk stationering og skikkelse.";

const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEARCH_RESULTS = 20;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_SEGMENTS = 100;
const MAX_VERTICES = 20_000;

export type LngLat = [number, number];

export interface OfficialWatercourseSuggestion {
  id: string;
  name: string;
  nameStatus: string;
  municipalities: string[];
  center: { lat: number; lng: number } | null;
  bbox: [number, number, number, number] | null;
  modifiedAt: string | null;
}

export interface OfficialWatercourseGeometry {
  id: string;
  name: string;
  nameStatus: string;
  municipalities: string[];
  center: { lat: number; lng: number };
  bbox: [number, number, number, number];
  geometry: {
    type: "MultiLineString";
    coordinates: LngLat[][];
  };
  segmentCount: number;
  vertexCount: number;
  lengthM: number;
  modifiedAt: string | null;
  geometryVersion: number | null;
  sourceUrl: string;
  attribution: string;
  disclaimer: string;
}

export class OfficialWatercourseSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialWatercourseSourceError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function isDanishLngLat(value: unknown): value is LngLat {
  if (!Array.isArray(value) || value.length < 2) return false;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return (
    Number.isFinite(lng) && Number.isFinite(lat) && lng >= 7 && lng <= 16 && lat >= 54 && lat <= 58
  );
}

function asCenter(value: unknown): { lat: number; lng: number } | null {
  if (!isDanishLngLat(value)) return null;
  return { lng: Number(value[0]), lat: Number(value[1]) };
}

function asBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [west, south, east, north] = value.map(Number);
  if (
    ![west, south, east, north].every(Number.isFinite) ||
    west < 7 ||
    east > 16 ||
    south < 54 ||
    north > 58 ||
    west >= east ||
    south >= north
  ) {
    return null;
  }
  return [west, south, east, north];
}

function municipalitiesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(asRecord(item)?.["navn"], 100))
    .filter((item): item is string => item != null)
    .slice(0, 10);
}

export function buildOfficialWatercourseSearchUrl(query: string): string {
  const q = query.trim();
  if (q.length < 2 || q.length > 100) {
    throw new OfficialWatercourseSourceError("Vandløbsnavnet skal være mellem 2 og 100 tegn.");
  }
  const url = new URL(OFFICIAL_WATERCOURSE_SEARCH_ENDPOINT);
  url.search = new URLSearchParams({
    q,
    fuzzy: "true",
    per_side: String(MAX_SEARCH_RESULTS),
  }).toString();
  return url.toString();
}

export function buildOfficialWatercourseGeometryUrl(id: string): string {
  if (!POSTGRES_UUID.test(id)) {
    throw new OfficialWatercourseSourceError("Vandløbets kilde-ID er ugyldigt.");
  }
  const url = new URL(`${OFFICIAL_WATERCOURSE_GEOMETRY_ENDPOINT}/${encodeURIComponent(id)}`);
  url.search = new URLSearchParams({ format: "geojson", srid: "4326" }).toString();
  return url.toString();
}

export function parseOfficialWatercourseSuggestions(
  payload: unknown,
): OfficialWatercourseSuggestion[] {
  if (!Array.isArray(payload)) {
    throw new OfficialWatercourseSourceError(
      "Dataforsyningen returnerede et ugyldigt søgeresultat.",
    );
  }

  const seen = new Set<string>();
  const suggestions: OfficialWatercourseSuggestion[] = [];
  for (const raw of payload) {
    if (suggestions.length >= MAX_SEARCH_RESULTS) break;
    const item = asRecord(raw);
    const place = asRecord(item?.["sted"]);
    const id = asText(place?.["id"], 36);
    const name = asText(item?.["navn"] ?? place?.["primærtnavn"]);
    const mainType = asText(place?.["hovedtype"], 50)?.toLocaleLowerCase("da-DK");
    const subtype = asText(place?.["undertype"], 50)?.toLocaleLowerCase("da-DK");
    if (
      !id ||
      !POSTGRES_UUID.test(id) ||
      !name ||
      seen.has(id) ||
      (mainType !== "vandløb" && subtype !== "vandløb")
    ) {
      continue;
    }
    seen.add(id);
    suggestions.push({
      id,
      name,
      nameStatus: asText(item?.["navnestatus"] ?? place?.["primærnavnestatus"], 50) ?? "ukendt",
      municipalities: municipalitiesFrom(place?.["kommuner"]),
      center: asCenter(place?.["visueltcenter"]),
      bbox: asBbox(place?.["bbox"]),
      modifiedAt: asText(place?.["geo_ændret"] ?? place?.["ændret"], 50),
    });
  }
  return suggestions;
}

function parseLine(raw: unknown): LngLat[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const line: LngLat[] = [];
  for (const rawPoint of raw) {
    if (!isDanishLngLat(rawPoint)) return null;
    line.push([Number(rawPoint[0]), Number(rawPoint[1])]);
  }
  return line;
}

function haversineM(a: LngLat, b: LngLat): number {
  const radiusM = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radiusM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function geometryStats(lines: LngLat[][]): {
  bbox: [number, number, number, number];
  center: { lat: number; lng: number };
  vertexCount: number;
  lengthM: number;
} {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let vertexCount = 0;
  let lengthM = 0;
  for (const line of lines) {
    for (let index = 0; index < line.length; index++) {
      const point = line[index];
      west = Math.min(west, point[0]);
      south = Math.min(south, point[1]);
      east = Math.max(east, point[0]);
      north = Math.max(north, point[1]);
      vertexCount += 1;
      if (index > 0) lengthM += haversineM(line[index - 1], point);
    }
  }
  return {
    bbox: [west, south, east, north],
    center: { lng: (west + east) / 2, lat: (south + north) / 2 },
    vertexCount,
    lengthM: Math.round(lengthM),
  };
}

export function parseOfficialWatercourseGeometry(
  payload: unknown,
  expectedId: string,
): OfficialWatercourseGeometry {
  const feature = asRecord(payload);
  const geometry = asRecord(feature?.["geometry"]);
  const properties = asRecord(feature?.["properties"]);
  const returnedId = asText(properties?.["id"], 36);
  const name = asText(properties?.["primærtnavn"]);
  const mainType = asText(properties?.["hovedtype"], 50)?.toLocaleLowerCase("da-DK");
  if (
    !POSTGRES_UUID.test(expectedId) ||
    returnedId !== expectedId ||
    !name ||
    mainType !== "vandløb" ||
    !geometry
  ) {
    throw new OfficialWatercourseSourceError(
      "Dataforsyningen returnerede ikke det valgte vandløb.",
    );
  }

  const geometryType = geometry["type"];
  const rawLines =
    geometryType === "LineString"
      ? [geometry["coordinates"]]
      : geometryType === "MultiLineString"
        ? geometry["coordinates"]
        : null;
  if (!Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > MAX_SEGMENTS) {
    throw new OfficialWatercourseSourceError(
      "Vandløbets geometri er ugyldig eller for omfattende.",
    );
  }

  const lines: LngLat[][] = [];
  let vertexCount = 0;
  for (const rawLine of rawLines) {
    const line = parseLine(rawLine);
    if (!line) {
      throw new OfficialWatercourseSourceError(
        "Vandløbets geometri indeholder ugyldige koordinater.",
      );
    }
    vertexCount += line.length;
    if (vertexCount > MAX_VERTICES) {
      throw new OfficialWatercourseSourceError("Vandløbets geometri overskrider punktgrænsen.");
    }
    lines.push(line);
  }

  const stats = geometryStats(lines);
  const propertyCenter = asCenter([
    properties?.["visueltcenter_x"],
    properties?.["visueltcenter_y"],
  ]);
  const geometryVersion = Number(properties?.["geo_version"]);

  return {
    id: expectedId,
    name,
    nameStatus: asText(properties?.["primærnavnestatus"], 50) ?? "ukendt",
    municipalities: [],
    center: propertyCenter ?? stats.center,
    bbox: stats.bbox,
    geometry: { type: "MultiLineString", coordinates: lines },
    segmentCount: lines.length,
    vertexCount: stats.vertexCount,
    lengthM: stats.lengthM,
    modifiedAt: asText(properties?.["geo_ændret"] ?? properties?.["ændret"], 50),
    geometryVersion: Number.isFinite(geometryVersion) ? geometryVersion : null,
    sourceUrl: buildOfficialWatercourseGeometryUrl(expectedId),
    attribution: OFFICIAL_WATERCOURSE_ATTRIBUTION,
    disclaimer: OFFICIAL_WATERCOURSE_DISCLAIMER,
  };
}

async function fetchJson(url: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new OfficialWatercourseSourceError(
        `Dataforsyningen svarede med HTTP ${response.status}.`,
      );
    }
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
      throw new OfficialWatercourseSourceError("Dataforsyningens svar er for stort.");
    }
    if (!response.body) {
      throw new OfficialWatercourseSourceError("Dataforsyningen returnerede et tomt svar.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new OfficialWatercourseSourceError("Dataforsyningens svar er for stort.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new OfficialWatercourseSourceError("Dataforsyningen returnerede ikke gyldig JSON.");
    }
  } catch (error) {
    if (error instanceof OfficialWatercourseSourceError) throw error;
    throw new OfficialWatercourseSourceError("Kunne ikke hente data fra Dataforsyningen.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchOfficialWatercourses(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OfficialWatercourseSuggestion[]> {
  const payload = await fetchJson(buildOfficialWatercourseSearchUrl(query), fetchImpl);
  return parseOfficialWatercourseSuggestions(payload);
}

export async function fetchOfficialWatercourse(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OfficialWatercourseGeometry> {
  const payload = await fetchJson(buildOfficialWatercourseGeometryUrl(id), fetchImpl);
  return parseOfficialWatercourseGeometry(payload, id);
}
