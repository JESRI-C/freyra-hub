// VERIFIKATION: Motorens faktorer skal være IDENTISKE med referenceværdierne
// udlæst fra de officielle beregningsark (docs/kilder/lavbund/). Fejler denne
// test, afviger koden fra statens grundlag — og må ikke merges.
//
// Kæden: officielt ark → lavbund-faktor-referencer.json (denne test: kode ==
// reference) → scripts/verify-lavbund-faktorer.mjs (ark == reference).
import { describe, it, expect } from "vitest";
import referencer from "@/data/lavbund-faktor-referencer.json";
import {
  CO2_FAKTORER,
  P_EROSION,
  P_SLOPE,
  P_TRAE,
  P_GEO,
  FAKTOR_VERSIONER,
} from "@/data/lavbundFaktorer";
import type { Arealanvendelse, Kulstofklasse } from "@/types/lavbund";

describe("CO2-faktorer == officielt beregningsark v12", () => {
  const ref = referencer.co2.udenBuffer as Record<string, Record<string, number>>;

  it("matcher alle 12 celler (kulstofklasse × arealanvendelse)", () => {
    for (const klasse of Object.keys(ref) as Kulstofklasse[]) {
      for (const anvendelse of Object.keys(ref[klasse]) as Arealanvendelse[]) {
        expect(CO2_FAKTORER[klasse][anvendelse], `${klasse} / ${anvendelse}`).toBe(
          ref[klasse][anvendelse],
        );
      }
    }
  });

  it("versionsstemplet nævner v12", () => {
    expect(FAKTOR_VERSIONER.co2).toContain("v12");
  });
});

describe("Fosfor-faktorer == officielt regneark maj 2024 (DCE-263)", () => {
  it("Tabel 2 — brinkerosionsrater", () => {
    const ref = referencer.fosfor.tabel2_erosion_mm_aar;
    for (const form of ["udrettet", "slynget"] as const) {
      for (const landskab of ["hedeslette", "moraene"] as const) {
        for (const type of [1, 2, 3] as const) {
          expect(P_EROSION[form][landskab][type], `${form}/${landskab}/type${type}`).toBe(
            ref[form][landskab][String(type) as "1" | "2" | "3"],
          );
        }
      }
    }
  });

  it("Tabel 3 — hældningskorrektion", () => {
    const ref = referencer.fosfor.tabel3_haeldning;
    for (const landskab of ["hedeslette", "moraene"] as const) {
      for (const [anlaeg, v] of Object.entries(ref[landskab])) {
        expect(P_SLOPE[landskab][anlaeg as keyof (typeof P_SLOPE)["hedeslette"]], `${landskab}/${anlaeg}`).toBe(v);
      }
    }
  });

  it("Tabel 4 — vegetationskorrektion", () => {
    const ref = referencer.fosfor.tabel4_vegetation;
    for (const landskab of ["hedeslette", "moraene"] as const) {
      for (const type of [1, 2, 3] as const) {
        expect(P_TRAE[landskab][type], `${landskab}/type${type}`).toBe(
          ref[landskab][String(type) as "1" | "2" | "3"],
        );
      }
    }
  });

  it("Tabel 5 — fosforindhold pr. georegion 1-9", () => {
    const ref = referencer.fosfor.tabel5_fosfor_kg_p_m3 as Record<string, number>;
    for (let region = 1; region <= 9; region++) {
      expect(P_GEO[region], `georegion ${region}`).toBe(ref[String(region)]);
    }
  });
});
