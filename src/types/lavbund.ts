// LavbundsMRV — domain types.
// KILDER er dokumenteret i data/lavbundFaktorer.ts. Alle værdier er statens
// officielle tal og må ikke ændres.

export type Kulstofklasse = ">12" | "6-12" | "<6";
export type Arealanvendelse =
  | "Omdrift"
  | "Permanent græs"
  | "Natur"
  | "Øvrige IMK-arealer";
export type Landskabstype = "moraene" | "hedeslette";
export type Vandloebsform = "udrettet" | "slynget";
export type VandloebsType = 1 | 2 | 3;
export type Georegion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ProjektStatus =
  | "planlagt"
  | "etablering"
  | "maaling"
  | "verificeret"
  | "overdraget";
export type Opmaalingsintensitet = "minimal" | "standard" | "intensiv";

/** Anvendelsesområde — HÅRD grænse. Jf. v12-vejledningen egner metoden sig IKKE
 *  til CO₂-kvotesalg og afviger fra den nationale opgørelse. */
export type UsageScope = "tilskudsordning_klimaregnskab";

export interface Tiltag {
  draenAfbrydes: boolean;
  groefterTilkastes: boolean;
  vandloebsbundHaeves: boolean;
  overrislingszoner: boolean;
  pumpedriftStopper: boolean;
}

export interface ArealFordeling {
  kulstofklasse: Kulstofklasse;
  arealanvendelse: Arealanvendelse;
  buffer: boolean;
  hektar: number;
}

export interface Afvigelse {
  id: string;
  beskrivelse: string;
  korrigerendeHandling: string;
  aaben: boolean;
}

export interface LavbundsProjekt {
  id: string;
  navn: string;
  kommune: string;
  status: ProjektStatus;
  samletArealHa: number;
  arealFordeling: ArealFordeling[];
  tiltag: Tiltag;
  torvAndel?: number;
  publiceretExAnteTonPrHa?: number;
  vandspejlFoerM: number;
  usageScope: UsageScope;
  afvigelser: Afvigelse[];
}

export interface Maalepunkt {
  id: string;
  projektId: string;
  type: "kanal_logger" | "markpejling";
  position: { x: number; y: number };
  /** Reel geoposition (WGS84) — sættes ved klik-placering på feltkortet. */
  lat?: number;
  lng?: number;
  intensiteter: Opmaalingsintensitet[];
}

export interface VandstandsReading {
  maalepunktId: string;
  tidspunkt: string;
  dybdeM: number;
  kilde: "hobo_logger" | "manuel_pejling" | "drone_dem" | "insar";
}

export interface Transekt {
  nr: number;
  projektId: string;
  fase: "foer" | "efter";
  landskabstype: Landskabstype;
  vandloebsType: VandloebsType;
  georegion: Georegion;
  vandloebsform: Vandloebsform;
  laengdeM: number;
  hoejVegetationSide1: number;
  hoejVegetationSide2: number;
  brinkHoejdeSide1M: number;
  brinkHoejdeSide2M: number;
  brinkLaengdeSide1M: number;
  brinkLaengdeSide2M: number;
}

export interface GroeftStraekning {
  id: string;
  projektId: string;
  laengdeM: number;
  brinkHoejdeM: number;
  tilkastet: boolean;
}

export interface LedgerPost {
  seq: number;
  tidspunkt: string;
  actor: string;
  event: string;
  detail: string;
  prevHash: string;
  hash: string;
}

export interface BeregningsSnapshot {
  projektId: string;
  genereret: string;
  usageScope: UsageScope;
  faktorVersioner: { co2: string; fosfor: string };
  co2: {
    krediteretTonPrHa: number;
    krediteretTotal: number;
    verifikationsgrad: number;
    verificeretTonPrHa: number;
    verificeretTotal: number;
    usikkerhedTotal: number;
  };
  fosfor: {
    vandloebFoerKgAar: number;
    vandloebEfterKgAar: number;
    groefterFoerKgAar: number;
    groefterEfterKgAar: number;
    balanceKgAar: number;
  };
}
