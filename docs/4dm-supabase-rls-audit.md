# 4DM Supabase- og RLS-audit

Dato: 2026-08-31

## Konklusion

Checkpointets migrationskæde havde kritiske tenantbrud: åbne legacy-policies, vilkårlig self-enrolment som projekt-admin, owner-eskalering, flytbare tenantnøgler og manglende privat Storage-kontrakt. De kendte fund er adresseret af `20260831064838_harden_4dm_tenant_isolation.sql`, seed/setup-oprydning og private Storage-services. Hardening er anvendt på den brugerautoriserede staging-instans og er ikke anvendt i produktion. Den sidste reviewrunde fandt samtidig P0-blokerende restarbejde omkring upload-intents, evidence-kontrakten, orphan-reconciliation og bearer-link-revocation.

Det er endnu ikke en fuldt bestået sikkerhedsgate. En transaktionel A/B-test på staging beviste own-read og cross-tenant read/write/RPC/Storage-afvisning, mens anon PostgREST afviser private applikationstabeller. En rigtig Auth-session, Storage API-rejse, clean lokal replay og pgTAP-testens 62 assertions mangler fortsat. `public.spatial_ref_sys` er anonymt læsbar uden RLS og kræver en eksplicit ejerbeslutning. Produktion er ikke ændret.

## Auditeret grundlag

- `supabase/config.toml`, hele den versionsstyrede migrationskæde, `seed.sql` og `setup_complete.sql`
- browser-, server-, auth-, projekt-, upload-, media- og evidence-services
- SQL-funktioner, triggers, grants, RLS- og `storage.objects`-policies
- pgTAP-planen i `supabase/tests/database/4dm_tenant_isolation.test.sql`
- Vitest-kilde-/servicetests; endelig genkørsel gav 5 filer/37 tests og hele suiten 42 filer/345 tests bestået
- TypeScript og produktionsbuild bestod; buildet havde kendte Vite/Nitro-warnings. Changed-test ESLint havde 0 fejl, mens fuld lint fortsat fejlede for 394 filer med 5.164 fejl/23 advarsler/fatal 0
- Supabase CLI 2.116.0; lokal stack kunne ikke startes uden Docker/Podman

Auditten skelner mellem checkpointets fund, den lokale rettelse og runtime-evidens. En policy i en fil beviser ikke den effektive policy i en database.

## Miljøklassifikation

| Miljø                            | Evidens                                                                                                           | Status                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Repository/working tree          | Statisk audit, 43 filer/350 Vitest-tests, typecheck og staging-build                                               | Verificeret til checkpoint        |
| Lokal Supabase                   | Docker/Podman mangler; reset gav `LegacyLocalDbRunningError`, og pgTAP/db lint gav `ECONNREFUSED 127.0.0.1:54322` | **AFVENTER**                      |
| Auth/PostgREST/RPC/Storage       | SQL A/B-tenanttest + anon PostgREST-smoke; rigtig Auth-/Storage API-session mangler                               | Delvist verificeret               |
| Lovable-/produktionstarget       | `ikrmcetjutqcjtwfhzfv` er ikke ændret                                                                             | Ikke rørt                         |
| Staging                          | `xdvqdzdpyceojbdknofi`, aktiv, migreret, private buckets og transaktionelt tenanttestet                           | Verificeret for testet scope      |
| Produktion                       | Ingen migration, read/write, secretændring eller deploy                                                           | Ikke rørt                         |

## Kritiske checkpoint-fund og lokal behandling

| Fund ved checkpoint                                                                                              | Lokal behandling i working tree                                                                                                                                                         | Evidensstatus                                                      |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `dev_select_all`, `dev_all`, brede `auth_*` og åbne `project_media`-policies kunne OR'e sig uden om tenantfiltre | Hardening-migrationen dropper alle kendte policy-navne, tilbagekalder anon/PUBLIC-tabeladgang og genopretter policies pr. operation                                                     | Kildetest + staging-katalog grøn for 61 app-tabeller/0 `dev_*`; fuld policy-/rollematrix og `spatial_ref_sys`-afklaring **AFVENTER** |
| En authenticated bruger kunne indsætte sig selv i et vilkårligt `project_members`-projekt og vælge `admin`       | Self-enrol-policy fjernes. Kun project manage kan ændre medlemmer; projektcreator bootstrapper atomisk som admin via ikke-kaldbar trigger                                               | Kildetest grøn; DB **AFVENTER**                                    |
| Organisationsadmin kunne skabe/promovere owner eller omskrive membership-identitet                               | Kun eksisterende owner kan oprette eller bevare owner-rolle. `organization_memberships.user_id` og `organization_id` er immutable, og self-change/self-delete afvises                   | Kildetest grøn; pgTAP-cases skrevet; DB **AFVENTER**               |
| En ny organisation havde ikke en dokumenteret sikker creator-bootstrap                                           | `add_creator_as_owner()` opretter owner-rækken i samme transaktion; triggerfunktionen har tomt `search_path` og er ikke execute-grantet til API-roller                                  | Kildetest grøn; DB **AFVENTER**                                    |
| `projects.organization_id` og flere `project_id`-felter kunne flyttes                                            | Immutable triggers afviser tenantflytning; project/org-match trigger tilføjes, hvor begge felter findes                                                                                 | Kildetest grøn; DB **AFVENTER**                                    |
| Uploads kunne flyttes via uploader-grenen                                                                        | Personlig staging må scopes én gang til et autoriseret projekt/en organisation; derefter kan `project_id`/`organization_id` ikke fjernes eller omfordeles                               | Kildetest grøn; pgTAP-cases skrevet; DB **AFVENTER**               |
| `upload_import_jobs` havde ikke komplet arv for staging- og org-scope                                            | Separate read/insert/update/delete-policies arver den aktuelle `uploads`-rækkes personlige, organisations- eller projektscope                                                           | Kildetest grøn; pgTAP-cases skrevet; DB **AFVENTER**               |
| Monitoring-path kunne aliasere en anden uploader eller få dublerede metadata-rækker                              | `storage_path` bindes til `uploaded_by`-prefix, gøres immutable og beskyttes med advisory lock + duplicate-check; Storage helper kræver præcis én metadata-række                        | Kildetest grøn; pgTAP-cases skrevet; DB **AFVENTER**               |
| Authenticated upload-klient kunne ændre backend-afledt proveniens og workflowstatus                              | INSERT/UPDATE privileges tilbagekaldes og gen-grantes som kolonne-whitelists; kun rå filidentitet, autoriseret scope og `user_metadata` er klientskrivbart                              | Kildetest grøn; negative pgTAP-cases skrevet; DB **AFVENTER**      |
| `project-media`/`evidence-files` var baseret på public URL uden dokumenteret private buckets                     | Tre buckets oprettes/låses private. Projektmedia materialiseres med signed URL på 300 sekunder; evidence gemmer kun privat path; uploads bruger `upsert: false` og kompensationscleanup | 6 servicetests + tre private staging-buckets verificeret; rigtig Storage API **AFVENTER** |
| Metadata-path kunne pege på andet projekt eller byttes efter oprettelse                                          | `project_media.file_path`/`evidence_files.file_url` validerer encoded project/canonical org og kan ikke ændres, når referencen først er etableret                                       | Kildetest grøn; pgTAP-cases skrevet; DB **AFVENTER**               |
| Monitoring/project-media havde kun klientkontrollerede størrelses-/typegrænser                                   | Migrationen sætter 200 MiB + eksisterende MIME-allowlist for monitoring og 50 MiB + image/PDF for project-media; `ON CONFLICT` genanvender grænserne                                    | Statisk test + staging-bucketkonfiguration verificeret; Storage API-håndhævelse og pgTAP **AFVENTER** |
| Et fjernet medlem kunne potentielt genbruge samme JWT til filer                                                  | Storage SELECT slår aktuelt medlemskab op på hver request. PgTAP-planen fjerner medlemskaber og forventer både projekt- og object-read = 0                                              | Kildetest grøn; pgTAP/Storage **AFVENTER**                         |
| `field` var del af den generelle projekt-write-helper og kunne dermed ændre konfiguration/rapporter/analyser     | `field` er fjernet fra `can_write_project` og findes kun i `can_contribute_project`; særskilte policies whitelister collection/evidence-flader                                          | Kildetest grøn; tre pgTAP-cases skrevet; DB **AFVENTER**           |
| En korrekt `project_id` kunne kombineres med parent-id fra et andet projekt                                      | Same-project triggers dækker direkte parents på 18 tabeller samt særguards for action-evidence, device-parameter, issue-measurement og assessment scope                                 | Kildetest grøn; DB **AFVENTER**                                    |
| `external` var beskrevet som shared-document-only, men der findes ingen autoritativ share-relation               | Rollen er fjernet fra `can_read_project` og fejler lukket uden generel projekt-/datalæsning, indtil document sharing er modelleret                                                      | Kildetest grøn; to pgTAP-cases skrevet; DB **AFVENTER**            |
| Indirekte children kunne re-parentes af en bruger med write i to tenants                                         | Parentnøgler gøres immutable på device children, media/assets/comments/mappings, action-evidence, importjobs og lavbund-children; membership-user og uploader låses også                | Kildetest grøn; pgTAP re-parent-case skrevet; DB **AFVENTER**      |
| Legacy signup gav en bestemt email owner-adgang til en delt demoorganisation                                     | `handle_new_user` er redefineret uden email-authorization og opretter kun profil + isoleret personal org/owner-membership                                                               | Kildetest grøn; founder-email pgTAP-cases skrevet; DB **AFVENTER** |

## Funktioner, RPC, seed og legacy setup

- Autorisationshelpers ligger primært i det ikke-eksponerede `private` schema, bruger `auth.uid()` internt, har `SECURITY DEFINER` kun for rekursionsfri membership-opslag og har `SET search_path = ''`.
- Public kompatibilitetshelpers accepterer kun callerens egen UUID og har PUBLIC/anon execute tilbagekaldt.
- `get_project_geojson` og `get_project_metrics` redefineres som `SECURITY INVOKER`, kontrollerer projektadgang eksplicit, har låst `search_path`, afviser fremmed projekt med `42501`, og kan kun eksekveres af `authenticated`.
- `handle_new_user` bruger ikke email som authorization claim. Signup opretter kun profil, ny isoleret personal organisation og owner-membership til den nye bruger; funktionen har låst `search_path` og ingen direkte API-execute.
- `setup_complete.sql` definerer ikke længere de to RPC'er og kan derfor ikke overskrive hardeningens authorization/search-path/grants ved senere manuel kørsel.
- `seed.sql` og `setup_complete.sql` opretter ikke længere `dev_all` eller andre åbne udviklingspolicies.
- `006_project_media.sql` bruger lokalt `project_id uuid` i stedet for en ugyldig `text → uuid` foreign key. En ren historikreplay er stadig **AFVENTER**.
- `data_quality_issues.measurement_id` får en `NOT VALID` foreign key til `device_measurements(id)` med `ON DELETE SET NULL`; en særskilt trigger kræver samtidig, at measurementens device tilhører issue-projektet.
- `uploads`-oprettelser auditeres i en låst database-trigger, så field- og uscopede staginguploads registreres uden at give klienten generel adgang til at fabrikere audit-events.
- Authenticated kan ved INSERT kun skrive rå filidentitet/scope/`user_metadata` og ved UPDATE kun `project_id`, `organization_id`, `zone_id` og `user_metadata`; afledt GPS/proveniens, validerings-/importresultat og status er backend-ejet.

## Field-rolle og contribution-flader

`private.can_write_project` omfatter lokalt kun `admin`, `project_manager` og `editor`. `field` får i stedet eksplicit INSERT/UPDATE på `drone_flights`, `evidence_files`, `field_observations`, `geo_observations`, `observations` og `project_media`. Samme contribution-grænse bruges for `action_evidence`, `observation_media`, `drone_assets`, projektscopede uploads/importjobs og Storage INSERT i media/evidence. Reports, projektkonfiguration, generel analyse og delete forbliver uden for field-rollen.

`external` får ikke samme read-adgang som et almindeligt projektmedlem. Fordi schemaet mangler en autoritativ document-share-relation, udelukker `can_read_project` rollen eksplicit. Det er en fail-closed midlertidig model, ikke et færdigt eksternt delingsflow.

## Same-project provenance

`private.require_project_parent_match()` håndhæver same-project parents på `data_sources`, `sensors`, `observations`, `evidence_files`, `actions`, `mitigation_measures`, `documents`, `project_media`, `monitoring_devices`, `integration_runs`, `field_observations`, `drone_flights`, `environmental_analyses`, `monitoring_alerts`, `data_quality_rules`, `data_quality_issues`, `uploads` og `indicator_measurements`.

Særskilte locked-path triggerfunktioner dækker `action_evidence` media/evidence, `device_measurements.parameter_id`, `data_quality_issues.measurement_id` og `data_quality_assessments.scope_id` for `data_source`/`device`. Alle er lokale SQL-kontroller; runtime er **AFVENTER**.

`private.reject_parent_key_change` låser den autoritative parent på `device_parameters`, `device_measurements`, `device_maintenance_logs`, `observation_media`, `drone_assets`, `alert_comments`, `data_source_mappings`, `action_evidence`, `upload_import_jobs` og lavbund-children. `project_members.user_id` og `uploads.uploaded_by` er også immutable. Det lukker den UPDATE-baserede re-parentingvej, også for brugere med legitim write-adgang i flere tenants.

## Storage og signed URLs

`monitoring-uploads`, `project-media` og `evidence-files` deklareres private. Project/evidence-paths kan i den lokale migration være enten `{projectId}/...` eller den fremtidige `organizations/{org}/projects/{project}/...`-form. Object-policies udleder projekt-id og vurderer den aktuelle rolle ved requesttid. `private.storage_path_matches_project` kræver for canonical paths, at organization-segmentet faktisk ejer project-segmentet; legacy project-id-paths bevares. Metadatareferencerne `project_media.file_path` og `evidence_files.file_url` validerer selv samme projekt/canonical relation og kan ikke byttes efter etablering.

Bucketkontrakten er nu også DB-konfigureret: `monitoring-uploads` har 200 MiB og den eksisterende MIME-allowlist; `project-media` har 50 MiB og `image/*`/`application/pdf`. Konfliktopdatering genanvender de fastlagte begrænsninger. `evidence-files` gøres privat uden at ændre eksisterende size/MIME-værdier, fordi en godkendt evidence-kontrakt mangler.

`project-media-service.ts` ignorerer gamle persisterede public URLs og signer `file_path` i 300 sekunder. Monitoring-service bruger også en fast 300-sekunders signed URL. En signeringsfejl er fail-closed. Delete henter stien fra den RLS-beskyttede DB-række, og caller kan ikke levere en alternativ sti. `evidence-service.ts` sanitiserer filnavnet, gemmer kun object-path og rydder op ved DB-insertfejl. Monitoring-upload gør det eksplicit synligt, hvis metadata-insert og efterfølgende Storage-rollback begge fejler.

Almindelig scoped object-delete kræver manage. Project-media/evidence har kun en snæver orphan-cleanup-undtagelse: `owner_id = auth.uid()`, højst 15 minutter gammel, caller har contribution-scope, og ingen metadata-række matcher pathen. Monitoring-delete bruger en særskilt manage-aware helper; personlig, ny og metadata-løs staging kan ryddes af ejeren. Alle tre Storage UPDATE-policies er droppet og genoprettes ikke, så objekter kan ikke overskrives eller omdøbes gennem authenticated RLS.

Vigtig begrænsning: medlemskabsfjernelse afskærer nye Storage-requests med samme JWT, men en allerede udstedt signed URL kan bruges indtil TTL. Øjeblikkelig tilbagekaldelse af selve URL'en kræver et download-proxy-/tokenflow, som ikke er implementeret.

## Resterende sikkerhedsrisici

1. Migrationen er anvendt atomisk på staging; reproducerbarhed fra tom lokal historik og database-lint/pgTAP er stadig ubevist.
2. Authenticated Storage INSERT er ikke bundet til et server-issued upload intent eller en eksakt pending metadata-række. En legitim bruger kan derfor skabe metadata-løse orphans eller Storage-misbrug inden for sin prefix-/contribution-scope.
3. `evidence-files` mangler en godkendt size/MIME-kontrakt. Monitoring/project-media bucketgrænser er verificeret i staging-kataloget; faktisk Storage API-håndhævelse er **AFVENTER**.
4. Der mangler orphan-reconciliation, retention og karantæne. Project/evidence-objectpolicies kræver heller ikke exact object-path↔metadata-række, selv om DB-metadatareferencen nu validerer projekt/path.
5. Den nuværende app skriver fortsat den korte `{projectId}/...`-sti, og evidence mangler et eksplicit signed-downloadflow.
6. Guards er anvendt på staging, men ikke testet gennem hele PostgREST-/rollematricen. Nye relationer skal fortsat føjes eksplicit til guard-matrixen.
7. Staging blev inventeret; produktion/Lovable og eventuelle legacy Storage-objekter dér er ikke inventeret.
8. Allerede udstedte signed URLs er bearer-links og kan ikke tilbagekaldes før den faste TTL på højst 300 sekunder.
9. `setup_complete.sql` er stadig et parallelt manuelt schemaspor, selv om RPC- og åben-policy-overrides er fjernet.
10. Repositoryets fulde lint-gate er fortsat rød.

## CI- og nøglegrænse

- Browserklienter bruger publishable/anon-konfiguration; service role er fortsat server-only og må aldrig importeres i klientbundlen.
- Den lokale CI-ændring erstatter automatisk `main`-push med manuel `workflow_dispatch`, kræver bekræftelsen `DEPLOY`, bruger production environment, pinnet CLI 2.116.0, secret-baseret project ref og `db push --dry-run` før push.
- CI-ændringen er ikke kørt. Den er derfor kontrol i kode, ikke deploy-evidens.
- Den generiske `.env` må ikke bruges til lokale A/B-tests; test-runneren skal fail-closed på andet end `localhost`/`127.0.0.1`.

## Lokal reproducerbarhed

En frisk schema-replay er ikke bevist. `006_project_media.sql` er rettet lokalt, men ændringen er ikke sammenholdt med targetets migrationshistorik. Den historiske fil må først behandles som deploybar efter read-only sammenligning og clean reset eller en dokumenteret baseline/squash-strategi.

## Kilder

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database Testing](https://supabase.com/docs/guides/database/testing)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase signed URLs](https://supabase.com/docs/guides/storage/serving/downloads)

## P0-vurdering

Ikke klar, blokkerende problemer består
