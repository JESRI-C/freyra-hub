# Kanoniske droneoriginaler, rounds og fagligt review — næste implementeringskontrakt

Udarbejdet 13. oktober 2026 ved read-only gennemgang af den aktive checkout `udvikling/freyra-hub`, branch `codex/haderslev-delivery`, startet fra auditeret SHA `97782c0986d13971fd684240662a79eb70296db6`. Mødeleverancen er 10. november 2026.

**Status: designkontrakt, ikke implementeret eller accepteret.** Dokumentet ændrer ikke schema, API, produktkode, Storage eller eksisterende faglige beslutninger. Aktuel fresh disposable DB-gate skal være grøn, før næste kode-/schemaimplementering begynder. Migrationskandidater, lokale tests, hosted CI, deployment og faglig accept er forskellige beviser; ét bevis erstatter ikke de øvrige.

## Formål og opgavenumre

Denne kontrakt konkretiserer næste sammenhængende del af [Haderslev-opgaverne](../HADERSLEV_OPGAVER.md):

| Opgave       | Leverance i denne kontrakt                                                                                  | Fortsat acceptgrænse                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **17 / H08** | Kanonisk originalaktiv, dubletproveniens og idempotent promotion fra serverkontrolleret upload.             | Rå struktur-/metadatakontrol er ikke pixeldecoding, georeferering eller faglig godkendelse.      |
| **18 / H09** | Vedvarende round-, baseline-, plan- og fotobinding, genindlæsning og særskilte statusser.                   | Modtaget, råkontrolleret, tilknyttet, reviewet og rapportgodkendt må ikke tælles som samme trin. |
| **19 / H09** | Versionsfast observation, resultat og menneskelig godkend/ret/afvis-transition med præcise inputreferencer. | En kandidat eller et AI-forslag kan ikke godkende sig selv.                                      |

Kontrakten afhænger af fælles identiteter i **05**, versioneret konkret reach i **06**, baseline i **07/14**, faglig baselineaccept i **15** og verifikationsplan i **16**. Den giver struktureret input til første FØR-udkast i **21**; rapportversion, rapportgodkendelse og faktisk eksport i **22–24** er efterfølgende opgaver.

Den faglige rækkefølge er: afgrænset sag → accepteret offentligt grundlag → accepterede spørgsmål/metode → originale billeder og observationer → fagligt review → rapport. Eksisterende optagelser kan forbindes retrospektivt med deres faktiske datoer. Teknisk fixtureudvikling kan foregå, mens konkret geografi og reviewer afklares.

## Faktiske integrationpunkter og schemafund

Følgende er læst i lokale filer. Det er ikke en ny credential-båret runtimekontrol af en database.

| Aktuelt forhold                                                                                                                                                                                                            | Konkrete kilder                                                                                                                                                                                                                                                                                                      | Konsekvens for næste implementering                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `uploads` er intake/staging. H08 tilføjer serverejede `original_sha256`, `original_validation_sha256` og `original_validation`. Prepare/persist genkontrollerer medlemskab og eksakt Storage object-ID/version/updated_at. | [H08-migration](../../supabase/migrations/20261013063920_drone_original_validation.sql), [validator](../../src/services/monitoring/drone-original-validation.server.ts), [serverfunktion](../../src/lib/drone-original-validation.functions.ts)                                                                      | Genbrug dette serverresultat og dets objectbinding; browsermetadata er ikke promotionautoritet.                     |
| H08-resultaterne er `raw_original_validated`, `review_required` eller `rejected`; `pixelDecoded`, `georeferenced` og `reportEligible` er false.                                                                            | Samme H08-filer                                                                                                                                                                                                                                                                                                      | Bevar kvalitet og begrænsninger. Et kanonisk aktiv får ikke automatisk en højere evidensstatus.                     |
| `project_media` er det eksisterende fælles medieregister med UUID-projekt-FK, filsti, størrelse/MIME og valgfri optagetid/koordinater.                                                                                     | [006](../../supabase/migrations/006_project_media.sql), [metadatareconcile](../../supabase/migrations/20260831064800_reconcile_project_media_metadata.sql), [validering](../../supabase/migrations/20260831173500_validate_project_media_metadata.sql), [genererede typer](../../src/integrations/supabase/types.ts) | Udvid dette register i stedet for at etablere et parallelt filregister. Legacydata er ikke automatisk verificerede. |
| Mediereader bruger fast `project-media` bucket. Pathtrigger kræver projektkodet sti; H08-originaler har derimod `monitoring-uploads/{user}/intents/{upload}/…`.                                                            | [medieservice](../../src/services/project-media-service.ts), `private.require_private_storage_reference` i [tenant-hardening](../../supabase/migrations/20260831064838_harden_4dm_tenant_isolation.sql)                                                                                                              | Det eksisterende H08-path kan ikke kopieres direkte ind i `project_media` med nuværende trigger og reader.          |
| `project_media.is_report_ready` kan skrives gennem den eksisterende medieservice. Collectiontabeller tillader field-bidrag gennem tenantpolitikker.                                                                        | Medieservice og tenant-hardening                                                                                                                                                                                                                                                                                     | Dette legacyflag er ikke faglig godkendelse. Rapportinput skal komme fra de nye versionsfaste reviewreferencer.     |
| `drone_assets.flight_id` og `drone_flights.flown_at` er NOT NULL.                                                                                                                                                          | [flyvning/asset-migration](../../supabase/migrations/20260705211130_be41814c-3af8-4303-9f0a-94bcd3a20b68.sql), [droneservice](../../src/services/monitoring/drone-service.ts)                                                                                                                                        | Gem originalaktivet uden en opfundet flyvning eller UTC-tid. Tilknyt en faktisk kendt flyvning senere.              |
| `field_observations` og `observation_media` findes, men har ikke en immutable baseline-/question-/reviewbinding.                                                                                                           | [observationsmigration](../../supabase/migrations/20260705210841_96dfc010-b649-4fed-b3b8-b02695799507.sql), tenant-hardening                                                                                                                                                                                         | En eksisterende mutable observation må ikke læses som en godkendt versionsfast observation.                         |
| Aktuel `can_delete_monitoring_object` tillader bl.a. projektmanager/admins sletning af det scoped originalobjekt. H08 beskytter resultatindhold, ikke filens levetid.                                                      | Tenant-hardening og H08-migration                                                                                                                                                                                                                                                                                    | Promotion skal beskytte referenced originals mod Storage DELETE/replacement og metadata-/upload-sletning.           |
| Baseline er versionsfast, kilde-/geometry-/dato-/hashbundet. H07 giver kun spørgeudkast uden gemte reviews.                                                                                                                | [baseline-migration](../../supabase/migrations/20261013062924_project_baseline_snapshots.sql), [baselineservice](../../src/services/baseline/public-baseline-service.ts), [spørgegenerator](../../src/services/baseline/verification-plan.ts)                                                                        | Persistér planen fra en gemt baseline; genhent ikke nyere kilder under save/review/reload.                          |

Den eksisterende [datamodelkontrakt](../4dm-project-monitor-data-model.md) beskriver `project_media` som kanonisk, `uploads` som staging og drone-/observationsmedier som specialiseringer/junctions. [Vandløbsmetoden](../4dm-watercourse-monitoring-method.md) adskiller kameraets placering, observeret objekt, processeret produkt og kontrolleret georeferering. Disse forhold videreføres.

## Mindste målmodel

Nedenstående tabelnavne og felter er forslag til kommende migrationer. De er ikke en påstand om eksisterende tabeller. Nye migrationer oprettes via projektets Supabase CLI; eksisterende historik omskrives ikke for at indføre denne kontrakt.

| Model                                     | Typed kerne og invariants                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Udvid **`project_media`**                 | `storage_bucket` med legacydefault `project-media`, originalhash, originalvalidationhash, primær `source_upload_id`, Storage object-ID/version/updated_at og serverregistreret promotiontid. Kanonisk identitet og sourcebinding er immutable. Ingen signerede URLs gemmes.                                    |
| Ny **`project_media_upload_origins`**     | Projekt, media-ID, upload-ID, originalhash, validationhash og eksakt objectbinding. Upload-ID er unikt; relationen bevarer dubletuploads og fysisk originalproveniens.                                                                                                                                         |
| Ny **`survey_round_versions`**            | Logisk round-ID, monoton version, fase `BEFORE/IMMEDIATE_AFTER/FOLLOW_UP/CONTROL`, baseline-ID/hash, plan-ID/hash, eventuel reach-version, planlagte/faktiske tider, metode og manifesthash. Ukendte tider/geometri er nullable med udtrykkelig status.                                                        |
| Ny **`survey_round_media`**               | Roundversion, samme projekt, media-ID/hash, logical role og inkluderet/udeladt med begrundelse. Originalen kan genbruges som evidens i en anden round; det skaber ikke nye originale bytes.                                                                                                                    |
| Ny **`verification_plan_versions`**       | Baseline-ID/hash, generator-/metodeversion, immutable planmanifest og manifesthash. Manifest indeholder stabile question-ID'er, source-ID'er, perioder, AOI, prioritet, evidenskrav og usikkerhed.                                                                                                             |
| Ny **`verification_submission_versions`** | Round-/plan-/question-ID, metodeversion, originalernes ID'er/hashes, faktisk observation og dens tid, objektgeometri med provenance, resultat og begrænsninger. Indsendte versioner er immutable; rettelse er en ny version. En eventuel eksisterende field-observation forbindes med sin frosne inputversion. |
| Ny **`verification_review_decisions`**    | Typet mål: baseline, plan eller submission, mål-ID/hash, beslutning, begrundelse, verificeret actor, servertid og eventuelt `supersedes_id`. Append-only; typed FKs og CHECK kræver præcis ét mål og samme projekt.                                                                                            |
| Ny **`project_reviewer_assignments`**     | Udtrykkelig projektudpegning til baseline-/observation-/rapportreview, udpeget bruger, udpegningens actor/tid og aktiv/revokeret status. Editor-/field-adgang er ikke automatisk faglig godkendelsesret.                                                                                                       |

En faktisk reach-version er fortsat en afhængighed fra opgave 06. Roundudkast kan eksistere med `reach_version_id = null` og projekt-AOI fra baseline, mærket uafklaret. Faglig godkendelse må ikke godtage den fulde navngivne reference som den aftalte kommunale delstrækning. Konkrete endpoints, stationering og juridisk reference opfindes ikke.

For kanoniske originale bytes er en unik identitet pr. **projekt + originalhash + originalrolle** en anvendelig minimumsregel. Deduplicér ikke på tværs af tenants. Flyvning, round og anvendelsesrolle registreres i relationer, så samme original kan refereres uden ny original. Retry af samme upload skal returnere samme media-ID og bevare hver original uploadrelation.

## Originalpromotion og Storage

Anbefalet løsning er at udvide `project_media` til den allerede kontrollerede private originalreference i `monitoring-uploads`, frem for at kopiere alle filer. Det kræver en begrænset bucketbevidst reader/pathtrigger og eksplicit Storagebeskyttelse. Legacy `project-media`-referencer bevarer deres nuværende regler.

Browseren sender kun projekt/upload/request-ID. Serveren oplæser H08-resultatet, validerer resultat/hash og genkontrollerer aktuelt upload-/Storageobjekt under locks. Bucket og path læses fra den autoriserede serverreference. Frit valgt callerbucket/path må aldrig kunne få kanonisk status.

`raw_original_validated` og `review_required` kan registreres som kanoniske råfiler med deres respektive begrænsninger. `rejected` forbliver modtaget og afvist og må ikke promoveres til et brugbart aktiv. Hverken mangel på GPS eller ukendt tidszone løses med centroid, uploadtid eller antaget lokal tidszone. En senere menneskelig afklaring får egen provenance og ændrer ikke de udtrukne originalmetadata.

Nye serverfelter skal beskyttes mod browser-INSERT/UPDATE. Eksisterende tabelbrede grants må ikke utilsigtet gøre nye kolonner writable: brug eksplicit kolonnegrant/immutabilitytrigger og negative databasetests. Legacy `is_report_ready`/`status` kan ikke overtrumfe denne binding eller give rapportadgang.

Reference-FKs skal forhindre sletning af kanoniske uploads/media. Storage DELETE/replacement skal afvises, når et originalobjekt er kanonisk eller indgår i låst evidens. Det gælder også en administrator gennem den almindelige app. Eventuel senere retention-/sletteprocedure er en særskilt autoriseret proces. Object-ID/version/updated_at bevares; hvis aktuel fil ikke matcher, er evidensen utilgængelig/ændret og kan ikke stiltiende erstatte den låste version.

Hvis privat serverkopi senere vælges i stedet, kræves destinationens egen bytehash/objectbinding og bevaret sourcebinding. En Storage-kopi alene beviser ikke identiske bytes eller gør materialet godkendt.

## Versioner, resultater og reviewtransitions

Roundversioner og planversioner er gemte udkast, til de er eksplicit indsendt. Nyt indhold giver ny version; indsendte/låste manifests ændres ikke. Tilknytning af fotos til en eksisterende låst round giver en ny roundversion. Rapporten skal senere pege på bestemte versioner og reviews, aldrig på mutable latest-data.

Planen genereres server-side med `createDraftVerificationPlan` fra den gemte baseline. Manglende offentlige kilder forbliver baseline-datahuller. DMI-/scenekatalogdata bliver ikke automatisk et hydraulik-/vedligeholdelsesfund, og sourcefetch udføres ikke under gem/genåbn. Retrospektivt billedmateriale mærkes med faktisk optageperiode og forhold til baselineperioden.

Hold det faglige resultat og workflowet adskilt:

- Resultat: `supported`, `refuted`, `inconclusive`, `site_visit`.
- Reviewbeslutning: `approved`, `changes_requested`, `rejected`; fravær af beslutning er afventer review.

En godkendt `inconclusive` betyder, at den dokumenterede usikkerhed er gennemgået. Det beviser ikke en tilstand, effekt eller et indsatsbehov. Godkendelse af baseline/plan er heller ikke godkendelse af alle senere observationer.

For `supported/refuted` skal metoden, datoerne og den geografiske sammenhæng kunne vurderes på referenced original/evidens. Kameraets GPS er ikke objektgeometri eller billedfootprint. Uklar geografisk sammenhæng kan give `inconclusive/site_visit`; originalfotos uden GPS kan fortsat reviewes, hvis anden dokumenteret geolokalisering foreligger. Der må ikke opstå en automatisk positiv vurdering fra den manglende information.

Baselineapproval binder en faktisk accepteret reach-/baselineversion og reviewer. Planapproval binder baselineapproval og den præcise plan/metode. Faglig indsendelse/godkendelse af observation binder disse forudsætninger og en låst roundversion. En ny rettelse eller senere revokeret/superseded beslutning kan ikke ændre en allerede gemt rapportversion; fremtidig rapportgodkendelse skal kontrollere den gældende beslutningskæde.

Reviewer kommer fra verificeret auth og en aktiv, udtrykkelig assignment, ikke fra `user_metadata`, et navn i JSON eller browserens reviewer-ID. Kontrakten udpeger ingen konkret person og antager ingen faglig kvalifikation ud fra en eksisterende teknisk rolle.

## Smal API- og sikkerhedskontrakt

Foreslåede API'er:

```ts
promoteDroneOriginal({ projectId, uploadId, requestId })
saveSurveyRoundDraft({ projectId, baselineId, phase, requestId, ... })
saveVerificationPlan({ projectId, baselineId, requestId })
attachRoundMedia({ projectId, roundVersionId, mediaId, requestId })
submitVerification({ projectId, roundVersionId, questionId, ... })
recordVerificationReview({
  projectId, targetId, expectedTargetSha256, decision, rationale, requestId
})
```

`...` angiver endnu ikke fastlagte typed draft-/observationsfelter, ikke fri JSON-persistens. API-validering defineres eksplicit ved implementering. Actor, canonical hashes, sourcebinding og servertid beregnes/læses af serveren. Callerens `expectedTargetSha256` er en samtidighedspræmis; serveren sammenligner med det autoriserede mål og beregner ikke godkendelse ud fra callerens påstand.

Autoriseret auth-/projektread skal ske før service-role-client, download eller writer. Writer-RPC'er er service-only og genkontrollerer aktuelle rettigheder under locks på projekt, medlemskaber, reviewerassignment og relevante input i konsistent rækkefølge. Det beskytter mod revoke/race mellem servercheck og commit. Alle childrelationer kræver samme projekt gennem typed FK eller eksplicit SQL-trigger; callerens projekt-ID er ikke nok.

Nye exposed tabeller får tenantafgrænset SELECT, RLS og eksplicitte grants. Browseren får ingen writes til godkendelse, hash, immutable versionsmanifest eller udpegning. Versionsallokering og idempotens sker atomisk. Samme request/input returnerer eksisterende version; samme request med ændret input giver konflikt. List-API'er returnerer begrænsede summaryfelter med pagination, ikke alle store manifests. Maksimal manifeststørrelse og bounded bulkbehandling fastlægges og testes.

## Implementeringsrækkefølge og accept

1. **Opgave 17:** promotion, immutable identitet, originrelationer og Storage-/slettebeskyttelse. Ét kontrolleret JPEG går gennem finalize → H08 → kanonisk media. Retry og en separat dubletupload giver samme kanoniske media-ID med bevarede originrelationer.
2. **Opgave 18:** gem plan/roundudkast og fotobinding. Reload giver samme ID'er/hashes. Statusser for modtagelse, råkontrol, tilknytning og review vises særskilt. Ingen ny originalkontrol/sourcefetch kræves for at læse gemte records.
3. **Opgave 19:** versionsfast submission og append-only review. Ret/afvis er en reel transition med actor, tid og begrundelse. Godkendelse afviser manglende reach-/baseline-/planapproval eller reviewerassignment.
4. **Opgave 21:** én fixtureobservation gennem hele kæden giver et faktisk projektbundet FØR-udkast med limitations og de låste inputreferencer. Det er teknisk accept; ikke kommunens faglige pilotaccept.

Målrettede tests skal omfatte forkert tenant, viewer/field versus reviewer, spoofet actor/hash/path, relation til et andet projekt, ændret Storageversion, membership-/assignment-revoke under commit, samtidige promotions/retries, ukendt GPS/tidszone, afvist original, sletning af referenced originals, immutable approved input og identisk reload. Failed processing er aldrig ready. Udvid derefter fra én fil til 10/120 og reel batch, når de relevante adgangs-/runtimegates består.

Den minimale første nye kodeleverance er **promotion + dubletproveniens + gemt roundudkast**. Den kan bygges på kontrollerede fixtures efter aktuel fresh DB-gate. Eksakte reachdata og en udpeget reviewer er nødvendige for faglig pilotaccept, men kan ikke erstattes af fixturedata eller udviklerens tests. Baselineaccept, private originalers credential-bårne adgangsaccept, rigtig batchreview og den faktiske rapport/eksport forbliver åbne opgaver, til deres egne beviser foreligger.
