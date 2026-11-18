# GoFreyra · Scrum og samlet udgivelse

Opdateret 18. november 2026. Produktejer: Jesper Riel. Status: igangværende klargøring. Brugeren har bedt om at udgive alt bygget arbejde og erstatte den eksisterende GoFreyra-side.

## Sprintmål

Saml den eksisterende Freyra Hub og den byggede kandidat, udgiv den samlede løsning på den eksisterende app, og verificér de centrale forløb på den faktisk udgivne version. Den eksisterende produktionsdatabase og dens kundedata skal bevares. Risteprøve er separat testgrundlag og må ikke stiltiende erstatte produktionsdatabasen.

## Prioriteret sprint

| Prioritet | Arbejde | Faktisk status | Accept før afslutning |
| --- | --- | --- | --- |
| P0 | Fastlæg eksisterende app og samlet kildeversion | I gang. Freyra Hub i Lovable er identificeret; lokal kandidat og publiceret kode er forskellige. | Samlet kildepakke med filmanifest, kildeversion og mulighed for at vende tilbage til hidtidig version. Nyere eksisterende ændringer bevares. |
| P0 | Fuld kodekontrol, prøver og distributionsbuild | Fuld TypeScript-kontrol og komplet produktionsbuild bestod. Baseline: 4090/4095 prøver bestod; fem fejl i samme router-mock er rettet og genafprøvet. 12 relevante regressionsprøver bestod. Den efterfølgende privatlivstilpasning af udgivelsespakken afprøves særskilt. | Fuldt typecheck, relevante regressioner og faktisk komplet byggepakke består. Ingen indsnævret kontrol erstatter en fuld gate. |
| P0 | Database og serveropsætning | Eksisterende produktionsref og separat Risteprøve identificeret. Produktionsmigrationsniveau undersøges. | Nødvendige skemaændringer afstemt mod aktiv database, rettigheder bevaret, ingen testkonti eller syntetiske sager kopieret ind i kundedata. Servernøgler findes kun på serveren. |
| P0 | Udgiv eksisterende app | Ikke udgivet endnu. | Publicering afsluttet, eksisterende adresse svarer, ny kildeversion er dokumenteret, login og direkte genindlæsning virker. |
| P0 | Feltarbejde fra mobil til godkendt rapport | Lokale delprøver består: kort, originalfoto, offlinekø, færdigmelding, ledergodkendelse og fast rapport. | Samme forløb på udgivet app med medarbejder og leder. Adgang på tværs af sager afvises. Fysisk telefon afprøves særskilt. |
| P0 | Kort, kilder og eksport | Enheder, nulværdier, kilde-id og GeoJSON/CSV er lokalt afprøvet. Kildebaseret status har 12 beståede prøver; browseraccept mangler. | Verificér kortlag, opdatering, sagsskift, afvist eksportlog og download på den udgivne version. |
| P1 | Enhedsmålinger i låste rapporter og fakturagrundlag | Åben. Kilderegisterets sidehentning er rettet; målingskilder er endnu ikke tilsluttet. | Serveren fastfryser de valgte målinger, enhed, tid, kvalitet og kilde. Senere data ændrer ikke en gemt rapport. Fakturagrundlag bruger kun godkendte registreringer. |
| P1 | Haderslev A–E og faglig accept | Delvist dokumenteret i særskilte pilotkvitteringer. | Rigtige originaler, fagperson, eksisterende roller og alle fem pilotforløb afprøves på den konkrete udgivelse. |
| P1 | Hele Skyhost-produktet | 42 foreløbige funktionsområder, 68 detaljerede Jobs/GeoTag-krav. Fuld rolle- og moduldækning er ikke verificeret. | Brug eksisterende RES-framework; hvert område kræver fuld kortlægning og egen bestået accept. Ingen status færdig udledes af en teknisk delprøve. |

## Statusregler

Kode findes, lokal prøve bestået, hosted prøve bestået og fagligt accepteret er forskellige beviser. Et sprintkort afsluttes først efter sin konkrete acceptprøve på den angivne version. En afventende publiceringsanmodning er ikke en udgivelse.

Den tidligere F00–F29-/S00–S16-plan og Rapportmotor 2.0-planen bevares. Dette er deres aktuelle udgivelsesopfølgning, ikke et mindre produktmål. Funktionsregisteret `skyhost-product-register.json` og udviklingstavlen bevarer hele Skyhost-omfanget.

## Offentlig kildepakke

Kun kode og Scrum-plan må offentliggøres. Interne projekt- og testnoter, skærmbilleder og servernøgler opbevares privat. Udviklingstavlen viser derfor en privatmarkering frem for interne prøveresultater. Produktionsudgivelse og hosted accept er fortsat åbne.
