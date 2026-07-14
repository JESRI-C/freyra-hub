// Rene beregningsfunktioner for LavbundsMRV. Ingen DOM/React.
import {
  AFVANDINGSKLASSER,
  CO2_FAKTORER,
  FAKTOR_VERSIONER,
  P_EROSION,
  P_GEO,
  P_SLOPE,
  P_TRAE,
  type SlopeKey,
} from "@/data/lavbundFaktorer";
import type {
  BeregningsSnapshot,
  GroeftStraekning,
  LavbundsProjekt,
  Transekt,
  VandstandsReading,
} from "@/types/lavbund";

const AREAL_TOL = 0.05;

export interface CO2Resultat {
  ok: boolean;
  krediteretTonPrHa: number;
  krediteretTotal: number;
  arealSum: number;
  arealTjek: "ok" | "fejl";
}

export function beregnKrediteretCO2(projekt: LavbundsProjekt): CO2Resultat {
  const torv = projekt.torvAndel ?? 1;
  let total = 0;
  let arealSum = 0;
  for (const row of projekt.arealFordeling) {
    arealSum += row.hektar;
    const base = CO2_FAKTORER[row.kulstofklasse][row.arealanvendelse];
    const buf = row.buffer ? 0.5 : 1;
    total += row.hektar * base * buf * torv;
  }
  const arealTjek: "ok" | "fejl" =
    Math.abs(arealSum - projekt.samletArealHa) <= AREAL_TOL ? "ok" : "fejl";
  const perHa = projekt.samletArealHa > 0 ? total / projekt.samletArealHa : 0;
  return {
    ok: arealTjek === "ok",
    krediteretTonPrHa: perHa,
    krediteretTotal: total,
    arealSum,
    arealTjek,
  };
}

export interface TiltagValidering {
  ok: boolean;
  besked?: string;
}

export function tiltagValidering(projekt: LavbundsProjekt): TiltagValidering {
  const antal = Object.values(projekt.tiltag).filter(Boolean).length;
  if (antal === 0) {
    return {
      ok: false,
      besked:
        "Uden aktiv udtagning kan effekten ikke krediteres (jf. v12-vejledningen)",
    };
  }
  return { ok: true };
}

export function klassificerDybde(dybdeM: number): (typeof AFVANDINGSKLASSER)[number] {
  for (const k of AFVANDINGSKLASSER) {
    if (dybdeM <= k.max) return k;
  }
  return AFVANDINGSKLASSER[AFVANDINGSKLASSER.length - 1];
}

export interface VerifikationsResultat {
  verifikationsgrad: number;
  fordeling: Record<string, number>;
  antalMaalinger: number;
}

/**
 * Skilletidspunkt for etableringsdatoen ('YYYY-MM-DD') som LOKAL midnat.
 * Date.parse på en ren dato giver UTC-midnat, men målingernes tidsstempler
 * stammer fra danske lokaltider — UTC-skillet ville fejlklassificere
 * nattetimerne på selve etableringsdagen som baseline.
 */
function etableringsSkille(etableringsdato?: string): number | null {
  if (!etableringsdato) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(etableringsdato);
  if (!m) {
    const t = Date.parse(etableringsdato);
    return Number.isNaN(t) ? null : t;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/**
 * Del målinger i baseline (før etablering) og efter-målinger. Uden
 * etableringsdato er alt "efter" (bagudkompatibelt).
 */
export function splitVedEtablering(
  readings: VandstandsReading[],
  etableringsdato?: string,
): { baseline: VandstandsReading[]; efter: VandstandsReading[] } {
  const skille = etableringsSkille(etableringsdato);
  if (skille === null) return { baseline: [], efter: readings };
  const baseline: VandstandsReading[] = [];
  const efter: VandstandsReading[] = [];
  for (const r of readings) {
    (Date.parse(r.tidspunkt) < skille ? baseline : efter).push(r);
  }
  return { baseline, efter };
}

/** Andel af readings i "våd" klasse + 0,5 × "Fugtig eng". */
export function beregnVerifikationsgrad(
  readings: VandstandsReading[],
  etableringsdato?: string,
): VerifikationsResultat {
  // Baseline-målinger dokumenterer førtilstanden — de tæller ikke som opnået
  // effekt (jf. statens N/P-protokol med før/efter-måling).
  readings = splitVedEtablering(readings, etableringsdato).efter;
  const fordeling: Record<string, number> = {};
  for (const k of AFVANDINGSKLASSER) fordeling[k.navn] = 0;
  if (readings.length === 0) {
    return { verifikationsgrad: 0, fordeling, antalMaalinger: 0 };
  }
  for (const r of readings) {
    const k = klassificerDybde(r.dybdeM);
    fordeling[k.navn] += 1;
  }
  const n = readings.length;
  let grad = 0;
  for (const k of AFVANDINGSKLASSER) {
    const andel = fordeling[k.navn] / n;
    if (k.vaad) grad += andel;
    else if (k.navn === "Fugtig eng") grad += 0.5 * andel;
  }
  // Normaliser fordeling til andele
  for (const key of Object.keys(fordeling)) fordeling[key] = fordeling[key] / n;
  return { verifikationsgrad: grad, fordeling, antalMaalinger: n };
}

export interface MetodeStat {
  antal: number;
  foersteTidspunkt: string | null;
  senesteTidspunkt: string | null;
  kilder: { kilde: VandstandsReading["kilde"]; antal: number }[];
  baseline: { antal: number; middelDybdeM: number | null };
  efter: { antal: number; middelDybdeM: number | null };
}

/**
 * Metode- og datagrundlagsstatistik til rapporten: måleperiode, fordeling
 * pr. kilde og baseline/efter-opgørelse — samme skille som
 * splitVedEtablering, i én gennemgang.
 */
export function beregnMetodeStat(
  readings: VandstandsReading[],
  etableringsdato?: string,
): MetodeStat {
  const skille = etableringsSkille(etableringsdato);
  const kilder = new Map<VandstandsReading["kilde"], number>();
  let minT = Infinity;
  let maxT = -Infinity;
  let foerste: string | null = null;
  let seneste: string | null = null;
  let baselineN = 0;
  let baselineSum = 0;
  let efterN = 0;
  let efterSum = 0;
  for (const r of readings) {
    kilder.set(r.kilde, (kilder.get(r.kilde) ?? 0) + 1);
    const t = Date.parse(r.tidspunkt);
    if (!Number.isNaN(t)) {
      if (t < minT) {
        minT = t;
        foerste = r.tidspunkt;
      }
      if (t > maxT) {
        maxT = t;
        seneste = r.tidspunkt;
      }
    }
    if (skille !== null && t < skille) {
      baselineN += 1;
      baselineSum += r.dybdeM;
    } else {
      efterN += 1;
      efterSum += r.dybdeM;
    }
  }
  return {
    antal: readings.length,
    foersteTidspunkt: foerste,
    senesteTidspunkt: seneste,
    kilder: Array.from(kilder, ([kilde, antal]) => ({ kilde, antal })),
    baseline: { antal: baselineN, middelDybdeM: baselineN > 0 ? baselineSum / baselineN : null },
    efter: { antal: efterN, middelDybdeM: efterN > 0 ? efterSum / efterN : null },
  };
}

// ── Fosfor ────────────────────────────────────────────────────────────────

const SLOPE_KEYS: { key: SlopeKey; ratio: number }[] = [
  { key: "1:4", ratio: 1 / 4 },
  { key: "1:3", ratio: 1 / 3 },
  { key: "1:2", ratio: 1 / 2 },
  { key: "1:1.5", ratio: 1 / 1.5 },
  { key: "1:1.25", ratio: 1 / 1.25 },
  { key: "1:1", ratio: 1 },
];

function slopeKeyFor(brinkHoejde: number, brinkLaengde: number): SlopeKey {
  if (brinkLaengde <= 0) return "1:1";
  const r = brinkHoejde / brinkLaengde;
  let best = SLOPE_KEYS[0];
  let bestDiff = Math.abs(r - best.ratio);
  for (const s of SLOPE_KEYS) {
    const d = Math.abs(r - s.ratio);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best.key;
}

function sideKgPrAar(
  t: Transekt,
  brinkHoejde: number,
  brinkLaengde: number,
  vegAndel: number,
): number {
  if (brinkHoejde <= 0 || brinkLaengde <= 0 || t.laengdeM <= 0) return 0;
  const rate =
    P_EROSION[t.vandloebsform][t.landskabstype][
      t.vandloebsType as 1 | 2 | 3
    ];
  const slopeKey = slopeKeyFor(brinkHoejde, brinkLaengde);
  const slopeFaktor = P_SLOPE[t.landskabstype][slopeKey];
  const korrigeret = rate * slopeFaktor; // mm/år
  const traeFaktor = P_TRAE[t.landskabstype][t.vandloebsType as 1 | 2 | 3];
  const veg = Math.min(1, Math.max(0, vegAndel));
  const vegetationsvaegtet = traeFaktor * korrigeret * veg + korrigeret * (1 - veg);
  const erosionM3PrMPrAar = (vegetationsvaegtet / 1000) * brinkHoejde;
  const geo = P_GEO[t.georegion];
  const kgPrMPrAar = geo * erosionM3PrMPrAar;
  return kgPrMPrAar * t.laengdeM;
}

export function beregnFosforTab(t: Transekt): number {
  const side1 = sideKgPrAar(t, t.brinkHoejdeSide1M, t.brinkLaengdeSide1M, t.hoejVegetationSide1);
  const side2 = sideKgPrAar(t, t.brinkHoejdeSide2M, t.brinkLaengdeSide2M, t.hoejVegetationSide2);
  return side1 + side2;
}

export interface FosforBalance {
  vandloebFoerKgAar: number;
  vandloebEfterKgAar: number;
  groefterFoerKgAar: number;
  groefterEfterKgAar: number;
  balanceKgAar: number;
}

/** DCE-arkets forsimplede grøfte-formel: brug hedeslette/type 2/moræne som proxy
 *  for grøfter — vi behandler grøfter som type 1 udrettede moræne-strækninger
 *  (dvs. rate 21,3 mm/år, slope 1:1 → faktor 0,96) og vegetation = 0. */
function groeftKgPrAar(g: GroeftStraekning, tilstand: "foer" | "efter"): number {
  if (tilstand === "efter" && g.tilkastet) return 0;
  if (g.brinkHoejdeM <= 0 || g.laengdeM <= 0) return 0;
  const rate = P_EROSION.udrettet.moraene[1];
  const slopeFaktor = P_SLOPE.moraene["1:1"];
  const korrigeret = rate * slopeFaktor;
  const erosionM3PrMPrAar = (korrigeret / 1000) * g.brinkHoejdeM;
  const geo = P_GEO[4]; // gennemsnitlig — grøfter mangler georegion i modellen
  return geo * erosionM3PrMPrAar * g.laengdeM * 2; // to sider
}

export function beregnFosforBalance(
  transekterFoer: Transekt[],
  transekterEfter: Transekt[],
  groefter: GroeftStraekning[],
): FosforBalance {
  const vandloebFoer = transekterFoer.reduce((s, t) => s + beregnFosforTab(t), 0);
  const vandloebEfter = transekterEfter.reduce((s, t) => s + beregnFosforTab(t), 0);
  const groefterFoer = groefter.reduce((s, g) => s + groeftKgPrAar(g, "foer"), 0);
  const groefterEfter = groefter.reduce((s, g) => s + groeftKgPrAar(g, "efter"), 0);
  return {
    vandloebFoerKgAar: vandloebFoer,
    vandloebEfterKgAar: vandloebEfter,
    groefterFoerKgAar: groefterFoer,
    groefterEfterKgAar: groefterEfter,
    balanceKgAar: vandloebFoer - vandloebEfter + (groefterFoer - groefterEfter),
  };
}

export function bygSnapshot(input: {
  projekt: LavbundsProjekt;
  readings: VandstandsReading[];
  transekterFoer: Transekt[];
  transekterEfter: Transekt[];
  groefter: GroeftStraekning[];
}): BeregningsSnapshot {
  const co2 = beregnKrediteretCO2(input.projekt);
  const ver = beregnVerifikationsgrad(input.readings, input.projekt.etableringsdato);
  const fos = beregnFosforBalance(
    input.transekterFoer,
    input.transekterEfter,
    input.groefter,
  );
  const verificeretTonPrHa = co2.krediteretTonPrHa * ver.verifikationsgrad;
  const verificeretTotal = co2.krediteretTotal * ver.verifikationsgrad;
  return {
    projektId: input.projekt.id,
    genereret: new Date().toISOString(),
    usageScope: input.projekt.usageScope,
    faktorVersioner: { co2: FAKTOR_VERSIONER.co2, fosfor: FAKTOR_VERSIONER.fosfor },
    co2: {
      krediteretTonPrHa: co2.krediteretTonPrHa,
      krediteretTotal: co2.krediteretTotal,
      verifikationsgrad: ver.verifikationsgrad,
      verificeretTonPrHa,
      verificeretTotal,
      usikkerhedTotal: verificeretTotal * 0.2,
    },
    fosfor: fos,
  };
}

// ─── Opnåelsesgrad: lovet (ex-ante) vs. målt (verificeret) ────────────────────
//
// Produktets kerne (jf. LavbundsMRV-oplægget): staten krediterer effekten PÅ
// FORHÅND — ingen måler om den indtræffer. Opnåelsesgraden er svaret: hvor
// stor en andel af den LOVEDE effekt er dokumenteret målt. Som "lovet" bruges
// statens publicerede ex-ante-tal fra forundersøgelsen når det findes; ellers
// vores v12-genberegning (samme faktorer, samme resultat).

export interface Opnaaelse {
  /** Lovet årlig effekt (t CO₂e/år) — grundlaget kommunen er krediteret for. */
  lovetTotal: number;
  lovetKilde: "publiceret_ex_ante" | "genberegnet_v12";
  verificeretTotal: number;
  /** Målt andel af lovet effekt, 0-100+ (kan overstige 100 ved bedre vådlægning end antaget). */
  procent: number;
}

export function beregnOpnaaelse(
  projekt: Pick<LavbundsProjekt, "publiceretExAnteTonPrHa" | "samletArealHa">,
  krediteretTotal: number,
  verificeretTotal: number,
): Opnaaelse {
  const publiceret =
    projekt.publiceretExAnteTonPrHa != null
      ? projekt.publiceretExAnteTonPrHa * projekt.samletArealHa
      : null;
  const lovetTotal = publiceret ?? krediteretTotal;
  return {
    lovetTotal: Math.round(lovetTotal * 100) / 100,
    lovetKilde: publiceret != null ? "publiceret_ex_ante" : "genberegnet_v12",
    verificeretTotal: Math.round(verificeretTotal * 100) / 100,
    procent: lovetTotal > 0 ? Math.round((verificeretTotal / lovetTotal) * 100) : 0,
  };
}
