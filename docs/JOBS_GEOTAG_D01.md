# D01: opgavescope og rettighedskontrakter

Denne pakkehistorik suppleres af den [aktuelle samlede testlevering](JOBS_GEOTAG_TESTLEVERING.md), som dokumenterer efterfølgende staging-installation, API-prøve og deployment.

Arbejdsordreidentiteten er en relation med samme ID som en eksisterende `actions`-post. Organisation og projekt bindes med sammensatte fremmednøgler til de eksisterende stamdata. Ingen ny projekt-, auth-, upload- eller rapportmotor oprettes.

## Krav og genbrug

ORG-01/02/03/04 og SYS-01/02/03/04 får den første operationelle kontrakt. Eksisterende medlemskaber, RLS, authenticated request-klient og `audit_events` genbruges. `work_orders` og `work_order_access_versions` er additive tabeller. `initialize_work_order`, `save_work_order_access` og `get_work_order_access` er authenticated SECURITY INVOKER-RPCer. Private definer-funktioner bruges alene til medlemsopslag/RLS-rekursion og en afgrænset audit-trigger.

Eksterne brugere har fortsat ingen projektbred adgang. Et aktivt opgavegrant kan vise netop arbejdsordreidentiteten og dens kapabiliteter. Det åbner ikke `actions`, projektdata, eksisterende jobkort eller privat Storage. Den nødvendige konkrete filadgang kommer i D03 og må først aktiveres efter sine egne prøver. D01 er derfor ikke hele ORG-03's afleverings-/filforløb.

Planlægning følger eksisterende editor+-adgang. Tildeling af rettigheder kræver projektadministrator/projektansvarlig eller organisationsadministrator. Udførelse for felt-/ekstern rolle kræver et aktuelt grant; en læser får ikke skjult udføreradgang. Review kræver en særskilt eksplicit kapabilitet og følger ikke automatisk af administrator- eller udførerrolle. D05 skal desuden binde review til afleveringsversion og afvise kontrol af egen aflevering. En reviewer-kapabilitet er ikke i sig selv en faglig godkendelse.

Hver rettighedsændring har forventet version, request-ID, autentificeret aktør og begrundelse. Genforsøg med ændret payload afvises. Medlemskab kontrolleres igen ved ny forespørgsel; gamle grants kan ikke opretholde adgang efter medlemsfjernelse. Tilbagekaldelse tilføjer en version. Mutation og intern audit er én databasetransaktion. Der er ingen mail-, SMS-, invitations- eller provider-consumer.

## Filer og prøver

- Migration: `20261029183735_work_order_scope_and_access.sql`, oprettet med den installerede Supabase CLI.
- Kontrakter og eksisterende servermiddleware: `src/lib/work-order-access.ts`, `src/lib/work-order-access.functions.ts` og `src/services/work-order-access-service.ts`.
- 20 serviceprøver bestod lokalt: scope/aktør, kontoændring, forfalskede returdata, versionskvittering, idempotensdata og sanitiserede 403/409/422/503-fejl.
- `work_order_access.test.sql` afprøver RLS, sammensatte FK'er, eksplicit reviewer, fjernet medlemskab, retur-/genforsøgsidentitet og injiceret auditfejl. Den kører kun i disponibel database.
- Den eksisterende `field-job-concurrency.test.mjs` genbruges med to nye scenarier: konkurrerende tildeling og identisk genforsøg med faktisk PostgreSQL-lockvidne. Ingen parallel forbindelses-/testmotor tilføjes.

Lokalt findes ingen Docker/PostgreSQL. Den faktiske disponible CI-prøve er nu bestået på koderevision `312e332b1fef150f4ef5f8adf8e73187162872a9`, [run 40935274270](https://github.com/JESRI-C/freyra-hub/actions/runs/40935274270). Appjobbet bestod 3.108 tests i 230 filer, typechecks, lint (0 fejl, 24 eksisterende advarsler), lokal Images-prøve og build. Databasejobbet bestod frisk migrationsreplay og 1.102 assertions i 18 filer, heraf 71 nye D01-assertions, faktisk samtidighed inklusive de to nye tildelingsscenarier, dump/restore og funktionskontrol. [Draft-PR 28](https://github.com/JESRI-C/freyra-hub/pull/28) er stablet på offlinegrenen; ingen merge.

Prøven afslørede og fik rettet en INSERT/RETURNING-fejl: eksisterende projektlæsning bruges direkte i den nye rækkes læsepolitik, mens opgavespecifik ekstern læsning stadig følger det aktuelle grant. Den samme STABLE-snapshotbegrænsning beskrives i [PostgreSQL-dokumentationen](https://www.postgresql.org/docs/current/xfunc-volatility.html). En syntetisk opfølgning oprettes gennem Freyras eksisterende kilde-/historik-RPC. Ingen eksisterende validering blev slået fra.

Ved den første D01-kodelevering var ingen hosted migration udført og ingen ny brugerflade udgivet. UI-/filforløb og fuld T01-accept for kommende operationelle data er fortsat åbne. De beståede tekniske delprøver er hverken fysisk mobilprøve eller kunde-/faglig accept.

## Rollback og næste pakke

Udviklingsklienten kan holde op med at bruge de nye endpoints. D01 ændrer ingen eksisterende projekt-/Storage-politikker eller legacy action-statusser. Nye historikposter slettes ikke som app-rollback. Fysisk schema-rollback og retention er særskilte driftsbeslutninger efter konkret dataafstemning.

D02 tilføjer arbejdsordrens planrevisioner, vandløbsprofil, tildeling/pulje og faktisk udførelse. D03 følger med observationer, originalfiler og opgavespecifik feltadgang. D05 er den eneste kommende vej til afleverings-/reviewgodkendelse; legacy `Lukket` må ikke behandles som godkendt arbejdsordre.
