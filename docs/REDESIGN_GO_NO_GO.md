# Redesign: go/no-go og reproduktion

Kontroldato: 22. oktober 2026. Reference: `625781906a4f49d120b6b3581261279dd889e6de` på `codex/haderslev-demo-2710`. Arbejdsgren: `codex/redesign-2710`. Ingen ændring af main, demogrenen eller online staging.

**Aktuel beslutning: NO-GO.** Brugeren kunne ikke finde kategorierne. [Kategorirettelsen](CATEGORY_RESTORATION.md) genåbner kategorierne, men browserprøven fandt HTTP 500 i Byggeri og natur og forkert startside efter organisationsvalg. Arbejdet er standset efter brugerens regel. Build og 2.790 tests er grønne, men to browserprøver fejler. Rapportkontrolsum med seks fotos består. Ingen frigivelse.

**Historisk kontrol af første UI-leverance, ikke aktuel frigivelsesstatus:** Den samlede browserprøve med serveradgang bestod på applikationscommit `ebe8e86`. Kategoriernes reelle tilgængelighed var ikke dækket tilstrækkeligt af denne prøve. Faglig accept, 10-sekunders brugerprøve og produktionsfrigivelse er fortsat åbne.

| Kontrol | Resultat | Evidens / begrænsning |
|---|---|---|
| Bevaringskort | Gemte skærme og input kortlagt | `REDESIGN_MAP.md`; 80 skærme/layouts, 268 inputforekomster. Antallet er ikke antallet af unikke fagparametre. |
| UI-scope | Bestået på UI-koden | `node scripts/verify-redesign-scope.mjs`: eksisterende routes og 79 inputbindinger/handlers i berørte skærme bevaret. Ingen motor, service, API, database, RLS, afhængighed eller workflow ændret. Kontrollen supplerer manuel gennemgang; den beviser ikke fuld funktion alene. |
| Typekontrol | Bestået | `node node_modules/typescript/bin/tsc --noEmit`. |
| Lint | Bestået med advarsler | 0 fejl, 23 eksisterende advarsler; browserprøven formateret og efterkontrolleret. |
| Unit-/integrationstests | Bestået | 172 testfiler, 2.790 tests. Seriel kørsel: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism`. |
| Staging-build | Bestået | Vite staging-build, kontrol af stagingkonfiguration og bundle. Både browser- og serverdel er bygget. |
| Desktop-/mobilnavigation | Bestået på `ebe8e86`, 57,5 sekunder | Fem startvalg, alle seks trin, historisk baseline, nulstilling, kildesøgning og genoptagelse efter ugyldigt bogmærke. Desktop/mobil; nul observerede browserfejl. |
| Ny UI-version, identisk rapport med fotos | Bestået på `ebe8e86`, 26,2 sekunder | Godkendt midlertidig testsession; samme læsekonto genhentede præcis generalprøvens PDF med seks billeder. |
| Uændret online staging, eksisterende rapport | Bestået læsende kontrol | Samme læsekonto, rapportversion 2: 2.163.225 bytes, seks indlejrede illustrationer og præcis generalprøvens SHA-256. Ingen rapportversion eller faglig beslutning oprettet. |
| Ny UI-version, originalupload til PDF/ZIP | Bestået på `ebe8e86`, 54,7 sekunder | Originalt DJI-foto, dato/GPS, baseline, teknisk fotobeslutning, audit, beplantning, PDF/ZIP og genhentning. Isoleret teknisk sag; nul AI-kald. Seks filer i ZIP med validerede kontrolsummer. |
| Start en ny sag | Bestået, 9,6 sekunder | Oprettet gennem browseren: standardværdier, nulstilling, gemning, genåbning og læsende kontrol af gemte værdier. Præcis én teknisk sag oprettet. |
| DB/RLS og samtidighed | Bestået i PR-CI på `e6cebd3` | Begge jobs grønne: app og database/samtidighed. Databaseprøven omfatter 814 pgTAP-tests. [Kørsel](https://github.com/JESRI-C/freyra-hub/actions/runs/39848598514). Senere ændringer er test, billeder og dokumentation; deres PR-checks kontrolleres særskilt. |
| 10-sekunders forståelse | Afventer rigtig brugerprøve | Udviklerens skærmbilleder erstatter ikke observation af en førstegangsbruger. |
| Faglig accept, kundeadgang, backup og drift | Fortsat åbent | Se udviklingsplanens pakke 3-6. Ingen produktionstilladelse udledes af denne PR. |

## Rapportafvigelsen er undersøgt

Den læsende sammenligning brugte samme undersøgelse (`43600233-a99b-48e6-8a3e-05f6d727d759`) og rapportversion 2 på lokal preview og online staging. Gemte rapportdata blev ikke ændret.

| Miljø | PDF-bytes | Illustrationer | SHA-256 |
|---|---:|---:|---|
| Lokal preview uden nødvendig servernøgle | 23.459 | 0 | `92659a40d526697915281dbc1ba031b333f49a91002046f6a6ff6e96a4b45475` |
| Uændret online staging | 2.163.225 | 6 | `a07aec981f2a2868be75d93e99b8b701a7742dd5ff5724160300397d708441b5` |

Serverloggen dokumenterede den manglende servervariabel. Rapportmotor og downloadfunktion er uændrede. Den efterfølgende prøve med korrekt serveropsætning bestod både identisk genhentning og den fulde originalupload til PDF/ZIP på `ebe8e86`.

Det første forsøg på at starte `wrangler dev --remote` blev afvist af automatisk sikkerhedskontrol: sessionen ville have adgang til stagingressourcer og servernøgler, og kontrollen krævede udtrykkelig tilladelse. Jesper gav derefter denne tilladelse den 22.10.2026. Den midlertidige session gennem localhost:8788 blev anvendt til de beståede slutprøver ovenfor. Den online stagingversion blev ikke erstattet. Nøgler er ikke lagt i Git eller browserkonfigurationen.

Et uploadforsøg brugte først en nedskaleret rapportillustration med samme filnavn som originalen. Den manglede dato/GPS, hvilket programmet korrekt viste. Prøven blev derefter kørt med den verificerede DJI-original og bestod. Testen kontrollerer nu originalens SHA-256 før oprettelse af en testsag, så fejl i testmaterialet opdages tidligt. Den tekniske fotobeslutning er eksplicit en afvisning til test; ingen faglig godkendelse er afgivet.

[Maskeret testkvittering](screens/redesign-qa-2026-10-22.json) indeholder kontrolsummer, testresultater og skellet mellem teknisk kontrol og menneskelig accept.

## Gentag de to browserkontroller

Brug eksisterende tekniske konti gennem miljøvariabler. Loginoplysninger skal opbevares uden for Git. `e2e/redesign-ui.spec.ts` kræver `HADERSLEV_READER_EMAIL`, `HADERSLEV_READER_PASSWORD`, `HADERSLEV_E2E_ORG_ID`, `HADERSLEV_UI_PROJECT_ID`, `HADERSLEV_UI_ROUND_ID`, `HADERSLEV_UI_OLDER_ROUND_ID`, `HADERSLEV_UI_PROJECT_NAME` og `HADERSLEV_UI_REPORT_SHA256`. De to undersøgelser skal høre til samme læsbare sag; forventet rapporthash skal komme fra den kontrollerede leverance.

Kør med korrekt `HADERSLEV_E2E_BASE_URL` og eventuelt `HADERSLEV_E2E_BROWSER_CHANNEL=msedge`. `FREYRA_CAPTURE_SCREENS=1` gemmer maskerede designbilleder under `docs/screens/`. Testkontoens særlige organisationsvalg i navigationsprøven forudsætter præcis én viewer-organisation; kontoen kan samtidig eje sin egen personlige testorganisation.

Kør begge prøver i `e2e/redesign-ui.spec.ts` og derefter `e2e/haderslev-delivery.spec.ts` med opsætningen i README. En isoleret navigationsprøve må ikke rapporteres som bestået filintegritet eller samlet generalprøve. Ved fejl bevares den tidligere onlineversion, årsagen dokumenteres, og GO udskydes.
