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

describe("beregnOpnaaelse — lovet vs. målt", () => {
  it("bruger statens publicerede ex-ante som 'lovet' når det findes", async () => {
    const { beregnOpnaaelse } = await import("@/services/lavbundBeregning");
    const o = beregnOpnaaelse(
      { publiceretExAnteTonPrHa: 20, samletArealHa: 10 },
      180, // v12-genberegning (sekundær)
      170,
    );
    expect(o.lovetTotal).toBe(200); // 20 t/ha × 10 ha
    expect(o.lovetKilde).toBe("publiceret_ex_ante");
    expect(o.procent).toBe(85);
  });

  it("falder tilbage til v12-genberegningen uden publiceret tal", async () => {
    const { beregnOpnaaelse } = await import("@/services/lavbundBeregning");
    const o = beregnOpnaaelse({ samletArealHa: 10 }, 180, 90);
    expect(o.lovetTotal).toBe(180);
    expect(o.lovetKilde).toBe("genberegnet_v12");
    expect(o.procent).toBe(50);
  });

  it("håndterer nul-lovet uden division-by-zero", async () => {
    const { beregnOpnaaelse } = await import("@/services/lavbundBeregning");
    expect(beregnOpnaaelse({ samletArealHa: 0 }, 0, 0).procent).toBe(0);
  });
});

describe("baseline før/efter etablering (statens N/P-protokol-mønster)", () => {
  const r = (t: string, d: number) =>
    ({ maalepunktId: "MP", tidspunkt: t, dybdeM: d, kilde: "manuel_pejling" as const });

  it("splitVedEtablering deler korrekt og er bagudkompatibel uden dato", async () => {
    const { splitVedEtablering } = await import("@/services/lavbundBeregning");
    const readings = [r("2025-01-15T00:00:00Z", 1.2), r("2025-06-15T00:00:00Z", 0.3)];
    const s = splitVedEtablering(readings, "2025-03-01");
    expect(s.baseline).toHaveLength(1);
    expect(s.efter).toHaveLength(1);
    const uden = splitVedEtablering(readings);
    expect(uden.baseline).toHaveLength(0);
    expect(uden.efter).toHaveLength(2);
  });

  it("verifikationsgraden tæller kun efter-målinger når dato er sat", async () => {
    const { beregnVerifikationsgrad } = await import("@/services/lavbundBeregning");
    // Tørre baseline-målinger (1,2 m = Mark) + våde efter-målinger (0,3 m = Våd eng)
    const readings = [
      r("2025-01-01T00:00:00Z", 1.2),
      r("2025-01-02T00:00:00Z", 1.2),
      r("2025-06-01T00:00:00Z", 0.3),
      r("2025-06-02T00:00:00Z", 0.3),
    ];
    const uden = beregnVerifikationsgrad(readings);
    const med = beregnVerifikationsgrad(readings, "2025-03-01");
    expect(uden.verifikationsgrad).toBeCloseTo(0.5, 5); // halvdelen våd
    expect(med.verifikationsgrad).toBeCloseTo(1.0, 5); // kun efter-målinger, alle våde
    expect(med.antalMaalinger).toBe(2);
  });

  it("skillet er LOKAL midnat — nattetimer på etableringsdagen er 'efter'", async () => {
    const { splitVedEtablering } = await import("@/services/lavbundBeregning");
    // En logger-måling kl. 00:30 lokal tid på selve etableringsdagen. Med et
    // UTC-midnatsskille ville den (i UTC+1/+2) fejlklassificeres som baseline.
    const paaDagen = new Date(2025, 5, 1, 0, 30).toISOString(); // 1. jun 2025 00:30 lokal
    const foerDagen = new Date(2025, 4, 31, 23, 30).toISOString(); // 31. maj 23:30 lokal
    const s = splitVedEtablering([r(paaDagen, 0.3), r(foerDagen, 1.2)], "2025-06-01");
    expect(s.efter).toHaveLength(1);
    expect(s.efter[0].tidspunkt).toBe(paaDagen);
    expect(s.baseline).toHaveLength(1);
  });

  it("beregnMetodeStat opgør periode, kilder og baseline/efter i samme skille", async () => {
    const { beregnMetodeStat } = await import("@/services/lavbundBeregning");
    const readings = [
      r("2025-01-01T12:00:00Z", 1.2),
      r("2025-01-02T12:00:00Z", 1.0),
      r("2025-06-01T12:00:00Z", 0.3),
      { ...r("2025-06-02T12:00:00Z", 0.5), kilde: "hobo_logger" as const },
    ];
    const m = beregnMetodeStat(readings, "2025-03-01");
    expect(m.antal).toBe(4);
    expect(m.foersteTidspunkt).toBe("2025-01-01T12:00:00Z");
    expect(m.senesteTidspunkt).toBe("2025-06-02T12:00:00Z");
    expect(m.kilder).toEqual(
      expect.arrayContaining([
        { kilde: "manuel_pejling", antal: 3 },
        { kilde: "hobo_logger", antal: 1 },
      ]),
    );
    expect(m.baseline.antal).toBe(2);
    expect(m.baseline.middelDybdeM).toBeCloseTo(1.1, 5);
    expect(m.efter.antal).toBe(2);
    expect(m.efter.middelDybdeM).toBeCloseTo(0.4, 5);
    // Uden dato: alt er "efter"
    const uden = beregnMetodeStat(readings);
    expect(uden.baseline.antal).toBe(0);
    expect(uden.efter.antal).toBe(4);
  });
});
