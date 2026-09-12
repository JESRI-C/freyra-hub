# GoFreyra execution state

Opdateret: 2026-09-12, staging database-/UI-reconciliation og Worker-deploy, P0-cyklus 016.

## Seneste verificerede checkpoint

- Repositoryet er `JESRI-C/freyra-hub` på arbejdsbranch `codex/gofreyra-p0`. Commit `57cdfe8` er pushet til `origin/codex/gofreyra-p0` og udgivet til den navngivne staging-Worker som version `80e8ba0f-90b6-49f1-abce-3a8b1702af14`; produktion og custom domain er ikke ændret.
- Den isolerede Supabase-staging `xdvqdzdpyceojbdknofi` blev genetableret som `ACTIVE_HEALTHY`. Den registrerede migrationshistorik stopper ved præcis `20260831172610`, `20260831172839`, `20260901163924`, `20260902153933` og korrektionsmigrationen `20260912110614`. Den nye samlede migrationskilde `20260912112500` er **ikke anvendt**: forsøget blev afvist, fordi der ikke forelå et særskilt live-migrationsmandat. Live schema matcher allerede den observerede hærdede tilstand; endelig kilde-/historikreconciliation er stadig **AFVENTER**.
- Live postflight viser, at den private lease-ledger har RLS, ingen tabelprivilegier til Data API-rollerne og gyldige indeks; kun `service_role` kan kalde de to cleanup-RPC'er. `public.uploads` og `storage.objects` indeholdt begge 0 rækker ved kontrollen.
- Før korrektionsmigrationen fejlede et tomt orphan-claim med SQLSTATE `42702`, fordi `upload_id` var tvetydigt i `ON CONFLICT`. `20260912110614_fix_upload_orphan_claim_conflict.sql` målretter den eksisterende primary-key-constraint eksplicit. Efter rettelsen returnerede et tomt cleanup-claim observeret 0 rækker.
- En rollback-only canary under rollen `authenticated` bestod plain projektinsert, persistence af en gyldig GeoJSON `Polygon`, oprettelse af et server-scopet pending drone-intent og metadata. Hele canary-transaktionen blev rullet tilbage, og efterkontrollen viste ingen efterladte canary-rækker.
- Security advisor viste den forventede `private`-schema INFO om RLS-tabeller uden policies samt de allerede kendte fund om PostGIS/`spatial_ref_sys` og leaked-password-beskyttelse. Performance advisor returnerede den observerede firetalstælling `47/21/76/18`; fundene er endnu ikke triageret eller lukket.
- Den versionsstyrede pgTAP-kilde er nu `plan(107)`, men de 107 cases er **ikke runtime-kørt i denne cyklus**. Aktuel typecheck PASS, målrettet ESLint på ændrede filer PASS, fuld serial Vitest 55 filer/420 tests PASS og staging-build med env-preflight/bundle-check for `xdvqdzdpyceojbdknofi` PASS; første buildforsøg ramte kun sandbox-read-denial, og den godkendte genkørsel bestod. Wrangler `--strict --dry-run` PASS, og det efterfølgende staging-deploy PASS med version `80e8ba0f-90b6-49f1-abce-3a8b1702af14`.
- Den hostede UI viser login korrekt. Anonym navigation til både `/app` og en direkte projektrute ender på `/login`. Kilden viser en synlig `Upload`-fane, fører fra en gyldig projektgrænse til en projekt-scopet `FØR`-upload-CTA og stopper flowet ved manglende eller malformed geometri. Kun projektdetalje, projektgeometri og projektkort har eksplicit `ssr:false`; projektindekset har ingen beskyttet loader og ligger under auth-layoutet. Rigtig credential-båret navigation/reload er endnu ikke browserverificeret.
- Cleanup-Workerens `SUPABASE_SERVICE_ROLE_KEY`/`MONITORING_CRON_API_SECRET`, scheduler og rigtig credential-båret browser/TUS/Storage/finalize/cleanup forbliver **AFVENTER**. Produktion, Simply, `app.gofreyra.com`, custom domain og produktionsdata er ikke rørt.
- Samme-chat-automationen `gofreyra-p0-90-min-cyklus` forbliver aktiv, indtil hele den bindende P0-rejse og alle gates er dokumenteret bestået.

## Aktiv højeste opgave

`SEC-P0-02` er fortsat den højeste aktive sikkerhedsgate. Upload-intent, pending-row-binding og orphan-reconciliation er anvendt og katalog-/rollback-canary-verificeret på den isolerede staging, inklusive korrektionsmigrationen for SQLSTATE `42702`. Den samlede `20260912112500`-kildemigration er ikke anvendt uden særskilt mandat, selv om live schema matcher den hærdede postflight. Rigtig brugerbåret TUS/Storage/finalize/cleanup, Worker-secrets, scheduler, lokal frisk replay/107 pgTAP-cases, advisor-triage og den samlede Før/Efter-browserrejse mangler fortsat. P0 og produktion er **NO-GO**.

## Aktive blokeringer

1. Den scoped observationsvalidering og efterfølgende insert er ikke én database-transaktion; schemaet mangler composite relation constraints. Endelig TOCTOU-lukning kræver sikker migration/RPC og live preflight i `SEC-P0-02`.
2. Legacy åbne policies og `project_members` self-insert er lukket på staging og negativt SQL-testet. Frisk lokal reset/107 pgTAP-cases og rigtig Auth/PostgREST/Storage API-accept mangler fortsat, så produktion er **NO-GO**.
3. `xdvqdzdpyceojbdknofi` er brugerautoriseret staging og må anvendes til test. Lovable-/produktionsinstansen `ikrmcetjutqcjtwfhzfv` er fortsat read-only/uden connectoradgang og er ikke ændret.
4. Den canonical browserklient og authbootstrap-race-/deadlockrettelsen er verificeret i kilde/tests. Projektdetalje, projektgeometri og projektkort har `ssr:false`; projektindekset har ingen beskyttet loader og ligger under auth-layoutet. Credential-båret login/reset/logout/refresh/account-switch samt direkte reload på de tre detailruter er stadig **AFVENTER**. En request-scoped serverklient er fortsat påkrævet, hvis beskyttede SSR-loaders senere genindføres. Signup-/bekræftelseslinks kræver korrekt Auth Site URL/redirect-allowlist.
5. Global lint er rød, og npm audit rapporterer 17 advisories (2 low, 5 moderate, 10 high). Buildet består, men store chunks og bundler-advarsler mangler triage.
6. Endeligt Haderslev/Skallebæk-projektnavn og reelt P0-datasæt er **AFVENTER** projektmaster.
7. Projektbundet FØR-batch, TUS-resume og idempotent intent-håndtering er implementeret, migrationskontrakten er anvendt på staging, og UI'et har en synlig `Upload`-fane samt projekt-scopet `FØR`-CTA efter gyldig boundary. Uploadkøen er endnu ikke routet til canonical `drone_assets`/survey rounds/photo pairs, og rigtig browser-/Storage-/TUS-test er **AFVENTER**.
8. Et dronekamerapunkt er ikke et footprint eller en ortofoto-georeference. Objektiv/sensor/GSD/footprint og eventuel fotogrammetri kræver verificerede input og må ikke udledes ved gæt.
9. UI-kilden stopper ved manglende eller malformed projektgeometri og viser derefter den projekt-scopede FØR-indgang. Den fulde rejse med rigtig konto, gemt boundary og fil er fortsat **AFVENTER**.
10. Projektgrænsen har endnu ikke immutable revisioner eller versionskolonne til cross-tab/to-bruger optimistic concurrency. Den lokale hook afviser samtidige writes i samme UI-instans, men en komplet løsning kræver schema-/RPC-ændring og live verifikation.
11. Canonical geometri er fortsat et enkelt GeoJSON `Polygon`; `MultiPolygon` og `FeatureCollection` er eksplicit unsupported i denne slice.
12. Boundary-rækken og RPC-feature-samlingen læses ikke atomisk eller mod samme version. Metrics-cachen invalideres på boundary save/clear, og ugyldigt `calculated_at` afvises, men det aktuelle schema har ingen boundary-/source-version, som kan bevise metrics-friskhed. Begge garantier er **AFVENTER** schema-/RPC-versionering og live verifikation.
13. Lokal Supabase kan ikke startes i dette miljø: `supabase:start` stopper med `docker: command not found` og finder heller ikke Podman; reset stopper med `LegacyLocalDbRunningError`; pgTAP og DB-lint stopper med `ECONNREFUSED 127.0.0.1:54322`. Derfor er frisk migration replay, de 107 planlagte pgTAP-cases og DB-lint **AFVENTER** et disponibelt container-runtime.
14. Upload-intent-, cleanup- og `42702`-korrektionsmigrationerne kører på staging, og databasepostflight/rollback-canary er grøn. `20260912112500` er kun i kilden og kræver særskilt live-migrationsmandat. Rigtig Storage API/TUS upload/finalize/delete/cleanup/signed-URL/revoke, Worker-secrets, automatisk cleanup-scheduling og en eventuel ledger-purgepolitik mangler; `evidence-files` mangler fortsat en godkendt size/MIME-kontrakt.
15. Supabase-advisors viser den forventede INFO for private RLS-tabeller uden policies samt de kendte PostGIS-/`spatial_ref_sys`- og leaked-password-fund; performance-resultatet `47/21/76/18` er ikke triageret. `spatial_ref_sys` må ikke ændres automatisk.

## Næste handlinger

1. Afslut den samlede migrationsreconciliation mod den registrerede staging-historik, og kør ved første disponible lokale containerstack frisk reset, den versionsstyrede `plan(107)`-suite og DB-lint.
2. Typecheck, målrettet ESLint, fuld serial suite 55 filer/420 tests, staging-build/preflight, Wrangler `--strict --dry-run`, staging-deploy og anonym hosted smoke er grønne. Fortsæt den credential-bårne kunderejse på Worker-version `80e8ba0f-90b6-49f1-abce-3a8b1702af14`.
3. Med en særskilt godkendt staging-testbruger: verificér login → opret/åbn projekt → gem/reload Polygon → projekt-scopet `FØR`-CTA → lille syntetisk JPEG via rigtig TUS POST/PATCH/finalize. Kontrollér både gyldig og malformed geometry gate, og ryd kun de eksplicit oprettede testfixtures.
4. Afgør håndteringen af `public.spatial_ref_sys`; kør derefter security advisor igen. Flyt ikke PostGIS-extensionen uden en særskilt kompatibilitetsmigration.
5. Provisionér kun efter særskilt mandat cleanup-Workerens dedikerede server-secrets, og verificér ruten mod rigtig staging-Storage med cancelled/expired/missing-object, retry, stale-token og parallel worker; vælg derefter eksplicit scheduler og eventuel ledger-purge uden at ændre produktion.
6. Luk det resterende TOCTOU-gap i observations-ingest med databaseatomisk relationvalidering.
7. Verificér credential-båret initial navigation via projektindekset under auth-layoutet og direkte reload på de tre `ssr:false`-ruter for projektdetalje, geometri og kort. Design kun en request-scoped serverklient, hvis beskyttet SSR genindføres.

## Genoptagelseskontrol

Læs dette dokument, backlog, QA-matrix, beslutninger og seneste run-log. Kør derefter `git status --short --branch`, kontrollér at eksisterende ændringer tilhører den aktive cyklus, og overskriv dem ikke. Der må ikke startes P1/P2, commit/push eller ekstern handling uden opfyldt gate og mandat.
