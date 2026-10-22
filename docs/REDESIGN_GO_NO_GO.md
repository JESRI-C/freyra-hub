# Redesign: go/no-go og reproduktion

Kontroldato: 22. oktober 2026. Reference: `625781906a4f49d120b6b3581261279dd889e6de` på `codex/haderslev-demo-2710`. Arbejdsgren: `codex/redesign-2710`. Ingen ændring af main, demogrenen eller online staging.

**Samlet beslutning: NO-GO til sammenlægning og frigivelse, indtil den nye versions samlede browserprøve med serveradgang er bestået.** Grøn build og unit-tests er ikke en grøn generalprøve.

| Kontrol | Resultat | Evidens / begrænsning |
|---|---|---|
| Bevaringskort | Gemte skærme og input kortlagt | `REDESIGN_MAP.md`; 80 skærme/layouts, 268 inputforekomster. Antallet er ikke antallet af unikke fagparametre. |
| UI-scope | Bestået på UI-koden | `node scripts/verify-redesign-scope.mjs`: eksisterende routes og 79 inputbindinger/handlers i berørte skærme bevaret. Ingen motor, service, API, database, RLS, afhængighed eller workflow ændret. Kontrollen supplerer manuel gennemgang; den beviser ikke fuld funktion alene. |
| Typekontrol | Bestået | `node node_modules/typescript/bin/tsc --noEmit`. |
| Lint | Bestået med advarsler | 0 fejl, 23 eksisterende advarsler; browserprøven formateret og efterkontrolleret. |
| Unit-/integrationstests | Bestået | 172 testfiler, 2.790 tests. Seriel kørsel: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism`. |
| Staging-build | Bestået | Vite staging-build, kontrol af stagingkonfiguration og bundle. Både browser- og serverdel er bygget. |
| Desktop-/mobilnavigation | Bestået på `a43b214`; slutkontrol af `ebe8e86` afventer | `e2e/redesign-ui.spec.ts`, prøven med fem startvalg. Desktop/mobil, seks fotopunkter, historisk baseline, nulstilling og kildesøgning; nul observerede browserfejl. Dette er en særskilt prøve fra filintegritet. |
| Ny UI-version, identisk rapport med fotos | Bestået i godkendt midlertidig testsession på `a43b214` | Efter afklaring af lokal serveropsætning gav samme læsekonto præcis generalprøvens PDF med seks billeder. Slutkontrol af seneste UI-rettelse afventer. |
| Uændret online staging, eksisterende rapport | Bestået læsende kontrol | Samme læsekonto, rapportversion 2: 2.163.225 bytes, seks indlejrede illustrationer og præcis generalprøvens SHA-256. Ingen rapportversion eller faglig beslutning oprettet. |
| Ny UI-version, originalupload til PDF/ZIP | Ikke gennemført | `e2e/haderslev-delivery.spec.ts` er tilpasset de seks trin. Prøven kræver fuld serveropsætning og en isoleret teknisk testsag. Den rigtige Bykær-historik må ikke bruges til testbeslutninger. |
| DB/RLS og samtidighed | Ikke genkørt på PR-head | Ingen ændring af disse lag. Tidligere generalprøve er historisk evidens; PR-checks skal stadig bestå. |
| 10-sekunders forståelse | Afventer rigtig brugerprøve | Udviklerens skærmbilleder erstatter ikke observation af en førstegangsbruger. |
| Faglig accept, kundeadgang, backup og drift | Fortsat åbent | Se udviklingsplanens pakke 3-6. Ingen produktionstilladelse udledes af denne PR. |

## Rapportafvigelsen er undersøgt

Den læsende sammenligning brugte samme undersøgelse (`43600233-a99b-48e6-8a3e-05f6d727d759`) og rapportversion 2 på lokal preview og online staging. Gemte rapportdata blev ikke ændret.

| Miljø | PDF-bytes | Illustrationer | SHA-256 |
|---|---:|---:|---|
| Lokal preview uden nødvendig servernøgle | 23.459 | 0 | `92659a40d526697915281dbc1ba031b333f49a91002046f6a6ff6e96a4b45475` |
| Uændret online staging | 2.163.225 | 6 | `a07aec981f2a2868be75d93e99b8b701a7742dd5ff5724160300397d708441b5` |

Serverloggen dokumenterede den manglende servervariabel. Rapportmotor og downloadfunktion er uændrede. Dette beviser en lokal miljømangel; det beviser endnu ikke, at den nye UI-version består den fulde generalprøve med korrekt serveropsætning.

Det første forsøg på at starte `wrangler dev --remote` blev afvist af automatisk sikkerhedskontrol: sessionen ville have adgang til stagingressourcer og servernøgler, og kontrollen krævede udtrykkelig tilladelse. Jesper gav derefter denne tilladelse den 22.10.2026. En midlertidig session blev startet med forbindelse gennem localhost:8788, og begge browserprøver bestod på `a43b214`: navigation 57,3 sekunder og filintegritet 30,4 sekunder. Den online stagingversion blev ikke erstattet. Nøgler er ikke lagt i Git eller browserkonfigurationen.

## Gentag de to browserkontroller

Brug eksisterende tekniske konti gennem miljøvariabler. Loginoplysninger skal opbevares uden for Git. `e2e/redesign-ui.spec.ts` kræver `HADERSLEV_READER_EMAIL`, `HADERSLEV_READER_PASSWORD`, `HADERSLEV_E2E_ORG_ID`, `HADERSLEV_UI_PROJECT_ID`, `HADERSLEV_UI_ROUND_ID`, `HADERSLEV_UI_OLDER_ROUND_ID`, `HADERSLEV_UI_PROJECT_NAME` og `HADERSLEV_UI_REPORT_SHA256`. De to undersøgelser skal høre til samme læsbare sag; forventet rapporthash skal komme fra den kontrollerede leverance.

Kør med korrekt `HADERSLEV_E2E_BASE_URL` og eventuelt `HADERSLEV_E2E_BROWSER_CHANNEL=msedge`. `FREYRA_CAPTURE_SCREENS=1` gemmer maskerede designbilleder under `docs/screens/`. Testkontoens særlige organisationsvalg i navigationsprøven forudsætter præcis én viewer-organisation; kontoen kan samtidig eje sin egen personlige testorganisation.

Kør begge prøver i `e2e/redesign-ui.spec.ts` og derefter `e2e/haderslev-delivery.spec.ts` med opsætningen i README. En isoleret navigationsprøve må ikke rapporteres som bestået filintegritet eller samlet generalprøve. Ved fejl bevares den tidligere onlineversion, årsagen dokumenteres, og GO udskydes.
