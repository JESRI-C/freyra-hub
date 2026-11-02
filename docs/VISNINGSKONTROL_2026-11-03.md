# Visningskontrol af hele programkortet

3. november 2026 · S01/S11 · Testmiljø · Kilde `e4d71ece56a9fbe333f7ad5d06c85aa14a504c9a`.

Kontrollen følger alle 115 kortpunkter og de 97 aktive destinationer i
Programoverblik. Det er en kontrol af navigation, synligt indhold,
projektkontekst og præsentation. Den lukker ikke fagkrav, der kræver
repræsentative projektdata, en gennemført integration eller brugeraccept.

## Konkrete rettelser

| Fund | Rettelse og bevaring |
|---|---|
| To aktuelle hovedmenupunkter på blandt andet Kort og Data/metoder | Kun det mest præcise menupunkt markeres. Routerens automatiske markering følger samme regel, også med søgeparametre. De 18 indgange bevares. |
| Geodatakortlinket i kildekataloget pegede på et fast pilotprojekt | Linket bruger det valgte projekts slug/UUID. Uden projekt vises projektvalg. Pilotprojektet og gamle links slettes ikke. |
| Engelske moduloverskrifter og forskellige navne på samme værktøj | Modulnavne er danske; hovedmenu og fælles projektarbejdsrum genbruger programkortets betegnelser. Routes og fagmoduler bevares. |
| Projekthovedet talte en godkendt opgave som åben via den ældre projektstatus | Hovedet viser det samlede antal arbejdsopgaver. Den præcise operationelle status vises fortsat på opgaven. Ingen gamle statusfelter ændres. |
| En specialiseret rapport blev præsenteret som en generel kommunerapport | Haderslev-skabelonen er navngivet som skabelon, og dens faste modtager/kladde er synlig. Gemte rapporter, generatorversioner, indhold og filnavne bevares. |
| Katalogets tilslutningsstatus kunne læses som bevis for projektets data | Forklaringen skelner katalogstatus, faktisk hentning, konfiguration og dokumenteret dækning. Der opfindes ingen kilde- eller integrationsresultater. |
| Beslutningsnotater viste strukturerede udførelser og opfølgninger som rå JSON | De gemte poster åbnes nu i deres eksisterende arbejdsrum med samme projekt/opgave. Generisk redigering af de strukturerede poster fjernes fra denne visning; almindelige notater og samtlige versioner bevares. |
| Knapper til datakilder, regler og lavbundsprojekt kunne blive klemt på små skærme | De berørte overskrifter og handlinger stables på telefon. Moduloversigtens links står hver for sig. De konkrete knappers afgrænsning kontrolleres i browseren. |
| Genbrugte arbejdsrum kunne vise den forkerte overskrift under eksempelvis Projektopsætning | Overskriften følger den faktiske side og programkortet, selv når visningen genbruger en anden sides dataarbejdsrum. |

Rapportskabelonens modtager er fortsat fast i den eksisterende generator.
En generel kommunerapport med korrekt modtager og samme afleverings-/reviewkilder
er arbejde i S05. Den er ikke gjort generisk ved at omdøbe overskriften.

## Hvad der kontrolleres i browseren

| Omfang | Bevis og afgrænsning |
|---|---|
| Hele programkortet | 115 punkter er til stede. 13 planlagte funktioner og fem integrationskandidater har ingen aktive handlinger. |
| 71 sideindgange, 20 projektværktøjer, fem opgavedele og ét reviewkortpunkt | Alle 97 aktive destinationer besøges. 90 kontrolleres i den relevante visning; syv fagprojektafhængige indgange kontrolleres frem til projektvalg. |
| Computer og telefonbredder | Alle destinationer måles ved 1280, 390 og 320 pixels. Ingen vandret afskæring, ødelagte synlige billeder, JavaScript-sidefejl eller fejlede appkald accepteres. |
| Formål og resultat | De fælles forklaringer findes. Projektets hovedside bruger det eksisterende projektlederforløb; reviewkortet åbner samme afleveringskontrol. Ingen ekstra parallel forklaring er tilføjet. |
| Faktisk hovedmenu | Den rigtige router og browseren kontrollerer præcis ét aktuelt menupunkt. Mobilmenuen bevarer de 18 links. |
| Projekt og opgave | Kortlink, valgt opgave, dokumentation, afleveringsversion og gennemgang følger den eksisterende testkontekst. Den gemte godkendelse vises med tidligere returnering. |
| Adgang | En tidligere autoriseret, nu tilbagekaldt testkonto får tom opgaveliste og afvises af review-RPC med `42501`. Anonyme får login og ingen opgavehistorik. Ingen rettigheder ændres. |

Testkontoen har ingen tilgængelige bygge- eller lavbundsprojekter. De syv
indgange er byggeprojektdetaljen og lavbundens forløb/kort/klima/fosfor/rapport/
revisionsspor. Projektvælgerne er kontrolleret; deres fulde datavisning og
faglige resultater er fortsat uprøvet med denne konto. Manglende projektdata
erstattes ikke med eksempelresultater.

Naturkortets synlige mangel på en gyldig projektpolygon i den syntetiske
sag er korrekt. Det er ikke bevis for, at der ingen beskyttet natur er.
Tomt rapportarkiv, tomme kilder og manglende baselineversioner behandles
ligeledes som faktiske tomme/manglende tilstande.

## Gentagelse og sporbarhed

`scripts/test-display-staging.mjs --staging` bruger de eksisterende private
testloginfiler i ignoreret `tmp`. Sæt `FREYRA_TEST_REVISION` til den præcise
appkilde først. Scriptet kontrollerer den offentlige buildmetadata og skriver
skærmbilleder, tekstudtræk og maskinresultater under `tmp/display-audit`.
Det skriver ingen forretningsdata, originaler, rettigheder eller konfiguration
og aktiverer ingen udbyder. Testdatabasen nulstilles ikke.

Regressionstests dækker rigtig router, projekt-ID/slug/intet valgt projekt og
den faste rapportmodtager. Se [maskinkvitteringen](display-staging-receipt-2026-11-03.json)
for den endelige CI, Worker, målinger og begrænsninger. Kode og bevis ligger
i kladde-[PR41](https://github.com/JESRI-C/freyra-hub/pull/41) oven på PR40.

Planen, programkortet og de to brugerændrede Jobs/Geotag-dokumenter bevares.
Appinventaret er genskabt med 876 filer, 71 kanoniske sidevisninger og nul
umappede produktsider. Fuld Skyhost-paritet, S04s profilspecifikke krav,
S05s rapportbinding, fysisk telefonprøve og faglig/brugeraccept er fortsat
åbne. Ingen merge, produktion eller ekstern besked er udført.
