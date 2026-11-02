# Arbejdsopgave → feltregistrering → originalfoto

S02 / afgrænset D03-leverance · 2. november 2026.

## Det, som er samlet

Projektets **Plan og opgaver → vælg opgave → Dokumentation** genbruger de
eksisterende gemte jobkort og serververificerede feltfotos. En tilknytning
vælger en bestemt jobkortversion og et bestemt originalfoto. Den kræver en
begrundelse. Rettelse og tilbagetrækning opretter nye versioner; originalen
kopieres eller flyttes ikke.

**Udført arbejde (valgfrit)** lader brugeren vælge en bestemt eksisterende
udførelsesversion på samme opgave. Der vælges ikke automatisk den nyeste.
Planlagte registreringer kan ikke blive til dokumentation for faktisk
udførelse, heller ikke ved direkte API-insert. **Se tilknyttet udførelse**
viser den valgte versions datoer, metode, dækning, mangler og arbejdsgrundlag.
Den indlæses først, når brugeren åbner den. Senere rettelser ændrer ikke den
valgte udførelsesreference.

**Mine opgaver → åbn opgave → Se dokumentation** giver tildelte brugere
læseadgang til opgavens registrerede sammenhænge og præcis originaladgang.
Denne indgang opretter ikke nye registreringer eller projektuploads.

```mermaid
flowchart LR
  A[Arbejdsopgave: eksisterende action-ID] --> B[Gemt jobkortversion]
  A --> C[Dokumentationskobling med historik]
  B --> C
  D[Eksisterende feltupload] --> E[Serverens checksumkvittering]
  E --> C
  C --> F[Fast observationsskema og værdier]
  C --> G[Fast filidentitet og checksum]
  C --> H[Begrundelse og intern audit]
  G --> I[Præcis originaladgang efter adgangskontrol]
  C --> J[Ny rettelse eller tilbagetrækning]
  K[Eksisterende gemt faktisk udførelse] --> C
  C --> L[Præcis historisk udførelsesversion]
```

## Hvad bevares og håndhæves

- Opgaveidentitet: `work_orders.action_id` og de eksisterende organisationer,
  projekter og medlems-/opgaverettigheder.
- Observation i denne leverance: en ikke-kladde fra `field_job_versions`.
  Den oprindelige skemadefinition og svar fastholdes i koblingen. Null er
  ukendt; nul og falsk bevares. Tilknytning betyder ikke faglig godkendelse.
- Original: `field_photo_uploads` + en `verified`-kvittering i
  `field_photo_receipts`. Hash, størrelse, Storage-objektets ID, version og
  opdateringstid skal stemme. Filens faktiske bytekontrol genbruges fra den
  eksisterende foto-worker; den gentages ikke i browseren.
- Den nye `work_order_evidence_versions` er koblingshistorik. Sammensatte
  fremmednøgler håndhæver samme opgave/projekt/organisation, også ved direkte
  API-insert. Callerens snapshots og tidspunkt erstattes af databaseværdier.
- Nye versioner kræver forventet version; konkurrerende forfattere får
  konflikt. Samme request-ID og indhold returnerer samme gemning. Ændret
  indhold under samme request-ID afvises. Intern audit sker i samme transaktion.
- Valgfri udførelsesreference genbruger `work_order_execution_bindings` og
  den eksisterende immutable workspace-revision. Samme opgave/projekt/organisation
  håndhæves med den eksisterende sammensatte fremmednøgle. Den nye trigger
  afviser planlagt arbejde som faktisk udførelse. Ukendt metode, dækning og
  udføreridentitet bliver fortsat vist som dokumentationsmangler.
- Kladden og en usikker gemnings identiteter bevares ved fejl og visningsskift.
  En konflikt rebases ikke automatisk: sammenlign historikken, og start en ny
  rettelse fra den aktuelle version. Andre editorers låse frigives ikke af
  dokumentationspanelet.
- Interne projektbidragydere skal også have udførelsesadgang på opgaven for
  at tilknytte. Tildelte eksterne kan læse den konkrete opgaves snapshots,
  men får hverken projektets kildekatalog eller Storage-enumeration.
- Kildevalg og historik bruger begrænsede cursor-sider. Klientens validering
  kontrollerer også lookahead-rækken, ikke kun de viste rækker.

## Præcis originaladgang

`get_work_order_evidence_original` returnerer kun et eksisterende, tilknyttet
snapshot fra en læsbar opgave. Den kontrollerer den aktuelle Storage-identitet.
Seneste tilbagetrækning lukker også adgang fra de ældre rækker i koblingen.
En rettelse ændrer ikke tidligere registreringers betydning; historiske
originalreferencer kan fortsat læses, indtil koblingen trækkes tilbage.

Serverfunktionen tager kun koblings-ID og opgavens scope fra klienten.
Serverens eksisterende Supabase-adminclient signerer den kontrollerede sti,
og brugerens adgang samt objektidentiteten læses igen bagefter. URL'en skal
have samme Supabase-origin, præcis sti og HTTPS. Den gemmes ikke i metadata,
localStorage eller forespørgselscache. Browserbundlen indeholder ikke den
privilegerede signer eller dens nøglehenvisning.

Et udstedt link er en kortvarig adgangsbillet og kan bruges i **op til 60
sekunder**, også hvis adgang tilbagekaldes lige efter udstedelsen. Dette er
ikke øjeblikkelig tilbagekaldelse af allerede udleverede links. Originalens
bytes er ikke proxyet gennem appen. Den eksisterende serverkonfiguration for
`SUPABASE_URL` og adminclienten skal virke i det miljø, der senere prøves;
bygningen alene verificerer ikke miljøets adgang til signering.

Storage-politikkerne er ikke udvidet. Den smalle databasetrigger bruger
ejerrettigheder til at låse det præcise objekt efter bidrags-/opgavekontrol;
brugeren får ikke UPDATE-adgang til objektet.

## Kode og prøver

| Område | Ejer |
|---|---|
| Relation, RLS, canonicalisering og audit | `supabase/migrations/20261102090158_work_order_evidence_bindings.sql` |
| Valg af faktisk udførelse og direkte API-kontrol | `supabase/migrations/20261102094049_work_order_evidence_execution_sources.sql` |
| Input, svar og referencevalidering | `src/lib/work-order-evidence.ts`, `src/services/work-order-evidence-service.ts` |
| Autoriseret servergrænse | `src/lib/work-order-evidence.functions.ts` |
| Begrænset originalsignering | `src/services/work-order-evidence-original.server.ts` |
| Projektvisning | `WorkOrderEvidencePanel`, `ProjectWorkOrdersWorkspace` |
| Ekstern læseindgang | `MyWorkOrders` |
| Præcis historisk udførelsesvisning | `WorkOrderExecutionReference`, eksisterende `get_work_order_execution_binding` og work-order-execution-service |
| Syntetiske databaseprøver | `supabase/tests/database/work_order_evidence.test.sql` |
| Faktisk samtidighed og HTTP 409 | Udvidelse af eksisterende `scripts/database-concurrency/field-job-concurrency.test.mjs` |

Applikationscommit: `5739c85b59376478d2ff39770808d3942eb487df`.
[Kladde PR36](https://github.com/JESRI-C/freyra-hub/pull/36) bygger oven på
[navigationskladde PR35](https://github.com/JESRI-C/freyra-hub/pull/35).

Lokalt bestod typecheck, ændrede filers lint og **69 tests i fem filer**:
servicegrænse, originalsigner, dokumentationspanel, projektnavigation og
Mine opgaver. JavaScript-syntaksen i det udvidede samtidighedsscript er
kontrolleret. `npm run build:staging` bestod med ovenstående SHA og staging
i den tilbage-læste `freyra-build.json`. De 191 browser-JS-filer indeholder
ingen `supabaseAdmin`, `SUPABASE_SERVICE_ROLE_KEY` eller
`signWorkOrderEvidenceOriginal`-markør. Dette erstatter ikke hosted prøver.

Den tidligere testkø er afviklet. På `e716533` bestod begge jobs i
[CI-kørsel 41421195287](https://github.com/JESRI-C/freyra-hub/actions/runs/41421195287):
**3.353 applikationstests i 249 filer**, 1.458 databasekontroller i 22 filer,
tom migration, reel PostgreSQL-samtidighed, restore, databaselint, typecheck,
lint, foto-workerens syntetiske billeddekodning og build.

Den efterfølgende udførelseskobling ligger i applikationscommit
`72d4c8486295848740d384c58006f545fb82f3f6`. Lokalt bestod typecheck,
ændrede filers lint og **108 målrettede tests i syv filer**.
[CI-kørsel 41423470242](https://github.com/JESRI-C/freyra-hub/actions/runs/41423470242)
har allerede bestået hele databasejobbet: **1.471 databasekontroller i 22
filer**, tom migration, 29 generelle samtidighedsscenarier, 21 job-/opgave-
scenarier, seks fotoscenarier, restore, databaselint og oprydning. Det samlede
applikationsjob bestod også: **3.367 tests i 249 filer**, typecheck, lint,
beregningskilder, foto-workerens billeddekodning og build.

Staging-bygningen bestod lokalt med præcis `72d4c84…` i de tilbage-læste
buildmetadata. Alle 191 browser-JS-filer er kontrolleret uden privilegerede
signer/admin-markører. En lokal Chrome-prøve af de faktiske komponenter og
den byggede CSS bestod ved **320, 390 og 1.280 pixels**: intet vandret
overløb, synlige knapper mindst 44 pixels høje, historisk udførelse og
redigeringsformular. Serverfunktionerne var syntetiske hukommelses-fixtures;
det er hverken hosted end-to-end-test eller fysisk telefonacceptance.
Prøven gemmer skærmbilleder og resultat under ignoreret
`tmp/evidence-execution-browser/`.

[Maskinlæsbar kandidatkvittering](opgave-dokumentation-kandidat-2026-11-02.json)
registrerer den præcise testede kode, CI, testomfang og resterende accept.

Kontrollerne har kørt på CI's midlertidige database. Maskinen har fortsat
hverken lokal Docker, PostgreSQL-klient eller installeret WSL. Ingen hosted
database er brugt som erstatning eller ændret af denne leverance.

CI genbruger den eksisterende disposable Supabase-stack: tom migration,
alle pgTAP-prøver, samtidighed med reelle PostgreSQL-låse, HTTP-konflikt,
restore og databaselint. Nye scenarier omfatter konkurrerende kobling,
identisk genforsøg og medlemskab tilbagekaldt før commit. pgTAP omfatter
forkert scope, kladde, uverificeret/ændret original, manipuleret snapshot,
ekstern læseadgang, tilbagetrækning og audit-rollback.

## Næste acceptpunkter og afgrænsning

1. Den automatiske kandidatkontrol er bestået og registreret. PR36 forbliver
   kladde; migrationerne er ikke anvendt på hosted staging.
2. Prøv den migrerede kandidat i et aftalt testmiljø: intern og ekstern
   bruger, to projekter, tilbagekaldt opgaveadgang, manglende/ændret original,
   mistet gemmesvar og manuel konfliktbehandling. Bekræft, at signerens
   eksisterende serveropsætning er tilgængelig.
3. Prøv computer og fysisk telefon: læsning, valg, historik, originalåbning,
   visningsskift med kladde og konto-/projektskift. En automatiseret DOM-prøve
   er ikke fysisk mobil-/kamera-/offline-acceptance.
4. Udvid derefter eksisterende observationer og originaltyper én ad gangen;
   generiske `field_observations` og canonical droneoriginaler er ikke
   automatisk konverteret. Initial foto-position bevares; senere
   positionsrevisioner er ikke implicit gjort til observationsbevis.
5. Brug de præcise relationer i S04/D05 og S05/D07 til udførelse, frosne
   afleveringer, review og rapportkilder. En valgfri eksisterende
   udførelsesrevision kan nu vælges og læses i UI. Denne leverance gør ikke
   koblingen til en færdig aflevering.

**S02/D03 er fortsat delvis.** Ekstern nyregistrering/upload, hele D03,
S04/D05, S05/D07 og salgs-/produktionsacceptance er ikke lukket. Der er ikke
merget, deployet, sendt mail eller kaldt betalte datakilder. Ingen original
eller tidligere udviklet funktion er slettet. Brugerens to eksisterende
Jobs/Geotag-dokumentændringer er hashkontrolleret uændrede.
