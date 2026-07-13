#!/usr/bin/env node
// Verifikation af LavbundsMRV-faktorgrundlaget: læser de OFFICIELLE
// beregningsark i docs/kilder/lavbund/ og kontrollerer at
//   1) filernes SHA-256 matcher referencer (ingen har rørt kilderne)
//   2) faktorværdierne i arkene matcher lavbund-faktor-referencer.json
// Sammen med unit-testen (kode == referencer) beviser det kæden
// officielt ark == referencer == kode.
//
// Kør: npm run verify:faktorer
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const referencer = JSON.parse(
  readFileSync(join(root, "src/data/lavbund-faktor-referencer.json"), "utf8"),
);

let fejl = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  fejl++;
  console.error(`  ✗ ${msg}`);
};

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function naer(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol;
}

// ─── 1) Checksums ─────────────────────────────────────────────────────────────
console.log("Checksums (kilderne er uændrede):");
for (const k of [referencer.co2, referencer.fosfor, ...referencer.superseded]) {
  const path = join(root, "docs/kilder/lavbund", k.kilde);
  try {
    const actual = sha256(path);
    if (actual === k.sha256) ok(`${k.kilde}`);
    else fail(`${k.kilde}: sha256 ${actual} ≠ forventet ${k.sha256}`);
  } catch {
    fail(`${k.kilde}: filen mangler i docs/kilder/lavbund/`);
  }
}

// ─── 2) CO2-faktorer fra arket ────────────────────────────────────────────────
console.log("CO2 v12 (Beregningsark-fanen, rækker 25-48):");
{
  const wb = XLSX.read(
    readFileSync(join(root, "docs/kilder/lavbund", referencer.co2.kilde)),
    { type: "buffer" },
  );
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Beregningsark"], { header: 1, defval: null });
  // Effekt-kolonnen (index 4), blokke a 4 rækker: >12, 6-12, <6 — uden buffer
  // fra række 25, med buffer fra række 37. Arealanvendelses-rækkefølgen i arket:
  const anvendelser = ["Omdrift", "Permanent græs", "Natur", "Øvrige IMK-arealer"];
  const klasser = [">12", "6-12", "<6"];
  const læs = (startRow) => {
    const out = {};
    klasser.forEach((klasse, b) => {
      out[klasse] = {};
      anvendelser.forEach((anv, i) => {
        out[klasse][anv] = Number(rows[startRow + b * 4 + i]?.[4] ?? NaN);
      });
    });
    return out;
  };
  const udenBuffer = læs(25);
  const medBuffer = læs(37);

  for (const klasse of klasser) {
    for (const anv of anvendelser) {
      const forventet = referencer.co2.udenBuffer[klasse][anv];
      const fraArk = udenBuffer[klasse][anv];
      if (naer(fraArk, forventet)) ok(`${klasse} / ${anv}: ${fraArk}`);
      else fail(`${klasse} / ${anv}: ark=${fraArk} ≠ reference=${forventet}`);
      // Buffer = halv effekt — kontrollér mod arkets med-buffer-blok
      const forventetBuffer = forventet * referencer.co2.bufferFaktor;
      if (!naer(medBuffer[klasse][anv], forventetBuffer)) {
        fail(`${klasse} / ${anv} (buffer): ark=${medBuffer[klasse][anv]} ≠ ${forventetBuffer}`);
      }
    }
  }
}

// ─── 3) Fosfor-tabeller fra arket ─────────────────────────────────────────────
console.log("Fosfor maj 2024 (FØR-fanens tabeller, kolonne AH/AI):");
{
  const wb = XLSX.read(
    readFileSync(join(root, "docs/kilder/lavbund", referencer.fosfor.kilde)),
    { type: "buffer" },
  );
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["FØR"], { header: 1, defval: null });
  const val = (r, c) => Number(rows[r]?.[c] ?? NaN);

  // Tabel 2 (rækker 3-8 udrettet, 10-15 slynget; værdi i kolonne 36)
  const t2 = referencer.fosfor.tabel2_erosion_mm_aar;
  const t2Rækker = [
    ["udrettet", "hedeslette", ["1", 3], ["2", 4], ["3", 5]],
    ["udrettet", "moraene", ["1", 6], ["2", 7], ["3", 8]],
    ["slynget", "hedeslette", ["1", 10], ["2", 11], ["3", 12]],
    ["slynget", "moraene", ["1", 13], ["2", 14], ["3", 15]],
  ];
  for (const [form, landskab, ...typer] of t2Rækker) {
    for (const [type, row] of typer) {
      const fraArk = val(row, 36);
      const forventet = t2[form][landskab][type];
      if (naer(fraArk, forventet)) ok(`Tabel 2 ${form}/${landskab}/type${type}: ${fraArk}`);
      else fail(`Tabel 2 ${form}/${landskab}/type${type}: ark=${fraArk} ≠ ${forventet}`);
    }
  }

  // Tabel 3 (rækker 20-25 hedeslette, 26-31 moræne; værdi i kolonne 36)
  const t3 = referencer.fosfor.tabel3_haeldning;
  const anlaeg = ["1:4", "1:3", "1:2", "1:1.5", "1:1.25", "1:1"];
  anlaeg.forEach((a, i) => {
    const hede = val(20 + i, 36);
    const mor = val(26 + i, 36);
    if (!naer(hede, t3.hedeslette[a])) fail(`Tabel 3 hedeslette/${a}: ark=${hede} ≠ ${t3.hedeslette[a]}`);
    else ok(`Tabel 3 hedeslette/${a}: ${hede}`);
    if (!naer(mor, t3.moraene[a])) fail(`Tabel 3 moræne/${a}: ark=${mor} ≠ ${t3.moraene[a]}`);
  });

  // Tabel 4 (rækker 36-38 hedeslette, 39-41 moræne; kolonne 36)
  const t4 = referencer.fosfor.tabel4_vegetation;
  [1, 2, 3].forEach((type, i) => {
    const hede = val(36 + i, 36);
    const mor = val(39 + i, 36);
    if (!naer(hede, t4.hedeslette[String(type)])) fail(`Tabel 4 hedeslette/type${type}: ark=${hede}`);
    else ok(`Tabel 4 hedeslette/type${type}: ${hede}`);
    if (!naer(mor, t4.moraene[String(type)])) fail(`Tabel 4 moræne/type${type}: ark=${mor}`);
  });

  // Tabel 5 (rækker 46-54; georegion i kolonne 33, værdi i kolonne 34)
  const t5 = referencer.fosfor.tabel5_fosfor_kg_p_m3;
  for (let i = 0; i < 9; i++) {
    const region = String(val(46 + i, 33));
    const fraArk = val(46 + i, 34);
    if (naer(fraArk, t5[region])) ok(`Tabel 5 georegion ${region}: ${fraArk}`);
    else fail(`Tabel 5 georegion ${region}: ark=${fraArk} ≠ ${t5[region]}`);
  }
}

console.log("");
if (fejl > 0) {
  console.error(`FEJL: ${fejl} afvigelse(r) mellem officielle ark og referencer. Kør IKKE beregninger før dette er afklaret.`);
  process.exit(1);
}
console.log("✅ Faktorgrundlag verificeret: officielle ark == referencer (og unit-testen sikrer referencer == kode).");
