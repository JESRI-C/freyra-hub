# D02c: faktisk udførelse bundet til planen

JOB-03 får en konkret plan-/udførelseskobling i den eksisterende udførelsesformular. Den faktiske udførelse gemmes stadig som `freyra.action-execution/v1` i `project_workspace_entries`. Rapporter og før/efter-referencer beholder dermed samme eksisterende originalrevision. En additiv binding knytter revisionen til en bestemt planversion, request-ID, faktisk udfører og medlemsvurdering. Projektionerne til dato, metode og dækning udfyldes af triggeren fra det eksisterende udførelsesnotat og er ikke en anden redigerbar udførelsesmotor.

## Adfærd

Ved åbning indlæses og fastlåses planversion og tidligere faktisk revision. Formularen viser planlagte datoer/metode ved siden af faktisk dato/metode. Den faktiske udfører vælges særskilt fra planens ansvarlige og registreringens forfatter. En senere planændring omskriver ingen historisk udførelse; et åbent, forældet grundlag giver konflikt. Et uændret genforsøg efter mistet svar får samme revision og interne audit, også når en nyere plan siden er kommet til.

En afvigelse kræver begrundelse. Faktisk arbejde kan registreres med manglende afvigelsesbilag eller ukendt metode/dækning/udføreridentitet, men manglerne beregnes af databasen og gemmes eksplicit. Dette er ingen aflevering eller godkendelse. D05 skal bruge versionsbundne dokumentationskrav før aflevering. Plan-/udførelsesdato og fotodato forbliver forskellige oplysninger.

Udførerens medlemsvurdering gemmes sammen med revisionen. Fjernelse eller rolleændring ændrer ikke tidligere vurderinger. En rettelse kan beholde den umiddelbart foregående udfører, selv når medlemskabet er fjernet; grundlaget markeres da historisk med kildehenvisning. Det giver ingen ny adgang til personen og kan ikke bruges til en ny udførelse på en anden opgave.

## Filer og integritet

- Migration `20261029191811_work_order_execution_bindings.sql`, oprettet med Supabase CLI: sammensatte FK'er til præcis plan og workspace-revision, append-only binding, RLS, atomisk SECURITY INVOKER-save og afgrænset læsning.
- En udskudt constraint-trigger kræver bindingen ved transaktionens afslutning. Direkte Data API-skrivning kan derfor ikke springe planreferencen over. Den private trigger er SECURITY DEFINER, fordi den skal se identiteten og integriteten også efter medlemsfjernelse i samme transaktion. Den har ingen læse-/mutations-API og giver ingen bredere klientadgang. Den eksisterende mutationsautorisation og workspace-validering gælder fortsat.
- Planændring og udførelse låser samme opgave; udførelsens eksisterende versionslås genbruges. Workspace-note, binding og interne audit-hændelser gemmes i samme transaktion.
- `src/lib/work-order-execution.ts`, `work-order-execution.functions.ts` og `src/services/work-order-execution-service.ts` bruger eksisterende auth-middleware og fejlgrænse, med fast forventet aktør også ved åbning.
- `ActionExecutionPanel.tsx` genbruges med planvisning, faktisk medlemsidentitet, afvigelsesårsag, kladdebevarelse, request-genforsøg, kontospecifik cache og mobilfelter på mindst 44 pixels. Legacy-handlinger uden arbejdsplan bevarer deres tidligere serviceforløb og læsevisning.

## Prøver og kendte mangler

96 fokuserede appprøver i ni filer bestod lokalt. Det omfatter service- og UI-prøver med plan i uge 39 og faktisk udførelse i uge 41, forfalskede kvitteringer, kontoændring, legacy-læsning, konflikt og genforsøg. Fokuseret lint og app-typecheck bestod også. CI på `a25e7d68b6383ff809fa8e5ed4a8aa487cc6b615`, [run 40940625369](https://github.com/JESRI-C/freyra-hub/actions/runs/40940625369), bestod 3.175 appprøver i 236 filer, build/typechecks/lint samt 1.219 databaseassertions, faktisk samtidighed, database-dump/restore og funktionskontrol.

Den efterfølgende API-prøve i isoleret staging afslørede en transportfejl, som SQL-prøven ikke kunne se: forventet versionskonflikt med SQLSTATE `40001` blev HTTP 500 og gentagne kald. Loggen viste korrekt databaseafvisning uden datatab. PostgREST dokumenterer både [40*-oversættelsen og PTxyz-fejlkoder til HTTP-status](https://docs.postgrest.org/en/stable/references/errors.html). En additiv migration, `20261029194025_work_order_api_conflict_status.sql`, skifter kun de syv udtrykkeligt navngivne arbejdsordre-funktioners forventede versionskonflikter til `PT409`. Native PostgreSQL-serialiseringsfejl forbliver `40001`; servicegrænsen håndterer begge. Oprindelige migrationer redigeres ikke efter installation.

Samtidighedsprøven kontrollerer nu også tre faktiske HTTP-kald mod den disponible lokale Supabase-API: forældet plan, tildeling og udførelse skal returnere HTTP 409 med `PT409` inden kaldets timeout. Den genbruger en lokal, syntetisk aktør og lokal JWT, uden Auth-mail, hosted endpoint eller udskrift af nøgler. 52 fokuserede prøver i tre berørte appfiler bestod efter rettelsen; den udvidede CI afventer.

Eksisterende `work_order_plans.test.sql` udvides med faktisk udførelse, fjernet medlemskab, planændring, rå API-skrivning, udskudt integritet, auditfejl og rollback. Den eksisterende PostgreSQL-samtidighedsprøve udvides med to scenarier for udførelse; samme forbindelser og lockvidne genbruges. Der bruges kun syntetiske fixtures.

Hele D02 er fortsat åben: grupper, puljeovertagelse, serverstyret livscyklus og logbog følger. D03 skal give tildelt felt-/ekstern rolle konkret observations- og filadgang. Denne del holder den gamle workspace-politik for editor+ lukket; tildeling alene åbner ikke projektets øvrige workspace. D04's filtre/totaler, D05's aflevering/review og D07's fulde plan-/udførelseseksport er ikke dækket af denne del. Fysisk mobilprøve og Bykær-accept er ikke gennemført.

## Tilbagerulning og næste del

De fire grundmigrationer er installeret i den eksisterende isolerede staging-database med kildefingeraftryk og de CLI-genererede versionsnumre. Før testfixtures var alle 50 projekter, 16 handlinger, 110 mediereferencer, 252 Storage-objekter og 31 workspace-poster bevaret. Fire nye tabeller har RLS, og den private integritetstrigger kan ikke kaldes direkte af browserrollen. Staging-appens nye deployment og konfliktrettelsens migration afventer den udvidede CI og API-prøve. Ingen produktion, mail/SMS, invitation, betalt provider eller merge er udført.

Efter schema-installation må en app-rollback ikke sende arbejdsordrer gennem det gamle ubundne save; en kompatibel rollback skal beholde bindings-RPC eller deaktivere gemning for nye arbejdsordrer. Legacy-handlinger uden arbejdsordre bevarer deres tidligere vej. Historik og originale notater slettes ikke. Næste del er D02's resterende tildelings-/statusforløb, derefter D03 feltdata og originaler.
