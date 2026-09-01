# 4DM Supabase RLS-testmatrix

Dato: 2026-08-31

## Status og evidensniveau

Hardening er dækket af grønne statiske/unit-tests og er anvendt på staging `xdvqdzdpyceojbdknofi`. Hele suiten bestod med 43 filer/350 tests; typecheck og staging-build bestod, og buildet indeholder kun staging-ref.

En transaktionel stagingtest som `authenticated` beviste eget project/media/Storage-read samt cross-tenant project/media/Storage-read, write og metrics-RPC-afvisning; fixtures blev rullet tilbage. Anon PostgREST afviser `projects` og `project_media` med 401. En rigtig Auth-/Storage API-rejse, alle roller og `supabase/tests/database/4dm_tenant_isolation.test.sql` med `plan(62)` er fortsat **AFVENTER**, fordi Docker/Podman ikke er tilgængelig. Produktion er ikke testet eller ændret.

Supabase CLI-version: **2.116.0**.

## Isolerede identiteter

| Identitet                 | Organisation        | Rolle                   | Formål                                         |
| ------------------------- | ------------------- | ----------------------- | ---------------------------------------------- |
| `a-owner@test.invalid`    | A                   | owner + project admin   | Creator-, owner- og adminflows                 |
| `a-admin@test.invalid`    | A                   | admin + project manager | Administration uden owner                      |
| `a-member@test.invalid`   | A                   | editor                  | Generelle, ikke-administrative writes          |
| `a-field@test.invalid`    | A                   | field                   | Kun collection/evidence contribution           |
| `a-external@test.invalid` | A                   | external                | Skal fejle lukket uden document-share-relation |
| `a-viewer@test.invalid`   | A                   | viewer                  | Read-only negative writes                      |
| `b-owner@test.invalid`    | B                   | owner + project admin   | Modpart                                        |
| `b-member@test.invalid`   | B                   | editor                  | Modpart                                        |
| `no-org@test.invalid`     | Ingen               | Ingen                   | Uautoriseret authenticated bruger              |
| `removed@test.invalid`    | A, derefter fjernet | Tidligere medlem        | Samme JWT efter medlemskabsfjernelse           |
| Lokal serviceidentitet    | Teststack           | `service_role`          | Fixture-setup/readback; aldrig brugerrequest   |

Auth-brugerne skal oprettes via lokal Auth Admin API. Testdata er syntetiske og rulles tilbage/resettes. Test-URL skal være `localhost` eller `127.0.0.1`.

## Kilde- og servicetests, der er kørt

| ID      | Test                                                                       | Resultat | Hvad den beviser                                                                            |
| ------- | -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| SRC-001 | Hele migrationsrækkefølgen + seed/setup indlæses af testen                 | Bestået  | Hardening-filen er sidst og entydig i kildetræet                                            |
| SRC-002 | Kendte legacy/open policy-navne droppes                                    | Bestået  | Den lokale SQL indeholder eksplicit cleanup; ikke DB-effekt                                 |
| SRC-003 | Anon grants og function execute indsnævres                                 | Bestået  | Kilde-invariants for grants/search path                                                     |
| SRC-004 | Project self-enrol og tenant-key moves lukkes                              | Bestået  | Policies/triggers findes i lokal SQL                                                        |
| SRC-005 | Owner-eskalering, creator-bootstrap og membership `user_id`-immutability   | Bestået  | Lokale predicates/triggers findes                                                           |
| SRC-006 | One-way upload scope, `upload_import_jobs`-arv og monitoring fallback      | Bestået  | Lokale upload-/Storage-predicates findes                                                    |
| SRC-007 | `setup_complete.sql` genindfører hverken åbne policies eller RPC-overrides | Bestået  | Legacy script kan ikke statisk overskrive hardeningens RPC-definitioner                     |
| SRC-008 | Canonical Storage org/project-relation og legacy path                      | Bestået  | `storage_path_matches_project` afviser forged org-segment                                   |
| SRC-009 | Field whitelist og external fail-closed                                    | Bestået  | Field er ikke general writer; external er ikke general reader                               |
| SRC-010 | Direkte/indirekte parent-guards og immutable provenance keys               | Bestået  | 18 tabelguards, fire specialguards, parent immutability og measurement-FK findes lokalt     |
| SRC-011 | Signup uden email-authorization og snæver Storage orphan-cleanup           | Bestået  | Founder-email fjernes; cleanup kræver owner, alder, contribution og manglende metadata      |
| SRC-012 | Monitoring path-uploader-binding, duplicate/race-guard og manage-delete    | Bestået  | Path er uploader-prefixed/immutable, helpers failer på dublet, scoped delete kræver manage  |
| SRC-013 | Storage uden UPDATE og immutable, projektvaliderede metadatareferencer     | Bestået  | UPDATE-policies er fraværende; media/evidence path kan ikke forgiftes eller byttes          |
| SRC-014 | Upload column grants, backend-proveniens og DB-audit                       | Bestået  | INSERT/UPDATE-whitelist og trigger findes; status/derived metadata er backend-ejet          |
| SRC-015 | DB-konfigurerede bucket size/MIME-grænser                                  | Bestået  | Monitoring 200 MiB + allowlist og project-media 50 MiB + image/PDF genanvendes ved conflict |
| APP-001 | Forged project-query og cross-org selection                                | Bestået  | Klientcontext vælger kun projekter i aktiv organisation                                     |
| APP-002 | Login/logout/bruger-switch rydder tenant-cache                             | Bestået  | Gamle query-resultater genbruges ikke mellem brugere                                        |
| STO-001 | Project media bruger 300 s signed URL og ignorerer public URL-felter       | Bestået  | Serviceadfærd med mocked Supabase                                                           |
| STO-002 | Signeringsfejl er fail-closed                                              | Bestået  | Service returnerer ikke fallback-public URL                                                 |
| STO-003 | Upload persisterer kun path, `upsert: false`                               | Bestået  | Ingen signed URL lagres                                                                     |
| STO-004 | Delete bruger DB-rækkens autoriserede path                                 | Bestået  | Manipuleret caller-path ignoreres                                                           |
| STO-005 | Evidence sanitiserer navn, gemmer privat path og rydder op ved DB-fejl     | Bestået  | Kompensationsflow med mocked Supabase                                                       |
| MON-001 | Monitoring rollback-fejl er synlig                                         | Bestået  | Dobbeltfejl efterlades ikke som tavs succes                                                 |
| MON-002 | Monitoring signed URL har fast 300 s TTL                                   | Bestået  | Caller kan ikke vælge en længere levetid                                                    |
| MON-003 | Monitoring delete stopper ved Storage-fejl                                 | Bestået  | Metadata og audit ændres ikke efter afvist object-delete                                    |
| MON-004 | Monitoring delete kræver én faktisk slettet metadata-række                 | Bestået  | RLS/no-row bliver synligt frem for falsk succes                                             |

Kommandoen dækkede i alt 5 filer/37 tests; tabellen grupperer beslægtede assertions. Den beviser ikke RLS eller Storage-serveradfærd.

## pgTAP-plan, 62 assertions — ikke kørt

Den nuværende pgTAP-fil dækker:

- A-admin læser A og ikke B ved direkte UUID
- afvist self-enrol i B med service-readback
- afvist owner-create, owner-promotion og rewrite af membership `user_id`
- lovlig A-geometri/area-write og afviste B-writes
- immutable projekt- og area-tenantnøgler med readback
- personlig upload → projekt A som lovlig engangsassignment
- `upload_import_jobs` både før og efter assignment
- derived status/GPS/validation/importdata kan hverken forfalskes ved INSERT eller UPDATE
- monitoring-path skal matche uploader, og tenant B kan ikke aliasere tenant A's path
- Storage read A/deny B samt afvist B insert/update/delete; fravær af UPDATE-policy verificeres også statisk
- evidence-metadata afviser fremmed Storage-projekt, og etableret project-media-reference kan ikke byttes
- viewer read-only
- field kan oprette feltobservation, men kan ikke oprette rapport eller opdatere projektkonfiguration
- symmetrisk tenant B og outsider uden projektsynlighed
- media-UUID-isolation
- GeoJSON/metrics RPC allow A/deny B
- composite project-area/metric constraint
- anon uden RPC- og tabeladgang
- samme JWT efter medlemskabsfjernelse: både projekt- og Storage-read = 0
- canonical Storage-path med organization B/project A afvises
- external kan hverken læse hele projektet eller projektdatasæt uden en document-share-relation
- action-evidence kan ikke re-parentes efter oprettelse, selv inden for samme projekt
- en legacy founder-email får ingen delt demo-owner-adgang, mens signup stadig får én isoleret personal org
- field kan slette sit eget nye metadata-løse orphan, og objektet er væk bagefter
- field upload-oprettelse registreres af database-triggeren
- monitoring bucket har 200 MiB og den dokumenterede MIME-allowlist
- project-media bucket har 50 MiB og kun image/PDF

Normal organization/project creator-bootstrap kontrolleres statisk, mens signup-personal-org bootstrap er med i pgTAP-planen. Den nuværende 62-plan tester ikke alle 18 direkte parent-guards, alle immutable indirect-parent keys eller de fire specialguards gennem databasen.

## Struktur- og granttests

| ID     | Test                            | Forventning                                                                                                                | Status       |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------ |
| DB-001 | Ren `supabase db reset --local` | Alle migrations og data-only seed anvendes uden fejl                                                                       | **AFVENTER** |
| DB-002 | `supabase db lint --local`      | Ingen error-level database findings                                                                                        | **AFVENTER** |
| DB-003 | RLS-introspektion               | RLS enabled; ingen legacy `dev_*`, public `USING(true)` eller skjulte OR-bypasses                                          | **DELVIST STAGING** — 61 app-tabeller med RLS og 0 `dev_*`; fuld policykombination/lokal replay og `spatial_ref_sys`-afklaring mangler |
| DB-004 | Grants til `anon`/PUBLIC        | Ingen tenanttabel- eller privat object-adgang                                                                              | **DELVIST STAGING** — anon `projects`/`project_media` = 401; `spatial_ref_sys` = 200; fuld grantmatrix mangler |
| DB-005 | Policy pr. operation            | SELECT/INSERT/UPDATE/DELETE har korrekt rolle, `USING` og `WITH CHECK`                                                     | **AFVENTER** |
| DB-006 | Function inventory              | Definer/invoker, owner, execute og `search_path` matcher designet                                                          | **AFVENTER** |
| DB-007 | Views                           | Eventuelle views er security-invoker eller ikke eksponeret                                                                 | **AFVENTER** |
| DB-009 | Bucketdefinitioner              | Alle tre private; monitoring 200 MiB + allowlist, project-media 50 MiB + image/PDF; evidence bevarer eksisterende kontrakt | **PASS staging-katalog / API AFVENTER** |
| DB-011 | Upload column grants/audit      | Kun whitelisted inputkolonner; afledt metadata backend-ejet; upload-created audit præcis én gang                           | **AFVENTER** |
| DB-010 | Creator-bootstrap               | Orgcreator bliver owner og projektcreator admin i samme transaktion uden direkte trigger-execute                           | **AFVENTER** |

## Positive adgangstests

| ID      | Flade   | Identitet  | Handling                                                   | Forventning                                    | Status       |
| ------- | ------- | ---------- | ---------------------------------------------------------- | ---------------------------------------------- | ------------ |
| POS-001 | REST    | A-member   | Læs A-projekt/geometri/observationer                       | Kun A-data                                     | **AFVENTER** |
| POS-002 | REST    | A-member   | Opret tilladt observation/geometri                         | Række returneres og service-readback matcher A | **AFVENTER** |
| POS-003 | REST    | A-viewer   | Læs A-data                                                 | Tilladt uden B-rækker                          | **AFVENTER** |
| POS-004 | REST    | A-owner    | Opret organisation/projekt                                 | Creator får præcis owner/admin bootstrap       | **AFVENTER** |
| POS-005 | REST    | A-admin    | Administrér ikke-owner membership                          | Tilladt; identitet og org kan ikke omskrives   | **AFVENTER** |
| POS-006 | RPC     | A-member   | `get_project_geojson(A)` og metrics                        | Kun A-projekt                                  | **AFVENTER** |
| POS-007 | Eksport | A-member   | Eksportér A-projekt                                        | Kun autoriserede A-rækker; ingen seedfallback  | **AFVENTER** |
| POS-008 | Upload  | A-uploader | Opret personlig upload og importjob                        | Tilladt før tenantassignment                   | **AFVENTER** |
| POS-009 | Upload  | A-uploader | Assign personlig upload én gang til A og kør nyt importjob | Tilladt; job arver nyt scope                   | **AFVENTER** |
| POS-010 | Storage | A-member   | Upload/læs A project-media/evidence                        | Tilladt via privat bucket                      | **AFVENTER** |
| POS-011 | Storage | A-admin    | Slet A-resource                                            | Object slettes før metadata; fejl er synlig    | **AFVENTER** |
| POS-012 | REST    | A-field    | Opret field observation/evidence                           | Tilladt kun på contribution-whitelisten        | **AFVENTER** |

## Negative tenant- og rolletests

| ID      | Forsøg                                                                    | Forventning                                 | Status       |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------- | ------------ |
| NEG-001 | A læser/skriver/sletter B ved kendt projekt- eller child-UUID             | 0 rækker eller `42501`; B uændret           | **AFVENTER** |
| NEG-002 | Authenticated outsider eller anon lister tenantdata                       | Tomt/afvist                                 | **AFVENTER** |
| NEG-003 | A tilføjer sig selv til B som project admin                               | `42501`; ingen membership-række             | **AFVENTER** |
| NEG-004 | Org-admin opretter eller promoverer en owner                              | `42501`; rolle uændret                      | **AFVENTER** |
| NEG-005 | Org-admin omskriver membership `user_id` eller `organization_id`          | `23514`; række uændret                      | **AFVENTER** |
| NEG-006 | Project-admin flytter projekt/area/media/etc. til B                       | `23514`; tenantnøgle uændret                | **AFVENTER** |
| NEG-007 | Uploader flytter eller afkobler en allerede scopet upload                 | `23514`; oprindeligt scope bevares          | **AFVENTER** |
| NEG-008 | A opretter importjob på B-upload eller opdaterer job efter tabt adgang    | Afvist                                      | **AFVENTER** |
| NEG-009 | Viewer eller field udfører konfigurations-/rapport-write                  | Afvist                                      | **AFVENTER** |
| NEG-010 | A kalder GeoJSON/metrics med B-id                                         | `42501` uden B-data                         | **AFVENTER** |
| NEG-011 | A indsætter metric med A-project/B-area                                   | `23503`; ingen række                        | **AFVENTER** |
| NEG-012 | Fjernet medlem genbruger samme JWT til A REST/RPC/Storage                 | Nye requests returnerer ingen A-data/object | **AFVENTER** |
| NEG-013 | External læser projekt/datasæt uden document-share-relation               | 0 rækker; fail-closed                       | **AFVENTER** |
| NEG-014 | A-row refererer til B-parent på en af de 18 guardede tabeller             | `23514`; ingen poisoned relation            | **AFVENTER** |
| NEG-015 | Cross-project action-evidence/device-parameter/quality scope              | `23514`; ingen relation                     | **AFVENTER** |
| NEG-016 | Bruger med adgang i to tenants re-parenter indirekte child via UPDATE     | `23514`; oprindelig parent bevares          | **AFVENTER** |
| NEG-017 | Membership `user_id` eller upload `uploaded_by` omskrives                 | `23514`; oprindelig identitet bevares       | **AFVENTER** |
| NEG-018 | Signup matcher historisk founder-email                                    | Ingen delt demo-owner-adgang                | **AFVENTER** |
| NEG-019 | Uploader forfalsker status/GPS/validation/importdata ved INSERT/UPDATE    | `42501`; DB-default/backenddata bevares     | **AFVENTER** |
| NEG-020 | B registrerer uploadmetadata med A-uploader-prefix eller dublet path      | `23514`/`23505`; ingen alias/dublet         | **AFVENTER** |
| NEG-021 | Media/evidence metadata peger på fremmed path eller bytter etableret path | `23514`; oprindelig proveniens bevares      | **AFVENTER** |

## Storage- og URL-tests

| ID         | Forsøg                                                               | Forventning                                                                   | Status             |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| STO-DB-001 | A læser/indsætter/opdaterer/sletter B-object                         | Afvist eller 0 rækker; UPDATE afvises for alle authenticated                  | **AFVENTER**       |
| STO-DB-002 | `monitoring-uploads` user-prefix uden metadata-række                 | Kun egen personlige staging er tilladt                                        | **AFVENTER**       |
| STO-DB-003 | Samme monitoring-path efter tenantassignment og tabt medlemskab      | Prefix-fallback gælder ikke; adgang afvises straks ved næste request          | **AFVENTER**       |
| STO-DB-004 | Canonical path med org B men project A                               | Afvises af `storage_path_matches_project`; pgTAP-case skrevet                 | **AFVENTER**       |
| STO-DB-005 | Project/evidence path uden matchende metadata-række                  | Skal afvises i slutdesignet; exact row-match er endnu ikke implementeret      | **AFVENTER / GAP** |
| STO-DB-006 | Contributor sletter normalt eller ældre object                       | Afvist; almindelig delete kræver manage                                       | **AFVENTER**       |
| STO-DB-007 | Contributor rydder nyt eget orphan efter fejlet metadata-insert      | Kun tilladt ved owner-id, ≤15 min, contribution-scope og ingen metadata-række | **AFVENTER**       |
| STO-DB-008 | Authenticated INSERT uden server-issued intent/pending metadata      | Skal afvises i slutdesignet; intent-binding er ikke implementeret             | **AFVENTER / GAP** |
| STO-DB-009 | Monitoring/project-media over DB-konfigureret type-/størrelsesgrænse | Skal afvises; konfiguration er statisk/pgTAP-planlagt, runtime ikke kørt      | **AFVENTER**       |
| STO-DB-010 | Orphan efter crash/rollback-fejl                                     | Reconcileres/karantænes efter retention; job findes ikke                      | **AFVENTER / GAP** |
| STO-DB-011 | Evidence-fil uden godkendt type-/størrelseskontrakt                  | Kontrakt skal godkendes før migration må fastsætte eller nulstille grænser    | **AFVENTER / GAP** |
| URL-001    | A signer A-media/monitoring                                          | URL virker højst 300 sekunder                                                 | **AFVENTER**       |
| URL-002    | A forsøger at signere B-media                                        | Afvist uden public fallback                                                   | **AFVENTER**       |
| URL-003    | Medlemskab fjernes efter signering                                   | Nye signeringer afvises; eksisterende bearer-link virker op til 300 s         | **AFVENTER / GAP** |
| URL-004    | Udløbet signed URL                                                   | Download afvises                                                              | **AFVENTER**       |
| URL-005    | Evidence-download                                                    | Skal ske via eksplicit signed flow; service mangler endnu dette flow          | **AFVENTER / GAP** |

## Eksport- og cachetests

| ID      | Forsøg                                | Forventning                                                | Status                             |
| ------- | ------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| EXP-001 | A-session eksporterer B-project-id    | Afvist; intet B-indhold                                    | **AFVENTER**                       |
| EXP-002 | Mixed array med A- og B-id'er         | Hele request afvises eller filtreres eksplicit uden B-data | **AFVENTER**                       |
| EXP-003 | Pagination over normal sidegrænse     | Alle og kun autoriserede rækker                            | **AFVENTER**                       |
| EXP-004 | Skift A→B i samme browser/query-cache | Ingen A-data genbruges                                     | Unit bestået; browser **AFVENTER** |

## Sikker lokal køreplan

Senest observerede gates:

| Gate                | Resultat                                          |
| ------------------- | ------------------------------------------------- |
| Målrettet Vitest    | 5 filer, 37/37 bestået                            |
| Fuld Vitest         | 42 filer, 345/345 bestået                         |
| Typecheck           | Bestået                                           |
| Build               | Bestået med kendte Vite/Nitro-warnings            |
| Changed-test ESLint | 0 fejl                                            |
| Fuld lint           | Fejlet: 394 filer, 5.164 fejl/23 warnings/fatal 0 |
| Local reset         | Blokeret: `LegacyLocalDbRunningError`             |
| pgTAP og db lint    | Blokeret: `ECONNREFUSED 127.0.0.1:54322`          |

CLI-syntaks er kontrolleret mod 2.116.0 og package scripts binder databasekommandoer til `--local`:

```powershell
npm.cmd run supabase:start
npm.cmd run supabase:reset:local
npm.cmd run supabase:lint:db
npm.cmd run supabase:test:db
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Integrationsrunneren skal afbryde før enhver request, hvis URL-host ikke er `localhost`/`127.0.0.1`, eller hvis `--linked`, `--db-url`, `SUPABASE_ACCESS_TOKEN` eller `SUPABASE_DB_PASSWORD` indgår.

Kilder: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database testing](https://supabase.com/docs/guides/database/testing), [Advanced pgTAP](https://supabase.com/docs/guides/local-development/testing/pgtap-extended), [CLI local workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

## P0-vurdering

Ikke klar, blokkerende problemer består
