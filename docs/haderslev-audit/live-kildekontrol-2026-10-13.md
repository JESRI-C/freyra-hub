# Direkte kontrol af offentlige kildeadaptere

Kontrolleret 13. oktober 2026 fra den lokale Haderslev-checkout. Testområdet `9.0,55.1,9.7,55.4` er et teknisk prøveområde. Det er ikke en godkendt kommunal delstrækning, og ingen database- eller kundedata blev skrevet.

## DMI

Kommando: `node --experimental-strip-types scripts/verify-dmi-source.mjs --bbox 9.0,55.1,9.7,55.4 --from 2026-08-24T06:00:00Z --to 2026-09-07T06:00:00Z`.

Den faktiske adapter `dmi-historical-station-precip/v1` returnerede exit 0, `mode=live`, `status=partial`, ingen kildefejl og 14 officielle døgnværdier fra station `05384`, Vojens Airport. Hentetid: `2026-10-13T10:12:42.632Z`. Alle stations- og værdissider blev gennemgået.

Stationsforbindelsen til projektets opland er `not_assessed`. Den observerede serie går fra `2026-08-25T00:00:00.001000+02:00` til `2026-09-08T00:00:00+02:00`. Døgnintervallerne matcher ikke de ønskede vilkårlige UTC-tidspunkter. Derfor er `summary.complete=false` og `totalMm=null`; der er ikke opfundet en fuld periodesum. De oprindelige værdier, herunder virkelige nuller, er bevaret.

Payload-SHA-256: `50fa97b436f02c3d1c3703f6e0d1adadc583440976b04e6c949c9ce13273b373`.

Primær kilde: [DMI climateData](https://www.dmi.dk/friedata/dokumentation/apis/climate-data-api-1). Stationernes nedbør er kontekst, og den dokumenterer ikke vandføring, opstuvning eller vedligeholdelsesbehov i bækken.

## Sentinel-2

Kommando: `node scripts/verify-sentinel-source.mjs --bbox 9.0,55.1,9.7,55.4 --from 2026-08-24 --to 2026-08-31`.

Den faktiske adapter `sentinel-2-l2a-catalog/v1` returnerede exit 0, `mode=live`, `status=partial`, ingen kildefejl og 10 geografiske scenekandidater. Hentetid: `2026-10-13T10:17:45.112Z`. Katalogpaginationen var komplet for testforespørgslen. Scenedatoerne var 24.–31. august 2026.

Lokal QA for skyer, skygger, nodata og brugbarhed er `pending`; der er ikke hentet billedbånd eller beregnet NDVI. Scene-ID og separat produkt-ID er bevaret: leverandørens produkt-ID-felt var ikke oplyst i disse svar og står derfor `null`. Global skyprocent, eksempelvis 0,59 % for én scene, er ikke projektområdets lokale skyprocent.

Payload-SHA-256: `265eb6c80d8a2109a9f7b1b4e5b30bfddff4650a84ac15895168a133440836c9`.

Primær kilde: [Copernicus Data Space STAC](https://documentation.dataspace.copernicus.eu/APIs/STAC.html). Det aktuelle endpoint er `https://stac.dataspace.copernicus.eu/v1/search`.

## Danske Stednavne — DAWA lukket, tidligere anonym kildekontrol

Kontrolleret 13. oktober 2026 med officielle myndighedskilder og anonyme GET-kald. Ingen API-nøgler, credentials eller kundedata blev læst eller sendt. Byskov Bæk var alene søgetekst; der er ikke fundet eller godkendt en konkret pilotreference.

Klimadatastyrelsen oplyser, at **alle DAWA-tjenester lukkede 1. oktober 2026 kl. 10**. HTTP 410 fra den eksisterende adapter er derfor en nedlagt tjeneste. [Officiel nedlukningsmeddelelse, 2. juli 2026](https://www.klimadatastyrelsen.dk/om-klimadatastyrelsen/nyheder/nyhedsarkiv/2026/jul/dawa-lukker-d-1-oktober-2026).

| Offentligt endpoint testet uden credentials                                                                             | Faktisk svar                     |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `https://api.dataforsyningen.dk/stednavne2?q=Byskov%20B%C3%A6k`                                                         | 410 JSON: Gone                   |
| `https://api.dataforsyningen.dk/steder?format=geojson&srid=4326&hovedtype=Vandl%C3%B8b&per_side=1`                      | 410 JSON: Gone                   |
| `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/REST/HentDKStednavne?Format=JSON&stednavn=Byskov%20B%C3%A6k` | 403: Unauthorized access         |
| `https://wfs.datafordeler.dk/Stednavn/STEDNAVNE_BEARBEJDET_GML3SFP/1/WFS?service=WFS&request=GetCapabilities`           | 401                              |
| `https://graphql.datafordeler.dk/DS/v1/schema` og `/DS/v2/schema`                                                       | Begge 401                        |
| `https://graphql.datafordeler.dk/DS/v1?query=%7B__typename%7D`                                                          | 401                              |
| `https://api.datafordeler.dk/FileDownloads/GetAvailableFileDownloads?Register=DS`                                       | 401                              |
| `https://api.dataforsyningen.dk/rest/gsearch/v2.0/stednavn?q=Byskov%20B%C3%A6k`                                         | 400: kræver authentication token |

Probeværktøjet havde 15 sekunders timeout, afviste redirects og læste højst 650 bytes til statusdokumentation pr. svar. Sandkassens DNS-fejl blev efterfulgt af en godkendt read-only prøve uden for sandkassen; tabellen viser de faktisk modtagne HTTP-svar.

De aktuelle officielle [GraphQL](https://datafordeler.dk/dataoversigt/danske-stednavne/danske-stednavne-graphql/), [bearbejdede WFS](https://datafordeler.dk/dataoversigt/danske-stednavne/danske-stednavne-bearbejdet-wfs/) og [Fildownload](https://datafordeler.dk/dataoversigt/danske-stednavne/danske-stednavne-fildownload/) beskriver **API-key/OAuth**, bruger og IT-system på Datafordeler Administration. Der er ikke verificeret en anonym geometri-afløser. Skemakatalogets betegnelse “Åben” beviser ikke anonym dataadgang; de testede schema-URL'er krævede også autentifikation. Legacy REST udfases og er ikke anbefalet som ny provider. **Danske Stednavne har ikke været opdateret siden september 2025**; et nyt hentetidspunkt giver ikke en nyopmålt vandløbsgeometri.

Gsearch er heller ikke en varig nødløsning: den lukker **29. oktober 2026 kl. 16**, før mødet. [Officiel transitionsmeddelelse, 25. september 2026](https://www.klimadatastyrelsen.dk/om-klimadatastyrelsen/nyheder/nyhedsarkiv/2026/sep/dataforsyningen-flytter-til-ny-driftsplatform-2-november-2026).

**Konsekvens ved den tidligere anonyme kontrol:** den eksisterende adapter gav en tydelig dansk nedluknings-/adgangsfejl ved 410, uden fallback. På dette tidspunkt var ny provider-/ID-/geometri-/CRS-mapping ikke credentialvalideret eller implementeret. En ny provider skal være server-only, fast-host og bounded, med adgangsmangel som `needs_access`. Gemte v1-referencers proveniens må ikke lydløst omskrives; den efterfølgende autentificerede kontrol og versionerede kodekandidat fremgår nedenfor.

Alternativt kan næste implementering støtte en eksplicit **officiel filimport**. [Fildownloaddokumentationen](https://confluence.kds.dk/pages/viewpage.action?pageId=158368067) udstiller bl.a. `Vandloeb` og `Stednavn` i JSON/GPKG; Stednavn alene har ikke geometri. Importen kræver originalfil/checksum, register-/entitets-ID og relation, faktisk data-/downloadversion, kilde-/licensreference samt dokumenteret CRS og eventuel transformation til EPSG:4326. Den skal være mærket importeret og afvente relevant faglig accept; den må ikke kaldes frisk anonym API-hentning. Denne importvej er et forslag, ikke en eksisterende understøttet uploadfunktion.

### Tidligere adgangsoverdragelsesplan til moderniseret Datafordeler

Den officielle produktionsindgang er [Datafordeler Administration](https://portal.datafordeler.dk/hjem), bekræftet via myndighedens [loginoversigt](https://datafordeler.dk/konto/login-oversigt/) og [brugeroprettelsesguide](https://confluence.kds.dk/display/DML/Brugeroprettelse%2BDatafordeler%2BAdministration). Brugeren skal selv acceptere brugsvilkårene og udføre login/verifikation.

Mindste adgang til offentlige DS-data:

1. Opret bruger med e-mail/adgangskode eller MitID Privat og verificér e-mail. MitID Erhverv er relevant ved organisationsdeling/beskyttede data; det er ikke nødvendigt for denne ubeskyttede DS-adgang.
2. Opret eller tilknyt et IT-system til GoFreyra.
3. Vælg **API-Keys → Opret**, og navngiv nøglen. Den vises kun én gang og skal overføres privat til serverbinding. [Officiel API-key-guide](https://confluence.kds.dk/pages/viewpage.action?pageId=187105503).
4. API-key giver ubeskyttede data; dokumentationen beskriver ikke en DS-only nøglescope. GoFreyras kommende adapter skal selv afgrænse register/host/forespørgsel til DS og bevare credentialfri proveniens. Der skal ikke ansøges om CPR eller andre beskyttede registerdata til dette formål.

Dokumenterede moderniserede endpoints:

| Tjeneste                          | Endpoint og dokumentation                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bearbejdet navne-/geometri-WFS    | `https://wfs.datafordeler.dk/Stednavn/STEDNAVNE_BEARBEJDET_GML3SFP/1/WFS` med serverintern `apikey` eller OAuth. [Officielt produktkort](https://datafordeler.dk/dataoversigt/danske-stednavne/danske-stednavne-bearbejdet-wfs/).                                                                                                                                                                                                                                               |
| GraphQL                           | `https://graphql.datafordeler.dk/DS/<version>` og samme URL med `/schema`. Version vælges fra det aktuelle katalog/schema efter adgang; v1/v2 blev kun probet anonymt og er ikke credentialvalideret her. [Produktkort](https://datafordeler.dk/dataoversigt/danske-stednavne/danske-stednavne-graphql/) og [officiel endpoint-/query-/adgangsvejledning](https://datafordeler.dk/media/5iyjgjvp/brugervejledning-transitionsguide-for-entitetsbaserede-graphql-tjenester.pdf). |
| Filinventar og officielle exports | `https://api.datafordeler.dk/FileDownloads/GetAvailableFileDownloads?Register=DS` og `https://api.datafordeler.dk/FileDownloads/GetFile?Register=DS`, med serverintern autentifikation. [Registerspecifik dokumentation](https://confluence.kds.dk/pages/viewpage.action?pageId=158368067). Vælg den konkrete entitet/filversion; en massefil er ikke et bounded projektopslag.                                                                                                 |

Efter adgang følger en read-only schema/capabilities-prøve, faktisk ID-/navne-/geometri-/CRS-mapping og først derefter ny serveradapter. API-key-parametre må ikke indgå i klienten, loggede URL'er, `sourceUrl` eller baseline-manifest. Den daværende fejlrettelse ændrede ikke provider eller udførte disse prøver.

### Efterfølgende konto-/IT-system-/stagingbinding, 13. oktober 2026

Brugeren har nu oprettet konto, verificeret e-mail og gennemført almindeligt login. **GoFreyra Staging** er et aktivt IT-system. API-key **GoFreyra staging offentlige data** udløber **13. oktober 2028** og er provisioneret som krypteret `DATAFORDELER_API_KEY` kun på `gofreyra-p0-staging`; secret-bulk success for én nøgle og liste med fire bindingsnavne er kontrolleret uden at registrere værdier.

Første autentificerede **GetCapabilities** gav **401 / `DAF-AUTH-0005`**, nøgle ikke genkendt. Den officielle vejledning angiver mindst 15 minutter efter nøgleoprettelse. Dette svar er nu historisk: de efterfølgende kald efter aktivering lykkedes som vist nedenfor. [Samlet adgangsnotat, kodecheckpoint og resterende accept](datafordeler-adgang-2026-10-13.md).

### Faktiske autentificerede WFS-kald efter aktivering

| Kontrol                                                | Faktisk svar                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| GetCapabilities                                        | **200 / 156.988 bytes**, GML-outputformater                                       |
| DescribeFeatureType                                    | **200 / 652 bytes**, include-only                                                 |
| Refereret offentligt XSD                               | **200 / 134.514 bytes**                                                           |
| GetFeature, COUNT 1, EPSG:4326 i URN-form              | **200 / 12.698 bytes**                                                            |
| FES PropertyIsLike(`sn:navn_1.skrivemaade`), Bykær Bæk | **200 / 12.152 bytes**; lokal-ID `1233766a-1fdb-6b98-e053-d480220a5a3f`           |
| FES PropertyIsEqualTo(`sn:id.lokalId`), Lillemølle Bæk | **200 / 12.695 bytes**, entydigt; lokal-ID `120b35a4-d910-46b9-e063-6f4f210a952b` |

Entiteten er **`sn:Vandloeb`**, stabil identitet **`sn:id.lokalId`**, navne **`sn:navn_1..5.skrivemaade`** med primært aktuelt/officielt navn. Eksplicit CRS-akseorden **latitude/longitude** transporteres til canonical **longitude/latitude**. Ingen nøglebærende URL'er eller rå autentifikationsdata registreres. Bykær-/Lillemølle-opslagene er **tekniske testreferencer, ikke en valgt kommunal pilot**.

En ny bounded serveradapter/GML-parser med byte-/deadline-/namespace-/DTO-gates, afviste redirects og credentialfri proveniens er på disk; `fast-xml-parser` er fastlåst til **5.11.2**. **61 parsertests** og **46 baseline-/reachtests** (inklusive 12 nye datocases) PASS; v1/v2-proveniens/snapshotgren er forberedt. **94 filer/1.012 tests PASS før de 12 supplerende datocases** efter workspace TEMP/TMP løste en Windows cache-EPERM før tests. Koden er endnu ikke committed/deployet; endelig fuldsuite/build/deploy/hosted CI er ikke accepteret. Staging har fortsat **0 gemte baselines**.

## Acceptgrænse

Kaldkontrollen beviser DMI-/Sentinel-adapteres faktiske læsning og konservative status på testregionen, de tidligere anonyme HTTP-svar og nu vellykkede autentificerede Datafordeler-capabilities/schema/GetFeature med præcise testopslag. Den nye adapter er en deltestet kodekandidat. Beviserne accepterer ikke den nye provider i deployet Worker-runtime, gemt baseline, lokal rasterkvalitet, kommunal geografi eller faglig pilotgodkendelse. Disse har separate opgaver og acceptkrav; offentligt grundlag → droneverifikation → godkendt rapport gælder fortsat.
