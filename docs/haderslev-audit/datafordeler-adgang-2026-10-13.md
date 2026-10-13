# Datafordeler: adgang, faktiske WFS-kald og kodekandidat

Kontrolleret 13. oktober 2026. Notatet dokumenterer adgangsopsætning, efterfølgende autentificerede kildekald og en endnu ikke committed kodekandidat. Ingen nøgle-, password-, e-mail-, JWT- eller tokenværdier registreres. Faktiske kildekald er ikke en gemt baseline eller faglig godkendelse af en kommunal sag.

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

| Kontrol                                                                                             | Faktisk svar                                   | Hvad det beviser                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GetCapabilities                                                                                     | **HTTP 200 / 156.988 bytes**                   | Autentificeret WFS-adgang virker. Capabilities angiver GML-formater; GeoJSON er ikke dokumenteret som outputformat.                |
| DescribeFeatureType                                                                                 | **HTTP 200 / 652 bytes**                       | Svaret indeholder kun en schema-include; det er ikke hele entitetsskemaet.                                                         |
| Refereret offentligt XSD                                                                            | **HTTP 200 / 134.514 bytes**                   | Det faktiske schema kan læses og understøtter mappingen nedenfor.                                                                  |
| GetFeature, COUNT 1, SRSNAME `urn:ogc:def:crs:EPSG::4326`                                           | **HTTP 200 / 12.698 bytes**                    | En begrænset reel feature kan læses med eksplicit CRS.                                                                             |
| FES PropertyIsLike på `sn:navn_1.skrivemaade`, søgetekst **Bykær Bæk**                              | **HTTP 200 / 12.152 bytes**                    | Returnerede lokal-ID **`1233766a-1fdb-6b98-e053-d480220a5a3f`**. Dette er en teknisk testreference, **ikke valgt kommunal pilot**. |
| FES PropertyIsEqualTo på `sn:id.lokalId`, Lillemølle Bæk **`120b35a4-d910-46b9-e063-6f4f210a952b`** | **HTTP 200 / 12.695 bytes**, entydigt resultat | Et stabilt lokal-ID kan genfindes præcist; dette er også en teknisk referencetest.                                                 |

Den faktiske entitet er **`sn:Vandloeb`**. Stabil identitet kommer fra **`sn:id.lokalId`**. Navne læses fra **`sn:navn_1..5.skrivemaade`**, med primært aktuelt/officielt navn. Den oplyste CRS har eksplicit **latitude/longitude**-akseorden; transporten til canonical geometri omsætter til **longitude/latitude**. Dette må ikke erstattes af en gættet akseorden eller af et omskrevet gammelt DAWA-ID.

Danske Stednavne har ifølge kildegrundlaget ikke været opdateret siden september 2025. Et aktuelt hentetidspunkt er derfor ikke et bevis på nyopmålt vandløbsgeometri, kommunal afgrænsning eller regulativstationering.

## Uncommitted kodecheckpoint

Den nye serveradapter/GML-parser er på disk med grænser for bytes og deadline, namespace-/DTO-validering, afviste redirects og credentialfri output/proveniens. XML-parseren er fastlåst til **`fast-xml-parser` 5.11.2**. **61 parsertests PASS**. Versioneret v1/v2-proveniens og snapshotgren er forberedt; **46 baseline-/reachtests PASS**, inklusive **12 nye** supplerende datocases. Gemte v1-referencer må ikke lydløst omskrives til den nye provider.

En første fuldsuite blev standset af Windows TEMP-cache **EPERM før tests**. Efter flytning af TEMP/TMP til arbejdsområdet bestod en direkte Vitest-kørsel med **94 testfiler / 1.012 tests**, **før** de 12 supplerende datocases. Dette er et tidligere delbevis på kandidaten, ikke en endelig samlet gate efter alle ændringer. **Endelig fuldsuite/build/deploy/hosted CI er endnu ikke accepteret.** Koden har ikke et nyt committed eller deployet checkpoint her.

Opgave 17 har desuden en canonical-kandidat på disk: migration/service, upload-retry-UI og privat bucketreader. Deltests består: **11 promotion-/authtests, 17 readertests og 12 retry-helpertests**. **72+ SQL-punkter er planlagt; kandidatens DB-replay/apply er ikke udført.** Disse tal lægges ikke til den samlede suite som ekstra unikke tests og accepterer ikke round-/baseline-/spørgsmålsbinding, fagligt review eller en virkelig batch.

Tidligere verificerede kode-/runtimebeviser beholder deres genese: `ca333c810656ca7cc5901d3aa32c4919d16c6433`, Worker `0fe72b06-db07-48d5-b7de-440d942e7d22` og CI8. CI9 på dokumentationshead `9ea2f5f` accepterer ikke den efterfølgende kodekandidat eller Datafordeler-integration i den hostede app.

## Resterende accept i prioriteret rækkefølge

1. Afslut samlede kode-/dependency-/build-/deploy-/CI-gates efter alle kandidatændringer. Verificér den nye provider i faktisk deployet serverruntime med credentialfri proveniens og korrekte fejlstatusser.
2. Gennemfør faktisk privat baseline-persistens og genåbning af samme immutable version med ny autoritativ reference. Kontrollér v1/v2-kompatibilitet og dato-/geometribinding i runtime.
3. Fastlæg opgave 04's kommunale delstrækning, beslutningsspørgsmål og reviewer. Tekniske Bykær-/Lillemølle-referencer vælger ikke sagen. Indhent regulativ og resterende offentlige kilder og få faglig baselineaccept.
4. Runtimeverificér canonical-migration og adgangs-/idempotens-/retrygates efter fresh DB-replay. Gennemfør reel batch, round-/spørgsmålsbinding, review og den faktiske godkendte rapport-/eksportkæde.

**Staging har fortsat 0 gemte baselines.** Autentifikation og afgrænsede kildekald er nu lykkedes; kodekandidaten er deltestet, men opgave 08/17 og den fulde kommunale leverance er ikke afsluttet. Offentlige data først → droneverifikation → fagligt godkendt rapport gælder fortsat frem mod **10. november 2026**.
