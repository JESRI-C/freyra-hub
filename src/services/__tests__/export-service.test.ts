import { describe, it, expect } from "vitest";
import { buildCsv, buildZonesCsv } from "../export-service";
import type { Zone } from "@/services/zones-service";

const ZONE: Zone = {
  id: "z1",
  project_id: "p1",
  name: "Zone A — Vandløb",
  area_type: "watercourse",
  area_ha: 1.4,
  created_at: "2026-05-01T08:00:00Z",
  geojson: {
    type: "Polygon",
    coordinates: [
      [
        [9.4821, 55.2514],
        [9.4826, 55.2514],
        [9.4826, 55.252],
        [9.4821, 55.2514],
      ],
    ],
  },
};

describe("buildCsv", () => {
  it("escaper semikolon og citationstegn", () => {
    const csv = buildCsv([{ navn: 'Zone "A"; nord', tal: 1.4 }], ["navn", "tal"]);
    expect(csv).toContain('"Zone ""A""; nord"');
  });

  it("starter med BOM for Excel-kompatibilitet", () => {
    const csv = buildCsv([{ a: "æøå" }], ["a"]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("tomme værdier bliver tomme felter", () => {
    const csv = buildCsv([{ a: null, b: undefined, c: "x" }], ["a", "b", "c"]);
    expect(csv.split("\n")[1]).toBe(";;x");
  });

  it("neutraliserer regnearksformler i tekst men bevarer negative tal", () => {
    const csv = buildCsv(
      [{ navn: '=HYPERLINK("https://example.invalid")', tal: -2 }],
      ["navn", "tal"],
    );
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv.split("\n")[1]).toContain(";-2");
  });
});

describe("buildZonesCsv", () => {
  it("indeholder zonenavn, type-label og areal", () => {
    const csv = buildZonesCsv([ZONE]);
    expect(csv).toContain("Zone A — Vandløb");
    expect(csv).toContain("Vandløb / Sø");
    expect(csv).toContain("1.4");
  });
});
