// Officielle faktorer til LavbundsMRV. MÅ IKKE ÆNDRES.
import type { Arealanvendelse, Kulstofklasse } from "@/types/lavbund";

/** KILDE: Naturstyrelsen, "Beregningsark til estimeret CO2-effekt ved aktiv
 *  udtagning af lavbundsjord", version 12 (Klima-Lavbund / LDP-Lavbund).
 *  t CO2/ha/år. Bufferzone (7,5 m langs dræn/grøfter/vandløb) = HALV effekt. */
export const CO2_FAKTORER: Record<Kulstofklasse, Record<Arealanvendelse, number>> = {
  ">12": { Omdrift: 35, "Permanent græs": 25, Natur: 15, "Øvrige IMK-arealer": 10 },
  "6-12": { Omdrift: 17.5, "Permanent græs": 12.5, Natur: 7.5, "Øvrige IMK-arealer": 5 },
  "<6": { Omdrift: 0, "Permanent græs": 0, Natur: 0, "Øvrige IMK-arealer": 0 },
};

/** KILDE: DCE-rapport nr. 263 (2023) / regneark maj 2024. Brinkerosion mm/år,
 *  Tabel 2: form × landskab × vandløbstype. */
export const P_EROSION = {
  udrettet: {
    hedeslette: { 1: 45.2, 2: 45.2, 3: 45.2 },
    moraene: { 1: 21.3, 2: 25.3, 3: 32.4 },
  },
  slynget: {
    hedeslette: { 1: 89.2, 2: 89.2, 3: 89.2 },
    moraene: { 1: 18, 2: 30.9, 3: 20.8 },
  },
} as const;

/** Tabel 3: hældningskorrektion pr. anlæg × landskab. */
export const P_SLOPE = {
  hedeslette: { "1:4": 0.68, "1:3": 0.7, "1:2": 0.75, "1:1.5": 0.79, "1:1.25": 0.82, "1:1": 0.85 },
  moraene: { "1:4": 0.76, "1:3": 0.78, "1:2": 0.83, "1:1.5": 0.88, "1:1.25": 0.91, "1:1": 0.96 },
} as const;

export type SlopeKey = keyof (typeof P_SLOPE)["hedeslette"];

/** Tabel 4: korrektionsfaktor pga. træer/høj vegetation. */
export const P_TRAE = {
  hedeslette: { 1: 0.47, 2: 0.47, 3: 0.47 },
  moraene: { 1: 0.73, 2: 0.57, 3: 0.62 },
} as const;

/** Tabel 5: fosforindhold kg P/m³ pr. georegion 1–9 (index 0 ubrugt). */
export const P_GEO = [0, 0.656, 0.825, 0.874, 0.559, 0.412, 0.803, 0.817, 1.311, 0.3585] as const;

/** Naturstyrelsens/Atkins' afvandingsklasser (dybde til vandspejl, m). */
export const AFVANDINGSKLASSER = [
  { navn: "Frit vandspejl", max: 0.0, vaad: true },
  { navn: "Sump", max: 0.25, vaad: true },
  { navn: "Våd eng", max: 0.5, vaad: true },
  { navn: "Fugtig eng", max: 0.75, vaad: false },
  { navn: "Tør eng", max: 1.0, vaad: false },
  { navn: "Tør overjord", max: 1.25, vaad: false },
  { navn: "Mark", max: Infinity, vaad: false },
] as const;

export const FAKTOR_VERSIONER = {
  co2: "Beregningsark v12 (Klima-Lavbund/LDP-Lavbund)",
  fosfor: "DCE-rapport 263 · regneark maj 2024",
} as const;
