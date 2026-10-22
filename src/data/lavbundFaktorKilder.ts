// Kildegrundlag/proveniens for LavbundsMRV-faktorerne — vises i rapporter og
// UI, så det altid er dokumenteret hvor tallene kommer fra og hvilken version
// der er indbygget. Selve værdierne verificeres automatisk:
//   - Unit-test: kode == lavbund-faktor-referencer.json
//   - npm run verify:faktorer: officielle ark (docs/kilder/lavbund/) == referencer
import referencer from "@/data/lavbund-faktor-referencer.json";

export interface FaktorKilde {
  navn: string;
  version: string;
  udgiver: string;
  fil: string;
  sha256: string;
  anvendtTil: string;
}

export const FAKTOR_KILDER: FaktorKilde[] = [
  {
    navn: "Beregningsark til estimeret CO₂-effekt ved udtagning af lavbundsjord",
    version: referencer.co2.version,
    udgiver: referencer.co2.udgiver,
    fil: `docs/kilder/lavbund/${referencer.co2.kilde}`,
    sha256: referencer.co2.sha256,
    anvendtTil: "CO₂-faktorer (t CO₂/ha/år) pr. kulstofklasse × arealanvendelse · buffer = halv effekt",
  },
  {
    navn: "Regneark til bestemmelse af fosforbalance ved brinkerosion",
    version: referencer.fosfor.version,
    udgiver: referencer.fosfor.udgiver,
    fil: `docs/kilder/lavbund/${referencer.fosfor.kilde}`,
    sha256: referencer.fosfor.sha256,
    anvendtTil: "Brinkerosionsrater (Tabel 2), hældnings- og vegetationskorrektion (Tabel 3-4), fosforindhold pr. georegion (Tabel 5)",
  },
];

export const FAKTOR_VERIFICERET_DATO = referencer.verificeret;
