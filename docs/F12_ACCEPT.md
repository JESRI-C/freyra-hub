# F12: teknisk klargøring og åben pilotaccept

**Status: afventer ekstern afprøvning. Ingen accepteret pilot.**

Applikationskandidat: b39b81b456f9dd5e58c23dfac9ce689624b4ea9c på
codex/bykaer-pilot-v1, baseret på b39ffbc med PR18 allerede inkluderet.
Den private udviklingsreference er læst; den og interne kundeoplysninger
indgår ikke i denne ændring.

## Udført lokal kontrol

- Samlet Vitest-kørsel under udviklingen: **2.954/2.954 bestået**.
  Efterfølgende kontrakt-/integrationsændringer har målrettede genprøver:
  33 tests i otte filer, derefter 16 tests i fem berørte filer inklusive
  actions-integration og UI-link. Tallene overlapper og skal ikke lægges sammen.
- Offline PostgreSQL/RLS: **112 assertions bestået**. Additiv migration
  20261028153415_freeze_workflow_report_inputs afprøvet oven på repræsentativ
  tidligere fixture og gentaget. Dette er ikke fuld PostGIS-/Supabase-replay,
  hosted Storage eller en ny belastningsprøve.
- Typecheck består. Fuld lint: 0 fejl / 24 eksisterende advarsler.
- Syntetisk PDF/ZIP er genereret. PDF-signatur, alle manifesthashes og
  geneksport er testet. En syntetisk PDF-side er renderet og visuelt kontrolleret
  for læsbarhed, linjeskift, margener og footer. Det er ikke kunderapportens layoutaccept.
- Endeligt staging-build og bundlekontrol består på
  **b39b81b456f9dd5e58c23dfac9ce689624b4ea9c**. Den genererede
  freyra-build.json er genlæst og matcher denne kilde, staging, kundedata
  og municipal workflow. Ingen build er deployed.
- Rå lokale testresultater og syntetiske eksportfiler ligger under ignoreret
  tmp/workflow-qa. Ingen private rapporter, originaler eller secrets er tilføjet Git.

## Aktuelt testmiljø, læst uden skrivning

Den hostede stagingapp identificerer sig som cfe09c4e0cbb3fac4379460dc353f9b9fea17fc1,
release 1.0, viteMode staging, customerDataOnly og municipalWorkflow true.
Den kører således ikke kandidatens nye funktioner.

Stagingdatabasen har seneste migration 20261027223941; den nye workflowkontrakt
er verificeret **ikke anvendt**. Den nye app stopper rapportgemning før skrivning
på et sådant miljø. Ingen migration er anvendt på en hosted database.
Produktionsappens aktuelle kilde kunne ikke identificeres; produktion er urørt.

## Kundeprøvens trin

| Brugerhandling                                                  | Status på den nye kandidat  | Nødvendigt for accept                                                 |
| --------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Medarbejder åbner/opretter korrekt projekt med skriveret        | Ikke afprøvet               | Aftalt medarbejderrolle, projekt og testrelease                       |
| Original før-/efterserie uploades/genhentes                     | Ikke afprøvet               | Verificerede originaler, afgrænset strækning, metadata og hashes      |
| Baseline/besøg og faktisk dækning gennemgås                     | Ikke afprøvet               | Rigtigt datagrundlag og relevant deltager                             |
| Faktisk grødeskæring dokumenteres                               | Ikke afprøvet               | Skærelog med faktisk dato/periode, metode, udfører, sted og kilde     |
| Før/efter-egnethed og begrænsninger afklares                    | Ikke afprøvet               | Samme relevante strækning, synlighed og faglig gennemgang             |
| Rapport/kildepakke gemmes, eksporteres og genåbnes i ny session | Ikke afprøvet hosted        | Godkendt isoleret testrelease og den komplette kundekæde              |
| Læser kan modtage uden skriveret                                | Ikke afprøvet på ny release | Særskilt tildelt læser, negativ API-/Storage-prøve og tilbagekaldelse |
| Næste opfølgning tildeles og genfindes efter refresh            | Ikke afprøvet hosted        | Faktisk ansvarlig, planlagt tidspunkt/betingelse og formål            |
| Medarbejder gennemfører uden agent/produktejer som betjener     | Ikke afprøvet               | Faktisk deltagelse; hjælp og tidsforbrug registreres                  |
| Fagperson/kunde bruger rapporten til en navngiven beslutning    | Ikke afprøvet               | Relevant kompetence og dokumenteret reviewomfang                      |
| DB og originale filobjekter genoprettes samlet                  | Ikke afprøvet hosted        | Isoleret gendannelsesmål og dokumenteret resultat                     |

Eksisterende 274-foto-atlas omfatter flere vandløb og uafklarede poster;
det kan ikke automatisk udlægges som en komplet Bykær-før/efterserie.
Ingen skæremetode, faglig accept, deltager eller effekt er opfundet.
Den lokale målrettede søgning i eksisterende analyse-/produktionsmetadata
identificerede ikke en verificeret skærelog. Det er ikke bevis for, at kunden
ikke har sådan en log.

## Næste afgrænsede arbejdspakke

F12 fortsættes med hosted teknisk prøve efter særskilt godkendelse af en
konkret testudgivelse: migrationen ovenfor til det eksisterende isolerede
stagingmiljø og den præcise byggede applikationskandidat til stagingappen.
Planens startinstruks kræver konkret autorisation til deploy/migration.
Det er ikke et mandat til produktion, main-merge, e-mail eller invitationer.

Før testen: genlæs mål, migrationsledger, backup og appversion; bevar fallback
cfe09c4. SQL er additivt og ændrer ingen eksisterende kundeværdier. Ved approllback
bevares versionsdata og nye guards; de må ikke slettes som en genvej.
Fuldt migrationsreplay og ny samtidigheds-/browserprøve står åbent og skal
rapporteres som sådan, indtil de faktisk er gennemført.

Den efterfølgende kunde-/fagprøve kan først accepteres med de rigtige input
og deltagere. F13–F29 er kortlagt, men ikke aktiveret i denne leverance.
Der sendes ingen e-mails, heller ikke tests.

## Godkendt stagingudgivelse og hosted prøve

Brugerens konkrete godkendelse er modtaget og udført. Denne status erstatter
ovenstående historiske oplysninger om ikke-deployed kandidat og manglende migration.

- Staging: https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev
- Verificeret applikationskilde: b39b81b456f9dd5e58c23dfac9ce689624b4ea9c.
- Cloudflare Worker-version: 3a4b7e93-8605-4b7b-89b5-efca6f69a616.
- Supabase-ledger: 20261028163056 freeze_workflow_report_inputs. Den lokale
  kildefil hedder 20261028153415_freeze_workflow_report_inputs.sql; MCP tildelte
  serverversionen. SQL SHA-256: A7D61CEAF08C9671B592CEFC050AF3DA16F662786D1B865B7705AE4061997FB5.
- Før/efter migration: workspace 23, rapportrevisioner 21, actions 9 i begge
  målinger. Ingen eksisterende kundeværdier ændret af migrationen.
- Appfallback: Worker 203a9441-9578-4187-ac26-c30b1010d184, kilde cfe09c4e0cbb3fac4379460dc353f9b9fea17fc1.
  Ved approllback bevares nye data/guards. Samlet hosted DB+Storage-restore er
  fortsat ikke afprøvet; fallbackversion er ikke bevis for gendannelse.
- Produktionsmiljø og main er urørt. Ingen mails eller invitationer sendt.

`scripts/test-workflow-hosted.mjs` består med 11 scenarier og ingen registrerede
browserfejl: projekt-/organisationsisolation; korrekt hosted version/DB-kontrakt;
editor gemmer/genåbner udførelse; beskrivende kildebundet sammenligning; rettelse
kræver ny vurdering; idempotent opfølgning med bevaret afvisning og actions-spejl;
mobil uden vandret overflow; afvisning af syntetisk kunderapport; eksplicit
syntetisk API-kladde genåbnes og eksporteres som PDF/ZIP med verificerede filhashes;
frisk læserlogin med afvist skrive-RPC; tilbagekaldt projektmedlemskab afviser nye
rapport-/workflowlæsninger. Allerede udstedte Storage-links er ikke prøvet for
øjeblikkelig tilbagekaldelse.

Prøverne bruger separate tekniske projekter, syntetiske pixels og adminoprettede
ikke-leverbare testkonti. Mediefixtures er indsat via admin, ikke en bestået
kundeupload. Adfærdsprøver bruger editor/læser og frisk passwordlogin.
Testharness blev tilpasset de eksisterende orgroller, formularlabels og
originalbeskyttelse; ingen beskyttelse blev svækket. Privat receipt, screenshots,
PDF/ZIP og loginoplysninger ligger kun under ignoreret tmp/workflow-qa.
Desktop-sammenligning og læserrapport er visuelt kontrolleret. Mobilprøven beviser
kun overflowkravet; skærmbilledet viser indlæsning og beviser ikke en fuldt
færdigindlæst mobilrapport.

Kildebegrænsning observeret: feltfotos har hash i metadata.original_sha256,
mens rapportens kanoniske kilderegister viser SHA-256 ikke dokumenteret, når
sha256-kolonnen er tom. Eksportens filmanifest består, men dette beviser ikke
originalfilernes checksums eller fuldstændige backup. Dette skal afklares før
accept af en rigtig kundekildepakke.

Kundematricens rækker står fortsat **ikke afprøvet** med faktiske Bykær-data og
deltagere. En teknisk syntetisk API-kladde er ikke en positiv kunde-UI-rapportprøve.
Næste afgrænsede arbejde er originalhash i rapportkilderegister og færdigindlæst
mobilkontrol; kundens skærelog/originalserie/faglige beslutning afventer eksternt.
Eksisterende sikkerhedsadvisor-fund er ikke ændret af denne migration; ingen nye
workflowfunktioner er security definer. Fuldt migrationsreplay er fortsat åbent.
