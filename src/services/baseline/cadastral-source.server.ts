import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import proj4 from "proj4";
import { booleanIntersects, feature, polygon } from "@turf/turf";
import type { Polygon, MultiPolygon } from "geojson";
import type { GeoJSONPolygon } from "@/lib/supabase/types";
import type { PublicBaselineSource } from "./public-baseline-types";
import { baselineSha256 } from "./public-baseline-service";
import { buildRasterQueryProjection } from "./raster-query-projection";
import { bytesSha256, PublicReadError, readPublicBytes } from "./bounded-public-read.server";

export const CADASTRAL_WFS =
  "https://wfs.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS";
export const CADASTRAL_DOCS =
  "https://datafordeler.dk/dataoversigt/matriklen-mat/matriklen2-gaeldende-og-foreloebig-wfs/";
const SRS = "urn:ogc:def:crs:EPSG::25832";
type XmlNode = Record<string, unknown>;
function record(value: unknown): XmlNode {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PublicReadError("INVALID_GML");
  return value as XmlNode;
}
function list(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function integer(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new PublicReadError("INVALID_COUNTS");
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new PublicReadError("INVALID_COUNTS");
  return result;
}
function label(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new PublicReadError("INVALID_GML_FIELD");
  return value.trim();
}
function checkTree(value: unknown, root: XmlNode, depth = 0): void {
  if (depth > 20) throw new PublicReadError("GML_DEPTH_LIMIT");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("@_xmlns") && value !== root) throw new PublicReadError("UNSAFE_NAMESPACE");
    if (key === "@_xlink:href") throw new PublicReadError("UNSUPPORTED_LINKED_GML");
    checkTree(child, root, depth + 1);
  }
}

/** Only the verified MAT2 GML 3.2 contract is accepted; unsupported geometry is a gap. */
export function parseCadastralGml(text: string) {
  if (
    text.length > 512 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    XMLValidator.validate(text) !== true
  )
    throw new PublicReadError("INVALID_GML");
  const document = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: false,
  }).parse(text) as XmlNode;
  if (Object.keys(document).some((key) => key !== "?xml" && key !== "wfs:FeatureCollection"))
    throw new PublicReadError("INVALID_GML_ROOT");
  const root = record(document["wfs:FeatureCollection"]);
  if (
    root["@_xmlns:wfs"] !== "http://www.opengis.net/wfs/2.0" ||
    root["@_xmlns:gml"] !== "http://www.opengis.net/gml/3.2" ||
    root["@_xmlns:mat"] !== "http://data.gov.dk/schemas/matrikel/1"
  )
    throw new PublicReadError("UNSAFE_NAMESPACE");
  checkTree(root, root);
  const members = list(root["wfs:member"]);
  if (members.length > 200) throw new PublicReadError("FEATURE_LIMIT");
  const returned = integer(root["@_numberReturned"]);
  const matched = root["@_numberMatched"] === "unknown" ? null : integer(root["@_numberMatched"]);
  if (returned !== members.length || (matched !== null && matched < returned))
    throw new PublicReadError("INVALID_COUNTS");
  let vertices = 0;
  const checkSrs = (node: XmlNode, inherited?: string): string => {
    const srs = node["@_srsName"] ?? inherited;
    if (srs !== SRS && srs !== "EPSG:25832") throw new PublicReadError("INVALID_CRS");
    if (node["@_srsDimension"] !== undefined && node["@_srsDimension"] !== "2")
      throw new PublicReadError("INVALID_DIMENSION");
    return String(srs);
  };
  const ring = (value: unknown, srs: string): number[][] => {
    const boundary = record(value),
      linear = record(boundary["gml:LinearRing"]);
    const coordinates = linear["gml:posList"];
    if (Object.keys(linear).some((key) => !key.startsWith("@_") && key !== "gml:posList"))
      throw new PublicReadError("UNSUPPORTED_GML_RING");
    const inherited = checkSrs(linear, srs);
    const pos =
      typeof coordinates === "string"
        ? coordinates
        : label(record(coordinates)["#text"], 512 * 1024);
    if (typeof coordinates !== "string") checkSrs(record(coordinates), inherited);
    const tokens = pos.trim().split(/\s+/);
    if (
      tokens.length < 8 ||
      tokens.length % 2 ||
      tokens.length > 20_000 ||
      tokens.some((v) => !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(v))
    )
      throw new PublicReadError("INVALID_COORDINATES");
    if (
      typeof coordinates !== "string" &&
      record(coordinates)["@_count"] !== undefined &&
      integer(record(coordinates)["@_count"]) !== tokens.length / 2
    )
      throw new PublicReadError("INVALID_COUNTS");
    vertices += tokens.length / 2;
    if (vertices > 24_000) throw new PublicReadError("GEOMETRY_LIMIT");
    const native: number[][] = [];
    for (let i = 0; i < tokens.length; i += 2) {
      const x = Number(tokens[i]),
        y = Number(tokens[i + 1]);
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 100_000 ||
        x > 1_000_000 ||
        y < 5_900_000 ||
        y > 6_500_000
      )
        throw new PublicReadError("INVALID_COORDINATES");
      native.push([x, y]);
    }
    if (native[0][0] !== native.at(-1)![0] || native[0][1] !== native.at(-1)![1])
      throw new PublicReadError("UNCLOSED_RING");
    return native.map((position) => {
      const point = proj4(
        "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs +type=crs",
        "+proj=longlat +datum=WGS84 +no_defs +type=crs",
        position,
      );
      if (
        point[0] < 7 ||
        point[0] > 16 ||
        point[1] < 54 ||
        point[1] > 58 ||
        !point.every(Number.isFinite)
      )
        throw new PublicReadError("INVALID_COORDINATES");
      return [point[0], point[1]];
    });
  };
  const parsePolygon = (value: unknown, inherited?: string): Polygon => {
    const node = record(value),
      srs = checkSrs(node, inherited);
    if (
      Object.keys(node).some(
        (key) => !key.startsWith("@_") && key !== "gml:exterior" && key !== "gml:interior",
      )
    )
      throw new PublicReadError("UNSUPPORTED_GML_POLYGON");
    const holes = list(node["gml:interior"]);
    if (holes.length > 100) throw new PublicReadError("GEOMETRY_LIMIT");
    return {
      type: "Polygon",
      coordinates: [ring(node["gml:exterior"], srs), ...holes.map((value) => ring(value, srs))],
    };
  };
  const parcels = members.map((member) => {
    const parcel = record(record(member)["mat:Jordstykke_Gaeldende"]);
    const geometryNode = record(parcel["mat:geometri"]);
    const types = Object.keys(geometryNode).filter((k) => !k.startsWith("@_"));
    if (types.length !== 1) throw new PublicReadError("INVALID_GEOMETRY");
    let geometry: Polygon | MultiPolygon;
    if (types[0] === "gml:Polygon") geometry = parsePolygon(geometryNode[types[0]]);
    else if (types[0] === "gml:MultiSurface") {
      const multi = record(geometryNode[types[0]]),
        srs = checkSrs(multi);
      if (Object.keys(multi).some((k) => !k.startsWith("@_") && k !== "gml:surfaceMember"))
        throw new PublicReadError("UNSUPPORTED_GML_SURFACE");
      const surfaces = list(multi["gml:surfaceMember"]);
      if (!surfaces.length || surfaces.length > 100) throw new PublicReadError("GEOMETRY_LIMIT");
      geometry = {
        type: "MultiPolygon",
        coordinates: surfaces.map(
          (surface) => parsePolygon(record(surface)["gml:Polygon"], srs).coordinates,
        ),
      };
    } else throw new PublicReadError("UNSUPPORTED_GML_GEOMETRY");
    return {
      id: label(parcel["mat:id.lokalId"]),
      parcelNumber: label(parcel["mat:matrikelnummer"], 80),
      landRegisterAreaCode: label(parcel["mat:ejerlavskode"], 30),
      geometry,
    };
  });
  if (new Set(parcels.map((p) => p.id)).size !== parcels.length)
    throw new PublicReadError("DUPLICATE_FEATURE");
  return {
    parcels,
    numberMatched: matched,
    numberReturned: returned,
    complete: matched === returned && !root["@_next"],
  };
}

export async function fetchCadastralSource(
  input: { polygon: GeoJSONPolygon; dateFrom: string; dateTo: string; geometrySha256?: string },
  options: { fetchImpl?: typeof fetch; now?: () => string } = {},
): Promise<PublicBaselineSource> {
  const projection = buildRasterQueryProjection(input.polygon);
  const geometrySha256 = await baselineSha256(input.polygon);
  if (input.geometrySha256 && input.geometrySha256 !== geometrySha256)
    throw new Error("Matrikelkildens område matcher ikke sagen.");
  const positions = input.polygon.coordinates.flat();
  const bbox: [number, number, number, number] = [
    Math.min(...positions.map((p) => p[0])),
    Math.min(...positions.map((p) => p[1])),
    Math.max(...positions.map((p) => p[0])),
    Math.max(...positions.map((p) => p[1])),
  ];
  const source: PublicBaselineSource = {
    id: "cadastral-parcels",
    mode: "live",
    status: "partial",
    provider: "Geodatastyrelsen via Datafordeleren",
    dataset: "Matriklen2 · gældende jordstykker",
    datasetVersion: null,
    licence: "Vilkår for brug af danske offentlige data",
    attribution: "Geodatastyrelsen / Datafordeleren",
    sourceUrl: CADASTRAL_WFS,
    sourceModifiedAt: null,
    fetchedAt: (options.now ?? (() => new Date().toISOString()))(),
    adapterVersion: "matriklen2-gml-polygons/v1",
    query: { geometrySha256, bbox, requestedFrom: input.dateFrom, requestedTo: input.dateTo },
    coverage: {
      spatial: "unknown",
      temporal: "unknown",
      observedFrom: null,
      observedTo: null,
      paginationComplete: false,
      returnedCount: null,
    },
    quality: {
      evidenceKind: "official_registration",
      method: "bounded-matriklen2-gml32",
      warnings: [
        "Gældende matrikelregister ved hentning; tilstanden på flyvedagen er ikke dokumenteret. Kortgrænser erstatter ikke landinspektørfaglig vurdering.",
        "GML-koordinater i ETRS89/UTM32 er omregnet til WGS84 uden epoke-/gridkorrektion. Ingen opmålingsnøjagtighed påstås.",
      ],
    },
    payload: null,
    payloadSha256: null,
    error: null,
  };
  try {
    const apiKey = process.env.DATAFORDELER_API_KEY?.trim();
    if (!apiKey) throw new PublicReadError("NOT_CONFIGURED");
    const url = new URL(CADASTRAL_WFS);
    url.search = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: "mat:Jordstykke_Gaeldende",
      count: "200",
      srsName: SRS,
      bbox: `${projection.bbox.join(",")},${SRS}`,
      apikey: apiKey,
    }).toString();
    const bytes = await readPublicBytes(url, {
      fetchImpl: options.fetchImpl,
      maxBytes: 512 * 1024,
      mediaType: "application/gml+xml",
    });
    const page = parseCadastralGml(new TextDecoder().decode(bytes));
    const parcels = page.parcels.filter((p) =>
      booleanIntersects(polygon(input.polygon.coordinates), feature(p.geometry)),
    );
    source.coverage = {
      ...source.coverage,
      spatial: page.complete ? "complete" : "partial",
      paginationComplete: page.complete,
      returnedCount: parcels.length,
    };
    if (!page.complete)
      source.quality.warnings.push(
        "Udtrækket er begrænset til 200 jordstykker; fuld dækning er ikke dokumenteret.",
      );
    const payload = {
      schema: "freyra.cadastral-polygons/v1",
      crs: "EPSG:4326",
      parcels,
      numberMatched: page.numberMatched,
      numberReturned: page.numberReturned,
      queryProjection: projection,
      responseSha256: await bytesSha256(bytes),
      documentationUrl: CADASTRAL_DOCS,
    };
    source.payload = z.json().parse(payload);
    source.payloadSha256 = await baselineSha256(payload);
    return source;
  } catch (error) {
    const code = error instanceof PublicReadError ? error.code : "INVALID_OR_UNAVAILABLE";
    return {
      ...source,
      mode: "error",
      status:
        code === "NOT_CONFIGURED" ? "not_configured" : code === "TIMEOUT" ? "timeout" : "failed",
      error: {
        code,
        message: "Matrikelgeometri kunne ikke hentes eller valideres. Dækning er ukendt.",
      },
    };
  }
}
