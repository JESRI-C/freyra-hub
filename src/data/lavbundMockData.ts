// Mock-data til LavbundsMRV. Al adgang GÅR gennem lavbundService.
import type {
  Afvigelse,
  BeregningsSnapshot,
  GroeftStraekning,
  LavbundsProjekt,
  LedgerPost,
  Maalepunkt,
  Transekt,
  VandstandsReading,
} from "@/types/lavbund";

const IGEN: Afvigelse[] = [];

export const MOCK_PROJEKTER: LavbundsProjekt[] = [
  {
    id: "petersminde-mose",
    navn: "Petersminde Mose",
    kommune: "Næstved",
    status: "maaling",
    samletArealHa: 21.4,
    arealFordeling: [
      { kulstofklasse: ">12", arealanvendelse: "Omdrift", buffer: true, hektar: 21.4 },
    ],
    tiltag: {
      draenAfbrydes: true,
      groefterTilkastes: true,
      vandloebsbundHaeves: false,
      overrislingszoner: false,
      pumpedriftStopper: true,
    },
    publiceretExAnteTonPrHa: 17.5,
    vandspejlFoerM: 1.1,
    usageScope: "tilskudsordning_klimaregnskab",
    afvigelser: IGEN,
  },
  {
    id: "haeggerup-mose",
    navn: "Hæggerup Mose",
    kommune: "Næstved",
    status: "verificeret",
    samletArealHa: 11.7,
    arealFordeling: [
      { kulstofklasse: ">12", arealanvendelse: "Permanent græs", buffer: false, hektar: 8.2 },
      { kulstofklasse: "6-12", arealanvendelse: "Natur", buffer: false, hektar: 3.5 },
    ],
    tiltag: {
      draenAfbrydes: true,
      groefterTilkastes: false,
      vandloebsbundHaeves: true,
      overrislingszoner: false,
      pumpedriftStopper: false,
    },
    publiceretExAnteTonPrHa: 21.3,
    vandspejlFoerM: 0.9,
    usageScope: "tilskudsordning_klimaregnskab",
    afvigelser: IGEN,
  },
  {
    id: "ringfenner",
    navn: "Ringfenner",
    kommune: "Aabenraa",
    status: "etablering",
    samletArealHa: 344.9,
    arealFordeling: [
      { kulstofklasse: ">12", arealanvendelse: "Omdrift", buffer: true, hektar: 120.0 },
      { kulstofklasse: ">12", arealanvendelse: "Permanent græs", buffer: false, hektar: 140.0 },
      { kulstofklasse: "6-12", arealanvendelse: "Natur", buffer: false, hektar: 84.9 },
    ],
    tiltag: {
      draenAfbrydes: true,
      groefterTilkastes: true,
      vandloebsbundHaeves: false,
      overrislingszoner: true,
      pumpedriftStopper: false,
    },
    publiceretExAnteTonPrHa: 24.0,
    vandspejlFoerM: 1.3,
    usageScope: "tilskudsordning_klimaregnskab",
    afvigelser: [
      {
        id: "af-1",
        beskrivelse: "Delområde øst: vandspejl over mål efter 6 mdr.",
        korrigerendeHandling: "Supplerende grøftelukning planlagt Q2.",
        aaben: true,
      },
    ],
  },
  {
    id: "vorslunde",
    navn: "Vorslunde",
    kommune: "Vejle",
    status: "planlagt",
    samletArealHa: 415.3,
    arealFordeling: [
      { kulstofklasse: "6-12", arealanvendelse: "Omdrift", buffer: false, hektar: 260.0 },
      { kulstofklasse: "6-12", arealanvendelse: "Permanent græs", buffer: true, hektar: 155.3 },
    ],
    tiltag: {
      draenAfbrydes: true,
      groefterTilkastes: true,
      vandloebsbundHaeves: false,
      overrislingszoner: false,
      pumpedriftStopper: false,
    },
    torvAndel: 0.55,
    publiceretExAnteTonPrHa: 9.6,
    vandspejlFoerM: 1.0,
    usageScope: "tilskudsordning_klimaregnskab",
    afvigelser: IGEN,
  },
];

// ── Målepunkter og readings (24 mdr syntetiske data) ───────────────────────
export const MOCK_MAALEPUNKTER: Maalepunkt[] = MOCK_PROJEKTER.flatMap((p, pi) =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `${p.id}-mp-${i + 1}`,
    projektId: p.id,
    type: i < 3 ? ("kanal_logger" as const) : ("markpejling" as const),
    position: { x: 20 + i * 15 + pi * 3, y: 25 + ((i * 17) % 40) },
    intensiteter:
      i === 0
        ? (["minimal", "standard", "intensiv"] as const).slice()
        : i < 3
          ? (["standard", "intensiv"] as const).slice()
          : (["intensiv"] as const).slice(),
  })),
);

function genererReadings(p: LavbundsProjekt, mps: Maalepunkt[]): VandstandsReading[] {
  const rows: VandstandsReading[] = [];
  const start = new Date();
  start.setMonth(start.getMonth() - 24);
  for (const mp of mps) {
    for (let m = 0; m < 24; m++) {
      const rampe = Math.min(1, m / 6);
      const seson = Math.sin(((m % 12) / 12) * Math.PI * 2) * 0.11;
      const dybde = p.vandspejlFoerM - (p.vandspejlFoerM - 0.35) * rampe + seson;
      const d = new Date(start);
      d.setMonth(d.getMonth() + m);
      rows.push({
        maalepunktId: mp.id,
        tidspunkt: d.toISOString(),
        dybdeM: Math.max(0.05, dybde),
        kilde: mp.type === "kanal_logger" ? "hobo_logger" : "manuel_pejling",
      });
    }
  }
  return rows;
}

export const MOCK_READINGS: VandstandsReading[] = MOCK_PROJEKTER.flatMap((p) => {
  const mps = MOCK_MAALEPUNKTER.filter((m) => m.projektId === p.id);
  return genererReadings(p, mps);
});

// ── Transekter (FØR/EFTER) og grøfter ──────────────────────────────────────
export const MOCK_TRANSEKTER: Transekt[] = MOCK_PROJEKTER.flatMap((p) => {
  const antal = 6;
  const rows: Transekt[] = [];
  for (let i = 0; i < antal; i++) {
    const base = {
      projektId: p.id,
      landskabstype: (i % 2 === 0 ? "moraene" : "hedeslette") as const,
      vandloebsType: ((i % 3) + 1) as 1 | 2 | 3,
      georegion: (((i * 2) % 8) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
      vandloebsform: (i % 2 === 0 ? "slynget" : "udrettet") as const,
      laengdeM: 1200 + i * 200,
    };
    rows.push({
      nr: i + 1,
      fase: "foer",
      ...base,
      hoejVegetationSide1: 0.1,
      hoejVegetationSide2: 0.15,
      brinkHoejdeSide1M: 1.45,
      brinkHoejdeSide2M: 1.3,
      brinkLaengdeSide1M: 1.45,
      brinkLaengdeSide2M: 1.4,
    });
    rows.push({
      nr: i + 1,
      fase: "efter",
      ...base,
      hoejVegetationSide1: 0.55,
      hoejVegetationSide2: 0.5,
      brinkHoejdeSide1M: 1.1,
      brinkHoejdeSide2M: 1.0,
      brinkLaengdeSide1M: 1.6,
      brinkLaengdeSide2M: 1.55,
    });
  }
  return rows;
});

export const MOCK_GROEFTER: GroeftStraekning[] = MOCK_PROJEKTER.flatMap((p) =>
  Array.from({ length: 4 }, (_, i) => ({
    id: `${p.id}-groft-${i + 1}`,
    projektId: p.id,
    laengdeM: 220 + i * 80,
    brinkHoejdeM: 0.6 + (i % 3) * 0.15,
    tilkastet: p.tiltag.groefterTilkastes && i < 3,
  })),
);

// ── Ledger og snapshots ────────────────────────────────────────────────────
export const MOCK_LEDGER: Record<string, LedgerPost[]> = Object.fromEntries(
  MOCK_PROJEKTER.map((p) => [p.id, [] as LedgerPost[]]),
);

export const MOCK_SNAPSHOTS: Record<string, BeregningsSnapshot | undefined> = {};
