import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  OFFICIAL_WATERCOURSE_DISCLAIMER,
  type OfficialWatercourseGeometry,
  type LngLat,
} from "./official-watercourse-source";

/** Verified against DS's public XSD and authenticated GML on 2026-10-13. */
export const DATAFORDELER_WATERCOURSE_ENDPOINT =
  "https://wfs.datafordeler.dk/Stednavn/STEDNAVNE_BEARBEJDET_GML3SFP/1/WFS";
export const DATAFORDELER_WATERCOURSE_PROVIDER = "datafordeler-ds-bearbejdet-wfs/v1";
export const DATAFORDELER_WATERCOURSE_CRS = "EPSG:4326";
export const DATAFORDELER_WATERCOURSE_AXIS_ORDER = "lat-lng";
export const DATAFORDELER_WATERCOURSE_DATASET_VERSION = "static-2025-09";
export const DATAFORDELER_WATERCOURSE_ATTRIBUTION =
  "Klimadatastyrelsen / Datafordeleren — Danske Stednavne";
export const DATAFORDELER_WATERCOURSE_DISCLAIMER = `${OFFICIAL_WATERCOURSE_DISCLAIMER} Danske Stednavne er statiske siden september 2025; registreringstid er ikke en ny feltobservation.`;
export const DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES = 2_000_000;
export const DATAFORDELER_WATERCOURSE_MAX_RESULTS = 20;

const SN = "http://data.gov.dk/schemas/stednavne/2/gml3sfp";
const WFS = "http://www.opengis.net/wfs/2.0";
const GML = "http://www.opengis.net/gml/3.2";
const SOURCE_ID_NAMESPACE = "http://data.gov.dk/stednavne";
const SOURCE_SRS = "urn:ogc:def:crs:EPSG::4326";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEGMENTS = 100;
const MAX_VERTICES = 20_000;
const MAX_NODES = 12_000;
const MAX_FEATURES = DATAFORDELER_WATERCOURSE_MAX_RESULTS + 1;
const XML_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export class DatafordelerWatercourseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatafordelerWatercourseError";
  }
}

export interface DatafordelerWatercourseGeometry extends OfficialWatercourseGeometry {
  sourceProvider: typeof DATAFORDELER_WATERCOURSE_PROVIDER;
  sourceCrs: typeof DATAFORDELER_WATERCOURSE_CRS;
  sourceAxisOrder: typeof DATAFORDELER_WATERCOURSE_AXIS_ORDER;
  datasetVersion: typeof DATAFORDELER_WATERCOURSE_DATASET_VERSION;
  sourceRegisteredAt: string | null;
  sourceValidFrom: string | null;
  officialLengthM: number | null;
}

export interface DatafordelerWatercourseCollection {
  watercourses: DatafordelerWatercourseGeometry[];
  numberMatched: number | null;
  numberReturned: number;
  paginationComplete: boolean;
}

function fail(message = "Datafordeleren returnerede ugyldigt vandløbs-GML."): never {
  throw new DatafordelerWatercourseError(message);
}

function xmlEscape(value: string): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return value.replace(/[&<>"']/g, (character) => escapes[character]);
}

function filter(predicate: string): string {
  return `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:sn="${SN}">${predicate}</fes:Filter>`;
}

function featureUrl(predicate: string, count: number): string {
  const url = new URL(DATAFORDELER_WATERCOURSE_ENDPOINT);
  url.search = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: "sn:Vandloeb",
    COUNT: String(count),
    STARTINDEX: "0",
    SRSNAME: SOURCE_SRS,
    FILTER: filter(predicate),
  }).toString();
  return url.toString();
}

/** Canonical provenance URL; credentials are appended only in the server fetch. */
export function buildDatafordelerWatercourseGeometryUrl(id: string): string {
  if (!UUID.test(id)) fail("Vandløbets kilde-ID er ugyldigt.");
  return featureUrl(
    `<fes:PropertyIsEqualTo><fes:ValueReference>sn:id.lokalId</fes:ValueReference><fes:Literal>${id.toLowerCase()}</fes:Literal></fes:PropertyIsEqualTo>`,
    2,
  );
}

export function buildDatafordelerWatercourseSearchUrl(query: string): string {
  const normalized = query.trim();
  if (
    normalized.length < 2 ||
    normalized.length > 100 ||
    Array.from(normalized).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    fail("Vandløbsnavnet skal være mellem 2 og 100 tegn uden kontroltegn.");
  }
  // FES escaping is separate from XML escaping. User wildcards remain literal.
  const literal = xmlEscape(`*${normalized.replace(/[!*?]/g, (character) => `!${character}`)}*`);
  const names = Array.from(
    { length: 5 },
    (_, index) =>
      `<fes:PropertyIsLike wildCard="*" singleChar="?" escapeChar="!" matchCase="false"><fes:ValueReference>sn:navn_${index + 1}.skrivemaade</fes:ValueReference><fes:Literal>${literal}</fes:Literal></fes:PropertyIsLike>`,
  ).join("");
  return featureUrl(`<fes:Or>${names}</fes:Or>`, MAX_FEATURES);
}

interface XmlElement {
  local: string;
  namespace: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

/** Decode only predefined/numeric XML escapes; DTD and custom entities are forbidden. */
function decodeText(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[\da-fA-F]{1,6});)/.test(value)) fail();
  return value.replace(
    /&(amp|lt|gt|quot|apos|#\d{1,7}|#x[\da-fA-F]{1,6});/g,
    (_, token: string) => {
      const predefined: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      if (predefined[token] !== undefined) return predefined[token];
      const code = token.startsWith("#x") ? parseInt(token.slice(2), 16) : Number(token.slice(1));
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) fail();
      if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail();
      return String.fromCodePoint(code);
    },
  );
}

function qualified(name: string, namespaces: Record<string, string>, attribute = false) {
  const parts = name.split(":");
  if (parts.length > 2) fail();
  const namespace =
    parts.length === 2
      ? Object.hasOwn(namespaces, parts[0])
        ? namespaces[parts[0]]
        : undefined
      : attribute
        ? ""
        : (namespaces[""] ?? "");
  if (typeof namespace !== "string") fail("GML indeholder et ukendt XML-namespace.");
  return { namespace, local: parts.at(-1)! };
}

function parseElements(
  value: unknown,
  inherited: Record<string, string>,
  budget: { nodes: number },
  depth = 0,
): { children: XmlElement[]; text: string } {
  if (!Array.isArray(value) || depth > 24) fail();
  const children: XmlElement[] = [];
  let text = "";
  for (const raw of value) {
    const item = record(raw);
    if ("#text" in item) {
      if (typeof item["#text"] !== "string") fail();
      text += decodeText(item["#text"]);
      continue;
    }
    const names = Object.keys(item).filter((name) => name !== ":@");
    if (names.length !== 1 || ++budget.nodes > MAX_NODES) fail();
    const rawAttributes = item[":@"] === undefined ? {} : record(item[":@"]);
    const namespaces: Record<string, string> = Object.assign(Object.create(null), inherited);
    for (const [name, attr] of Object.entries(rawAttributes)) {
      if (typeof attr !== "string") fail();
      if (name === "@_xmlns") namespaces[""] = decodeText(attr);
      else if (name.startsWith("@_xmlns:")) namespaces[name.slice(8)] = decodeText(attr);
    }
    const attributes: Record<string, string> = {};
    for (const [name, attr] of Object.entries(rawAttributes)) {
      if (name === "@_xmlns" || name.startsWith("@_xmlns:")) continue;
      const identity = qualified(name.slice(2), namespaces, true);
      attributes[`${identity.namespace}\0${identity.local}`] = decodeText(String(attr));
    }
    const identity = qualified(names[0], namespaces);
    const content = parseElements(item[names[0]], namespaces, budget, depth + 1);
    children.push({ ...identity, attributes, ...content });
  }
  return { children, text };
}

function nodes(element: XmlElement, local: string, namespace = SN): XmlElement[] {
  return element.children.filter((child) => child.local === local && child.namespace === namespace);
}

function one(element: XmlElement, local: string, namespace = SN): XmlElement {
  const matches = nodes(element, local, namespace);
  if (matches.length !== 1) fail();
  return matches[0];
}

function field(element: XmlElement, local: string, optional = false): string | null {
  const matches = nodes(element, local);
  if (matches.length === 0 && optional) return null;
  if (matches.length !== 1 || matches[0].children.length !== 0) fail();
  return matches[0].text.trim();
}

function attribute(element: XmlElement, local: string, namespace = ""): string | undefined {
  return element.attributes[`${namespace}\0${local}`];
}

function dateField(element: XmlElement, local: string): string | null {
  const value = field(element, local, true);
  if (value === null || value === "") return null;
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    fail();
  if (new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10))
    fail();
  if (value.endsWith("Z")) return value;
  const utc = new Date(value).toISOString();
  if (!/^\d{4}-/.test(utc)) fail();
  // Offset conversion preserves fractional precision, including source microseconds.
  const fraction = value.match(/\.\d+/)?.[0] ?? "";
  return `${utc.slice(0, 19)}${fraction}Z`;
}

function haversine(a: LngLat, b: LngLat): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (b[1] - a[1]) * radians;
  const longitudeDelta = (b[0] - a[0]) * radians;
  const h =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function parseFeature(feature: XmlElement): DatafordelerWatercourseGeometry {
  if (feature.namespace !== SN || feature.local !== "Vandloeb") fail();
  const id = field(feature, "id.lokalId");
  if (
    !id ||
    !UUID.test(id) ||
    field(feature, "id.namespace") !== SOURCE_ID_NAMESPACE ||
    field(feature, "status") !== "iBrug" ||
    field(feature, "vandloebstype") !== "vandløb"
  )
    fail("Kilden indeholder ikke et aktuelt officielt vandløb.");
  const primary = Array.from({ length: 5 }, (_, index) => index + 1).filter(
    (index) => field(feature, `navn_${index}.brugsprioritet`, true) === "primær",
  );
  if (primary.length !== 1) fail("Vandløbet har ikke ét entydigt primært navn.");
  const slot = primary[0];
  const name = field(feature, `navn_${slot}.skrivemaade`);
  if (
    !name ||
    name.length > 200 ||
    field(feature, `navn_${slot}.aktualitet`) !== "iAnvendelse" ||
    field(feature, `navn_${slot}.navnestatus`) !== "officielt"
  )
    fail("Vandløbets primære navn er ikke aktuelt og officielt.");
  const geometry = one(feature, "geometri");
  if (geometry.children.length !== 1 || geometry.text.trim()) fail();
  const multicurve = one(geometry, "MultiCurve", GML);
  if (
    attribute(multicurve, "srsName") !== SOURCE_SRS ||
    attribute(multicurve, "srsDimension") !== "2"
  )
    fail("Vandløbets koordinatsystem eller akseorden understøttes ikke.");
  const members = nodes(multicurve, "curveMember", GML);
  if (
    members.length < 1 ||
    members.length > MAX_SEGMENTS ||
    members.length !== multicurve.children.length ||
    multicurve.text.trim()
  )
    fail("Vandløbets kurvegeometri understøttes ikke.");
  const lines: LngLat[][] = [];
  let vertexCount = 0;
  let lengthM = 0;
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const member of members) {
    if (member.children.length !== 1 || member.text.trim()) fail();
    const line = one(member, "LineString", GML);
    if (
      (attribute(line, "srsDimension") ?? "2") !== "2" ||
      (attribute(line, "srsName") ?? SOURCE_SRS) !== SOURCE_SRS ||
      line.children.length !== 1 ||
      line.text.trim()
    )
      fail("Vandløbet indeholder en ukendt kurve eller koordinatdimension.");
    const posList = one(line, "posList", GML);
    if (
      posList.children.length ||
      (attribute(posList, "srsDimension") ?? "2") !== "2" ||
      (attribute(posList, "srsName") ?? SOURCE_SRS) !== SOURCE_SRS
    )
      fail();
    const values = posList.text.trim().split(/\s+/);
    if (
      values.length < 4 ||
      values.length % 2 !== 0 ||
      (vertexCount += values.length / 2) > MAX_VERTICES
    )
      fail("Vandløbets geometri overskrider punktgrænsen eller er ugyldig.");
    if (
      attribute(posList, "count") !== undefined &&
      nonnegativeInteger(attribute(posList, "count")) !== values.length / 2
    )
      fail();
    const points: LngLat[] = [];
    for (let index = 0; index < values.length; index += 2) {
      if (!XML_NUMBER.test(values[index]) || !XML_NUMBER.test(values[index + 1])) fail();
      const lat = Number(values[index]),
        lng = Number(values[index + 1]);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < 54 ||
        lat > 58 ||
        lng < 7 ||
        lng > 16
      )
        fail("Vandløbet indeholder ugyldige koordinater.");
      const point: LngLat = [lng, lat];
      if (points.length) lengthM += haversine(points[points.length - 1], point);
      points.push(point);
      west = Math.min(west, lng);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      north = Math.max(north, lat);
    }
    lines.push(points);
  }
  const officialLengthText = field(feature, "laengde", true);
  if (officialLengthText !== null && !XML_NUMBER.test(officialLengthText)) fail();
  const officialLengthM = officialLengthText === null ? null : Number(officialLengthText);
  if (
    officialLengthM !== null &&
    (!Number.isFinite(officialLengthM) ||
      officialLengthM < 0 ||
      attribute(one(feature, "laengde"), "uom", GML) !== "http://qudt.org/vocab/unit#Meter")
  )
    fail();
  return {
    id: id.toLowerCase(),
    name,
    nameStatus: "officielt",
    municipalities: [],
    center: { lng: (west + east) / 2, lat: (south + north) / 2 },
    bbox: [west, south, east, north],
    geometry: { type: "MultiLineString", coordinates: lines },
    segmentCount: lines.length,
    vertexCount,
    lengthM: Math.round(lengthM),
    modifiedAt: null,
    geometryVersion: null,
    sourceUrl: buildDatafordelerWatercourseGeometryUrl(id),
    attribution: DATAFORDELER_WATERCOURSE_ATTRIBUTION,
    disclaimer: DATAFORDELER_WATERCOURSE_DISCLAIMER,
    sourceProvider: DATAFORDELER_WATERCOURSE_PROVIDER,
    sourceCrs: DATAFORDELER_WATERCOURSE_CRS,
    sourceAxisOrder: DATAFORDELER_WATERCOURSE_AXIS_ORDER,
    datasetVersion: DATAFORDELER_WATERCOURSE_DATASET_VERSION,
    sourceRegisteredAt: dateField(feature, "registreringFra"),
    sourceValidFrom: dateField(feature, "virkningFra"),
    officialLengthM,
  };
}

function nonnegativeInteger(value: string | undefined): number | null {
  if (value === "unknown") return null;
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail();
  return Number(value);
}

export function parseDatafordelerWatercourseCollection(
  xml: string,
): DatafordelerWatercourseCollection {
  if (
    new TextEncoder().encode(xml).byteLength > DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES ||
    /<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)
  )
    fail("Kildens XML er for stor eller indeholder forbudte entiteter.");
  if (XMLValidator.validate(xml) !== true) fail();
  let raw: unknown;
  try {
    raw = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
      maxNestedTags: 24,
    }).parse(xml);
  } catch {
    fail();
  }
  const tree = parseElements(raw, { xml: "http://www.w3.org/XML/1998/namespace" }, { nodes: 0 });
  if (tree.children.length !== 1 || tree.text.trim()) fail();
  const root = tree.children[0];
  if (root.namespace !== WFS || root.local !== "FeatureCollection")
    fail("Datafordeleren returnerede ingen gyldig vandløbssamling.");
  const members = nodes(root, "member", WFS);
  if (members.length > MAX_FEATURES || root.children.length !== members.length || root.text.trim())
    fail();
  const numberReturned = nonnegativeInteger(attribute(root, "numberReturned"));
  const numberMatched = nonnegativeInteger(attribute(root, "numberMatched"));
  if (
    numberReturned !== members.length ||
    (numberMatched !== null && numberMatched < members.length)
  )
    fail();
  const watercourses = members.map((member) => {
    if (member.children.length !== 1 || member.text.trim()) fail();
    return parseFeature(member.children[0]);
  });
  if (new Set(watercourses.map((watercourse) => watercourse.id)).size !== watercourses.length)
    fail("Kilden returnerede flere versioner af samme vandløb.");
  return {
    watercourses,
    numberMatched,
    numberReturned,
    paginationComplete: numberMatched === numberReturned && !attribute(root, "next"),
  };
}

export function parseDatafordelerWatercourseGeometry(
  xml: string,
  expectedId: string,
): DatafordelerWatercourseGeometry {
  if (!UUID.test(expectedId)) fail("Vandløbets kilde-ID er ugyldigt.");
  const collection = parseDatafordelerWatercourseCollection(xml);
  if (
    !collection.paginationComplete ||
    collection.watercourses.length !== 1 ||
    collection.watercourses[0].id !== expectedId.toLowerCase()
  )
    fail("Datafordeleren returnerede ikke ét entydigt valgt vandløb.");
  return collection.watercourses[0];
}
