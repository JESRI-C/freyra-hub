# GoFreyra operations runbook

Opdateret: 2026-09-01. Dette er den verificerede staging-/lokalbaseline. Produktion er uden for mandatet.

## 1. Før start

1. Kontrollér repository og bevar eksisterende ændringer:

   ```powershell
   git status --short --branch
   git remote -v
   git log -1 --oneline
   ```

2. Forvent `codex/gofreyra-p0`. Stop ved ukendt divergens eller overlappende brugerændringer.
3. Brug Node `>=22 <23`; auditmiljøet var Node 22.14 og npm 10.9.
4. Secrets må ikke stå i Git, terminaloutput, screenshots eller run-log. Brug en ignoreret `.env.local`/lokal secret store og behold kun nøglenavne i `.env.example`.

## 2. Installation og lokal app

Den reproducerbare vej skal være:

```powershell
npm ci
npm run dev
```

Første audit fandt en stale lock og brugte `npm install` én gang til synkronisering. Et efterfølgende frisk `npm ci` består. Brug ikke `npm install` som skjult standard i planlagte kørsler.

`package-lock.json` er den kanoniske P0-lockfil. Den eksisterende `bun.lock` er legacy og må ikke bruges eller opdateres i arbejdscyklusser; en eventuel fjernelse håndteres som en særskilt, godkendt oprydning.

Appen bygges med Vite/TanStack Start; lokal URL fremgår af Vite-output. Kontroller login og datamode i UI. Seed/preview er kun udviklingsmode og må ikke bruges som P0-evidens.

## 3. Miljønøgler

Verificerede nøglenavne i kode/konfiguration omfatter:

- Browser/brugerklient: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy fallback `VITE_SUPABASE_ANON_KEY`).
- Server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OBSERVATIONS_INGEST_API_SECRET`, `OBSERVATIONS_INGEST_PROJECT_ID`, `MONITORING_CRON_API_SECRET`.
- Kilder: `ENABLE_LIVE_DATA`, `DMI_BASE_URL`, `DATAFORDELER_KEY`, `COPERNICUS_TOKEN` og deres dokumenterede Vite-fallbacks, hvor de stadig findes.

Tilføj ikke værdier til dette dokument. En `VITE_*`-værdi er klientlæsbar og må aldrig anvendes som privilegeret endpoint-secret. Ingest/cron-secrets er uafhængige, server-only værdier; de må heller ikke genbruge Supabase secret/service-role keys.

`src/lib/supabase/client.ts` er den eneste canonical browser-Supabase-/GoTrue-klient. Den genererede integrationsmodulvej er kun en fail-fast compatibility Proxy til samme instans; opret ikke en ny klient dér eller i en service. `VITE_SUPABASE_PUBLISHABLE_KEY` har prioritet, mens tom/manglende publishable falder tilbage til `VITE_SUPABASE_ANON_KEY`. Serverens `SUPABASE_*`-værdier må aldrig bruges som browserfallback. Auth persistence, auto-refresh og `detectSessionInUrl` er kun aktive, når modulet evalueres i browseren, og er deaktiverede ved SSR-evaluering.

`onAuthStateChange`-callbacken skal være synkron. Start aldrig nye Supabase-queries med `await` inde i callbacken; planlæg tenantbootstrap efter callbacken og generation-guard den mod identitetsskift, logout og unmount. Same-user token-events må kun opdatere sessionen. Password-login navigerer først, når AuthProvider har hydreret brugeren; bootstrapfejl skal vises med retry, og `next` må kun være en valideret same-origin relativ sti.

Denne singleton løser ikke SSR-autorisation. Eksisterende route-loaders bruger fortsat en global publishable/anon-klient uden den aktuelle requests bruger-JWT. Behandl derfor autentificeret initial navigation og RLS-resultater fra loaders som **AFVENTER**, indtil der findes en request-scoped serverklient, og browser-/serverflowet er verificeret med en godkendt dev/test-bruger.

Provisionér observations-ingest som ét runtime-miljø, ét stærkt secret og ét eksisterende projekt-ID med organisation. Request-bodyens `project_id` er kun kompatibilitetsinput og må ikke være autoritativ. Hvis projektbindingen ændres, skal credentialet roteres samtidig; genbrug ikke samme secret til flere projekter. En flerprojekt-integration kræver en særskilt, godkendt credential-/integrationsmodel.

`xdvqdzdpyceojbdknofi` er den brugerautoriserede P0-staging. Lovable-/produktionsref `ikrmcetjutqcjtwfhzfv` er ikke staging og må ikke ændres gennem denne lane. Brug `npm run build:staging` og `npm run preview:staging`; preflighten kræver eksakt staging-ref for browser og server og afviser fremmede Supabase-refs i buildet. `.env.staging.local` og genererede `.dev.vars.staging` er lokale/ignorerede og må aldrig committes. Cloudflare-hosting kræver særskilte staging-bindings/secrets; en lokal `.dev.vars` følger ikke med et deploy. Et særskilt brugerautoriseret hosted staging-deploy køres fra `.output/server` med den genererede `wrangler.json`, eksplicit `--env staging --keep-vars --strict` og en bestået `--dry-run`; en generisk/default Worker må aldrig bruges.

## 4. Migrationer og Storage

- Kildehistorik: `supabase/migrations/`; læs alle senere policyændringer før konklusion om effektiv RLS.
- Verificér målprojekt, diff og backup/recovery før enhver remote migration.
- Supabase CLI er fastlåst til 2.116.0 i devDependencies. Brug kun de versionsstyrede lokale scripts: `npm run supabase:start`, `npm run supabase:reset:local`, `npm run supabase:test:db` og `npm run supabase:lint:db`.
- Lokal reset/test kræver en disponibel Docker- eller Podman-baseret Supabase-stack. I cyklus 007 mangler Docker/Podman fortsat; frisk reset stoppede med `LegacyLocalDbRunningError`, og både pgTAP og DB-lint stoppede med `ECONNREFUSED 127.0.0.1:54322`. Ingen databasegate blev derfor kørt. Brug aldrig `--linked` som omgåelse.
- `20260831064838_harden_4dm_tenant_isolation.sql` er anvendt på den isolerede staging som del af registreret baseline efter atomisk rollback-dry-run og live katalogassertions. Det gør den ikke produktionsklar: frisk lokal replay, pgTAP `plan(62)`/62 assertions, DB-lint, rigtig Auth/Storage API-test og review af produktionsdata mangler fortsat.
- Hærdningskontrakt: field er kun indsamlings-/evidensbidragyder via eksplicit whitelist; `external` fejler lukket og får ingen hel-projektlæsning, før en autoritativ document-share-relation findes; canonical Storage-path validerer organisation→projekt-match; project-owned childreferencer skal matche rækkens `project_id`; indirekte child-parentnøgler og `uploads.uploaded_by` er immutable mod re-parenting; monitoring-uploadens path skal være sikkert uploader-prefikset, immutable og unik også ved samtidige inserts; action-evidence og device/parameter relationer har egne guards; `data_quality_assessments.scope_type/scope_id` er fail-closed for understøttede project-matchede typer; og `data_quality_issues.measurement_id` er en `NOT VALID` FK med `ON DELETE SET NULL`. Kolonnegrants på både upload-`INSERT` og `UPDATE` reserverer afledt metadata, validerings-/importresultater og status til backend, mens klienten kun kan skrive rå identitet/scope og ubetroet `user_metadata`; uploadoprettelse auditeres af en DB-trigger. Private metadata-paths valideres mod rækkens projekt og er immutable. Private Storage-buckets har ingen `UPDATE`-policy; almindelig monitoring-delete kræver manage, mens orphan-cleanup alene er tilladt for ejerens objekt i contributor-scope, når det er højst 15 minutter gammelt og uden metadata-række. `handle_new_user` opretter profil plus isoleret personal organisation og må aldrig foretage shared demo-owner-eskalering baseret på e-mail. Disse migrationseffekter er **AFVENTER** frisk replay og pgTAP, ikke live-verificerede.
- Produktionsworkflowet for migrationer må kun startes manuelt, kræver inputtet `DEPLOY`, GitHub environment `production`, secret-båret project ref og en bestået `supabase db push --dry-run`. Det er en sikkerhedsbarriere, ikke et mandat til at køre workflowet.
- Kør aldrig destruktiv kommando mod produktion og ændr aldrig live schema for at omgå en test.
- Migrationen foreslår private `monitoring-uploads`, `project-media` og `evidence-files`-buckets med projekt-/ejerbundne policies og uden privat Storage `UPDATE`. `monitoring-uploads` sættes til `209715200` bytes med den eksisterende MIME-allowlist; `project-media` sættes til `52428800` bytes med `image/*`/`application/pdf`. `ON CONFLICT` skal genanvende privacy, størrelse og MIME på eksisterende buckets. `evidence-files` gøres privat, men dens eksisterende size/MIME-constraints må ikke overskrives, før en autoritativ evidence-kontrakt er godkendt. Effektiv runtimekonfiguration, bucket/policies og eksisterende objektpaths er **AFVENTER** lokal/live inventar og negative tests. `Storage INSERT` mangler fortsat et serverudstedt upload-intent bundet til præcis én pending metadata-række. Multipart/resume, automatiseret orphan reconciliation/retention og oprydning af ældre orphans er også **AFVENTER**. Store filer må ikke falde tilbage til Git.
- Projektmedier og monitoring-downloads skal læses via signed URLs med fast TTL på 300 sekunder, afledt af en RLS-autoriseret DB-række/path; persisterede legacy public URLs må ikke materialiseres. En udstedt signed URL er et bearer-link og kan bruges indtil udløb, altså op til 300 sekunder efter en access revoke. Delete slår path op fra DB og må ikke stole på en caller-leveret path; monitoring-delete stopper ved Storage-fejl eller hvis RLS ikke sletter præcis én metadata-række, og auditerer først efter success. Evidence-upload gemmer kun privat object path og sanitiserer filnavnet. Ved fejlet uploadmetadata-insert skal Storage-rollback forsøges, og hvis rollback også fejler, skal både metadatafejl, path og cleanupfejl være synlige for operatøren. De målrettede servicecases verificerer kildekontrakten; de erstatter ikke Storage-integrationstests.

Efter migration skal mindst to organisationer testes negativt for tabel- og Storage-adgang. Cyklus 009 har udført en transaktionel live SQL-test som `authenticated` med tenant A/B og rollback; rigtig PostgREST bruger-JWT og Storage API list/read/write/delete/signed-URL/revoke mangler fortsat. Service-role-resultater er ikke RLS-evidens.

`public.spatial_ref_sys` er fortsat uden RLS og anonymt læsbar. Supabase-advisorens minimumsforslag er `ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;`, men det må ikke køres alene eller automatisk, fordi det kan blokere legitim PostGIS-adgang. Miljøejer skal vælge grants og read-policy først.

### 4.1 Dronefotos

- Brug monitoring-uploadet (`/app/connect/upload`) som indgang til dronefotos; skriv ikke nye dronefotos direkte til den generelle projektmedietabel.
- Originalfilen og dens SHA-256 er autoritative. Bevar den versionerede rå EXIF/XMP-envelope og parserfejl sammen med normaliserede felter; kopier ikke kun de synlige GPS-felter.
- Browserens preview/EXIF må kun sendes som ubetroet `user_metadata`. `detected_metadata`, validerings-/importresultater og workflowstatus skrives af en betroet backend efter verifikation; de må aldrig løftes direkte fra browserpayloaden.
- Aktivér ikke automatisk et foto på kortet ved manglende/modstridende GPS, ukendt UTC eller parsefejl. Brug aldrig projektcentroid som erstatning.
- Et EXIF-kamerapunkt er ikke et billed-footprint, en ortofoto-georeference eller dokumentation for fotogrammetrisk nøjagtighed.
- Canonical routing til `drone_assets`, serverudstedt upload-intent med eksakt pending-row-binding, evidence size/MIME-kontrakt, resumable/batchupload, end-to-end-idempotens, orphan reconciliation/retention og live RLS-/Storage-tests er **AFVENTER**. Den lokale DB-kilde afviser dubleret uploadpath og lukker samtidige metadata-inserts med en transaktionslås, men dette er ikke en komplet uploadprotokol. Store uploads skal have en verificeret resumable strategi før kundedrift.

### 4.2 Projektgrænse og geodataeksport

- `projects.geometry_polygon` er den aktuelle canonical boundary. Brug `persistProjectBoundary`/`clearProjectBoundary`; skriv ikke enkelte `geometry_*`-felter direkte fra UI.
- Import accepterer højst 2 MiB og én GeoJSON `Polygon` eller `Feature<Polygon>` i WGS84 med højst 500 reelle vertices. Åbne, ikke-endelige/out-of-range, duplikerede, selvkrydsende eller arealløse ringe afvises før skrivning. Polygon-huller valideres og fratrækkes areal/centroid; MultiPolygon/FeatureCollection afvises tydeligt.
- Kortredigering kræver eksplicit Gem/Annuller. Laget fryses under persistence, og en fejl må ikke vise succes eller fjerne brugerens mulighed for retry.
- Canonical GeoJSON og den deraf afledte observations-CSV skal bruge den databaseverificerede eksportvej. Preview/seed, simulerede sensorer og tavs RPC-fallback må ikke kunne downloades gennem denne vej. Connect metrics-/zone-CSV er separate udtræk og må ikke antages at have samme garanti uden egen guard og provenance.
- `get_project_geojson`-observationer dybdevalideres som Point, MultiPoint, LineString, MultiLineString, Polygon eller MultiPolygon med finite WGS84-koordinater og gyldige ringe. Ukendt geometri og 200 eller flere observationsfeatures stoppes; præcis 200 kan være RPC'ens cap og må ikke præsenteres som komplet eksport.
- Seed-geometri må kun bruges i eksplicit preview/ukonfigureret miljø. En databaseprojekt-række med ryddet boundary skal forblive tom og må ikke genoplives fra seed.
- Ugemte boundary-edits skal blokere tegning, upload, clear, projektskift og canonical download, indtil brugeren vælger Gem eller Annuller.
- Lokal UI-lock beskytter én hook-instans, og servicekontrakten kontrollerer den returnerede database-række før success. Boundary-rækken og `get_project_geojson` læses endnu ikke som ét atomisk, versionsbundet snapshot. Det kræver database-/RPC-versionering sammen med cross-tab/-bruger konflikthåndtering, immutable revisioner og live read-after-write og er `AFVENTER`.
- Boundary save/clear invaliderer projektmetrics, og manglende/ugyldigt `calculated_at` stoppes. Friskhed kan ikke sammenlignes med den aktuelle boundary, fordi schemaet mangler en fælles boundary-/source-version; en fuld stale-metrics-guard er `AFVENTER` schema-/RPC-versionering.

## 5. Kvalitetsgate

Kør i denne rækkefølge og log kommando, dato, miljø, exit og commit:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Kør desuden målrettede tests før hele suiten. Verificeret worktree 2026-09-01, cyklus 010: 9/9 målrettede auth-/logintests; typecheck; en fuld serial kørsel med 45 filer/359 Vitest-tests; `build:staging`; staging-ref-/secret-leak-preflight; Wrangler dry-run og hosted anonym Worker-smoke består. De tidligere transaktionelle DB-dry-run-, live tenant A/B SQL- og anonyme PostgREST-gates består fortsat fra cyklus 009. Buildscriptet giver Node 4 GB heap, fordi Nitro-bundlingen overstiger standardheapen. Seneste globale lint er fortsat rød med 5.155 errors/23 warnings og skal ned på 0 før P0-release.

`.github/workflows/ci.yml` er den ikke-deployende app-CI. Den har kun `contents: read`, persisterer ikke checkout-credentials, modtager ingen secrets og må ikke kalde Supabase, Wrangler eller deploy. Den kører ved pull request, accepteret push til `main` eller manuel dispatch med Node 22.14.0 og npm-lockfilen: ren install, typecheck, `verify:faktorer`, serial Vitest og normal build. Global lint er fortsat en synlig releaseblokering og må ikke tilføjes som `continue-on-error`; workflowkilden og lokale ækvivalente gates er ikke det samme som en bestået hosted Linux-kørsel.

Ved Supabase-/RLS-ændringer skal app-gaten suppleres i denne rækkefølge på en disponibel, entydigt lokal stack:

```powershell
npm run supabase:start
npm run supabase:reset:local
npm run supabase:test:db
npm run supabase:lint:db
```

Log CLI-version, kommando, exit og testantal. En statisk migrationsregression eller en skrevet pgTAP-fil dokumenterer kun kildekontrakten; RLS-/Storage-adfærd er først verificeret, når reset, pgTAP og relevante API/Storage-cases faktisk er kørt som `anon`/`authenticated` brugere fra mindst to organisationer.

På Windows springes Lovable MCP-routegeneratoren over, fordi den aktuelle pakke sammenligner blandede slash-formater; de genererede MCP-ruter ligger allerede i Git. På andre platforme kører pluginet fortsat i dev, aldrig i produktionsbuild. Genaktivér ikke Windows-pluginet uden en verificeret upstream-fix.

Der er endnu ingen verificeret Playwright-harness. En lokal pgTAP-harness findes nu, men den er ikke kørt, fordi container-runtime mangler. P0 kræver browserrejse på desktop/relevant mobil, konsol/netværkskontrol og negative to-tenant-/Storage-tests før release candidate.

## 6. Kildeadaptere og jobs

- Start i preview kun til UI-udvikling; en live gate skal vise faktisk status og `fetched_at`.
- Verificér endpoint, capabilities/collection, timeout, CRS og vilkår før kilden markeres live.
- Ved timeout/4xx/5xx: gem fejlkontekst uden secret og vis kilden som fejlet; returnér ikke preview med live-success.
- En dedikeret worker til fotogrammetri/COG/tiles er ikke verificeret. P0 må indlæse færdige afledte leverancer; tung behandling er **AFVENTER** konkret behov.

## 7. Rapporter

Aktuel kode kan generere en `jsPDF`-blob og en `documents`-række. Det er ikke den færdige P0-procedure. Før kundebrug skal følgende være verificeret:

1. rapporten genereres fra et låst input-snapshot;
2. PDF og manifest gemmes som versionsfaste Storage-aktiver med checksum;
3. obligatoriske sektioner og manglende data valideres;
4. godkendelse låser versionen; ny generering opretter en ny version;
5. downloadet PDF inspiceres for klip, tomme sektioner og læsbarhed.

## 8. Fejlsøgning

- **Stale lock:** Sammenlign `package.json` og lock uden at kassere brugerændringer; synkronisér én gang, og bevis derefter frisk `npm ci`.
- **Build OOM:** Brug kun det versionsstyrede `npm run build`; scriptet sætter 4 GB heap. En OOM ved standardheap er miljø-/værktøjsevidens, ikke et bestået build.
- **Sandbox read-denied:** Genkør den samme nødvendige, ikke-destruktive gate med korrekt godkendelse. Ændr ikke kode for at skjule miljøfejlen.
- **Supabase mangler:** Kontrollér kun nøglenavne/presence. Seed-fallback og statisk SQL-inspektion kan ikke verificere auth/RLS/persistence. Ved `permission denied` på målprojektet må et andet synligt projekt ikke bruges som substitut; markér live evidens `AFVENTER`.
- **RLS-fejl:** Reproducer med bruger-JWT og en anden tenant; brug aldrig service role som workaround.
- **Uploadmetadata fejler efter Storage-upload:** Kontrollér først den rapporterede metadatafejl. Hvis rollback også fejler, behold den synlige object path og cleanupfejl til manuel, autoriseret reconciliation; skjul ikke fejlen, og forsøg ikke en bred bucket-oprydning.
- **Kildedata mangler:** Kontrollér katalogstatus, URL, capabilities, CRS, timeout og vilkår; markér `AFVENTER` frem for at opfinde data.
- **Rapport afviger:** Sammenlign inputversioner, manifest/checksum og metodeversion; overskriv aldrig en godkendt rapport.

## 9. Afslut en cyklus

Opdatér `EXECUTION_STATE.md`, `P0_BACKLOG.md`, `QA_MATRIX.md` og `RUN_LOG.md` med observeret evidens. Commit kun én sammenhængende ændring efter bestået relevant gate; push er ikke merge eller produktion. Ved credentials, tenantlækage, datatab, ukendt remote-divergens eller manglende mandat: stop og rapportér præcis blokering.
