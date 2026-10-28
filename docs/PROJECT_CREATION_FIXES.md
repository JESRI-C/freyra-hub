# Projektoprettelse: rettelser efter gennemgang

Omfang: stedvalg og projektområde på eksisterende staging. Ingen produktion,
main-merge, e-mail eller invitation. Ingen kundedata ændres som testfixtures.

## 1. Find sted

DAWA autocomplete svarer 410 Gone. Adresseopslag bruger nu KDS Adressevælger,
med det offentlige overgangstoken anbefalet i KDS dokumentation. Vejforslag
præciserer søgningen; endelig adresse omregnes fra dokumenteret EPSG:25832 til
WGS84 med eksisterende projektion. Stednavne suppleres af Photon/OpenStreetMap,
med synlig kildeangivelse; de er lokaliseringshjælp, ikke autoritativ baseline.
Tastaturvalg, koordinater, rydning og forældede svar håndteres. Resolveren
accepterer kun det faste officielle husnummer-endpoint. Begge tjenester nede
vises som fejl, ikke som et tomt søgeresultat. Afgrænsede svar og timeout.

## 2. Kortets startvisning

Uden gyldig gemt afgrænsning åbnes Danmark på zoom 6 frem for Samsø på zoom 15.
Projektets kendte placering/kommune er forudfyldt i søgningen; brugeren vælger
resultatet. Gemt polygon forbliver styrende og overskrives ikke af stedforslag.

## 3. Matrikler og markblokke

Genbruger eksisterende validerede baselineadaptere for Matriklen2/Datafordeleren
og geodata.fvm.dk Markblokke 2026. Stagingens eksisterende Datafordeler-nøgle
forbliver server-side. Faktisk punkt-i-polygon afgør valg; nærliggende BBOX-
kandidater accepteres ikke automatisk. Flader med flere dele bliver ikke
beskåret i stilhed. Kildeidentitet/årgang fremgår før eksplicit gemning.
Tjenestefejl og ufuldstændigt udtræk adskilles fra et ægte tomt resultat.

## 4. Kortlag

Markblok- og natur-WMS peger på de kontrollerede aktuelle kilder. Gældende
matrikler genbruger den validerede vektoradapter. Kulstof2022-kildens WMS er
slået fra hos leverandøren; eksisterende validerede WFS-adapter genbruges som
vektorvisning uden klasseinddeling. Zoomkrav, indlæsning, delvist udtræk og
kilde-/billedfejl vises. Ingen tomt billede tolkes som bevis for fravær af natur.

## 5. Vandløb

Valgfrit foldbart afsnit. Åbent ved vandløbsopgaver eller gemt reference; øvrige
projekttyper kan fortsætte uden. Eksisterende vandløbsfunktion og gemte data
bevares. En vandløbsstreng er ikke en projektgrænse.

## 6. GPS fra billeder

Projektets registrerede billedpositioner og eksisterende droneupload-
positionsadapter genbruges via brugerens adgang. Op til 500 i hver kilde;
ingen originale filer eller signerede links hentes for denne oversigt.
Brugeren kan vise positionerne på kortet og finde en grænse derfra. Kameraets
placering behandles ikke som billeddækning, officiel adresse eller automatisk
projektgrænse. Manglende/ugyldige positioner gættes ikke.

## Kontrol

Målrettede lokale prøver: 34 beståede (inklusive eksisterende geometri),
derefter 39 beståede i søge-/valgs-/genbrugte kildesuiter; kørsler overlapper.
Hosted browseraccept og revisionsidentifikation registreres efter deploy.

Kilder kontrolleret:
- https://dataforsyningen.dk/data/4924
- https://confluence.kds.dk/display/ADV/Brugerstyring
- https://confluence.kds.dk/pages/viewpage.action?pageId=244318431
- https://confluence.kds.dk/pages/viewpage.action?pageId=246743156
- https://photon.komoot.io/ (fair use; ingen oppetidsgaranti)
- Eksisterende cadastral-source.server.ts og planting-polygon-sources.server.ts
  med kataloghenvisninger og validerede koordinat-/geometrikontrakter.
