# D02a: arbejdsopgavens plan og mobilformular

Denne del tilføjer en versionsgemt plan på samme eksisterende `actions`-/`work_orders`-identitet. JOB-01, JOB-02 og LOC-01 får en første operationel del. Hele D02 er fortsat åben: tildeling/puljer, livscyklus og kobling til faktisk udførelse følger efter denne del. Legacy-status `Lukket` er ingen afleverings- eller reviewgodkendelse.

## Adfærd

På projektets Handlinger og kommuneforløbets Udførelse kan planlæggere vælge en eksisterende opgave og gemme titel, beskrivelse, instruktion, profil, ansvarlig, sted, prioritet, planlagte datoer og metode. Mobilformularen bruger almindelige felter, en kolonne på små skærme, mindst 44 pixels høje betjeningsfelter og decimal-komma/-punktum. Gemte planversioner og begrundelser kan læses igen. Planen kopieres ved åbning; en baggrundsopdatering ændrer ikke den igangværende kladde. Fejl bevarer indtastningerne. Genforsøg med uændret indhold genbruger request-ID. Forældet versionsgrundlag afvises af databasen.

Planlagt ansvarlig er adskilt fra faktisk udfører og giver ingen rettigheder. Datoer kan være ukendte og sættes aldrig automatisk til i dag. Tomme mål forbliver ukendte; målt nul bevares som nul og kræver målkilde. Vandløbsprofilen har regulativreference/-version, stationer med retning, oplyst længde, bundbredde og termin. Længde udledes ikke af stationsforskellen. Eksisterende lokalitet og uforanderlig vandløbsversion vælges fra projektets data, med sammensatte fremmednøgler i databasen. Der tilføjes ingen punkt-til-areal-konvertering.

## Kontrakt og filer

- Migration `20261029185238_work_order_plan_versions.sql`, oprettet med Supabase CLI: append-only plan, typed projektioner, RLS, servervalidering, cursorhistorik og SECURITY INVOKER-save. Opgaverod, første plan og intern audit gemmes atomisk.
- `src/lib/work-order-plan.ts` og `work-order-plan.functions.ts`: typed kontrakt og eksisterende auth-middleware.
- `src/services/work-order-plan-service.ts`: aktør-/scopekontrol, præcis versionskvittering og fejl/konflikt adskilt fra tom historik. D01's RPC-fejlgrænse genbruges.
- `src/components/project/WorkOrderPlansPanel.tsx`: integreret i eksisterende projektside og kommuneforløb. Ingen eksisterende navigation fjernes.
- `supabase/tests/database/work_order_plans.test.sql`: syntetiske RLS-/FK-, nul-/ukendt-, historik-, idempotens- og atomaritetsprøver.
- Eksisterende `scripts/database-concurrency/field-job-concurrency.test.mjs` udvides med konkurrerende plansave og identisk genforsøg med faktisk lockvidne.

## Verifikation og begrænsninger

50 fokuserede appprøver i fire filer bestod lokalt, inklusive D01's 20 serviceprøver. De nye prøver kontrollerer blandt andet formularens bevarede kladde ved konflikt og mistet svar, fast aktør, genbrugt request-ID, historikcursor og målt nul. Appens typecheck og fokuseret lint bestod også. Disponibel CI bestod på koderevision `afbcd0a9db60bf8169aadeb578a26424ddd13d09`, [run 40937570174](https://github.com/JESRI-C/freyra-hub/actions/runs/40937570174): 3.138 appprøver i 233 filer, app-/worker-typechecks, lint (0 fejl), lokal Images-prøve og build. Databasejobbet bestod frisk migrationsreplay og 1.163 assertions i 19 filer, heraf 61 nye planassertions, de to nye samtidighedsscenarier med faktisk PostgreSQL-lockvidne, database-dump/restore og funktionskontrol. [Draft-PR 29](https://github.com/JESRI-C/freyra-hub/pull/29) er stablet på D01.

Ingen hosted migration eller deployment udføres med denne levering. Browseradgang til appen er tidligere afvist af adgangskontrollen, og brugeren har valgt selv at afprøve. Derfor er fysisk mobilvisning, kamera, iPhone/Android og kundens Bykær-forløb fortsat uafprøvet. Listevalg er ikke en godkendt 10.000-opgavers ydelsesprøve; D04 skal samle serverfiltre og pagination. Tildelt ekstern bruger kan læse en konkret plan gennem den nye kontrakt, men den eksisterende projektbrugerflade åbnes ikke for projektbred adgang.

## Tilbagerulning og næste del

Appen kan undlade at bruge det nye panel/endpoints. Eksisterende historik slettes ikke som rollback. Ingen eksisterende upload-, rapport- eller authmotor erstattes, og ingen mail, SMS, invitation eller betalt provider aktiveres. Næste del er D02b: eksplicit tildeling, opgavestatus og sammenhæng med den eksisterende versionshistorik for faktisk udførelse. D03 følger med observationer/originaler; D05 med versionsbundet aflevering og review.
