# 4DM Supabase RLS-verifikation

Dato: 2026-09-02

## Cyklus 013-addendum

App-/kildegates er nu 51 filer/397 Vitest-tests, grøn typecheck og grøn produktionsbuild. Den nye upload-intent-forward migration og 83-case pgTAP-kilde er statisk dækket, men ikke replayet eller runtime-kørt. Staging kører fortsat kun den tidligere hardening-baseline. Derfor er rigtig Auth/Storage/TUS, signed URL/revoke, orphan-reconciliation og hele rollematricen fortsat **AFVENTER**; ældre afsnit nedenfor med `plan(62)` og manglende intent er præ-slice-evidens.

## 1. Testet miljø

Repositoryets working tree er statisk auditeret; 43 filer/350 Vitest-tests, typecheck og staging-build er grønne. Supabase CLI 2.116.0 er installeret/pinnet lokalt. Docker/Podman er `NOT_FOUND`; reset gav `LegacyLocalDbRunningError`, og pgTAP/database-lint gav `ECONNREFUSED 127.0.0.1:54322`.

Staging `xdvqdzdpyceojbdknofi` er brugerautoriseret, aktiv og atomisk migreret. Katalogassertions, en transaktionel A/B-tenanttest og anon PostgREST-smoke er bestået; fixtures blev rullet tilbage. Rigtig Auth-/Storage API-adfærd er fortsat **AFVENTER**. Lovable-/produktionsinstansen `ikrmcetjutqcjtwfhzfv` er ikke ændret, og der er ikke deployet en hostet app.

## 2. Miljøklassifikation

- Lokal kode: auditeret, unit-/kildetestet og staging-bygget.
- Lokal Supabase: clean replay/pgTAP **AFVENTER**, fordi container-runtime mangler.
- Staging: `xdvqdzdpyceojbdknofi`, migreret og delvist runtime-verificeret.
- Produktion/Lovable: ikke ændret.

## 3. Testede tabeller

`projects`, `project_media`, `storage.objects` og metrics-RPC er runtime-testet transaktionelt med syntetiske A/B-identiteter på staging. Den fulde rollematrix og de øvrige tabeller er alene statisk/pgTAP-planlagt og fortsat **AFVENTER**.

Hardening-migrationen indeholder lokale policies/triggers for owner-eskalering, creator-bootstrap, immutable membership-identitet, project self-enrol, field/external-roller, tenant-key moves, one-way upload assignment, `upload_import_jobs`-scope, 18 direkte same-project parent-guards og fire specialguards. Indirekte parentnøgler, `project_members.user_id` og `uploads.uploaded_by` er immutable. Kildetests bekræfter, at de forventede SQL-invariants findes; pgTAP skal bevise adfærden.

## 4. Testede Storage-buckets og services

Tre private buckets er oprettet på staging. `storage.objects`-policies er transaktionelt A/B-testet via SQL; rigtig Storage API upload/list/read/delete/signed-URL/revoke er fortsat **AFVENTER**. Hardening-migrationen deklarerer:

- `monitoring-uploads` som privat med personlig staging og metadata-/tenantbaseret SELECT/INSERT/DELETE efter scope;
- `project-media` som privat med project-aware SELECT/INSERT/DELETE;
- `evidence-files` som privat med project-aware SELECT/INSERT/DELETE.

Authenticated Storage UPDATE-policies er droppet og genoprettes ikke. Upsert, rename og overwrite er dermed ikke en tilladt klientflade.

Migrationen konfigurerer `monitoring-uploads` med 209.715.200 bytes (200 MiB) og den eksisterende MIME-allowlist samt `project-media` med 52.428.800 bytes (50 MiB) og `image/*`/`application/pdf`. `ON CONFLICT` genanvender disse værdier. `evidence-files` holdes privat, men eksisterende size/MIME-værdier bevares, fordi en godkendt evidence-kontrakt mangler.

Canonical `organizations/{org}/projects/{project}/...` valideres lokalt af `private.storage_path_matches_project`, så org-segmentet skal eje projektsegmentet. Legacy `{projectId}/...` bevares. `project_media.file_path` og `evidence_files.file_url` skal encode metadata-rækkens projekt/canonical organisation og kan ikke byttes, når referencen først er etableret.

De målrettede service-unit-tests er grønne:

- project media bruger 300 sekunders signed URL og ignorerer persisterede public URL-felter;
- manglende signering fejler lukket;
- upload persisterer path, ikke signed URL, og bruger `upsert: false`;
- delete bruger DB-rækkens autoriserede path og ignorerer caller-path;
- evidence sanitiserer filnavn, gemmer privat path og kompensationssletter ved DB-fejl;
- monitoring signed URL er fast 300 sekunder;
- monitoring upload gør rollback-fejl synlig;
- monitoring delete stopper ved Storage-fejl og verificerer, at præcis én metadata-række faktisk blev slettet.

Normal scoped DELETE kræver fortsat manage. En contributor kan kun rydde et fejlet project/evidence-upload-orphan, når objektet ejes af caller, er højst 15 minutter gammelt, contribution-scope stadig er gyldigt, og der ikke findes en matchende metadata-række. Monitoring bruger en særskilt manage-aware delete-helper; egen ny metadata-løs staging kan ryddes af ejeren. Det giver ikke `field` generel sletteret.

`uploads.storage_path` skal have uploaderen som første segment, er immutable og beskyttes af advisory lock + duplicate-check. Storage-helpers kræver præcis én metadata-række og fejler lukket på legacy-duplikater. Authenticated upload INSERT/UPDATE er kolonne-whitelistet: rå filidentitet, autoriseret scope og ubetroet `user_metadata` er klientinput; status, afledt GPS/proveniens og validerings-/importresultat er backend-ejet. Database-triggeren auditerer upload creation, inklusive field- og uscopede uploads.

Service-unit-tests alene beviser ikke bucket-state eller `storage.objects`-RLS. På staging er tre private buckets og det transaktionelt testede SQL-scope verificeret; rigtig Storage API-adfærd og evidence signed-download er fortsat **AFVENTER**.

## 5. Testede roller

Ingen rigtig Auth-session er testet. En syntetisk `authenticated` A/B-session er SQL-testet, men hele rollematricen mangler. Modellen bruger organisationsrollerne `owner`, `admin`, `editor`, `viewer` og projektrollerne `admin`, `project_manager`, `editor`, `field`, `viewer`, `external`.

Lokalt design:

- `viewer` er read-only;
- `external` fejler helt lukket uden projekt-/datalæsning, fordi der endnu ikke findes en autoritativ document-share-relation;
- generel write tillades til owner/admin/editor eller project admin/project_manager/editor;
- `field` kan kun contribute på en eksplicit collection/evidence-whitelist og kan ikke ændre rapporter eller projektkonfiguration;
- manage/delete kræver owner/admin eller project admin/project_manager;
- owner-rollen kan ikke skabes eller tildeles af en almindelig org-admin;
- projekt- og organisationscreator bootstrapper atomisk til henholdsvis admin og owner.

Den effektive rolleadfærd er delvist verificeret for den syntetiske `authenticated` A/B-identitet; rigtig Auth og hele owner/admin/editor/viewer/field/external/outsider-matricen er **AFVENTER**.

## 6. Testede brugerflows

Følgende lokale app-invariants er testet:

- et forged `?project=` kan ikke vælge et projekt uden for aktiv organisation;
- login/logout/bruger-switch rydder tenant-query-cache;
- private project-media URLs signeres ved læs og public URL-felter ignoreres;
- upload-/delete-fejl i media/evidence håndteres fail-closed eller med kompensationscleanup;
- monitoring-download har fast 300 sekunders TTL, rollback-dobbeltfejl er synlig, og delete kræver observeret Storage- og metadataresultat.

Den lokale login/signup/redirect-smoke og en syntetisk SQL-båret A/B-rejse er kørt. Credentials-båret login, organisationsvalg, geometri, observationer, RPC/eksport, upload/download/delete, droneflow og fjernet medlems session er derfor fortsat **AFVENTER**.

## 7. Fundne sikkerhedsproblemer

Checkpointet indeholdt:

- åbne `dev_select_all`/`dev_all`/`auth_*` og `project_media`-policies;
- vilkårlig project self-enrol som admin;
- mulig owner-eskalering og omskrivning af membership-identitet;
- flytbare projekt-/tenantnøgler og uploadscope;
- public URL-antagelser og manglende private bucket-policies;
- public/default execute på privileged helpers og uklare RPC-grants;
- legacy setup, som kunne overskrive RPC-hardening;
- legacy signup, som brugte en bestemt emailadresse som adgangskontrol til delt demo-owner;
- automatisk remote migration-push fra `main`.

De kendte fund er anvendt på staging og delvist bevist med katalogassertions, transaktionel A/B-SQL og anon PostgREST. De er ikke verificeret i produktion, og hele Auth-/Storage API-/rollematricen mangler.

Den afsluttende review fandt desuden P0-blokeringer, som ikke er løst: Storage INSERT kræver ikke server-issued intent/exakt pending metadata, evidence size/MIME-kontrakten mangler, orphan-reconciliation/retention mangler, og allerede udstedte signed URLs er bearer-links indtil udløb.

## 8. Lokalt adresserede problemer

- Åbne policy-navne droppes, anon/PUBLIC grants tilbagekaldes, og tenantpolicies genoprettes pr. operation.
- Caller-bound helpers bruger tomt `search_path`; public helpers og RPC execute er indsnævret.
- Organisationcreator→owner og projectcreator→admin sker via ikke-API-kaldbar trigger.
- Admin kan ikke skabe/promovere owner; membership `user_id`/org og projektdataenes tenantnøgler gøres immutable.
- Upload går fra personlig staging til autoriseret scope højst én gang; importjobs arver uploadens aktuelle scope.
- Monitoring-path bindes til uploaderen, gøres immutable og duplicate/race-beskyttes; scoped delete kræver manage, og Storage UPDATE-policies er fjernet.
- Authenticated upload INSERT/UPDATE er kolonne-whitelistet; afledt GPS/proveniens, validerings-/importresultat og status er backend-ejet, mens preview/EXIF kun er ubetroet `user_metadata`.
- Upload creation auditeres ved databasegrænsen, også for field- og uscopede staginguploads.
- `field` fjernes fra `can_write_project` og begrænses til `can_contribute_project`; `external` udelukkes fra `can_read_project`, indtil en share-relation findes.
- Same-project guards beskytter de identificerede direkte parentreferencer; specialguards beskytter action-evidence, device-parameter, quality issue measurement og assessment scope.
- Indirekte child-parentnøgler, `project_members.user_id` og `uploads.uploaded_by` er immutable, så en bruger med adgang i to tenants ikke kan re-parente via UPDATE.
- `data_quality_issues.measurement_id` får en `NOT VALID` FK til `device_measurements(id)` med `ON DELETE SET NULL`.
- `handle_new_user` bruger ikke længere email som autorisationssignal; signup opretter kun profil og én isoleret personal org med owner-membership.
- GeoJSON/metrics redefineres som explicit-checking `SECURITY INVOKER`; `setup_complete.sql` indeholder ikke længere RPC-definitionerne.
- Tre buckets deklareres private; project media og monitoring bruger fast 300 sekunders signed URL; evidence gemmer kun private paths; snæver contributor-cleanup er begrænset til caller-ejede, nye, metadata-løse orphans.
- Project-media/evidence metadata-paths validerer rækkeprojekt/canonical organisation og er immutable efter etablering; monitoring rollback-fejl skjules ikke.
- Monitoring/project-media bucketgrænser er DB-konfigureret og genanvendes ved conflict; evidence holdes privat uden at overskrive en endnu ikke godkendt kontrakt.
- CI-deploy er ændret til manuel, bekræftet, secret-baseret dry-run-first workflow.
- `006_project_media.sql` bruger lokalt korrekt `uuid` foreign key; seed/setup opretter ikke åbne policies.

## 9. Ikke-verificerede eller uløste problemer

- Clean migration replay, database lint og alle 62 pgTAP-assertions er ikke kørt.
- Ingen rigtige A/B-Auth-, PostgREST-, RPC- eller Storage-sessioner.
- Staging-inventory af grants, policies, functions, buckets og relevant schema blev kørt i cyklus 009; produktion/Lovable og ikke-testede runtimeflader er fortsat ikke inventeret/verificeret.
- Authenticated Storage INSERT er ikke bundet til et server-issued upload intent eller en eksakt pending metadata-række. Metadata-løse orphans og Storage abuse er derfor fortsat mulig inden for legitim prefix-/contribution-scope.
- Monitoring/project-media size/MIME-konfigurationen er verificeret i staging-kataloget; håndhævelse gennem rigtig Storage API er ikke bevist. `evidence-files` mangler fortsat en godkendt kontrakt.
- Orphan-reconciliation, retention og karantænejob findes ikke.
- Project/evidence Storage-objectpolicy matcher endnu ikke object-path til en eksakt metadata-række; canonical org↔project og DB-metadatareferencen valideres nu lokalt.
- Appen skriver stadig kompatibilitetsstien `{projectId}/...`; fuld canonical sti er ikke end-to-end.
- Evidence mangler signed-downloadservice.
- Allerede udstedte signed URLs kan ikke straks tilbagekaldes og fungerer som bearer-links i op til 300 sekunder.
- Parent-guards og immutable indirect-parent keys er anvendt på staging, men ikke adfærdstestet på tværs af hele relationstabellen eller gennem fuld PostgREST-/rollematrix.
- Staging-inventory fandt 0 Storage-objekter/orphans ved checkpointet; legacy-objekter og public URLs i produktion/Lovable er ikke inventeret.
- Survey og billeddatasæt er ikke færdigmodelleret.

## 10. Migrationer

| Migration                                        | Status                                            | Bemærkning                                                                               |
| ------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Eksisterende historik                            | Statisk auditeret                                 | Ikke replayet lokalt                                                                     |
| `006_project_media.sql`                          | Lokalt rettet                                     | `project_id uuid`; remote historik **AFVENTER**                                          |
| `20260831064838_harden_4dm_tenant_isolation.sql` | Anvendt/registreret på staging; ikke i produktion | Katalog + SQL A/B + anon PostgREST delvist grøn; lokal replay og rigtig API **AFVENTER** |

Migrationen samles i cyklus 009-checkpointet til push på `codex/gofreyra-p0`; det er ikke en produktionsgodkendelse.

## 11. Positive adgangstests

Runtime-status: **DELVIST VERIFICERET på staging** — eget project/project_media/Storage-read er bevist; øvrige positive roller/flows/API'er er **AFVENTER**.

pgTAP-planen indeholder positive A- og B-project reads/writes, project-area, upload/importjob før/efter assignment, Storage A-read og GeoJSON/metrics RPC. Signup-personal-org bootstrap er planlagt i pgTAP; normal organization/project creator-bootstrap er kun kildekontrolleret og skal tilføjes som databaseassertion.

## 12. Negative adgangstests

Runtime-status: **DELVIST VERIFICERET på staging** — cross-tenant project/project_media-read/write, Storage-read og metrics-RPC blev afvist; resten af den negative matrix og rigtig Auth/Storage API er **AFVENTER**.

PgTAP-filen har samlet `plan(62)` og 62 assertions. Ud over de tidligere tenant-, rolle-, Storage-, RPC-, provenance- og revocation-cases kontrollerer fire nye assertions monitoring-bucketens 200 MiB/MIME-allowlist og project-media-bucketens 50 MiB/image-PDF-kontrakt. Ingen assertion er runtime-kørt.

Det beviser kun intent, indtil `supabase test db` har kørt og rapporteret 62/62.

## 13. Testresultater

| Gate                                | Resultat                         | Evidens                                                          |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Målrettet hardening + app + Storage | Bestået                          | Indgår i samlet Vitest                                           |
| Samlet Vitest                       | 43 filer, 350/350 bestået        | Lokal fuld suite                                                 |
| TypeScript                          | Bestået                          | Lokal typecheck                                                  |
| Staging-build                       | Bestået                          | Kun autoriseret staging-ref; kendte Vite/Nitro-warnings          |
| Changed-test ESLint                 | 0 fejl                           | Den ændrede statiske migrationstest                              |
| Fuld lint                           | Fejlet: 5.164 fejl, 23 advarsler | 394 filer; fatal 0; repositoryets samlede lint-gate              |
| Supabase CLI                        | 2.116.0                          | Pinnet package/lockfile                                          |
| Docker/local start                  | Fejlet/blokeret                  | Docker og Podman `NOT_FOUND`                                     |
| `db reset --local`                  | **AFVENTER**                     | `LegacyLocalDbRunningError`                                      |
| `db lint --local`                   | **AFVENTER**                     | `ECONNREFUSED 127.0.0.1:54322`                                   |
| pgTAP `plan(62)`                    | **AFVENTER**                     | `ECONNREFUSED 127.0.0.1:54322`; 62 assertions skrevet, ikke kørt |
| Auth/PostgREST/RPC A/B              | Delvist verificeret              | Syntetisk SQL A/B + anon 401; rigtig Auth-session **AFVENTER**   |
| Storage A/B                         | Delvist verificeret              | SQL object-read afgrænset; rigtig Storage API **AFVENTER**       |
| Lovable-/produktionstarget          | Ikke kørt/ændret                 | Connector utilgængelig                                           |
| Staging                             | Migreret og delvist verificeret  | Katalog + SQL A/B + anon; ingen hostet app                       |
| Produktion                          | Ikke kørt                        | Ingen adgang eller ændringer                                     |

De grønne kilde-, unit-, typecheck- og buildgates kan ikke erstatte database-/RLS-gaten. Den fulde lint-gate er fortsat rød og er registreret separat fra den grønne changed-test ESLint-gate med 0 fejl.

## 14. Kendte begrænsninger

- Staging-kataloget blev inspiceret efter migrationen for det dokumenterede scope. Statisk SQL og den afgrænsede smoke kan stadig ikke bevise ikke-testede roller/API-flader eller produktionens tilstand.
- Permissive policykombinationer er katalogkontrolleret på staging; `spatial_ref_sys`-undtagelsen og hele rollematricen mangler fortsat.
- Medlemskabsfjernelse rammer næste database/Storage-request; en eksisterende signed URL forbliver gyldig til sin TTL.
- Storage INSERT uden server-issued intent/exakt pending metadata er fortsat en abuse-/orphanflade; evidence mangler godkendt size/MIME-kontrakt.
- Storage og Postgres er ikke én transaktion; kompensation/outbox skal integrationstestes.
- CI-workflowets lokale hardening er ikke kørt og er ikke deploymentstilladelse.

## 15. Om P0 kan fortsætte til survey- og dronekæden

Nej. Survey → drone flight → imagery dataset → før/efter-analyse → report må først være næste vertikale leverance, når clean local reset, 62/62 pgTAP, A/B-tenanttests, upload-intent/evidence-kontrakt/orphan-reconciliation, Storage-isolation, RPC/export og service-role-grænsen er dokumenteret bestået.

## Kildegrundlag

- [`4dm-tenant-data-inventory.md`](./4dm-tenant-data-inventory.md)
- [`4dm-supabase-rls-audit.md`](./4dm-supabase-rls-audit.md)
- [`4dm-supabase-rls-test-matrix.md`](./4dm-supabase-rls-test-matrix.md)
- [`4dm-supabase-migration-plan.md`](./4dm-supabase-migration-plan.md)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase local development](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase database testing](https://supabase.com/docs/guides/database/testing)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase signed URLs](https://supabase.com/docs/guides/storage/serving/downloads)

## P0-vurdering

Ikke klar, blokkerende problemer består
