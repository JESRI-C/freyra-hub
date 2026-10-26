import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCadastralSource, parseCadastralGml } from "../cadastral-source.server";
import { baselineSha256 } from "../public-baseline-service";
import { PROJECT } from "./public-baseline.fixtures";
import type { GeoJSONPolygon } from "@/lib/supabase/types";

// Synthetic parcel near the synthetic test project; no actual cadastral record.
const pos = "501000 6100000 501100 6100000 501100 6100100 501000 6100100 501000 6100000";
function polygonXml(positions = pos, hole = "") {
  return `<gml:Polygon srsName="urn:ogc:def:crs:EPSG::25832"><gml:exterior><gml:LinearRing><gml:posList srsDimension="2" count="5">${positions}</gml:posList></gml:LinearRing></gml:exterior>${hole}</gml:Polygon>`;
}
function fixture(geometry = polygonXml(), matched = "1", returned = "1") {
  return `<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:mat="http://data.gov.dk/schemas/matrikel/1" numberMatched="${matched}" numberReturned="${returned}"><wfs:member><mat:Jordstykke_Gaeldende><mat:id.lokalId>synthetic-test-parcel</mat:id.lokalId><mat:matrikelnummer>TEST-1</mat:matrikelnummer><mat:ejerlavskode>000000</mat:ejerlavskode><mat:irrelevant>not-persisted</mat:irrelevant><mat:geometri>${geometry}</mat:geometri></mat:Jordstykke_Gaeldende></wfs:member></wfs:FeatureCollection>`;
}
const input = {
  polygon: PROJECT.geometry_polygon as GeoJSONPolygon,
  dateFrom: "2026-08-24",
  dateTo: "2026-08-24",
};
afterEach(() => vi.unstubAllEnvs());

describe("bounded official Matriklen2 GML source", () => {
  it("preserves holes and MultiSurface polygons and distinguishes incomplete pages", () => {
    const hole =
      "<gml:interior><gml:LinearRing><gml:posList>501020 6100020 501030 6100020 501030 6100030 501020 6100030 501020 6100020</gml:posList></gml:LinearRing></gml:interior>";
    const result = parseCadastralGml(
      fixture(
        `<gml:MultiSurface srsName="EPSG:25832"><gml:surfaceMember>${polygonXml(pos, hole)}</gml:surfaceMember><gml:surfaceMember>${polygonXml(pos.replaceAll("501", "502"))}</gml:surfaceMember></gml:MultiSurface>`,
        "2",
      ),
    );
    expect(result.complete).toBe(false);
    expect(result.parcels[0].geometry.type).toBe("MultiPolygon");
    expect(result.parcels[0].geometry.coordinates).toHaveLength(2);
    expect(result.parcels[0].geometry.coordinates[0]).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("not-persisted");
  });
  it.each([
    fixture().replace("http://data.gov.dk/schemas/matrikel/1", "https://untrusted.test"),
    fixture().replace("<mat:geometri>", '<mat:geometri xmlns:mat="https://untrusted.test">'),
    fixture().replace("urn:ogc:def:crs:EPSG::25832", "EPSG:4326"),
    fixture().replace('srsDimension="2"', 'srsDimension="3"'),
    fixture().replace('count="5"', 'count="6"'),
    fixture().replace('numberReturned="1"', 'numberReturned="2"'),
    fixture().replace('numberMatched="1"', 'numberMatched="0"'),
    fixture().replace("<gml:posList", '<gml:posList xlink:href="https://untrusted.test"'),
    fixture(polygonXml(pos.replace(/501000 6100000$/, "501001 6100000"))),
    '<!DOCTYPE x [<!ENTITY x "y">]>' + fixture(),
  ])("rejects ambiguous geometry, namespace, external references and false completeness", (xml) => {
    expect(() => parseCadastralGml(xml)).toThrow();
  });
  it("freezes current polygons and response hash without retaining server access or owner fields", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "private-fixture-key");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(fixture(), {
        headers: { "content-type": "application/gml+xml; version=3.2" },
      }),
    );
    const result = await fetchCadastralSource(input, { fetchImpl });
    expect(result).toMatchObject({
      mode: "live",
      status: "partial",
      coverage: {
        spatial: "complete",
        temporal: "unknown",
        paginationComplete: true,
        returnedCount: 1,
      },
    });
    expect(result.payload).toMatchObject({
      schema: "freyra.cadastral-polygons/v1",
      crs: "EPSG:4326",
      parcels: [{ parcelNumber: "TEST-1" }],
    });
    expect(result.payloadSha256).toBe(await baselineSha256(result.payload));
    expect(JSON.stringify(result)).not.toMatch(/private-fixture-key|not-persisted/);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get("typeNames")).toBe("mat:Jordstykke_Gaeldende");
    expect(url.searchParams.has("outputFormat")).toBe(false);
  });
  it("keeps missing access and unavailable or malformed responses unknown, never empty coverage", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    const fetchImpl = vi.fn();
    expect(await fetchCadastralSource(input, { fetchImpl })).toMatchObject({
      status: "not_configured",
      payload: null,
      coverage: { returnedCount: null },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.stubEnv("DATAFORDELER_API_KEY", "private-fixture-key");
    fetchImpl.mockResolvedValue(
      new Response("private-fixture-key", { headers: { "content-type": "application/gml+xml" } }),
    );
    const result = await fetchCadastralSource(input, { fetchImpl });
    expect(result).toMatchObject({
      status: "failed",
      payload: null,
      coverage: { spatial: "unknown", returnedCount: null },
    });
    expect(JSON.stringify(result)).not.toContain("private-fixture-key");
  });
});
