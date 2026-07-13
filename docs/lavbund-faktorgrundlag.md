# LavbundsMRV — Faktorgrundlag & verifikation

Alle beregningsfaktorer i LavbundsMRV-modulet stammer fra **officielle,
statslige beregningsark**, som er indbygget i repoet og verificeres
automatisk. Dette dokument beskriver kæden.

## Kilderne (docs/kilder/lavbund/)

| Fil | Version | Udgiver | Anvendes til |
|-----|---------|---------|--------------|
| `beregningsark-co2-effekt-version-12.xlsx` | v12 (Klima-Lavbund / LDP-Lavbund) | Naturstyrelsen | CO₂-faktorer (t CO₂/ha/år) pr. kulstofklasse × arealanvendelse; bufferzone = halv effekt |
| `fosforbalance-brinkerosion-maj-2024.xlsx` | maj 2024 | DCE / Miljøstyrelsen (DCE-rapport nr. 263) | Brinkerosionsrater (Tabel 2), hældningskorrektion (Tabel 3), vegetationskorrektion (Tabel 4), fosforindhold pr. georegion (Tabel 5) |
| `fosfor-apr-2024-SUPERSEDED.xlsm` | apr 2024 | DCE / Miljøstyrelsen | **Erstattet** af maj 2024-versionen — beholdt for historik |

SHA-256-checksums for alle filer er registreret i
`src/data/lavbund-faktor-referencer.json`.

## Verifikationskæden

```
Officielt ark (docs/kilder/lavbund/*.xlsx)
        │  npm run verify:faktorer  — læser arkene og sammenligner værdi for værdi
        ▼
lavbund-faktor-referencer.json  (referenceværdier + checksums)
        │  vitest: lavbundFaktorer-verifikation.test.ts — kode == reference
        ▼
src/data/lavbundFaktorer.ts  (motorens faktorer — "MÅ IKKE ÆNDRES")
        ▼
src/services/lavbundBeregning.ts  (CO₂ v12, verifikationsgrad, fosforbalance)
```

- **`npm run verify:faktorer`** åbner de committede ark, kontrollerer
  checksums (kilderne er uændrede) og sammenligner hver faktorcelle i arkene
  med referencefilen. Fejler ved enhver afvigelse.
- **Unit-testen** (kører i den almindelige testsuite) sikrer at motorens
  faktorer er identiske med referencefilen — alle 12 CO₂-celler og alle
  fosfor-tabeller (2, 3, 4, 5).
- **Rapport-fanen** i appen viser kildegrundlaget (udgiver, version, fil,
  checksum, verifikationsdato), så det altid fremgår af leverancen hvor
  tallene kommer fra.

## Når en ny officiel version udkommer

1. Læg det nye ark i `docs/kilder/lavbund/` (behold det gamle med
   `-SUPERSEDED`-suffiks).
2. Opdatér `src/data/lavbund-faktor-referencer.json`: nye værdier, ny
   `sha256`, ny `version`, flyt det gamle til `superseded`, opdatér
   `verificeret`-datoen.
3. Opdatér `src/data/lavbundFaktorer.ts` og `FAKTOR_VERSIONER` tilsvarende.
4. Kør `npm run verify:faktorer` og `npm run test` — begge skal være grønne
   før merge. Afviger kode og ark, blokerer testen.

Senest verificeret: **2026-07-13** (alle værdier matcher 1:1 — ingen
afvigelser mellem ark, reference og kode).
