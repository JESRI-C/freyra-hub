import { describe, expect, it } from "vitest";
import { checkPostgisApiTypes } from "../../../scripts/check-postgis-api-types.mjs";
const schema = () => `type Json = string | null;
export type Database = {
 public: {
  Tables: {
   geo_features: { Row: { geom: unknown; name: string | null }; Relationships: [] };
   geo_observations: { Row: { geom: unknown; value: number | null }; Relationships: [] };
   project_areas: { Row: { geom: unknown; area_ha: number | null }; Relationships: [] };
  };
  Views: { [_ in never]: never };
  Functions: { get_project_geojson: { Args: { input_project_id: string }; Returns: Json } };
  Enums: { project_role: "viewer" | "field" };
  CompositeTypes: { [_ in never]: never };
 }
};`;
describe("PostGIS public client declarations", () => {
  it("accepts matching generated API declarations", () => {
    expect(checkPostgisApiTypes(schema(), schema())).toEqual([]);
  });
  it("ignores formatting, union order and the redundant null in unknown", () => {
    const formatted = schema()
      .replaceAll("string | null", "null | string")
      .replace("geom: unknown;", "geom: unknown | null;")
      .replace('"viewer" | "field"', '"field" | "viewer"');
    expect(checkPostgisApiTypes(schema(), formatted)).toEqual([]);
  });
  it("finds a removed reference table still advertised to the app", () => {
    const stale = schema().replace(
      "Tables: {",
      "Tables: { spatial_ref_sys: { Row: { srid: number } };",
    );
    expect(checkPostgisApiTypes(stale, schema()).join(" ")).toContain("spatial_ref_sys");
  });
  it("finds a removed PostGIS function still advertised to the app", () => {
    const stale = schema().replace(
      "Functions: {",
      "Functions: { st_astext: { Args: never; Returns: string };",
    );
    expect(checkPostgisApiTypes(stale, schema()).join(" ")).toContain("st_astext");
  });
  it("compares nullable scalar and geometry table properties", () => {
    const changed = schema().replace("area_ha: number | null", "area_ha: number");
    expect(checkPostgisApiTypes(schema(), changed)).toContain(
      "Tables.project_areas does not match the migrated database.",
    );
  });
  it("compares the app RPC arguments", () => {
    const changed = schema().replace("input_project_id: string", "input_project_id: number");
    expect(checkPostgisApiTypes(schema(), changed)).toContain(
      "Functions.get_project_geojson does not match the migrated database.",
    );
  });
  it("refuses missing schema categories", () => {
    expect(() => checkPostgisApiTypes("type Database = {};", schema())).toThrow();
  });
});
