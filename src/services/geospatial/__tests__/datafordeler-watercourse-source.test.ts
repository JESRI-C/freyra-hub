import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDatafordelerWatercourseGeometryUrl,
  buildDatafordelerWatercourseSearchUrl,
  buildDatafordelerWatercourseBoundsUrl,
  DATAFORDELER_WATERCOURSE_ENDPOINT,
  DATAFORDELER_WATERCOURSE_PROVIDER,
  DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES,
  parseDatafordelerWatercourseCollection,
  parseDatafordelerWatercourseGeometry,
} from "../datafordeler-watercourse-source";

const ID = "120b35a4-d910-46b9-e063-6f4f210a952b";
const liveFixture = readFileSync(
  new URL("./fixtures/datafordeler-watercourse.gml", import.meta.url),
  "utf8",
);
const searchFixture = readFileSync(
  new URL("./fixtures/datafordeler-watercourse-search.gml", import.meta.url),
  "utf8",
);
const compact = liveFixture.replace(
  /<gml:posList>[\s\S]*?<\/gml:posList>/,
  "<gml:posList>54.967747653 9.926992122 54.967766043 9.926984735</gml:posList>",
);

describe("Datafordeler canonical queries", () => {
  it("builds a bounded EPSG4326 latitude-longitude BBOX without credentials", () => {
    const url = new URL(buildDatafordelerWatercourseBoundsUrl([9.25, 55.34, 9.27, 55.36]));
    expect(url.searchParams.get("BBOX")).toBe("55.34,9.25,55.36,9.27,urn:ogc:def:crs:EPSG::4326");
    expect(url.searchParams.get("COUNT")).toBe("21");
    expect(url.searchParams.has("apikey")).toBe(false);
    expect(url.searchParams.has("FILTER")).toBe(false);
  });
  it.each(
    [
      [7, 54, 16, 58],
      [9, 55, 9, 56],
      [55, 9, 56, 10],
      [9, 55, Infinity, 55.1],
      [9, 55, 9.1, 54.9],
    ].map((bounds) => ({ bounds })),
  )("rejects a malformed or unbounded BBOX $bounds", ({ bounds }) => {
    expect(() =>
      buildDatafordelerWatercourseBoundsUrl(bounds as [number, number, number, number]),
    ).toThrow();
  });
  it("binds the exact UUID to a fixed GML endpoint and key-free FES query", () => {
    const url = new URL(buildDatafordelerWatercourseGeometryUrl(ID.toUpperCase()));
    expect(`${url.origin}${url.pathname}`).toBe(DATAFORDELER_WATERCOURSE_ENDPOINT);
    expect(url.searchParams.get("COUNT")).toBe("2");
    expect(url.searchParams.get("SRSNAME")).toBe("urn:ogc:def:crs:EPSG::4326");
    expect(url.searchParams.get("FILTER")).toContain(
      `<fes:ValueReference>sn:id.lokalId</fes:ValueReference><fes:Literal>${ID}</fes:Literal>`,
    );
    expect(url.searchParams.has("apikey")).toBe(false);
    expect(() => buildDatafordelerWatercourseGeometryUrl("../admin")).toThrow("kilde-ID");
  });

  it("searches all five schema-declared names and escapes wildcard/XML syntax", () => {
    const url = new URL(buildDatafordelerWatercourseSearchUrl("A!*? & <B>"));
    const query = url.searchParams.get("FILTER")!;
    expect(query).toContain("<fes:Or>");
    for (let slot = 1; slot <= 5; slot++) expect(query).toContain(`sn:navn_${slot}.skrivemaade`);
    expect(query.match(/matchCase="false"/g)).toHaveLength(5);
    expect(query).toContain("*A!!!*!? &amp; &lt;B&gt;*");
    expect(url.searchParams.get("COUNT")).toBe("21");
    expect(url.searchParams.has("apikey")).toBe(false);
  });

  it.each(["a", "a".repeat(101), "Ba\u0000ek", "Ba\n\u0001ek"])(
    "rejects a malformed query %s",
    (query) => {
      expect(() => buildDatafordelerWatercourseSearchUrl(query)).toThrow();
    },
  );
});

describe("Datafordeler GML", () => {
  it("parses the authenticated public fixture with explicit latitude/longitude swap", () => {
    const reach = parseDatafordelerWatercourseGeometry(liveFixture, ID);
    expect(reach.id).toBe(ID);
    expect(reach.name).toBe("Lillemølle Bæk");
    expect(reach.geometry.coordinates[0][0]).toEqual([9.926992122, 54.967747653]);
    expect(reach.sourceProvider).toBe(DATAFORDELER_WATERCOURSE_PROVIDER);
    expect(reach.sourceCrs).toBe("EPSG:4326");
    expect(reach.sourceAxisOrder).toBe("lat-lng");
    expect(reach.datasetVersion).toBe("static-2025-09");
    expect(reach.sourceRegisteredAt).toBe("2024-02-23T10:41:59Z");
    expect(reach.sourceValidFrom).toBe("2024-02-23T10:41:59Z");
    expect(reach.modifiedAt).toBeNull();
    expect(reach.geometryVersion).toBeNull();
    expect(reach.municipalities).toEqual([]);
    expect(reach.officialLengthM).toBe(3684);
    expect(reach.lengthM).toBeGreaterThan(3000);
    expect(reach.sourceUrl).toBe(buildDatafordelerWatercourseGeometryUrl(ID));
  });

  it("parses the separately probed name search without replacing its identity", () => {
    const collection = parseDatafordelerWatercourseCollection(searchFixture);
    expect(collection.paginationComplete).toBe(true);
    expect(collection.watercourses[0].id).toBe("1233766a-1fdb-6b98-e053-d480220a5a3f");
    expect(collection.watercourses[0].name).toBe("Bykær Bæk");
  });

  it.each([
    ["2024-02-23T12:41:59+02:00", "2024-02-23T10:41:59Z"],
    ["2024-02-23T00:10:59+01:00", "2024-02-22T23:10:59Z"],
    ["2024-02-23T23:41:59-02:00", "2024-02-24T01:41:59Z"],
    ["2024-02-23T12:41:59.123456+02:00", "2024-02-23T10:41:59.123456Z"],
    ["2024-02-23T10:41:59Z", "2024-02-23T10:41:59Z"],
    ["2024-02-23T10:41:59.123456Z", "2024-02-23T10:41:59.123456Z"],
  ])("normalizes source offset %s to canonical UTC without losing precision", (date, utc) => {
    const reach = parseDatafordelerWatercourseGeometry(
      compact.replaceAll("2024-02-23T10:41:59Z", date),
      ID,
    );
    expect(reach.sourceRegisteredAt).toBe(utc);
    expect(reach.sourceValidFrom).toBe(utc);
    expect(reach.modifiedAt).toBeNull();
  });

  it.each([
    "2024-02-31T10:41:59+02:00",
    "2023-02-29T10:41:59+02:00",
    "2024-02-23T24:00:00+02:00",
    "2024-02-23T10:61:59+02:00",
    "2024-02-23T10:41:59+25:00",
    "2024-02-23T10:41:59+02:99",
  ])("rejects invalid offset date %s", (date) => {
    expect(() =>
      parseDatafordelerWatercourseGeometry(compact.replaceAll("2024-02-23T10:41:59Z", date), ID),
    ).toThrow();
  });

  it("resolves namespace URIs regardless of prefix spelling", () => {
    const renamed = compact
      .replaceAll("xmlns:sn=", "xmlns:ds=")
      .replaceAll("sn:", "ds:")
      .replaceAll("xmlns:gml=", "xmlns:curve=")
      .replaceAll("gml:", "curve:");
    expect(parseDatafordelerWatercourseGeometry(renamed, ID).geometry.coordinates[0][0]).toEqual([
      9.926992122, 54.967747653,
    ]);
  });

  it("selects the verified primary name across the five slots", () => {
    const alias = compact
      .replace("<sn:navn_1.brugsprioritet>primær", "<sn:navn_1.brugsprioritet>sekundær")
      .replace(
        "<sn:registreringFra>",
        "<sn:navn_2.aktualitet>iAnvendelse</sn:navn_2.aktualitet><sn:navn_2.brugsprioritet>primær</sn:navn_2.brugsprioritet><sn:navn_2.navnestatus>officielt</sn:navn_2.navnestatus><sn:navn_2.skrivemaade>Fixture &amp; Bæk</sn:navn_2.skrivemaade><sn:registreringFra>",
      );
    expect(parseDatafordelerWatercourseGeometry(alias, ID).name).toBe("Fixture & Bæk");
  });

  it.each([
    [
      "wrong namespace",
      (xml: string) =>
        xml.replace("http://data.gov.dk/schemas/stednavne/2/gml3sfp", "https://evil.test/schema"),
    ],
    [
      "inner namespace override",
      (xml: string) =>
        xml.replace("<sn:id.lokalId>", '<sn:id.lokalId xmlns:sn="https://evil.test/schema">'),
    ],
    [
      "wrong ID namespace",
      (xml: string) => xml.replace("http://data.gov.dk/stednavne", "https://evil.test/id"),
    ],
    ["inactive object", (xml: string) => xml.replace("<sn:status>iBrug", "<sn:status>nedlagt")],
    [
      "historical name",
      (xml: string) =>
        xml.replace("<sn:navn_1.aktualitet>iAnvendelse", "<sn:navn_1.aktualitet>historisk"),
    ],
    [
      "unofficial name",
      (xml: string) =>
        xml.replace("<sn:navn_1.navnestatus>officielt", "<sn:navn_1.navnestatus>uofficielt"),
    ],
    [
      "wrong CRS",
      (xml: string) => xml.replaceAll("urn:ogc:def:crs:EPSG::4326", "urn:ogc:def:crs:EPSG::25832"),
    ],
    [
      "ambiguous CRS syntax",
      (xml: string) => xml.replaceAll("urn:ogc:def:crs:EPSG::4326", "EPSG:4326"),
    ],
    ["three dimensions", (xml: string) => xml.replace('srsDimension="2"', 'srsDimension="3"')],
    [
      "line CRS override",
      (xml: string) =>
        xml.replace("<gml:LineString ", '<gml:LineString srsName="urn:ogc:def:crs:EPSG::25832" '),
    ],
    ["unknown curve", (xml: string) => xml.replaceAll("gml:LineString", "gml:Curve")],
    [
      "extra geometry",
      (xml: string) => xml.replace("</sn:geometri>", "<gml:Curve/></sn:geometri>"),
    ],
    [
      "mixed geometry text",
      (xml: string) => xml.replace("<sn:geometri>", "<sn:geometri>unparsed geometry"),
    ],
    [
      "incorrect posList count",
      (xml: string) => xml.replace("<gml:posList>", '<gml:posList count="3">'),
    ],
    ["odd coordinates", (xml: string) => xml.replace("54.967766043 9.926984735", "54.967766043")],
    [
      "swapped/invalid coordinates",
      (xml: string) => xml.replace("54.967747653 9.926992122", "9.926992122 54.967747653"),
    ],
    ["nonfinite coordinates", (xml: string) => xml.replace("54.967747653", "NaN")],
    ["hex coordinates", (xml: string) => xml.replace("54.967747653", "0x37")],
    ["wrong count", (xml: string) => xml.replace('numberReturned="1"', 'numberReturned="2"')],
    [
      "wrong length unit",
      (xml: string) =>
        xml.replace("http://qudt.org/vocab/unit#Meter", "http://qudt.org/vocab/unit#Foot"),
    ],
    ["invalid date", (xml: string) => xml.replaceAll("2024-02-23T10:41:59Z", "not-a-date")],
    [
      "nonexistent calendar date",
      (xml: string) => xml.replaceAll("2024-02-23T10:41:59Z", "2024-02-31T10:41:59Z"),
    ],
    ["unknown entity", (xml: string) => xml.replace("Lillemølle Bæk", "&undeclared;")],
    ["invalid XML", (xml: string) => xml.replace("</wfs:FeatureCollection>", "")],
  ])("rejects %s", (_, mutate) => {
    expect(() => parseDatafordelerWatercourseGeometry(mutate(compact), ID)).toThrow();
  });

  it("rejects internal/external DTD before parsing and never expands entities", () => {
    for (const declaration of [
      '<!DOCTYPE x SYSTEM "https://evil.test/secret">',
      '<!DOCTYPE x [<!ENTITY e "expansion">]>',
    ]) {
      expect(() => parseDatafordelerWatercourseCollection(declaration + compact)).toThrow(
        "forbudte entiteter",
      );
    }
  });

  it("rejects excess bytes, vertices and nesting", () => {
    expect(() =>
      parseDatafordelerWatercourseCollection(
        " ".repeat(DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES + 1),
      ),
    ).toThrow();
    expect(() =>
      parseDatafordelerWatercourseGeometry(
        compact.replace(
          /<gml:posList>[\s\S]*?<\/gml:posList>/,
          `<gml:posList>${"55 9 ".repeat(20_001)}</gml:posList>`,
        ),
        ID,
      ),
    ).toThrow("punktgrænsen");
    expect(() =>
      parseDatafordelerWatercourseCollection("<a>".repeat(30) + "</a>".repeat(30)),
    ).toThrow();
  });

  it("fails exact-ID loading on different ID or incomplete/ambiguous result", () => {
    expect(() =>
      parseDatafordelerWatercourseGeometry(compact, "2233766a-1fdb-6b98-e053-d480220a5a3f"),
    ).toThrow("entydigt");
    expect(() =>
      parseDatafordelerWatercourseGeometry(
        compact.replace('numberMatched="1"', 'numberMatched="2"'),
        ID,
      ),
    ).toThrow("entydigt");
    expect(() =>
      parseDatafordelerWatercourseGeometry(
        compact.replace('numberMatched="1"', 'numberMatched="unknown"'),
        ID,
      ),
    ).toThrow("entydigt");
    const member = compact.match(/<wfs:member>[\s\S]*?<\/wfs:member>/)![0];
    const duplicated = compact
      .replace("</wfs:FeatureCollection>", `${member}</wfs:FeatureCollection>`)
      .replace('numberMatched="1"', 'numberMatched="2"')
      .replace('numberReturned="1"', 'numberReturned="2"');
    expect(() => parseDatafordelerWatercourseGeometry(duplicated, ID)).toThrow("flere versioner");
  });

  it("represents an empty search as empty data", () => {
    const empty = compact
      .replace(/<wfs:member>[\s\S]*?<\/wfs:member>/, "")
      .replace('numberMatched="1"', 'numberMatched="0"')
      .replace('numberReturned="1"', 'numberReturned="0"');
    expect(parseDatafordelerWatercourseCollection(empty)).toMatchObject({
      watercourses: [],
      numberMatched: 0,
      numberReturned: 0,
      paginationComplete: true,
    });
    expect(() => parseDatafordelerWatercourseGeometry(empty, ID)).toThrow("entydigt");
  });
});
