import { describe, it, expect } from "vitest";
import {
  beregnKrediteretCO2,
  beregnVerifikationsgrad,
  beregnFosforBalance,
  bygSnapshot,
  tiltagValidering,
  klassificerDybde,
} from "../lavbundBeregning";
import { MOCK_PROJEKTER, MOCK_TRANSEKTER, MOCK_GROEFTER } from "@/data/lavbundMockData";
import type { VandstandsReading, LavbundsProjekt } from "@/types/lavbund";

const projekt = MOCK_PROJEKTER[0];

describe("beregnKrediteretCO2", () => {
  it("summerer areal og bruger tørveandel", () => {
    const r = beregnKrediteretCO2(projekt);
    expect(r.arealSum).toBeCloseTo(projekt.samletArealHa, 1);
    expect(r.arealTjek).toBe("ok");
    expect(r.krediteretTotal).toBeGreaterThan(0);
  });
  it("markerer arealtjek fejl når fordelingen afviger", () => {
    const brudt: LavbundsProjekt = {
      ...projekt,
      arealFordeling: [{ ...projekt.arealFordeling[0], hektar: 0.01 }],
    };
    expect(beregnKrediteretCO2(brudt).arealTjek).toBe("fejl");
  });
});

describe("tiltagValidering", () => {
  it("afviser projekt uden aktive tiltag", () => {
    const p: LavbundsProjekt = {
      ...projekt,
      tiltag: {
        draenAfbrydes: false,
        groefterTilkastes: false,
        vandloebsbundHaeves: false,
        overrislingszoner: false,
        pumpedriftStopper: false,
      },
    };
    expect(tiltagValidering(p).ok).toBe(false);
  });
  it("accepterer mindst ét aktivt tiltag", () => {
    expect(tiltagValidering(projekt).ok).toBe(true);
  });
});

describe("klassificerDybde + verifikationsgrad", () => {
  it("klassificerer 0.05 m som våd", () => {
    const k = klassificerDybde(0.05);
    expect(k.vaad).toBe(true);
  });
  it("tomt datasæt giver grad 0", () => {
    const r = beregnVerifikationsgrad([]);
    expect(r.verifikationsgrad).toBe(0);
    expect(r.antalMaalinger).toBe(0);
  });
  it("100% våde målinger giver grad 1.0", () => {
    const readings: VandstandsReading[] = Array.from({ length: 10 }, (_, i) => ({
      maalepunktId: "m1",
      tidspunkt: new Date(2026, 0, i + 1).toISOString(),
      dybdeM: 0.02,
      kilde: "manuel_pejling",
    }));
    const r = beregnVerifikationsgrad(readings);
    expect(r.verifikationsgrad).toBeCloseTo(1.0, 2);
  });
});

describe("beregnFosforBalance", () => {
  it("balance falder når EFTER-transekter og tilkastede grøfter reducerer erosion", () => {
    const projId = projekt.id;
    const foer = MOCK_TRANSEKTER.filter((t) => t.projektId === projId && t.fase === "foer");
    const efter = MOCK_TRANSEKTER.filter((t) => t.projektId === projId && t.fase === "efter");
    const g = MOCK_GROEFTER.filter((x) => x.projektId === projId);
    const b = beregnFosforBalance(foer, efter, g);
    expect(b.vandloebFoerKgAar).toBeGreaterThanOrEqual(0);
    expect(b.groefterEfterKgAar).toBeLessThanOrEqual(b.groefterFoerKgAar);
  });
});

describe("bygSnapshot", () => {
  it("inkluderer usageScope og faktorVersioner", () => {
    const snap = bygSnapshot({
      projekt,
      readings: [],
      transekterFoer: [],
      transekterEfter: [],
      groefter: [],
    });
    expect(snap.usageScope).toBe("tilskudsordning_klimaregnskab");
    expect(snap.faktorVersioner.co2).toBeTruthy();
    expect(snap.faktorVersioner.fosfor).toBeTruthy();
    expect(snap.co2.usikkerhedTotal).toBeCloseTo(snap.co2.verificeretTotal * 0.2, 5);
  });
});
