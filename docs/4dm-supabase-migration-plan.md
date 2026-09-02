# 4DM Supabase-migrationsplan

Dato: 2026-09-02

## Cyklus 014-addendum

De næste forward migrations er `20260901163924_upload_intents_resumable_storage.sql` og `20260902153933_reconcile_upload_intent_orphans.sql`; begge findes kun i kilden. Den nye migration tilføjer en privat lease-ledger, service-role-only claim/complete-RPC'er og en retention-guard for ikke-modtagne orphan-intent-rows, men skriver aldrig til `storage.objects`; den autoriserede appservice udfører den eksakte sletning via Storage API, mens modtagne uploads beholder normal manage-delete. Kildesuiten er grøn med 54 filer/412 tests, og pgTAP-planen er 105 assertions. Frisk replay, DB-lint, pgTAP, scheduler og live Auth/Storage/TUS er **AFVENTER**, og migrationerne må ikke anvendes på staging/produktion uden separat mandat og preflight.

## Aktuel migrationsstatus

| Element                                          | Status                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Supabase CLI                                     | 2.116.0, pinnet i `devDependencies` og lockfile                                                 |
| `20260831064838_harden_4dm_tenant_isolation.sql` | Anvendt atomisk og registreret på staging `xdvqdzdpyceojbdknofi`; ikke anvendt i produktion     |
| Målrettede kilde-/servicetests                   | Bestået; indgår i samlet Vitest                                                                 |
| Samlet Vitest                                    | 43 filer, 350/350 bestået                                                                       |
| Typecheck/staging-build                          | Bestået; staging-build indeholder kun den autoriserede staging-ref                              |
| Lint                                             | Changed test: 0 fejl; fuld lint: 394 filer, 5.164 fejl/23 advarsler/fatal 0                     |
| pgTAP                                            | Testfil med `plan(62)` og 62 assertions skrevet; **ikke kørt**                                  |
| Lokal database                                   | **AFVENTER**; Docker/Podman `NOT_FOUND`                                                         |
| Clean reset/lint                                 | **AFVENTER**; reset gav `LegacyLocalDbRunningError`, lint `ECONNREFUSED 127.0.0.1:54322`        |
| Auth/PostgREST/RPC/Storage                       | SQL A/B-tenanttest og anon PostgREST-smoke bestået; rigtig Auth-/Storage API-rejse **AFVENTER** |
| Lovable-/produktionstarget                       | `ikrmcetjutqcjtwfhzfv` utilgængelig via connector; ikke ændret                                  |
| Staging                                          | `xdvqdzdpyceojbdknofi` brugerautoriseret, aktiv, migreret og katalog-/tenanttestet              |
| Produktion                                       | Ikke rørt; ingen migration eller deploy                                                         |
| Git                                              | Leverancen samles i cyklus 009-checkpoint og pushes kun til `codex/gofreyra-p0`                 |
| Genererede typer                                 | Må først regenereres efter bestået lokal schema-replay                                          |

Staging-databasemigrationen og den transaktionelle A/B-test er runtime-evidens for den testede SQL-flade, men erstatter ikke clean lokal replay, de 62 pgTAP-cases eller en rigtig Auth-/Storage API-rejse.

## Forudsætninger

1. Docker Desktop eller Podman er installeret, startet og tilgængelig på PATH.
2. CLI 2.116.0 anvendes gennem repositoryets package scripts.
3. Test-runner afviser alle andre hosts end `localhost` og `127.0.0.1`.
4. Kun særskilte `SUPABASE_TEST_*`-variabler bruges; generisk `.env` indlæses ikke.
5. Der bruges aldrig `--linked`, remote `--db-url`, `db push` eller remote reset i den lokale verifikationsfase.

## Trin 0 — gør historikken replaybar

Checkpointets [`006_project_media.sql`](../supabase/migrations/006_project_media.sql) brugte `project_id text`, mens `projects.id` er `uuid`. Working tree bruger nu `uuid`, men ændringen er ikke replayet eller afstemt med targetets migrationshistorik.

Før senere merge/deploy vælges én dokumenteret strategi:

- kontrolleret korrektion af historisk `006` efter read-only sammenligning med faktisk migrationshistorik og schema; eller
- en valideret baseline/squash til tomme lokale/testdatabaser, mens remote versionshistorik håndteres særskilt.

Intet må antage, at ændringen omskriver et allerede anvendt remote schema.

## Trin 1 — seed og legacy setup

Følgende er implementeret lokalt og skal bevises ved clean reset:

- `seed.sql` er data-only og opretter ikke `dev_all` eller andre policies.
- `setup_complete.sql` opretter ikke åbne udviklingspolicies.
- `setup_complete.sql` definerer ikke `get_project_geojson` eller `get_project_metrics`; en manuel legacy-kørsel kan derfor ikke overskrive hardeningens RPC-authorization, `search_path` eller execute-grants.

`setup_complete.sql` er stadig et parallelt schemaspor og bør senere udfases eller mærkes tydeligt som ikke-autoritativt.

## Trin 2 — anvend den lokale hardening i en disposable stack

Migrationen implementerer lokalt:

1. cleanup af kendte `dev_*`, `auth_*`, `Authenticated full access` og åbne `project_media`-policies samt anon/PUBLIC-tabelgrants;
2. caller-bound membershiphelpers med tomt `search_path` og indsnævrede execute-grants;
3. atomisk organisation-creator→owner og project-creator→admin bootstrap;
4. afvisning af project self-enrol, owner-eskalering og omskrivning af membership-identitet;
5. separate læs/write/manage-policies: `viewer` er read-only; `external` fejler lukket uden autoritativ document-share-relation;
6. immutable organisation-/projektnøgler og project/org-match, hvor begge felter findes;
7. personlig uploadstaging med én tilladt overgang til autoriseret tenant-scope;
8. komplet `upload_import_jobs`-arv fra personlig, organisations- eller projektscopet upload;
9. eksplicit caller-checkede `SECURITY INVOKER` GeoJSON-/metrics-RPC'er;
10. private `monitoring-uploads`, `project-media` og `evidence-files` buckets med project-aware object-policies;
11. `field` fjernet fra general write og begrænset til en eksplicit collection/evidence-whitelist via `can_contribute_project`;
12. same-project guards på 18 direkte tabeller og specialguards for action-evidence, device-parameter, issue-measurement og assessment scope;
13. immutable parent keys på indirekte children, immutable `uploads.uploaded_by` og immutable `project_members.user_id`;
14. en `NOT VALID` composite FK for metric↔project-area samt `NOT VALID` FK fra quality issue measurement til device measurement.
15. redefineret `handle_new_user` uden email-baseret founder/demo-autorisation; signup opretter kun profil og isoleret personal org med owner-membership;
16. en snæver project-media/evidence orphan-cleanup for caller-ejede objekter ≤15 minutter uden metadata-række; almindelig delete kræver fortsat manage.
17. monitoring `storage_path` bundet til uploader-prefix, immutable og beskyttet af advisory-lock duplicate/race-guard; legacy-duplikater fejler lukket;
18. separate manage-aware delete-regler og ingen authenticated Storage UPDATE-policies i de tre private buckets;
19. projekt/canonical-validering og immutability for etablerede `project_media.file_path`- og `evidence_files.file_url`-referencer;
20. authenticated upload INSERT/UPDATE begrænset til rå filidentitet, autoriseret scope og `user_metadata`; afledt GPS/proveniens, validerings-/importresultat og status er backend-ejet;
21. database-trigger for `upload_created`, som også auditerer field- og uscopede uploads;
22. monitoring signed URL låst til 300 sekunder, synlig rollback-fejl og delete-service, der verificerer Storage- og metadataresultatet.
23. DB-konfigurerede bucketgrænser: monitoring 200 MiB + eksisterende MIME-allowlist og project-media 50 MiB + image/PDF, genanvendt ved `ON CONFLICT`; evidence forbliver privat og bevarer eksisterende grænser.

De immutable indirect-parent keys omfatter `device_id` på alle device children, `observation_id` på observation media, `flight_id` på drone assets, `alert_id` på comments, `data_source_id` på mappings, `action_id` på action evidence, `upload_id` på importjobs og `projekt_id` på alle lavbund-children. `project_members.user_id` og `uploads.uploaded_by` låses særskilt. Transfers skal ske som delete/recreate eller gennem et senere auditeret RPC-flow.

Kør derefter i denne rækkefølge:

1. `npm.cmd run supabase:start`
2. `npm.cmd run supabase:reset:local`
3. `npm.cmd run supabase:lint:db`
4. `npm.cmd run supabase:test:db` — forvent præcis 62 pgTAP-assertions
5. policy-, grant-, owner-, trigger-, function- og bucket-inventory fra den lokale database
6. lokale Auth/PostgREST/RPC/Storage-integrationstests med to tenants
7. reset én gang til fra tom database for at bevise reproducerbarhed

Ved første SQL-/schemafejl stoppes og migrationen korrigeres; ingen remote fallback.

## Trin 3 — Storage-kontrakt

### Implementeret kompatibilitetskontrakt

- Alle tre buckets sættes `public = false`.
- `monitoring-uploads` sættes til 209.715.200 bytes (200 MiB) med applikationens eksisterende MIME-allowlist; `project-media` sættes til 52.428.800 bytes (50 MiB) med `image/*`/`application/pdf`. `ON CONFLICT` genanvender disse grænser.
- `evidence-files` gøres privat uden at ændre eksisterende size/MIME-værdier, fordi der endnu ikke er godkendt en autoritativ evidence-kontrakt.
- `project-media`/`evidence-files` udleder project-id fra enten `{projectId}/...` eller `organizations/{org}/projects/{project}/...`.
- Canonical paths accepteres kun, når `private.storage_path_matches_project` bekræfter, at organization-segmentet ejer project-segmentet; legacy `{projectId}/...` bevares.
- Object SELECT/INSERT/DELETE vurderer den aktuelle projektrolle ved requesttid. Alle tre authenticated Storage UPDATE-policies er fjernet; upsert/rename/overwrite er ikke tilladt.
- `monitoring-uploads` tillader egen user-prefix i personlig staging. Metadata-pathen bindes til uploaderen, er immutable og duplicate/race-beskyttet; helpers kræver præcis én metadata-række. Efter tenant-scope kan prefixet ikke længere give selvstændig adgang.
- `project_media.file_path` og `evidence_files.file_url` validerer encoded project/canonical organization og kan ikke byttes efter etablering.
- `project-media` og monitoring bruger signed URL på præcis 300 sekunder; project-media bruger aldrig persisted public URL.
- Media/evidence/monitoring-upload bruger `upsert: false`; servicekode kompenserer ved DB-fejl, og monitoring gør rollback-fejl synlig.
- Contributor kan kun kompensationsslette et metadata-løst orphan, når `owner_id` er caller, objektet er højst 15 minutter gammelt, og contribution-scope stadig er gyldigt. Alle almindelige deletes kræver manage.
- Authenticated upload INSERT/UPDATE er kolonne-whitelistet; preview/EXIF er ubetroet `user_metadata`, mens status og maskinafledt proveniens er backend-ejet. Upload creation auditeres ved databasegrænsen.

### Næste hardening før endelig Storage-gate

Den ønskede canonical sti er:

```text
organizations/{organizationId}/projects/{projectId}/{resourceType}/{resourceId}/{objectId}_{sanitizedFilename}
```

Før dette kan kaldes den endelige kontrakt, skal SQL og app samles om samme format og håndhæve:

- hvert Storage INSERT kræver et server-issued upload intent og en eksakt pending metadata-række;
- en autoritativ evidence size/MIME-kontrakt godkendes, før migrationen må fastsætte eller nulstille evidence-grænser;
- `resourceId` og object-path matcher præcis én autoriseret metadata-række;
- et idempotent orphan-reconciliation-/retention-/karantænejob rydder crash- og rollbackrester;
- evidence-download sker gennem et eksplicit kortlivet signed flow;
- observation-media, drone-assets, documents og exports får entydige bucket/path-kontrakter;
- upsert forbliver slået fra, eller får de nødvendige SELECT + INSERT + UPDATE-policies og tests.

### Legacy-filplan

Efter særskilt mandat og kun read-only først:

1. inventér `storage.objects` og bucket public-state;
2. match hvert objekt til metadata og tenant;
3. flyt/kopiér kun entydige objekter via et idempotent trusted job;
4. verificér størrelse og checksum;
5. opdatér DB-reference;
6. slet først kilden efter verifikation;
7. placér ukendte/orphaned objekter i privat karantæne.

Ingen legacy-path må få en bred fallback. Den korte `{projectId}/...`-form er kun en midlertidig, autorisationskontrolleret kompatibilitetsvej.

## Trin 4 — session, revocation og signed URL

Den lokale policy bruger databaseopslag ved hver REST/RPC/Storage-request. pgTAP-planen fjerner både org- og projektmembership og forventer, at samme JWT straks mister projekt- og object-synlighed.

Dette gælder ikke en allerede udstedt signed URL. Den er et bearer-/capability-link og virker til sin TTL; project-media og monitoring bruger højst 300 sekunder. Hvis forretningen kræver øjeblikkelig URL-revocation, skal download gå gennem et autoriseret proxy-/one-time-tokenflow. Det er ikke del af denne migration.

## Trin 5 — applikations- og releasegates

Efter grøn databasegate:

1. kør targeted Vitest, samlet suite, TypeScript, changed-test ESLint og build;
2. kør A/B browserflows for login, org-/projektskift, cache, geometri, upload, signed download og medlemskabsfjernelse;
3. regenerér typer fra den lokale database;
4. opdatér QA-evidens med kommando, exitkode, testantal og miljø;
5. staging-databasemandatet blev anvendt i cyklus 009; en hostet staging-app, yderligere runtimeændringer og produktion kræver hver sin eksplicitte gate/autorisation.

CI-workflowet er lokalt ændret til manuel `workflow_dispatch` med eksakt `DEPLOY`-bekræftelse, production environment, secret-baseret project ref, pinnet CLI og `db push --dry-run`. Workflowet er ikke kørt og autoriserer ikke deployment.

## Lock- og driftsrisiko

| Ændring                            | Forventet risiko                                              | Begrænsning                                                            |
| ---------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| DROP/CREATE POLICY og GRANT/REVOKE | Korte metadata-/tabellåse; adgang ændres øjeblikkeligt        | Staging først; smoke-test hver rolle                                   |
| Triggers på tenantnøgler           | Eksisterende workflows kan fejle, hvis de flytter rows        | Kortlæg og erstat med auditerede transitioner                          |
| Nye constraints                    | Kan scanne eller afvise eksisterende data                     | `NOT VALID`, audit, derefter separat `VALIDATE`                        |
| Storage-policyudskiftning          | Kan afskære legitime legacy paths                             | Read-only inventory og kontrolleret backfill; aldrig bred allow-policy |
| Bucket privatgørelse               | Gamle public links stopper; signed links kræver klientændring | Verificér serviceflows og kommuniker cutover                           |

## Rollback

Sikkerhedsændringer rulles frem. Rollback må aldrig genoprette `USING(true)`, `dev_all`, self-enrol eller public buckets.

- En defekt policy erstattes af en korrigeret restriktiv policy.
- Additive objekter kan blive stående ubrugte.
- Storage-backfill beholder kilden, indtil mål og DB-reference er verificeret.
- Ved brud pauses deployment; dataadgang åbnes ikke som nødrettelse.
- Før enhver senere remote ændring gemmes read-only before/after-inventory og backup-/restore-plan.

## P0-vurdering

Ikke klar, blokkerende problemer består
