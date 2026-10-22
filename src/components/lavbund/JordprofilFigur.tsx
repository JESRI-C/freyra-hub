/**
 * JordprofilFigur — hvorfor vandspejlet afgør klimaeffekten.
 * Tegner terræn, vandspejl FØR (målsat førtilstand) og målt vandspejl EFTER
 * med de to zoner: iltet tørv (over vandspejlet → CO₂-frigivelse) og
 * vandmættet tørv (under vandspejlet → beskyttet kulstof).
 * Ren SVG med rigtige tal — ingen dekoration, tekst i tekst-tokens.
 */
const W = 520;
const H = 170;
const TOP = 30;
const BUND = 150;

export function JordprofilFigur({
  foerM,
  efterM,
  maxDybdeM = 1.4,
}: {
  /** Vandspejl FØR projektet, m under terræn. */
  foerM: number;
  /** Målt middelvandspejl EFTER (null = ingen målinger endnu). */
  efterM: number | null;
  maxDybdeM?: number;
}) {
  const y = (dybde: number) =>
    TOP + (Math.max(0, Math.min(maxDybdeM, dybde)) / maxDybdeM) * (BUND - TOP);
  const yFoer = y(foerM);
  const yEfter = efterM !== null ? y(efterM) : null;
  const vandY = yEfter ?? yFoer;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Jordprofil: iltet tørv over vandspejlet frigiver CO₂; vandmættet tørv er beskyttet"
    >
      {/* Tørveprofil */}
      <rect x="36" y={TOP} width={W - 72} height={BUND - TOP} fill="#a16207" opacity="0.14" rx="4" />
      {/* Iltet zone (over vandspejl) */}
      <rect x="36" y={TOP} width={W - 72} height={Math.max(0, vandY - TOP)} fill="#b45309" opacity="0.18" />
      {/* Vandmættet zone (under vandspejl) */}
      <rect
        x="36"
        y={vandY}
        width={W - 72}
        height={Math.max(0, BUND - vandY)}
        fill="#2563eb"
        opacity="0.16"
      />
      {/* Terræn */}
      <line x1="36" y1={TOP} x2={W - 36} y2={TOP} stroke="#059669" strokeWidth="2.5" />
      <text x="40" y={TOP - 8} fontSize="10" fill="currentColor" opacity="0.65">
        Terræn
      </text>
      {/* FØR-vandspejl */}
      <line
        x1="36"
        y1={yFoer}
        x2={W - 36}
        y2={yFoer}
        stroke="#b45309"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      <text x={W - 40} y={yFoer - 5} fontSize="10" fill="currentColor" opacity="0.65" textAnchor="end">
        FØR {foerM.toFixed(2)} m
      </text>
      {/* EFTER-vandspejl (målt) */}
      {yEfter !== null && efterM !== null && (
        <>
          <line x1="36" y1={yEfter} x2={W - 36} y2={yEfter} stroke="#2563eb" strokeWidth="2.5" />
          <text
            x={W - 40}
            y={yEfter + (yEfter > yFoer ? 14 : -7)}
            fontSize="10"
            fill="currentColor"
            opacity="0.8"
            textAnchor="end"
            fontWeight="600"
          >
            MÅLT {efterM.toFixed(2)} m
          </text>
        </>
      )}
      {/* Zonelabels */}
      {vandY - TOP > 22 && (
        <text x="44" y={(TOP + vandY) / 2 + 4} fontSize="10.5" fill="currentColor" opacity="0.6">
          Iltet tørv → CO₂-frigivelse
        </text>
      )}
      {BUND - vandY > 22 && (
        <text x="44" y={(vandY + BUND) / 2 + 4} fontSize="10.5" fill="currentColor" opacity="0.6">
          Vandmættet tørv → kulstof beskyttet
        </text>
      )}
    </svg>
  );
}
