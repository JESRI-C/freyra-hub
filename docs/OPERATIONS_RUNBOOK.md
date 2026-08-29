# GoFreyra operations runbook

Opdateret: 2026-08-29. Dette er den verificerede lokale baseline. Produktion er uden for mandatet.

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

Provisionér observations-ingest som ét runtime-miljø, ét stærkt secret og ét eksisterende projekt-ID med organisation. Request-bodyens `project_id` er kun kompatibilitetsinput og må ikke være autoritativ. Hvis projektbindingen ændres, skal credentialet roteres samtidig; genbrug ikke samme secret til flere projekter. En flerprojekt-integration kræver en særskilt, godkendt credential-/integrationsmodel.

Den konfigurerede Supabase `project_id` er `ikrmcetjutqcjtwfhzfv`, men instansens rolle som dev/test/prod er **AFVENTER**. Skriv ikke migrationer eller testdata, før målmiljø og mandat er bekræftet.

## 4. Migrationer og Storage

- Kildehistorik: `supabase/migrations/`; læs alle senere policyændringer før konklusion om effektiv RLS.
- Verificér målprojekt, diff og backup/recovery før enhver remote migration.
- Lokal `supabase db reset` er kun tilladt, når Supabase CLI/lokal container er verificeret og target tydeligt er lokal. Den blev ikke kørt i første cyklus.
- Kør aldrig destruktiv kommando mod produktion og ændr aldrig live schema for at omgå en test.
- Storage bucket/policies, multipart/resume og retention er **AFVENTER** live inventar. Store filer må ikke falde tilbage til Git.

Efter migration skal mindst to organisationer testes negativt for tabel- og Storage-adgang. Service-role-resultater er ikke RLS-evidens.

## 5. Kvalitetsgate

Kør i denne rækkefølge og log kommando, dato, miljø, exit og commit:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Kør desuden målrettede tests før hele suiten. Verificeret checkpoint: frisk `npm ci`, typecheck, 193/193 Vitest-tests og `npm run build` består. Buildscriptet giver Node 4 GB heap, fordi Nitro-bundlingen overstiger standardheapen. Ændrede TypeScript-filer har lint 0; global lint er fortsat rød med 5.428 errors/25 warnings og skal ned på 0 før P0-release.

På Windows springes Lovable MCP-routegeneratoren over, fordi den aktuelle pakke sammenligner blandede slash-formater; de genererede MCP-ruter ligger allerede i Git. På andre platforme kører pluginet fortsat i dev, aldrig i produktionsbuild. Genaktivér ikke Windows-pluginet uden en verificeret upstream-fix.

Der er endnu ingen verificeret Playwright- eller RLS-harness. P0 kræver browserrejse på desktop/relevant mobil, konsol/netværkskontrol og negative to-tenant-tests før release candidate.

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
- **Supabase mangler:** Kontrollér kun nøglenavne/presence. Seed-fallback kan åbne UI, men kan ikke verificere auth/RLS/persistence.
- **RLS-fejl:** Reproducer med bruger-JWT og en anden tenant; brug aldrig service role som workaround.
- **Kildedata mangler:** Kontrollér katalogstatus, URL, capabilities, CRS, timeout og vilkår; markér `AFVENTER` frem for at opfinde data.
- **Rapport afviger:** Sammenlign inputversioner, manifest/checksum og metodeversion; overskriv aldrig en godkendt rapport.

## 9. Afslut en cyklus

Opdatér `EXECUTION_STATE.md`, `P0_BACKLOG.md`, `QA_MATRIX.md` og `RUN_LOG.md` med observeret evidens. Commit kun én sammenhængende ændring efter bestået relevant gate; push er ikke merge eller produktion. Ved credentials, tenantlækage, datatab, ukendt remote-divergens eller manglende mandat: stop og rapportér præcis blokering.
