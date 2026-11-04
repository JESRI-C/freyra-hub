# Versionsbundne dokumentationskrav på arbejdsopgaven

4. november 2026 · S04/D05c · Status: implementeret; samlet database- og stagingprøve afventes.

Kravkilde: GoFreyras slutmål og udviklingsplanens S04/D05c samt FORM-/QA-kravene i Jobs/Geotag-registret. Produktreglen er valgt til GoFreyra. Der er ingen ny observation af Skyhosts brugerflade i denne leverance.

Projektlederen vælger op til ti eksisterende jobkort under **Arbejdsgrundlag → Rediger plan → Dokumentationskrav**. Valget gemmer den præcise skabelonidentitet, version og definition i planversionen. Valgfri og nødvendige felter fremgår også i den gemte plan og afleveringshistorikken. En ny skabelonversion erstatter ikke et tidligere valg.

Den tildelte feltmedarbejder kan vælge de krævede versioner i **Feltregistrering**, også før en redaktør har gemt den første registrering. Eksisterende bidragsadgang og opgavens udførelsesadgang er fortsat nødvendige. Projektlederen kan vælge andre skabeloner som hidtil; feltmedarbejderen får alene den ekstra binding, planen udtrykkeligt kræver.

Ved aflevering skal hvert valgt jobkort være repræsenteret i opgavens aktive dokumentation med den præcise version, udfyldte nødvendige felter og verificeret originalfoto. Et andet jobkort med samme titel eller felter opfylder ikke kravet. Et gemt svar skal tilknyttes under **Dokumentation**. Mangler fører brugeren tilbage til dette område.

## Kode, data og adgang

| Del | Genbrug og ændring |
|---|---|
| Plan og skabeloner | `work-order-plan.ts`, `field-job-cards.ts`, `WorkOrderPlansPanel.tsx`; valgfri `requiredJobCards` i den eksisterende plan |
| Fælles visning | `RequiredJobCards.tsx`, planoversigt, feltregistrering og afleveringshistorik læser samme gemte definition |
| Feltadgang | Eksisterende `validate_field_job_insert` og `save_field_job_version`; eksplicit påkrævet skabelon kan bindes af en autoriseret udfører |
| Aflevering | Eksisterende builder, roller, originalkontrol og låse genbruges; skabelonversion kontrolleres via den immutable registrering |
| Historik | Nye krav fastholdes med `freyra.submission-requirements/v1`; planer uden krav bruger fortsat det hidtidige snapshot og hash |
| Migration | `20261104024837_work_order_required_job_cards.sql`; ingen omskrivning af gemte planer, registreringer, originaler eller afleveringer |

Planens kopierede definition kontrolleres mod den eksisterende skabelon i samme organisation og projekt. Direkte tabelindsættelse har samme kontrol som RPC. Opgavelåsen tages før registreringslåsen i både RPC og trigger, så et planskift og valg af en påkrævet skabelon serialiseres.

## Gentagelig prøve

1. Gem en plan med en eksisterende skabelonversion. Kontrollér den gemte definition og genåbn på computer og telefonbredde.
2. Lad den tildelte feltmedarbejder gemme den valgte version uden redaktøradgang. Afvis en anden version og en opgave uden tildeling.
3. Knyt en registrering med samme felter fra et andet jobkort til dokumentationen. Afleveringen skal vise den konkrete mangel og afvise gemning.
4. Knyt den valgte versions komplette svar og originalfoto. Gem afleveringen, gentag request og kontrollér én version.
5. Gem en nyere skabelonversion. Den gamle plans krav og afleveringsgrundlag skal være uændrede.
6. Vælg den nye version i en ny plan. Kontrollér ændret grundlag, manglende ny dokumentation og bevaret gammel aflevering.

Appprøver: `required-job-cards.test.ts`, `WorkOrderPlansPanel.test.tsx`, `FieldJobCardsPanel.test.tsx` samt eksisterende plan-/afleveringsprøver. Databaseprøve: `supabase/tests/database/work_order_required_job_cards.test.sql`, kørt på disponibel CI-database med frisk migrationsafspilning. Resultater registreres efter faktisk kørsel.

## Fortsat åbent

Fagpersonen skal fortsat fastlægge, hvilke jobkort og bilag en bestemt faglig metode kræver. Denne funktion gemmer projektlederens konkrete valg og tillægger det ingen faglig godkendelse. Kategoriregler, yderligere bilagstyper, samlet offlineprøve med flere krævede jobkort og fysisk telefonaccept indgår i det resterende arbejde. Ekstern nyregistrering uden projektbidragsadgang udvides ikke af denne migration.
