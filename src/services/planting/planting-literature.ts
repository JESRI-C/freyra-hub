/** Literature-only context. Values never multiply local hectares or become project effect estimates. */
export const PLANTING_LITERATURE = [
  {
    effect: "Skygge og temperatur",
    interval: "1,3–3,0 °C lavere daglig maksimumtemperatur",
    context:
      "Modelresultat for eksisterende vegetation langs en 270 km vandløbsstrækning i slutningen af august 2009. Ikke en prognose for nyplantning eller Bykær Bæk.",
    citation: "Loicq m.fl. (2018), Science of the Total Environment 624, 480–490",
    sourceUrl: "https://doi.org/10.1016/j.scitotenv.2017.12.129",
    checkedAt: "2026-10-22",
  },
  {
    effect: "Kvælstof (N)",
    interval: "80–94 % tilbageholdelse af total-N i overfladeafstrømning",
    context:
      "Spænd mellem to amerikanske forsøgsbehandlinger: 7,1 m græs og 16,3 m græs/træer. Ikke et usikkerhedsinterval, ikke drænvand og ikke en lokal effektfaktor. Resultaterne afhænger blandt andet af regnintensitet.",
    citation: "Lee, Isenhart og Schultz (2003), Journal of Soil and Water Conservation 58(1), 1–8",
    sourceUrl: "https://doi.org/10.1080/00224561.2003.12457491",
    checkedAt: "2026-10-22",
  },
  {
    effect: "Fosfor (P)",
    interval: "78–91 % tilbageholdelse af total-P i overfladeafstrømning",
    context:
      "Spænd mellem de samme to forsøgsbehandlinger med græs og græs/træer; ikke en generel effekt af 10 eller 20 m beplantning. Lokal transportvej, jord, mætning og eventuel frigivelse skal undersøges.",
    citation: "Lee, Isenhart og Schultz (2003), Journal of Soil and Water Conservation 58(1), 1–8",
    sourceUrl: "https://doi.org/10.1080/00224561.2003.12457491",
    checkedAt: "2026-10-22",
  },
  {
    effect: "CO₂",
    interval: null,
    context:
      "Intet anvendeligt CO₂-effektinterval er valgt for denne skitse. Den globale litteratur beskriver blandt andet kulstoflagre ved modenhed; lagre er ikke årlig nettoreduktion. Jordbund, hydrologi, træarter, alder og etablering kræver et særskilt fagligt grundlag, især på kulstofrig jord.",
    citation:
      "Dybala m.fl. (2019), Carbon sequestration in riparian forests: A global synthesis and meta-analysis",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/30411449/",
    checkedAt: "2026-10-22",
  },
] as const;
