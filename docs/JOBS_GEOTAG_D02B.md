# D02b: personers tildeling og kontroladgang

Denne del gør D01's konkrete opgaverettigheder betjenelige i mobilformularen. JOB-04 og ORG-03 får personsporet, med adskilt udførelse og faglig kontrol. JOB-04 er fortsat delvist: grupper og atomisk puljeovertagelse følger. Der blev søgt efter eksisterende teams/grupper i migrationer, genererede typer og services; ingen organisatorisk gruppe-/medlemsmodel blev fundet. Billedgrupper og navigationens grupper er ikke medarbejdergrupper og genbruges ikke som sådan.

## Adfærd og genbrug

Projektansvarlige vælger en nuværende eller tidligere modtager på en konkret opgave og gemmer aktiv arbejdsgrundlagsadgang, udførerrettighed og reviewerrettighed hver for sig, med begrundelse. Tidligere modtagere forsvinder ikke fra listen, når medlemskabet fjernes, og kan tilbagekaldes. Modtagerens aktuelle medlemskab og rolle kontrolleres igen på serveren. Ansvarlig i planen er uændret og giver ikke automatisk udføreradgang. Projektets øvrige roller kan fortsat give adgang efter tilbagekaldelse af et enkelt opgavegrant; UI forklarer dette.

Opgavegrants og intern audit genbruger uændret D01's append-only tabel og mutations-RPC. Nye læse-RPCer giver versionshistorik for én person og en stabil, pagineret liste over tidligere modtagere. Kun projektets adgangsadministrator kan læse andres historik eller modtagerlisten. Udfører/reviewer kan læse egen historik, når opgaven stadig er tilgængelig. Der oprettes ingen ny medlems-, auth-, upload- eller rapportmotor.

Formularens aktør, projekt, person og åbningsversion fastlåses ved redigering. Baggrundsopdateringer overskriver ikke kladden. Mistet svar med uændret indhold genbruger request-ID. Gemmefejl og fejl i genkontrol bevarer kladden; uden verificeret adgang deaktiveres gemning. Plan og tildeling redigeres én ad gangen, og navigation advarer mod at forlade en kladde.

## Filer og prøver

- Migration `20261029191105_work_order_access_history.sql`, oprettet med Supabase CLI: to afgrænsede SECURITY INVOKER-læse-RPCer over eksisterende versionshistorik; ingen nye tabeller eller bredere projektpolitik.
- `src/lib/work-order-access.ts`, `work-order-access.functions.ts`, `src/services/work-order-access-service.ts`: typed cursor-/historikkontrakter, scope-/aktørkontrol og eksisterende servermiddleware.
- `src/components/project/WorkOrderAccessPanel.tsx` og integration i `WorkOrderPlansPanel.tsx`.
- Eksisterende `work-order-access-service.test.ts` udvides med ni prøver. Ny `WorkOrderAccessPanel.test.tsx` har seks adfærdsprøver, herunder særskilt reviewer, mistet svar, konkurrerende ændring, tidligere medlem, læser og fejl under adgangsgenkontrol.
- Eksisterende `work_order_access.test.sql` udvides med 17 assertions om cursor, begrænset personhistorik, fjernet medlem, ukendt historik, fremmed organisation/projekt og direkte API-afslag. Eksisterende samtidighedsprøver af D01-mutationen genbruges.

65 fokuserede appprøver i fem filer, app-typecheck og fokuseret lint bestod lokalt. Disponibel CI bestod på koderevision `361e633840bdb026b0e11310a32cd85c0f465f55`, [run 40938510298](https://github.com/JESRI-C/freyra-hub/actions/runs/40938510298): 3.153 appprøver i 234 filer, app-/worker-typechecks, lint (0 fejl, 24 eksisterende advarsler), lokal Images-prøve og build; databasejobbet bestod frisk migrationsreplay, 1.180 assertions i 19 filer (17 nye D02b), faktisk samtidighed, database-dump/restore og funktionskontrol. [Draft-PR 30](https://github.com/JESRI-C/freyra-hub/pull/30) er stablet på D02a. Ingen hosted migration/deployment er foretaget. Fysisk mobilprøve, ekstern brugers samlede feltindgang og faglig pilotaccept er åbne.

## Tilbagerulning og næste del

Appen kan skjule den nye tildelingsbetjening uden at slette historik. De nye læseendpoints ændrer ingen eksisterende data eller rettigheder. Ingen mails, SMS, invitationer eller betalte provider-kald udføres. Næste D02-del tilføjer grupper/pulje, faktisk udførelseskobling og serverstyret livscyklus. D03's konkrete observationer og private filadgang samt D05's aflevering/review er fortsat nødvendige for et helt feltforløb.
