import { describe, expect, it } from "vitest";
import {
  OfficialWatercourseSourceError,
  buildOfficialWatercourseGeometryUrl,
  buildOfficialWatercourseSearchUrl,
  parseOfficialWatercourseGeometry,
  parseOfficialWatercourseSuggestions,
  searchOfficialWatercourses,
} from "@/services/geospatial/official-watercourse-source";

const BYKAER_ID = "1233766a-1fdb-6b98-e053-d480220a5a3f";

describe("official watercourse endpoint allowlist", () => {
  it("keeps the host and path fixed while encoding the search text", () => {
    const url = new URL(buildOfficialWatercourseSearchUrl("Bykær Bæk&request=evil"));
    expect(url.origin).toBe("https://api.dataforsyningen.dk");
    expect(url.pathname).toBe("/stednavne2");
    expect(url.searchParams.get("q")).toBe("Bykær Bæk&request=evil");
    expect(url.searchParams.get("per_side")).toBe("20");
    expect([...url.searchParams.keys()].sort()).toEqual(["fuzzy", "per_side", "q"]);
  });

  it("only accepts a UUID as geometry path segment", () => {
    const url = new URL(buildOfficialWatercourseGeometryUrl(BYKAER_ID));
    expect(url.pathname).toBe(`/steder/${BYKAER_ID}`);
    expect(url.searchParams.get("format")).toBe("geojson");
    expect(url.searchParams.get("srid")).toBe("4326");
    expect(() => buildOfficialWatercourseGeometryUrl("../admin?all=true")).toThrow(
      OfficialWatercourseSourceError,
    );
  });

  it("stops reading an upstream body once the response limit is exceeded", async () => {
    const oversizedFetch = async () =>
      new Response("x".repeat(2_000_001), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(
      searchOfficialWatercourses("Bykær Bæk", oversizedFetch as typeof fetch),
    ).rejects.toThrow("Dataforsyningens svar er for stort");
  });
});

describe("parseOfficialWatercourseSuggestions", () => {
  it("keeps official watercourse results and drops other place types", () => {
    const result = parseOfficialWatercourseSuggestions([
      {
        navn: "Bykær Bæk",
        navnestatus: "officielt",
        sted: {
          id: BYKAER_ID,
          hovedtype: "Vandløb",
          undertype: "vandløb",
          visueltcenter: [9.269, 55.354],
          bbox: [9.251, 55.338, 9.272, 55.372],
          geo_ændret: "2026-05-04T22:02:01.427Z",
          kommuner: [{ navn: "Haderslev" }],
        },
      },
      {
        navn: "Bykærvej",
        sted: {
          id: "2233766a-1fdb-6b98-e053-d480220a5a3f",
          hovedtype: "Vej",
        },
      },
    ]);

    expect(result).toEqual([
      {
        id: BYKAER_ID,
        name: "Bykær Bæk",
        nameStatus: "officielt",
        municipalities: ["Haderslev"],
        center: { lng: 9.269, lat: 55.354 },
        bbox: [9.251, 55.338, 9.272, 55.372],
        modifiedAt: "2026-05-04T22:02:01.427Z",
      },
    ]);
  });

  it("rejects a non-array upstream payload", () => {
    expect(() => parseOfficialWatercourseSuggestions({ error: "html proxy" })).toThrow(
      OfficialWatercourseSourceError,
    );
  });
});

describe("parseOfficialWatercourseGeometry", () => {
  const payload = {
    type: "Feature",
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [9.251, 55.338],
          [9.26, 55.35],
        ],
        [
          [9.26, 55.35],
          [9.271, 55.371],
        ],
      ],
    },
    properties: {
      id: BYKAER_ID,
      hovedtype: "Vandløb",
      primærtnavn: "Bykær Bæk",
      primærnavnestatus: "officielt",
      geo_ændret: "2026-05-04T22:02:01.427Z",
      geo_version: 1,
      visueltcenter_x: 9.269,
      visueltcenter_y: 55.354,
    },
  };

  it("normalizes a MultiLineString and derives bounded provenance statistics", () => {
    const result = parseOfficialWatercourseGeometry(payload, BYKAER_ID);
    expect(result.name).toBe("Bykær Bæk");
    expect(result.geometry.type).toBe("MultiLineString");
    expect(result.segmentCount).toBe(2);
    expect(result.vertexCount).toBe(4);
    expect(result.lengthM).toBeGreaterThan(3_000);
    expect(result.bbox).toEqual([9.251, 55.338, 9.271, 55.371]);
    expect(result.center).toEqual({ lng: 9.269, lat: 55.354 });
    expect(result.sourceUrl).toContain(BYKAER_ID);
  });

  it("normalizes a single LineString to the canonical MultiLineString shape", () => {
    const result = parseOfficialWatercourseGeometry(
      {
        ...payload,
        geometry: { type: "LineString", coordinates: payload.geometry.coordinates[0] },
      },
      BYKAER_ID,
    );
    expect(result.geometry.coordinates).toHaveLength(1);
  });

  it("rejects source-id mismatch, non-lines, and coordinates outside Denmark", () => {
    expect(() =>
      parseOfficialWatercourseGeometry(
        { ...payload, properties: { ...payload.properties, id: crypto.randomUUID() } },
        BYKAER_ID,
      ),
    ).toThrow(OfficialWatercourseSourceError);
    expect(() =>
      parseOfficialWatercourseGeometry(
        { ...payload, geometry: { type: "Polygon", coordinates: [] } },
        BYKAER_ID,
      ),
    ).toThrow(OfficialWatercourseSourceError);
    expect(() =>
      parseOfficialWatercourseGeometry(
        {
          ...payload,
          geometry: {
            type: "LineString",
            coordinates: [
              [1, 1],
              [2, 2],
            ],
          },
        },
        BYKAER_ID,
      ),
    ).toThrow(OfficialWatercourseSourceError);
  });
});
