# Datafordeler: adgang, WFS-kald, deployment og baseline-QA

Kontrolleret 13. oktober 2026. Notatet dokumenterer adgang, autentificerede WFS-kald, committed/deployet kode/schema og teknisk hosted baseline-QA. Ingen nøgle-, password-, e-mail-, JWT- eller tokenværdier registreres. En syntetisk baseline er ikke fuld kildedækning eller faglig godkendelse af kommunens sag.

## Faktisk etableret adgang

| Element          | Verificeret status                                                                                                                                                                                                | Acceptgrænse                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Konto            | Brugeren har oprettet konto og verificeret e-mail. Almindeligt login er efterfølgende gennemført.                                                                                                                 | Kontooprettelse beviser ikke API-autentifikation eller datadækning.                                                          |
| IT-system        | **GoFreyra Staging** er oprettet og aktivt.                                                                                                                                                                       | Ingen adgang til beskyttede registre er nødvendig eller accepteret af dette forløb.                                          |
| API-key metadata | Brugeren har oprettet **GoFreyra staging offentlige data**, med udløbsdato **13. oktober 2028**.                                                                                                                  | Navn/udløbsdato er metadata; nøglens værdi må ikke læses eller offentliggøres i dokumentation.                               |
| Stagingbinding   | Nøglen er provisioneret som krypteret **`DATAFORDELER_API_KEY`**, kun på **`gofreyra-p0-staging`**. `wrangler secret bulk` rapporterede success for én nøgle; efterfølgende secret-list viste fire bindingsnavne. | Tilstedeværelse af binding er ikke API-/schema-/provideraccept. Produktion og klientkode er ikke ændret af nøgleoverførslen. |

Den nye Datafordeler-binding er adgangskonfiguration. Tidligere kode-/runtimebeviser gælder stadig deres konkrete versioner: kode `ca333c810656ca7cc5901d3aa32c4919d16c6433` og kontrolleret Worker `0fe72b06-db07-48d5-b7de-440d942e7d22`, før denne efterfølgende adgangskontrol. En secretbinding giver ikke et nyt kode-/providerbevis. [CI9](https://github.com/JESRI-C/freyra-hub/actions/runs/38414463410) på dokumentationshead `9ea2f5f` er SUCCESS; den grønne kontrol er ikke en vellykket Datafordeler-forespørgsel.

## Tidligere kodeforberedelse — serverbinding og klientafvisning

`wrangler.jsonc` er efterfølgende forberedt til at kræve `DATAFORDELER_API_KEY` i `env.staging`, altså fire krævede bindingsnavne uden værdier. Preflight afviser `VITE_DATAFORDELER_API_KEY` og medtager Datafordeler i browserbundlens scan for credentialværdier. Otte eksisterende CI-/konfigurationskontraktchecks PASS, almindelig preflight PASS og en faktisk syntetisk VITE-key-invocation gav forventet exit 1.

Disse delkontroller ændrer ikke de tidligere `ca333c8`-/`0fe72b06`-bevisers genese og er ikke en ny build-/deploy-/CI-accept. Et krav til serverbinding er ikke i sig selv vellykket autentifikation hos Datafordeler; de efterfølgende faktiske kildekald fremgår nedenfor.

## Historisk første autentificerede kildekald

Det første serverinternt autentificerede **GetCapabilities**-kald gav **HTTP 401**, fejlkode **`DAF-AUTH-0005`**: nøglen blev ikke genkendt. Nøgleparameter, nøglebærende URL og rå autentifikationsdata er udeladt.

Den officielle vejledning angiver **mindst 15 minutter efter nøgleoprettelse** før brug. Dette første svar og venteforudsætningen bevares som historik. De senere HTTP 200-kald nedenfor viser, at autentifikation nu er lykkedes; eventuelle fremtidige kildefejl må fortsat ikke erstattes af demo eller nul.

Officielt grundlag: [Datafordeler Administration](https://portal.datafordeler.dk/hjem), [API-key-guide](https://confluence.kds.dk/pages/viewpage.action?pageId=187105503) og [Danske Stednavne bearbejdet WFS](https://datafordeler.dk/dataoversigt/danske-stednavne/danske-stednavne-bearbejdet-wfs/). Den tidligere anonyme kilde-/endpointkontrol bevares i [live-kildekontrollen](live-kildekontrol-2026-10-13.md).

## Faktiske kald efter aktivering

| Kontrol                                                                                             | Faktisk svar                                   | Hvad det beviser                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GetCapabilities                                                                                     | **HTTP 200 / 156.988 bytes**                   | Autentificeret WFS-adgang virker. Capabilities angiver GML-formater; GeoJSON er ikke dokumenteret som outputformat.                                                                     |
| DescribeFeatureType                                                                                 | **HTTP 200 / 652 bytes**                       | Svaret indeholder kun en schema-include; det er ikke hele entitetsskemaet.                                                                                                              |
| Refereret offentligt XSD                                                                            | **HTTP 200 / 134.514 bytes**                   | Det faktiske schema kan læses og understøtter mappingen nedenfor.                                                                                                                       |
| GetFeature, COUNT 1, SRSNAME `urn:ogc:def:crs:EPSG::4326`                                           | **HTTP 200 / 12.698 bytes**                    | En begrænset reel feature kan læses med eksplicit CRS.                                                                                                                                  |
| FES PropertyIsLike på `sn:navn_1.skrivemaade`, Bykær Bæk                                            | **HTTP 200 / 12.152 bytes**                    | Lokal-ID `1233766a-1fdb-6b98-e053-d480220a5a3f`. Brugeren har siden nævnt Bykær Bæk som én af pilotsagerne; referenceopslaget fastlægger ikke kommunale endepunkter eller godkendt AOI. |
| FES PropertyIsEqualTo på `sn:id.lokalId`, Lillemølle Bæk **`120b35a4-d910-46b9-e063-6f4f210a952b`** | **HTTP 200 / 12.695 bytes**, entydigt resultat | Et stabilt lokal-ID kan genfindes præcist; dette er også en teknisk referencetest.                                                                                                      |

Den faktiske entitet er **`sn:Vandloeb`**. Stabil identitet kommer fra **`sn:id.lokalId`**. Navne læses fra **`sn:navn_1..5.skrivemaade`**, med primært aktuelt/officielt navn. Den oplyste CRS har eksplicit **latitude/longitude**-akseorden; transporten til canonical geometri omsætter til **longitude/latitude**. Dette må ikke erstattes af en gættet akseorden eller af et omskrevet gammelt DAWA-ID.

Danske Stednavne har ifølge kildegrundlaget ikke været opdateret siden september 2025. Et aktuelt hentetidspunkt er derfor ikke et bevis på nyopmålt vandløbsgeometri, kommunal afgrænsning eller regulativstationering.

## Verificeret kode-, schema- og deploymentcheckpoint

Pushed kode **`972524e298d0bbad1cbefb2e6e39d0a2c5886017`**, deployet staging Worker **`c07618c5-17d3-49ff-8341-b336744aab1f`**. Applikationstræet er identisk med det byggede `bf67149161ec0681d383569d802b5b0b76cdf799`. [CI11](https://github.com/JESRI-C/freyra-hub/actions/runs/38425940663) er fuldt **SUCCESS**: **94 testfiler/1.024 tests**, appgates og fresh disposable LOCAL migrationsreplay med **5 SQL-filer/268 TAP-punkter PASS**. Fire serverbindingsnavne, inklusive Datafordeler, er bevaret uden værdier. GML-serveradapterens byte-/deadline-/namespace-/DTO-gates, afviste redirects, credentialfri proveniens og v1/v2-kompatibilitet er committed; `fast-xml-parser` er fastlåst til **5.11.2**.

**Historiske delkontroller:** første suite blev standset af Windows TEMP-cache EPERM før tests; workspace TEMP/TMP gav 94/1.012 før 12 supplerende datocases. Parser61 og baseline/reach46 inklusive 12 nye bestod. CI10 på `bf67149` fejlede 1/268 ved `OLD.original_role` recordplanning; en separat IF rettede fejlen uden svækkede tests. Det aktuelle samlede bevis er CI11's 94/1.024 og 268 TAP.

**Nye migrations applied kun på staging `xdvqdzdpyceojbdknofi`:** repo `20261013144725` → hosted `20261013160451`, promote_drone_original; repo `20261013151039` → hosted `20261013160458`, datafordeler_watercourse_reference. Canonical-service, upload-retry og privat reader er committed/deployet. Tidligere målrettede promotion/auth11, reader17 og retry-helper12 er delkontroller; de lægges ikke oven i fuldsuiten.

## Hosted canonical promotion-QA

**Hosted canonical promotion-QA PASS — 33 checkpoints:** media `df98d250-fb09-4fa5-b275-e5e06cbb9ab5`, primær origin `c7d8f058-f747-4b5b-a211-d304d3df8034`, dubletorigin `492464e0-5cd5-408f-b8ff-20a8621851eb`, dublet-TUS `00b7b90f-eef9-4b84-a87b-4a8a0c95fbac`. **1 canonical / 2 fysiske originaler / 3 requests og 3 auditevents**; retry/dedup bevarer ID. Almindelig owner og viewer læser private bytes med HTTP 200 og verificeret SHA; foreign/anon nægtes, reserverede kolonner/service-RPC giver 42501, samme-JWT revoke og præcis membershiprestore PASS. Owner-overwrite nægtes; delete nægtes/0 fjernet. Begge faktiske filer er 137 bytes med samme hash; objectpins/DB-graf er uændret. 60-sekunders signed URL gav 400 efter 72 sekunder. [Bevis](staging-canonical-promotion-qa-2026-10-13.json). Dette lukker den tekniske canonical-slice, ikke round/review/batch/rapport; fixture har `review_required`, ingen EXIF/GPS.

## Hosted moderne baseline-QA

**Hosted moderne baseline-QA PASS — 31 checkpoints:** syntetisk projekt `24046b35-20cf-46f6-83de-1190b2d6a285`, zone `1b88e5f3-f1ec-43d6-b70e-025e732812f6`, faktisk Bykær-provider/reference `1233766a-1fdb-6b98-e053-d480220a5a3f`, statisk dataversion **2025-09**, **308 vertices**. Baseline v2 `3f5ec8bc-ac7d-476a-ad0f-2dd61243bb12`, version **1**, hash `32f9b05a8a30c2a8a0d118f14a4f36bfb98e5b34c5bc88786c5b5599a8bcd6c3`. Save/retry/get/list bevarer ID/hash og én faktisk række; viewer-læsning, foreign/anon-denial, samme-JWT revoke og præcis membershiprestore PASS. [Bevis](staging-modern-baseline-qa-2026-10-13.json). Dette er teknisk persistensaccept på syntetisk QA, ikke en kommunalt godkendt baseline.

**Faktiske syv kilder i QA-baselinen:** officiel reference **complete**; DMI **no_coverage / 0 målinger** fra det aktuelle stationsvalg; Sentinel **partial / 9 scener**, katalogdata uden lokal pixel-/sky-QA; regulativ, ortofoto/terræn, vandplan/natur og offentlige vandmålestationer **not_implemented**. DMI-undersøgelsen fandt valgt nærmeste station **Oksenvad `26050`, Inactive**, uden døgnværdier; dette konkluderer ikke manglende dækning fra alle DMI-stationer. QA har fortsat **0 droneflyvninger/drone_assets/observationer/rapporter**, og baselinen er uændret efter promotion. Opgave 15's faglige accept, fuld kildedækning, AOI/reviewer og rapport er åbne. **Opgave 16's planpersistens er I GANG**.

## Verificeret postflight og nye kodekandidater

**Verificeret staging-postflight efter de nye QA-kontroller:** **7 projekter/15 uploads/1 baseline/2 raw-originalvalidations/1 canonical/2 origins/3 requests**; syntetisk QA har **0 flyvninger/observationer/rapporter**. Kode-/build-/CI11-/Worker-/migrationmapping og faktisk sikkerhedskatalog/adgang er samlet i [postflight](staging-modern-chain-postflight-2026-10-13.json). Tallene er teknisk QA, ikke kommunal indlæsning eller rapportaccept.

**Efterfølgende kodekandidater, endnu ikke deployet/accepteret:**09 bruger faktisk DMI operation-/validperiode og max 3 bounded kandidater efter komplette tomme svar; den valgte Oksenvad 26050 har operationTo 2009-04-02 trods validTo:null.16 implementerer immutable planstore uden godkendelse/ny sourcefetch. En kildelink-UI-rettelse skal åbne offentlig produktbeskrivelse frem for et uautentificeret GetFeature-link; gemt sourceURL/hash ændres ikke af den kandidat.

## Kommunalt pilotscope og observeret AOI-afvigelse

Brugeren har nævnt **Bykær Bæk som én af pilotsagerne**, ikke den eneste; reviewer, kommunale endepunkter/beslutningsbehov og øvrige cases er ikke valgt. Read-only staging-UI efter reload på det eksisterende **Bykær Bæk–førregistrering**-projekt `90e964d6-040b-4286-b57f-6786531931b3` viste **22,07 ha**, manuelt tegnet centroid **55.9991 N / 10.5008 E** og fejlen **“Kunne ikke læse en gemt vandløbsstreng”**. Datafordeler-testreferencens koordinater var omtrent **55.365 / 9.268**. Afvigelsen er uafklaret; UI-tallet er en observation, ikke en ny faglig arealmåling. Ingen eksisterende kundegeometri er ændret. Registergeometri/bbox må ikke registreres som aftalt kommunal reach uden afklaring; den syntetiske zone i baseline-QA er alene runtimebevis.

Tidligere verificerede kode-/runtimebeviser beholder deres genese: `ca333c810656ca7cc5901d3aa32c4919d16c6433`, Worker `0fe72b06-db07-48d5-b7de-440d942e7d22` og CI8. CI9 på dokumentationshead `9ea2f5f` accepterer ikke den efterfølgende kodekandidat eller Datafordeler-integration i den hostede app.

## Resterende accept i prioriteret rækkefølge

1. Fortsæt opgave 16's planpersistens og round-/baseline-/spørgsmålsbinding efter det teknisk beståede baseline-/canonical-flow. Gennemfør reel batch og relevante formater/runtimegrænser; 137-byte-fixturen accepterer ikke dette.
2. Luk den observerede AOI-afvigelse og fastlæg kommunale endepunkter, formål, datoer, reviewer og øvrige cases. Bykær er én af pilotsagerne; en syntetisk QA-zone vælger ikke den kommunale strækning.
3. Indhent regulativ og de øvrige manglende offentlige kilder. Kontrollér datodækning/lokal kvalitet og få opgave 15's faglige baselineaccept; teknisk source-status complete er ikke fuld sagsdækning.
4. Gennemfør round-/baseline-/spørgsmålsbinding, review og den faktiske versionsfast godkendte rapport-/eksportkæde.

**Én syntetisk QA-baseline og én canonical med to fysiske originaler er teknisk runtimeverificeret**, inklusive idempotens/private bytes/adgang/TTL. Fuld kildedækning, AOI/reviewer/kommunalt scope, reel batch/review, 15's faglige accept og rapport er fortsat åbne. Opgave 16's planpersistens er I GANG. Opgave 08/17 og leverancen som helhed er ikke afsluttet. Offentlige data først → droneverifikation → godkendt rapport gælder frem mod **10. november 2026**.
