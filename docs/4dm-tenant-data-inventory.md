# 4DM tenant-data-inventar

Dato: 2026-09-02

## Cyklus 014-addendum

Upload-intents har nu både eksakt TUS/finalize-kontrakt og en kildetestet orphan-reconciliation: kun annullerede eller udløbne, ikke-modtagne intents kan leases, den autoriserede server sletter kun den claim-ID-bundne path via Storage API, fejl frigiver jobbet sikkert til retry, og orphan-intent-/ledger-audit kan ikke slettes; modtagne uploads beholder normal manage-delete. Den versionsstyrede pgTAP-plan er 105 assertions, og app-suiten er 54 filer/412 tests. Staging har ikke forward migrationerne; pgTAP-runtime, DB-lint, scheduler, rigtig Auth/Storage/TUS og serverekstraktor er **AFVENTER**. Ældre inventar- og gaplinjer nedenfor beskriver præ-slice-checkpointet.

Status: Repositoryets samlede migrationskæde og de relevante TypeScript-services er auditeret statisk. Hardening-migrationen `20260831064838_harden_4dm_tenant_isolation.sql` er anvendt på staging `xdvqdzdpyceojbdknofi`, men ikke i produktion. Katalogassertions, anon PostgREST og en transaktionel A/B-tenanttest er bestået. Clean lokal replay, rigtig Auth-/Storage API og hele rollematricen er **AFVENTER**.

Supabase CLI **2.116.0** er pinnet i repository og lockfile. Den endelige lokale verifikation gav 43 filer/350 tests, grøn typecheck og staging-build. Lokal reset stoppede med `LegacyLocalDbRunningError`, og pgTAP/database-lint gav `ECONNREFUSED 127.0.0.1:54322`; Docker/Podman er ikke tilgængelig. Stagingtesten er runtime-bevis for det testede A/B-scope, men ikke for alle tabeller, roller og API-flader.

## Evidensnøgle

- **Checkpoint-fund**: en sårbar eller uklar tilstand i migrationshistorikken før den nye hardening-migration.
- **Adresseret på staging**: rettelsen er anvendt på den brugerautoriserede staging-instans og testet i det beskrevne scope.
- **AFVENTER runtime**: den konkrete rolle, tabel eller API-flade er endnu ikke bevist; det ophæver ikke den observerede A/B-evidens for de testede ressourcer.
- PostgreSQL kombinerer permissive RLS-policies med `OR`; derfor dropper hardening-migrationen først samtlige kendte åbne legacy-policies, før de nye policies oprettes.

## Identitet, organisation og projekt

| Ressource               | Faktisk navn                                   | Tenant-/ejerskabsnøgle       | Lokal hardening i working tree                                                                                                                                            | Runtime      |
| ----------------------- | ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Brugerprofil            | `profiles`                                     | `id = auth.uid()`            | Signup opretter profil uden email-baseret autorisation; anonym tabeladgang tilbagekaldes                                                                                  | **AFVENTER** |
| Organisation            | `organizations`                                | `id`                         | Signup får kun en isoleret personal org; normal oprettelse bootstrapper caller som `owner`; legacy founder-email giver ikke demo-adgang                                   | **AFVENTER** |
| Organisationsmedlemskab | `organization_memberships`                     | `organization_id`, `user_id` | Admin kan ikke oprette/promovere `owner`; kun owner kan håndtere owner-rollen; `user_id` og `organization_id` er immutable; selvændring og selv-sletning afvises          | **AFVENTER** |
| Projekt                 | `projects`                                     | `organization_id`            | `dev_select_all` droppes; læs/write/manage opdeles; `organization_id` er obligatorisk og immutable                                                                        | **AFVENTER** |
| Projektmedlemskab       | `project_members`                              | `project_id`, `user_id`      | Vilkårlig self-enrolment fjernes; creator bootstrapper som `admin`; `user_id` er immutable; `external` fejler lukket uden autoritativ document-share-relation             | **AFVENTER** |
| Autorisationshelpers    | `private.can_*`, public kompatibilitetshelpers | `auth.uid()`                 | Caller-id udledes internt; `SECURITY DEFINER` har tomt `search_path`; PUBLIC/anon execute tilbagekaldes; kompatibilitetssignaturer accepterer kun `_user_id = auth.uid()` | **AFVENTER** |

## Direkte tenantdata

Alle nedenstående rækker er projektscopede, medmindre andet er angivet. Hardening-migrationen erstatter de tidligere policykombinationer med separate SELECT/INSERT/UPDATE/DELETE-policies. `private.can_write_project` omfatter kun `admin`, `project_manager` og `editor`; `field` er fjernet fra generel write og kan kun bruge eksplicitte `private.can_contribute_project`-policies på collection/evidence-whitelisten. Direkte `project_id`-felter gøres immutable. Virkningen er delvist verificeret for `projects`/`project_media` i staging-A/B-testen; øvrige tabeller og hele rollematricen er **AFVENTER runtime**.

| Domæne                    | Faktiske tabeller/felter                                                                                                                             | Ejerskab og relation                               | Særligt lokalt tiltag eller resterende risiko                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Projektgeometri           | `projects.geometry_polygon`, `geometry_*`                                                                                                            | Via projektets organisation                        | Projektpolicy + immutable `organization_id`; A/B-geometriflow findes i pgTAP-planen                  |
| Projektområder og geodata | `project_areas`, `geo_observations`, `calculated_metrics`                                                                                            | `project_id`; metric kan pege på `project_area_id` | Immutable projekt-id; composite FK for metric↔area i samme projekt tilføjes `NOT VALID`              |
| Globale kortreferencer    | `map_layers`, `geo_features`                                                                                                                         | Ingen tenantdata tilsigtet                         | Authenticated read/service write; klassifikationen skal stadig bekræftes mod faktiske data           |
| Kerneprojektdata          | `sites`, `data_sources`, `sensors`, `observations`, `indicators`, `indicator_measurements`                                                           | `project_id`                                       | Kendte åbne policies droppes; same-project guards dækker site/source/indicator-parents               |
| Monitorering              | `monitoring_zones`, `monitoring_devices`                                                                                                             | `project_id`; device har også `organization_id`    | Projekt/org-match og same-project `zone_id` håndhæves lokalt                                         |
| Feltdata                  | `field_observations`                                                                                                                                 | `project_id`, eventuelt `zone_id`                  | Same-project zone-guard; field må contribute her, men ikke ændre projektkonfiguration                |
| Kvalitet                  | `data_quality_rules`, `data_quality_issues`, `data_quality_assessments`                                                                              | Projekt eller navngivet organisation               | Parent-, measurement- og assessment-scope guards tilføjet; `measurement_id` får `NOT VALID` FK       |
| Integration               | `integration_connections`, `integration_runs`, `connector_fetch_logs`, `data_source_mappings`                                                        | Direkte eller indirekte projekt                    | Åben connectorlog-policy droppes; `integration_runs.data_source_id` skal matche samme projekt        |
| Drone/analyse             | `drone_flights`, `environmental_analyses`                                                                                                            | `project_id`                                       | Same-project zone-guards; field kan contribute til flights, men ikke generelle analyser              |
| Leverancer                | `data_exports`, `reports`, `documents`, `evidence_files`, `project_media`                                                                            | `project_id`, eventuelle parent-id'er              | Legacy policies droppes; same-project guards dækker report/site/action/document/before-media parents |
| Handling og audit         | `actions`, `audit_events`                                                                                                                            | `project_id`                                       | Legacy SELECT droppes; audit er append-only; DB-trigger registrerer også field- og uscopede uploads  |
| Alarm                     | `alert_rules`, `monitoring_alerts`                                                                                                                   | Projekt eller navngivet organisation               | Uscopede regler afvises; project/org-match og immutable tenantnøgler tilføjes                        |
| Compliance/construction   | `impact_units`, `construction_projects`, `nature_contexts`, `runoff_profiles`, `environmental_risks`, `mitigation_measures`, `authority_submissions` | `project_id`                                       | Kendte åbne policies droppes og erstattes af rolleafgrænsede projektpolicies                         |
| Lavbund                   | `lavbund_projekter`, `lavbund_*`                                                                                                                     | `linked_project_id` eller parentens `projekt_id`   | Child-adgang går via linked GoFreyra-projekt; helper execute indsnævres                              |

## Indirekte children og uploadpipeline

| Ressource         | Faktisk navn                                                          | Autoritativ relation                                                  | Lokal hardening i working tree                                                                                                                                                                                         | Runtime      |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Action-evidence   | `action_evidence`                                                     | `action_id → actions.project_id`                                      | Guard kræver media/evidence i actionens projekt; `action_id` er immutable; field kan contribute, men ikke slette                                                                                                       | **AFVENTER** |
| Device-data       | `device_parameters`, `device_measurements`, `device_maintenance_logs` | `device_id → monitoring_devices.project_id`                           | Parent-RLS; `device_id` er immutable; en measurements `parameter_id` skal tilhøre samme device                                                                                                                         | **AFVENTER** |
| Observationsmedie | `observation_media`                                                   | `observation_id → field_observations.project_id`                      | `observation_id` er immutable; konkret bucket/path-kontrakt er endnu ikke fastlagt                                                                                                                                     | **AFVENTER** |
| Droneaktiv        | `drone_assets`                                                        | `flight_id → drone_flights.project_id`                                | `flight_id` er immutable; konkret bucket/path-kontrakt skal dokumenteres sammen med billeddatasættet                                                                                                                   | **AFVENTER** |
| Alarmkommentar    | `alert_comments`                                                      | `alert_id → monitoring_alerts.project_id`                             | `alert_id` er immutable; author-semantik skal runtime-testes                                                                                                                                                           | **AFVENTER** |
| Uploadmetadata    | `uploads`                                                             | `uploaded_by`, `storage_path`, valgfri `project_id`/`organization_id` | Path bindes til uploader-prefix og højst én metadata-række med duplicate/race-guard; identitet/scope kan ikke flyttes. Authenticated INSERT/UPDATE er kolonne-whitelistet, og afledt proveniens/status er backend-ejet | **AFVENTER** |
| Uploadjob         | `upload_import_jobs`                                                  | `upload_id → uploads`                                                 | Scope arves fra uploadens aktuelle scope, og `upload_id` er immutable                                                                                                                                                  | **AFVENTER** |

## Same-project parent- og provenance-guards

Den lokale migration validerer ved INSERT/UPDATE, at nullable parentreferencer peger på rækker i samme projekt:

- `data_sources.site_id`; `sensors.site_id`
- `observations.site_id` og `observations.source_id`
- `evidence_files.report_id`
- `actions.site_id` og `actions.linked_indicator_id`
- `mitigation_measures.risk_id`
- `documents.site_id` og `documents.action_id`
- `project_media.action_id`, `document_id` og `before_media_id`
- `monitoring_devices.zone_id`
- `integration_runs.data_source_id`
- `field_observations.zone_id`, `drone_flights.zone_id` og `environmental_analyses.zone_id`
- `monitoring_alerts.device_id` og `zone_id`
- `data_quality_rules.data_source_id`
- `data_quality_issues.zone_id`, `data_source_id`, `device_id` og `upload_id`
- `uploads.zone_id`
- `indicator_measurements.indicator_id`

Særskilte guards håndterer `action_evidence` (media/evidence i actionens projekt), `device_measurements.parameter_id` (samme device), `data_quality_issues.measurement_id` (measurement-device i issue-projektet) og `data_quality_assessments.scope_id` for scope-typerne `data_source` og `device`. Derudover tilføjes en `NOT VALID` foreign key fra `data_quality_issues.measurement_id` til `device_measurements.id` med `ON DELETE SET NULL`.

Guards og FK er kildeverificerede, men deres databaseadfærd er **AFVENTER runtime**.

Indirekte tenantproveniens kan heller ikke flyttes efter oprettelse: `device_parameters.device_id`, `device_measurements.device_id`, `device_maintenance_logs.device_id`, `observation_media.observation_id`, `drone_assets.flight_id`, `alert_comments.alert_id`, `data_source_mappings.data_source_id`, `action_evidence.action_id`, `upload_import_jobs.upload_id` og alle lavbund-childrens `projekt_id` er immutable. En bruger med legitime roller i to tenants kan derfor ikke re-parente en række mellem dem via UPDATE.

## Field-rollens eksplicitte whitelist

`field` er ikke længere en generel projekt-editor. Rollen kan via `can_contribute_project` indsætte/opdatere collection/evidence-rækker på `drone_flights`, `evidence_files`, `field_observations`, `geo_observations`, `observations` og `project_media` samt de afledte contribution-flader `action_evidence`, `observation_media`, `drone_assets`, projektscopede uploads/importjobs og Storage INSERT i media/evidence. Rapport-, projekt-, konfigurations- og analysewrites kræver fortsat editor eller højere; deletes kræver manage.

`external` er beskrevet som shared-document-only, men repositoryet har endnu ingen autoritativ document-share-relation. Rollen er derfor eksplicit udelukket fra `can_read_project` og har ingen generel projekt-/datalæsning, indtil en sådan relation er modelleret og testet.

## Storage-kontrakt, implementeret og anvendt på staging (API-adfærd delvist AFVENTER)

Hardening-migrationen opretter eller låser følgende buckets til `public = false`:

- `monitoring-uploads`
- `project-media`
- `evidence-files`

Migrationen sætter `monitoring-uploads` til **209.715.200 bytes (200 MiB)** og den eksisterende applikations-MIME-allowlist. `project-media` sættes til **52.428.800 bytes (50 MiB)** og kun `image/*`/`application/pdf`. `ON CONFLICT` genanvender både privat flag, størrelse og MIME-kontrakt, så en eksisterende bucket ikke beholder bredere værdier. `evidence-files` holdes privat, men dens eventuelle eksisterende størrelse/MIME-værdier bevares, fordi der endnu ikke er godkendt en evidence-kontrakt.

`project-media` og `evidence-files` accepterer både den nuværende sti `{projectId}/{timestamp}_{filename}` og den fremtidige canonical form:

```text
organizations/{organizationId}/projects/{projectId}/{resourceType}/{resourceId}/{objectId}_{filename}
```

Policyen udleder projekt-id af stien og slår den aktuelle projektrolle op ved hver Storage-operation. For canonical paths verificerer `private.storage_path_matches_project`, at organization-segmentet faktisk ejer project-segmentet; legacy `{projectId}/...` bevares. `project_media.file_path` og `evidence_files.file_url` skal encode rækkens eget projekt og korrekt canonical organisation, når canonical form bruges; en etableret reference kan ikke senere byttes. Det betyder, at en fjernet bruger afvises ved næste object-request med samme JWT. En allerede udstedt signed URL er derimod et bearer-link, som er gyldigt indtil sin TTL udløber.

`project-media-service.ts` ignorerer persisterede public URLs, validerer at DB-rækkens `file_path` tilhører rækkens projekt, og materialiserer en signed URL med **300 sekunders TTL**. Monitoring-download bruger samme faste 300-sekunders TTL. Upload bruger `upsert: false`; der findes ingen Storage UPDATE-policies i de tre private buckets. Delete slår den autoriserede DB-række op og bruger dens sti i stedet for caller-input. `evidence-service.ts` sanitiserer filnavne, bruger `upsert: false`, gemmer kun den private object-path i `file_url` og forsøger kompensationssletning ved DB-fejl. Monitoring-uploadflowet gør en fejlet rollback synlig i stedet for at skjule et efterladt objekt. En særskilt signed-downloadfunktion til evidence er endnu ikke implementeret.

Normal project-media/evidence DELETE kræver fortsat manage. Den eneste contributor-undtagelse er oprydning efter et fejlet uploadflow: objectets `owner_id` skal være callerens UUID, objektet skal være højst 15 minutter gammelt, caller skal stadig have contribution-adgang, og der må ikke findes en matchende metadata-række. Det tillader field at rydde sit helt nye orphan op uden at give generel sletteret.

`monitoring-uploads` bevarer user-prefix til den personlige stagingfase. `uploads.storage_path` skal have `uploaded_by` som første segment, kan ikke ændres og beskyttes af en advisory-lock-baseret duplicate/race-guard. Storage-helpers kræver præcis én matchende metadata-række og fejler lukket ved legacy-duplikater. Når en matchende `uploads`-række får tenant-scope, slås prefix-fallback eksplicit fra, og adgang følger den aktuelle upload-/projekt-/organisationsrelation. Scoped delete kræver manage; almindelig Storage UPDATE er fjernet. Dermed kan en tidligere uploader ikke beholde adgang alene gennem sit gamle prefix efter assignment eller medlemskabsfjernelse.

Authenticated kan kun INSERT'e rå filidentitet, eget uploader-id, autoriseret scope og eksplicit `user_metadata`, og kan kun UPDATE'e `project_id`, `organization_id`, `zone_id` og `user_metadata`. Klientens preview/EXIF behandles som ubetroet `user_metadata`; `status`, `detected_metadata`, `validation_result`, `import_result` og øvrig afledt proveniens er backend-ejet. En `SECURITY DEFINER`-trigger registrerer `upload_created` ved databasegrænsen, også for field- og uscopede uploads, uden at give klienten generel audit-write.

Resterende Storage-gab:

- Authenticated Storage INSERT er endnu ikke bundet til et server-issued upload intent eller en eksakt, pending metadata-række. En legitim authenticated bruger kan derfor skabe metadata-løse objects/orphans og misbruge Storage inden for sin prefix-/contribution-scope.
- `evidence-files` mangler fortsat en godkendt size/MIME-kontrakt. Migrationen overskriver derfor bevidst ikke eksisterende evidence-begrænsninger.
- Der findes ingen dokumenteret orphan-reconciliation, retention eller karantænejob.
- Projektmedia/evidence-objectpolicyen matcher endnu ikke object-path til en bestemt metadata-række; metadatareferencen validerer projekt/path, men object INSERT håndhæver kun bucket + projektrolle.
- Den nuværende app skriver fortsat den korte `{projectId}/...`-sti, ikke den fulde canonical sti.
- Evidence har privat write/cleanup, men mangler et eksplicit signed-downloadflow i servicen.
- Allerede udstedte signed URLs kan ikke straks tilbagekaldes og virker som bearer-links i op til 300 sekunder.
- Staging-inventory fandt 0 Storage-objekter/orphans og tre private buckets ved checkpointet; legacy-objekter, checksums og public URLs i produktion/Lovable er ikke inventeret.
- Observation-media, drone-assets, documents og exports mangler en endeligt dokumenteret bucket↔metadata-kontrakt.

## Domænegab efter adgangsgaten

`survey`, `imagery_dataset` og `field_visit` findes endnu ikke som selvstændige tabeller. Modellering af survey → drone flight → imagery dataset → før/efter-analyse → rapport skal afvente, at local reset, 62 pgTAP-assertions, upload-intent/evidence-kontrakt/orphan-reconciliation, A/B-Auth/PostgREST/Storage og RPC-gates er dokumenteret bestået.

## Kilder

- Lokal hardening: [`20260831064838_harden_4dm_tenant_isolation.sql`](../supabase/migrations/20260831064838_harden_4dm_tenant_isolation.sql)
- Database-testplan: [`4dm_tenant_isolation.test.sql`](../supabase/tests/database/4dm_tenant_isolation.test.sql)
- Services: [`project-media-service.ts`](../src/services/project-media-service.ts), [`evidence-service.ts`](../src/services/evidence-service.ts), [`uploads-service.ts`](../src/services/monitoring/uploads-service.ts)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

## P0-vurdering

Ikke klar, blokkerende problemer består
