import { describe, it, expect } from "vitest";
import {
  featureExternalId,
  toFeatureCollection,
  buildGeoFeatureRows,
  buildNatureContextRow,
  type RawWfsFeature,
} from "@/services/nature-geo-transform";

const POINT = { type: "Point", coordinates: [9.5, 55.3] };

describe("featureExternalId", () => {
  it("bruger feature.id når det findes", () => {
    expect(featureExternalId({ id: "p3_eng.42" }, "p3_eng", 0)).toBe("p3_eng:p3_eng.42");
  });

  it("falder tilbage til objekt_id fra properties", () => {
    expect(featureExternalId({ properties: { objekt_id: "abc-123" } }, "vandloeb", 5)).toBe(
      "vandloeb:abc-123",
    );
  });

  it("bruger indeks som sidste udvej", () => {
    expect(featureExternalId({}, "p3_soe", 7)).toBe("p3_soe:idx-7");
  });
});

describe("toFeatureCollection", () => {
  it("normaliserer features og tilføjer ekstra properties", () => {
    const raw: RawWfsFeature[] = [
      { id: "a", properties: { navn: "Engen" }, geometry: POINT },
      { id: "b", properties: {}, geometry: null }, // uden geometri — filtreres fra
    ];
    const fc = toFeatureCollection(raw, { idPrefix: "p3_eng", extraProperties: { natureType: "Eng" } });
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].id).toBe("p3_eng:a");
    expect(fc.features[0].properties).toMatchObject({ navn: "Engen", natureType: "Eng" });
  });
});

describe("buildGeoFeatureRows", () => {
  it("mapper features til geo_features-rækker med dedupe-nøgle", () => {
    const fc = toFeatureCollection(
      [{ id: "x1", properties: { navn: "Åen" }, geometry: POINT }],
      { idPrefix: "vandloeb", extraProperties: { natureType: "Vandløb" } },
    );
    const rows = buildGeoFeatureRows("layer-uuid", fc, "watercourse");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      layer_id: "layer-uuid",
      external_id: "vandloeb:x1",
      name: "Åen",
      feature_type: "watercourse",
    });
    expect(rows[0].geojson).toBeTruthy();
  });
});

describe("buildNatureContextRow", () => {
  it("afleder kontekstfelter af naturdata", () => {
    const row = buildNatureContextRow("proj-1", {
      paragraph3AreasHa: 2.4,
      natureTypes: ["Eng", "Mose"],
      watercourseCount: 3,
      nearestWatercourseM: 120,
      natura2000WithinM: 900,
      natura2000Name: "Lillebælt",
    });
    expect(row).toMatchObject({
      project_id: "proj-1",
      adjacent_nature_type: "Eng, Mose",
      watercourse_present: true,
      distance_to_watercourse_m: 120,
      protected_nature_present: true,
      protected_nature_type: "Eng",
      natura2000_nearby: true,
      distance_to_natura2000_m: 900,
    });
  });

  it("markerer fravær korrekt", () => {
    const row = buildNatureContextRow("proj-2", {
      paragraph3AreasHa: 0,
      natureTypes: [],
      watercourseCount: 0,
      nearestWatercourseM: null,
      natura2000WithinM: null,
      natura2000Name: null,
    });
    expect(row.watercourse_present).toBe(false);
    expect(row.protected_nature_present).toBe(false);
    expect(row.natura2000_nearby).toBe(false);
    expect(row.adjacent_nature_type).toBeNull();
  });
});

describe("isOpenDataLiveEnabled", () => {
  it("er slået til som standard og fra ved eksplicit falsk", async () => {
    const { isOpenDataLiveEnabled } = await import("@/lib/nature-geo.functions");
    expect(isOpenDataLiveEnabled({})).toBe(true);
    expect(isOpenDataLiveEnabled({ VITE_ENABLE_LIVE_DATA: "true" })).toBe(true);
    expect(isOpenDataLiveEnabled({ VITE_ENABLE_LIVE_DATA: "false" })).toBe(false);
    expect(isOpenDataLiveEnabled({ ENABLE_LIVE_DATA: "0" })).toBe(false);
    expect(isOpenDataLiveEnabled({ ENABLE_LIVE_DATA: "off" })).toBe(false);
    // ENABLE_LIVE_DATA har forrang over VITE_-varianten
    expect(isOpenDataLiveEnabled({ ENABLE_LIVE_DATA: "true", VITE_ENABLE_LIVE_DATA: "false" })).toBe(true);
  });
});
