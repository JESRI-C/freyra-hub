# GoFreyra execution state

Opdateret: 2026-09-12, credential-båret kernekunderejse og sikker drone-FØR-modtagelse, P0-cyklus 018.

## Seneste verificerede checkpoint

- Repositoryet er `JESRI-C/freyra-hub` på arbejdsbranch `codex/gofreyra-p0`. Appen er fortsat hostet som staging-Worker-version `842dbf65-3e99-4fd1-83f5-62360268181d`. Database-/regressionsrettelsen er pushet i commit `0560571`; den ændrer ikke Worker-bundle, produktion eller custom domain.
- Den isolerede Supabase-staging `xdvqdzdpyceojbdknofi` er `ACTIVE_HEALTHY`. Den registrerede migrationshistorik indeholder nu `20260831172610`, `20260831172839`, `20260901163924`, `20260902153933`, `20260912110614` og `20260912132006`. Den samlede migrationskilde `20260912112500` er fortsat **ikke anvendt**; endelig kilde-/historikreconciliation er **AFVENTER**.
- En rigtig, credential-båret owner-session bestod organisationsvalg, projektoprettelse, separat RLS-read, åbning og direkte reload. Den bevarede syntetiske staging-canary er projekt `GF E2E Vandløb 20260912-1200` (`e5b1344c-770c-4081-87e4-309dd87ac92a`) i staging-organisationen `rfvf`.
- Projektets manuelt tegnede GeoJSON `Polygon` blev gemt og genindlæst med fem lukkede ringpositioner, areal `1022.88 ha`, centroid `55.991114 / 10.498811` og matchende projekt-audit-event. Projektvisningen viste derefter `1. Projektområde gemt` og den projektbundne `Upload FØR-dronefotos`-CTA.
- Den første rigtige TUS-overførsel af den 351-byte syntetiske DJI-JPEG landede i privat Storage, men finalisering fejlede observeret på `pg_catalog.coalesce(...)`. `20260912132006_fix_finalize_upload_intent_coalesce.sql` genskaber den eksisterende, caller-kontrollerede `finalize_upload_intent(uuid)` med PostgreSQL-syntaksen `coalesce(...)`; `anon` har fortsat ingen execute, mens `authenticated` har den nødvendige execute.
- Retry af den samme intent `13b16848-a2c5-480f-b3f2-f0468bc53c08` bestod. UI viste `1/200 billeder · 1 modtaget` og `Modtaget – afventer servervalidering`; efter fuld reload viste backendkøen fortsat filen som `Afventer validering` med modtagelsestid.
- Live postflight viste `awaiting_validation`, udfyldt `received_at`, eksakt Storage-objekt/ejer/størrelse/MIME, SHA-256 `ee4f545e36ed107def04a4860cfc2265e96ec9bf8fd237ea212ad03c636951e6`, UTC `2026-08-28T12:05:06.000Z`, GPS-preview `55.245678 / 9.487654`, præcis ét intent-audit-event og ét received-audit-event. `secure_receipt_chain_ok = true`. En fremmed authenticated tenant så `0/0/0/0` projekt-, upload-, objekt- og audit-rækker.
- Den versionsstyrede pgTAP-kilde er fortsat `plan(107)` og ikke runtime-kørt uden containerstack. Aktuel typecheck PASS, målrettet migrations-/uploadsuite 33/33 PASS, målrettet ESLint/Prettier PASS, `git diff --check` PASS og fuld Vitest 55 filer/422 tests PASS. Worker-build/deploy-gaten er uændret fra cyklus 017, fordi denne rettelse kun ændrer SQL-migration og tests.
- Security advisor viste de kendte `spatial_ref_sys`/PostGIS/leaked-password-fund samt de forventede SECURITY DEFINER-advarsler; `finalize_upload_intent` er eksplicit caller-/intent-/objektvalideret og ikke anon-eksekverbar. Performance-count-vector er aktuelt `47/21/67/18`; fundene er ikke triageret i denne slice.
- Cleanup-Workerens `SUPABASE_SERVICE_ROLE_KEY`/`MONITORING_CRON_API_SECRET`, scheduler, Storage-delete/cleanup, signed-URL/revoke, server-side metadataekstraktion, canonical `drone_assets` og Før/Efter-analyse forbliver **AFVENTER**. Produktion, Simply, `app.gofreyra.com`, custom domain og produktionsdata er ikke rørt.
- Samme-chat-automationen `gofreyra-p0-90-min-cyklus` forbliver aktiv, indtil hele den bindende P0-rejse og alle gates er dokumenteret bestået.

## Aktiv højeste opgave

`SEC-P0-02` er fortsat den højeste aktive sikkerhedsgate. Credential-båret login, projekt create/open/reload, Polygon save/reload og én rigtig TUS/Storage/finalize/reload er nu bestået på den isolerede staging, inklusive negativ fremmed-tenant-kontrol. Cleanup/delete/signed-URL/revoke, Worker-secrets, scheduler, lokal frisk replay/107 pgTAP-cases, hele rollematricen, server-side extractor og den samlede Før/Efter-rejse mangler fortsat. P0 og produktion er **NO-GO**.

## Aktive blokeringer

1. Den scoped observationsvalidering og efterfølgende insert er ikke én database-transaktion; schemaet mangler composite relation constraints. Endelig TOCTOU-lukning kræver sikker migration/RPC og live preflight i `SEC-P0-02`.
2. Legacy åbne policies og `project_members` self-insert er lukket på staging og negativt SQL-testet. Frisk lokal reset/107 pgTAP-cases og rigtig Auth/PostgREST/Storage API-accept mangler fortsat, så produktion er **NO-GO**.
3. `xdvqdzdpyceojbdknofi` er brugerautoriseret staging og må anvendes til test. Lovable-/produktionsinstansen `ikrmcetjutqcjtwfhzfv` er fortsat read-only/uden connectoradgang og er ikke ændret.
4. Credential-båret login, organisationsvalg, projekt create/open og direkte reload af projektdetalje/geometri er bestået. Reset/logout/refresh/account-switch, direkte reload af projektkortet og Auth redirect-allowlist er stadig **AFVENTER**. En request-scoped serverklient er fortsat påkrævet, hvis beskyttede SSR-loaders senere genindføres.
5. Global lint er rød, og npm audit rapporterer 17 advisories (2 low, 5 moderate, 10 high). Buildet består, men store chunks og bundler-advarsler mangler triage.
6. Endeligt Haderslev/Skallebæk-projektnavn og reelt P0-datasæt er **AFVENTER** projektmaster.
7. Projektbundet FØR-batch, TUS-resume og idempotent intent-håndtering er implementeret. En credential-båret browser/TUS/Storage/finalize/reload med GPS-/UTC-/SHA-preview består nu. Uploadkøen er endnu ikke routet til canonical `drone_assets`/survey rounds/photo pairs, og servervalidering/ekstraktion samt større batch-, afbruds- og cleanup-cases er **AFVENTER**.
8. Et dronekamerapunkt er ikke et footprint eller en ortofoto-georeference. Objektiv/sensor/GSD/footprint og eventuel fotogrammetri kræver verificerede input og må ikke udledes ved gæt.
9. UI-rejsen med rigtig konto, nyt projekt, gemt/reloadet boundary og én syntetisk FØR-fil består. Den bindende rejse med det reelle Haderslev-datasæt, servervalidering, AFTER-runde, parring, analyse og rapport er fortsat **AFVENTER**.
10. Projektgrænsen har endnu ikke immutable revisioner eller versionskolonne til cross-tab/to-bruger optimistic concurrency. Den lokale hook afviser samtidige writes i samme UI-instans, men en komplet løsning kræver schema-/RPC-ændring og live verifikation.
11. Canonical geometri er fortsat et enkelt GeoJSON `Polygon`; `MultiPolygon` og `FeatureCollection` er eksplicit unsupported i denne slice.
12. Boundary-rækken og RPC-feature-samlingen læses ikke atomisk eller mod samme version. Metrics-cachen invalideres på boundary save/clear, og ugyldigt `calculated_at` afvises, men det aktuelle schema har ingen boundary-/source-version, som kan bevise metrics-friskhed. Begge garantier er **AFVENTER** schema-/RPC-versionering og live verifikation.
13. Lokal Supabase kan ikke startes i dette miljø: `supabase:start` stopper med `docker: command not found` og finder heller ikke Podman; reset stopper med `LegacyLocalDbRunningError`; pgTAP og DB-lint stopper med `ECONNREFUSED 127.0.0.1:54322`. Derfor er frisk migration replay, de 107 planlagte pgTAP-cases og DB-lint **AFVENTER** et disponibelt container-runtime.
14. Upload-intent-, cleanup-, `42702`- og finalize-`coalesce`-korrektionsmigrationerne kører på staging. Rigtig TUS upload/finalize/persistence og fremmed-tenant-afvisning består for én syntetisk JPEG. Storage delete/cleanup/signed-URL/revoke, Worker-secrets, automatisk cleanup-scheduling og en eventuel ledger-purgepolitik mangler; `evidence-files` mangler fortsat en godkendt size/MIME-kontrakt.
15. Supabase-advisors viser den forventede INFO for private RLS-tabeller uden policies samt de kendte PostGIS-/`spatial_ref_sys`-, SECURITY DEFINER- og leaked-password-fund; performance-resultatet `47/21/67/18` er ikke triageret. `spatial_ref_sys` må ikke ændres automatisk.

## Næste handlinger

1. Afslut den samlede migrationsreconciliation mod den registrerede staging-historik, og kør ved første disponible lokale containerstack frisk reset, den versionsstyrede `plan(107)`-suite og DB-lint.
2. Typecheck, målrettet ESLint/Prettier, migrations-/uploadsuite 33/33 og fuld suite 55 filer/422 tests er grønne. Commit `0560571` er pushet; Worker-versionen er fortsat `842dbf65-3e99-4fd1-83f5-62360268181d`, fordi denne slice ikke ændrer app-bundle.
3. Udvid den beståede credential-bårne kernekunderejse med kontrolleret flerfil-/afbrydelses-/resume-test og betroet serverekstraktion, før de reelle 120 billeder indlæses. Bevar den syntetiske canary som persistence-evidens, indtil et eksplicit cleanup-checkpoint er godkendt.
4. Afgør håndteringen af `public.spatial_ref_sys`; kør derefter security advisor igen. Flyt ikke PostGIS-extensionen uden en særskilt kompatibilitetsmigration.
5. Provisionér kun efter særskilt mandat cleanup-Workerens dedikerede server-secrets, og verificér ruten mod rigtig staging-Storage med cancelled/expired/missing-object, retry, stale-token og parallel worker; vælg derefter eksplicit scheduler og eventuel ledger-purge uden at ændre produktion.
6. Luk det resterende TOCTOU-gap i observations-ingest med databaseatomisk relationvalidering.
7. Verificér de resterende auth-cases og direkte reload på projektkortet. Design kun en request-scoped serverklient, hvis beskyttet SSR genindføres.

## Genoptagelseskontrol

Læs dette dokument, backlog, QA-matrix, beslutninger og seneste run-log. Kør derefter `git status --short --branch`, kontrollér at eksisterende ændringer tilhører den aktive cyklus, og overskriv dem ikke. Der må ikke startes P1/P2, commit/push eller ekstern handling uden opfyldt gate og mandat.
