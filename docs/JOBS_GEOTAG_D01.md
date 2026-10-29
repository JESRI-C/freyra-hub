# D01: opgavescope og rettighedskontrakter

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

Lokalt findes ingen Docker/PostgreSQL. SQL/RLS/samtidighed er endnu ikke markeret bestået; faktisk CI-resultat registreres efter kørsel. Ingen hosted migration er udført, og ingen ny brugerflade er udgivet med D01.

## Rollback og næste pakke

Udviklingsklienten kan holde op med at bruge de nye endpoints. D01 ændrer ingen eksisterende projekt-/Storage-politikker eller legacy action-statusser. Nye historikposter slettes ikke som app-rollback. Fysisk schema-rollback og retention er særskilte driftsbeslutninger efter konkret dataafstemning.

D02 tilføjer arbejdsordrens planrevisioner, vandløbsprofil, tildeling/pulje og faktisk udførelse. D03 følger med observationer, originalfiler og opgavespecifik feltadgang. D05 er den eneste kommende vej til afleverings-/reviewgodkendelse; legacy `Lukket` må ikke behandles som godkendt arbejdsordre.
