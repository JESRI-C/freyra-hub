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

Entiteten er **`sn:Vandloeb`**, stabil identitet **`sn:id.lokalId`**, navne **`sn:navn_1..5.skrivemaade`** med primært aktuelt/officielt navn. Eksplicit latitude/longitude-akseorden transporteres til canonical longitude/latitude. Ingen nøglebærende URL'er registreres. Bykær er siden nævnt af brugeren som **én af pilotsagerne**; endepunkter/reviewer/øvrige cases og en observeret UI-/referenceafvigelse er åbne. Lillemølle er teknisk testreference.

Aktuel kode **c5374e50db76641f2ab9b80a6202e013ebc83b52**, Worker **c54c6163-d871-4c2b-bb8d-effe82918b1e**, [CI12](https://github.com/JESRI-C/freyra-hub/actions/runs/38432905812) FULL SUCCESS med **97/1.104** og fresh **6 SQL-filer/325 TAP**, inklusive **57 planpunkter**. Fire serverbindinger er bevaret; plan-DDL repo `20261013161017` → hosted `20261013164947`, kun staging. Baselineinput har ingen UPDATE; reviewfundet FOR SHARE blev rettet til immutable read før CI/apply med projekt-/membershiplocks/FK bevaret. CI11/972/c076 og tidligere baseline 31/canonical33 nedenfor er historik.

**Historisk baseline 31/canonical33 på CI11/972/c076:** gammel baseline `3f5ec8bc-ac7d-476a-ad0f-2dd61243bb12` og hash32f samt canonical-graf er bevaret. [Gammelt baselinebevis](staging-modern-baseline-qa-2026-10-13.json), [canonicalbevis](staging-canonical-promotion-qa-2026-10-13.json). Disse er tekniske 137-byte-/referencebeviser, ikke pilot-/rapportaccept.

**Hosted opgraderet baseline-QA PASS — 34 checkpoints:** ny baseline v2, version **2**, ID **`690ba491-f23c-4ed6-830d-453195acc08a`**, hash **`a66cf324f35a50fe3cb9148be3cb5b9e0ac1e3d9b8a2d8d324a1490dcd49c93e`**. DMI hentede faktisk **15 døgnværdier fra Vojens `05384`** efter et komplet tomt svar fra `06110`; Oksenvad `26050` blev fravalgt som lukket i 2009. Status er **partial**, UTC-periodens grænser matcher ikke døgnværdierne præcist, **totalMm er null**, og oplandsrelevans er **not_assessed**. Den tidligere baseline `3f5ec8bc-ac7d-476a-ad0f-2dd61243bb12` og hash `32f9b05a8a30c2a8a0d118f14a4f36bfb98e5b34c5bc88786c5b5599a8bcd6c3` er bevaret. [Bevis](staging-upgraded-baseline-qa-2026-10-13.json).

**Hosted verifikationsplan-QA PASS — 34 checkpoints:** planversion **1**, ID **`a951c82e-84f7-4e61-b05a-6e9fec769745`**, og planversion **2**, ID **`e8519f53-356b-465d-9cf1-0904128314d2`**, bevarer samme manifesthash **`0d7b0ee3b52bb8196acd70267f691c203c6f3c64d5889fe32afb34177d747491`** og præcis baselinebinding/frossen **v1-generator**. Ét stedmatchspørgsmål er gemt som **draft**, resultat **null**. Retry/read/cursor, RLS/grants, service-only RPC, aktuelt JWT-revoke og præcis rollegenskabelse PASS. [Bevis](staging-verification-plan-qa-2026-10-13.json). Ingen observationer, rapporter eller flyvninger blev oprettet; canonical-grafen er uændret. **SurveyRound-tabellen mangler (`PGRST205`); den må ikke opgøres som 0 runder.** Den første QA-harness' HEAD/null-count-fejl blev rettet til GET før writes, uden appændring eller svækkede tests.

**Aktuelle kildemangler og acceptgrænser:** officiel reference er tilgængelig; ny DMI-serie har 15 faktiske værdier med partial/inexact UTC-grænser, ingen fuld periodesum eller vurderet oplandskobling. Sentinel er fortsat katalogdata med lokal pixel-/sky-QA åben. Regulativ, ortofoto/terræn, vandplan/natur og offentlige vandmålestationer er fortsat **not_implemented** i baselinekæden. DMI-perioder **1/7/30 dage** og faglig oplands-/sagsrelevans mangler samlet accept. **Opgave 09 og 16 er DELVIST gennemført med teknisk runtime PASS**; plan 16 dækker kun ét stedmatchudkast uden godkendelse eller flere faglige kriterier. Fuld kildedækning, 15's faglige accept, AOI/reviewer og rapport er åbne.

Tidligere genese: [CI11-postflight](staging-modern-chain-postflight-2026-10-13.json). Den nye DMI-stationsvalgskode er nu deployet/runtimeverificeret: lukket Oksenvad `26050` fravælges, og komplet tomt svar fra `06110` fører til 15 faktiske Vojens `05384`-døgn. Perioder, oplandsrelevans og faglig accept er åbne. Legacy-saved-read genåbner valideret snapshot uden kildefetch; preview/save/ny baseline verificerer fortsat frisk provider/geometri. [To VVM-PDF-kandidater med hashes](bykaer-public-source-candidates-2026-10-13.json) er ikke regulativ eller valgt sag; rastermetadata HTTP200/79 records beviser adgang, men source 10-rasterintegration er ikke implementeret.

**Aktuel CI12-postflight:** kode c5374e50, Worker c54c6163, staging-only planmapping og upgraded-baseline-/planbeviser står i [postflight](staging-plan-dmi-postflight-2026-10-13.json), som nu faktisk findes. SQL verificerer **7 projekter/15 uploads/2 baselines/2 planversioner/1 canonical/2 origins/3 requests**. Syntetisk QA har ingen nye flyvninger/observationer/rapporter, og **SurveyRound-tabellen er fraværende**, ikke en tabel med 0 rækker. CI11-postflighten nedenfor beholder sine historiske rækketal/versioner.

**Næste source 10-kandidat — ikke del af deployet c537:** metadata-/projektionadapter er under arbejde og ikke baselineintegreret/deployet. `proj4` **2.22.0** er installeret som tre nye pakker til kandidaten med `--ignore-scripts`. Oversigt HTTP200/79 poster og versioneret GetAvailableRasterFileDownloads-metadata HTTP200 har faktiske camelCase-felter. En offentlig native-/WGS84-sammenligning af **308 vertices** gav højst **0,00378 m** numerisk afvigelse; dette er en koordinattransportkontrol, **ikke præcision mod terræn eller kontrolpunkter**. Ny bounded rastermetadataforespørgsel afventer. Ingen rasterpixels, optagedatoer, terræn-/hældnings-/dækningsresultater eller rapportaccept er bevist.

Read-only browsergenåbning på c54c af eksisterende reelt Bykær-projekt viser legacy-reference med 308 punkter/8 kurver/4,47 km uden source-load-fejl, med DAWA-udfasningslabel og offentlig credentialfri dokumentation. Ingen eksisterende sagsændring; 22,07 ha/manuelt centroid og den kommunale83m-reach er fortsat uaccepterede. Det er et snapshot-read-/UI-bevis, ikke frisk kilde- eller faglig reachaccept.

## Acceptgrænse

Kaldkontrollen beviser faktiske kildekald, CI12/kode/schema/deploy, upgraded baseline 34 og immutable verifikationsplan34 samt historisk canonical33 på syntetisk QA. DMI har nu reelle døgnværdier, men partial/inexact UTC-grænser, totalMm null og catchment not_assessed; 1/7/30-dage og faglig relevans er åbne. Fuld kildedækning, SurveyRound-datamodel, reel batch, lokal rasterkvalitet, afklaret 83 m/reviewer eller faglig pilot-/rapportgodkendelse er ikke accepteret. Opgave 09/16 er teknisk verificerede, delvise opgaver.
