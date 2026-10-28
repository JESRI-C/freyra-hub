# F00: indledende afstemning

Status 28.10.2026: **F00 afstemt og verificeret lokalt og for stagingmetadata;
produktionsrevision er ukendt**. Den private udviklingsreference er nu hentet gennem
autoriseret GitHub-adgang og læst i sin helhed, inklusive startinstruksen.
Den kopieres ikke ind i dette repository. Dette er en teknisk statuslog uden
interne kundeoplysninger. Pakkemapping findes i [pakkestatus](PAKKESTATUS.md).

## Kode og genbrug

GitHub-oplysninger er læst på ny via connectoren. Lokal Git-fetch fejlede med
`getaddrinfo() thread failed to start`; lokale remote-referencer er derfor
ikke alene brugt som bevis for aktuel GitHub-status.

| Spor                              | Kontrolleret revision                    | Konklusion                                                                                                                                                 |
| --------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| main                              | 7dc33f4c75e431d7ceba47d16d54cd1f5cdbb30e | Samme head i GitHub-grenlisten og lokal reference.                                                                                                         |
| PR18 / codex/bykaer-evidence-flow | 1ed21d7a7296110031884e90551245e5448b8c66 | Åben, ikke merged. Dokumenterede projektfaner, originaler, rapporter og adgangskontrol genbruges.                                                          |
| PR19 / codex/release-1.0          | b39ffbceced171ad53bad3f50dee3b0ab386fb99 | Åben draft mod codex/haderslev-demo-2710. Lokal ancestry-kontrol viser, at PR18-head allerede er indeholdt her.                                            |
| codex/haderslev-delivery          | 1437c2a8908969641dbeab00392387197c5744e5 | Separat checkout i udvikling/freyra-hub. Historiske drone-/AI-/rapportrettelser må vurderes efter behov; de cherry-pickes ikke blindt ind i releasegrenen. |

Det aktuelle genbrugsgrundlag er checkout
`arbejde/freyra-hub-bykaer`, nu på `codex/bykaer-pilot-v1`, oprettet direkte
fra b39ffbc uden merge eller cherry-pick. Checkout i `udvikling/freyra-hub`
var også rent ved kontrollen. Det overordnede dashboard-repository har
eksisterende ændring i `.gitignore` og untracked arbejde, docs, leverance,
tmp og referencebillede; disse er bevaret uden staging eller oprydning.

Genbrug især [releasevurderingen](RELEASE_1_0.md),
[rapport-/atlasaudit](REPORT_ATLAS_AUDIT.md) og
[simuleret kontrol](SIMULERET_BRUGERKONTROL.md). Det ældre
[Bykær-checkpoint](BYKAER_CHECKPOINT.md) er historisk og må ikke stå alene som
gældende test- eller migrationsstatus.

## Bykær Bæk som første komplette leverance

| Led                  | Genbrug                                                                       | Resterende accept                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Projekt              | Organisation/projektvalg, roller, geometri og versionsspor                    | Bekræft den faktiske kundesag og aftalt delstrækning med rette deltager. Kundeprøve: **ikke afprøvet**.                                                                  |
| Originalmateriale    | Privat originalupload, EXIF/XMP, SHA-256, atlas og kildehenvisninger          | Kontrollér det aktuelle kundemateriale og udpeg Bykær-poster. Det eksisterende 274-foto-grundlag omfatter flere vandløb og uafklarede poster; alle må ikke kaldes Bykær. |
| Baseline             | Eksisterende baseline, daterede kilder og manuelle vurderinger                | Bekræft relevant før-tilstand, kildeudgave og faglig vurdering. Kundeprøve: **ikke afprøvet**.                                                                           |
| Faktisk grødeskæring | Eksisterende arbejdsnoter og kilde-/observationskoblinger                     | Mangler verificeret arbejdsdato, udført omfang/delstrækning, udfører og udførelsesdokumentation. Må ikke udledes af to fotos. Kundeprøve: **ikke afprøvet**.             |
| Før/efter            | Daterede fotos, sammenligning, observationer og review                        | Kobl faktiske optagelser til samme strækning og den dokumenterede indsats mellem optagelserne. Kundeprøve: **ikke afprøvet**.                                            |
| Rapport              | Gemte kladder, versionering, kildefrysning, PDF/DOCX/CSV/GeoJSON og fotoatlas | Færdig kunderapport kræver ovenstående grundlag og navngiven faglig gennemgang. Kundeprøve: **ikke afprøvet**.                                                           |
| Næste opfølgning     | Eksisterende opfølgningsnoter og undersøgelsesfase follow_up                  | Aftal ansvarlig, tidspunkt eller udløsende betingelse, sted og hvad der skal dokumenteres. Ingen aftale opfindes. Kundeprøve: **ikke afprøvet**.                         |

## Testmiljø og accept i denne arbejdspakke

- Node v22.14.0 matcher projektets krav om Node 22.
- `npm run preflight:staging`: bestået; konfigurationen peger på staging
  `xdvqdzdpyceojbdknofi`. Ingen nøgler er udskrevet.
- `npm run typecheck`: bestået, exit 0.
- Målrettet Vitest: **45 tests i fire filer bestået**: photo-atlas,
  report-document, ReportWorkspace og drone-ingest. Første forsøg kunne ikke
  omdøbe midlertidige filer (EPERM) og kørte ingen tests. Genkørsel med TEMP/TMP
  under checkoutets `.cache/f00-temp` bestod; ingen produktkodeændring nødvendig.
- GitHub-grenliste og PR18/PR19-heads er sammenholdt med checkouts.
- Node 22.14.0 / npm 10.9.2; eksisterende package-lock.json er uændret.
- Gældende README, .lovable/plan.md, Haderslev-plan, package.json og CI er læst.
  Ingen AGENTS.md blev fundet under checkoutet ved filinventering.
- Fuld lint: bestået med 0 fejl og 24 eksisterende advarsler før kodeændringer.
- Ny målrettet basisregression: 135 tests i 11 filer bestået (serverauth,
  tenant-hardening, middleware, cache/projektvalg, vandløb/geometri, workspace,
  datamode og rapportservice).
- Read-only staging-DB-opslag: 30 anvendte migrationer; seneste
  20261027223941_field_photo_provenance_insert. Staging har historisk bootstrap
  og derfor en anden ledger end lokal migrationsreplay; versionsnumre alene
  er ikke bevis for fuld skemaparitet.
- Den historiske stagingkvittering i `release-1.0/deployment.json` angiver
  appkilde cfe09c4 og Worker 203a9441-9578-4187-ac26-c30b1010d184.
  **Aktuel hosted revision og nyt browserforløb er ikke afprøvet i denne pakke.**
  Tidligere 2.919 tests og browserbeviser er historiske resultater og tælles
  ikke som en ny fuld kørsel.
- Ingen databaseændring, deploy, merge, e-mail, invitation, password-reset
  eller testmail er udført. Produktionsvurderingen forbliver NO-GO.

## Kort statuslog og næste afhængighed

1. Afstemt PR18, PR19, releasecheckout og det separate leverancespor.
2. Dokumenteret genbrug og mangler for hele Bykær-kæden; lokale ændringer bevaret.
3. Konfigurationskontrol, typekontrol og 45 relevante tests bestået.
4. Udviklingsreferencen er læst. README og historiske planreferencer er
   afstemt med før/efter og valgfri plantning. Webværktøjet kunne først ikke
   læse buildmetadata; efterfølgende read-only HTTP-kontrol verificerer
   staging som cfe09c4, release 1.0, kundedata og municipal workflow.
   Produktionsmetadata kunne ikke læses. Den nye kode er ikke udgivet.
5. Manglende kundedata stopper kun de berørte kundeprøver. Ublokeret
   implementering og tekniske prøver fortsættes efter planens konkrete krav.

## Datakontrakter og valgt rapportspor

| Logisk objekt      | Eksisterende ejer                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projekt/område     | projects, project_members, watercourse_versions og segmenter                                                                                                                                              |
| Besøg og plan      | survey_round_versions, verification_plan_versions                                                                                                                                                         |
| Kilder/originaler  | project_baseline_snapshots, project_media, upload_intents, evidence_files og private buckets                                                                                                              |
| Resultat og review | watercourse_observations/reviews, photo_point_review_versions, drone_image_inspections                                                                                                                    |
| Indsats og bilag   | actions og action_evidence; immutable projektnotater til rettelser                                                                                                                                        |
| Rapport            | F10 vælger report_documents/revisions med frosset workflowgrundlag til aflevering på tværs af før-/efterrunder. municipal_report_versions og dets PDF/ZIP bevares til historiske og enkeltstående runder. |
| Opfølgning         | actions, kvalitet/alerts og versionsgemte project_workspace_entries                                                                                                                                       |
| Beregningskørsel   | calculated_metrics, kilde-/baselineversioner og eksisterende metodeprofiler                                                                                                                               |

Rollemap: projektansvarlig = project_manager/admin inden for eksisterende
grants; almindelig selvbetjening = editor; bidrag = field; modtager = viewer.
Fagligt review kræver desuden korrekt kompetence, objekt og omfang; en
rolleetiket giver ikke i sig selv faglig accept.

Signed URLs er bearer-links i deres udstedte levetid. Nyt opslag kontrollerer
adgang igen; tilbagekaldelse af medlemskab lover ikke øjeblikkelig spærring af
et allerede udstedt link. Droneoriginalens særlige læseflow kræver 60 sekunders
udløb. Generelle medie-/rapportlinks skal vurderes efter deres egen TTL.
