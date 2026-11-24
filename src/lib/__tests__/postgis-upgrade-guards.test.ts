import { describe, expect, it } from "vitest";
import {
  assertPostgisProbeTarget,
  canonicalPostgisDump,
} from "../../../scripts/postgis-upgrade/guards.mjs";

const local = {
  ci: "true",
  args: ["--disposable-local"],
  apiUrl: "http://127.0.0.1:54321",
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

describe("disposable PostGIS probe target", () => {
  it("accepts only the explicit CI loopback stack", () => {
    expect(assertPostgisProbeTarget(local)).toBe(local.databaseUrl);
  });
  it.each([
    { ci: undefined },
    { ci: "false" },
    { args: [] },
    { args: ["--linked"] },
    { args: ["--disposable-local", "--linked"] },
    { apiUrl: "https://example.supabase.co" },
    { apiUrl: "http://127.0.0.1:54321.example.test" },
    { databaseUrl: "postgresql://postgres:postgres@db.example.test:54322/postgres" },
    { databaseUrl: "postgresql://postgres:postgres@localhost:54322/postgres" },
    { databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54323/postgres" },
    { databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/other" },
    { databaseUrl: local.databaseUrl + "?hostaddr=203.0.113.1" },
  ])("rejects an unverified or overridden target %#", (override) => {
    expect(() => assertPostgisProbeTarget({ ...local, ...override })).toThrow();
  });
});

const dump = (rows = ["b\tfalse\t0", "a\ttrue\t1"]) =>
  [
    "\\restrict RANDOM_BEFORE",
    "COPY public.geo_features (id, checked, count) FROM stdin;",
    ...rows,
    "\\.",
    "COPY public.geo_observations (id) FROM stdin;",
    "c",
    "\\.",
    "COPY public.project_areas (id) FROM stdin;",
    "d",
    "\\.",
    "\\unrestrict RANDOM_BEFORE",
    "",
  ].join("\n");

describe("independent pg_dump comparison", () => {
  it("ignores only random guards and physical COPY row order", () => {
    const after = dump(["a\ttrue\t1", "b\tfalse\t0"]).replaceAll("RANDOM_BEFORE", "RANDOM_AFTER");
    expect(canonicalPostgisDump(dump(), "data")).toBe(canonicalPostgisDump(after, "data"));
  });
  it("preserves actual values and backslash records inside COPY", () => {
    const before = dump(["b\tfalse\t0", "\\restrict literal", "a\tpublic.geometry(Point,4326)"]);
    expect(canonicalPostgisDump(before, "data")).toContain("\\restrict literal");
    expect(canonicalPostgisDump(before, "data")).toContain("public.geometry(Point,4326)");
    expect(canonicalPostgisDump(before, "data")).not.toBe(
      canonicalPostgisDump(before.replace("b\tfalse\t0", "b\ttrue\t0"), "data"),
    );
  });
  it("permits the intended geometry namespace change without ignoring grants", () => {
    const before =
      "geom public.geometry(Point,4326)\nGRANT SELECT ON public.geo_features TO authenticated;";
    const after = before.replace("public.geometry(", "extensions.geometry(");
    expect(canonicalPostgisDump(before, "schema")).toBe(canonicalPostgisDump(after, "schema"));
    expect(canonicalPostgisDump(after, "schema")).not.toBe(
      canonicalPostgisDump(after.replace("GRANT SELECT", "GRANT ALL"), "schema"),
    );
  });
  it.each([
    dump().replace("COPY public.geo_features", "COPY public.unchecked"),
    dump().replace("COPY public.geo_observations", "COPY public.geo_features"),
    dump().replace("d\n\\.", "d"),
    "COPY public.geo_features (id) FROM stdin;\na\n\\.\n",
  ])("refuses incomplete or unscoped table data %#", (text) => {
    expect(() => canonicalPostgisDump(text, "data")).toThrow();
  });
});
