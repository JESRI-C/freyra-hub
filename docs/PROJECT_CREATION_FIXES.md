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

## Afsluttet teknisk stagingprøve

Alle seks punkter er implementeret og teknisk afprøvet på eksisterende staging.
Ni browserchecks består i `scripts/test-project-area-hosted.mjs`, inklusive
faktisk projektoprettelse/genåbning, adresse- og stednavnevalg, begge former for
kortvalg og eksplicit gemning, 24 faktisk tegnede lavbundsflader, GPS uden
ændring af gemt grænse, valgfrit vandløb og frisk/resized mobil med alle
baggrundsknapper inden for kortets bredde og indlæste kortbilleder.
Ingen browserfejl er registreret. Desktop og mobil er visuelt gennemgået.

Den anvendte lavbundskilde er **delvis** i prøven; der påstås hverken komplet
dækning, klasseinddeling eller målt kulstofeffekt. Billederne er syntetiske;
kortkilderne er rigtige offentlige tjenester. GPS-fixturen er en faktisk lagret
syntetisk PNG med projektafgrænset sti og dokumenteret hash; den beviser ikke
rigtige originalers optagested eller nøjagtighed.

- Applikationskilde: e2a08f585d914f47bfbd5c4c9fb538eee9ed6b3c.
- Worker: 4f968b72-ff7d-43b5-b4c9-94e092b6f67c.
- [Staging](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev)
- [Build og målrettede prøver](https://github.com/JESRI-C/freyra-hub/actions/runs/40753110783)
- [Samlede kode-, bygge- og databasekontroller](https://github.com/JESRI-C/freyra-hub/actions/runs/40753110761)
- [Kladde til gennemgang](https://github.com/JESRI-C/freyra-hub/pull/21)
- Maskinlæsbar, afpersonificeret kvittering: project-area-staging-acceptance.json.

Browsersessionen er med en separat teknisk konto/projekt, som genbruges ved
reproducerbar genprøve. Private kontooplysninger, skærmoptagelse, screenshots
og rå logfiler ligger kun under ignoreret tmp/. Ingen mails/invitationer sendes.
Produktion og main er ikke ændret. Ingen databaseændring blev nødvendig for
disse rettelser; CI bruger en separat disponibel lokal database.

Browserprøven fandt og fik rettet en adressemarkør, der opsnappede matrikelklik,
og en mobilknap, der kunne blive klemt. Den sidste kontrol venter også på
færdig gemning og begge korttjenesters rigtige billeder. Tjenestefejl i
områdelisten vises nu som fejl; ukendte arealer vises ikke som nul hektar, og
hele geometrien indgår i cachens nøgle. Enkeltdele af multipart-flader vises
ikke som om de var hele fladen.

Det lokale fulde build overskred maskinens ledige hukommelse. Det godkendte
stagingbuild blev i stedet lavet på GitHub, hentet med connectoren, verificeret
mod artifact-SHA-256 og lagt på den eksisterende stagingapp med bevarede vars
og servernøgler. Workflowet har kun browseroffentlig stagingkonfiguration og
bygger en filpakke; det har ingen produktions- eller deployrettigheder.
Fallback før dette arbejde er Worker 3a4b7e93-8605-4b7b-89b5-efca6f69a616.

Den egentlige Bykær-kunde-/fagprøve og samlet hosted DB+originalfil-restore er
fortsat ikke afprøvet. De ændres ikke til bestået af denne tekniske UI-prøve.
