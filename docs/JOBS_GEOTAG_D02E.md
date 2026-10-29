# D02e: operationel status og fælles logbog

Arbejdet foregår på `codex/work-order-lifecycle-v1` oven på `b6cb97c375fd5e03a99eb0c57c99baaf727c33b7` / PR 32. Checkout var rent ved start. Installeret testapp er fortsat kode `6413a946e87f12c94bc09da18a521e39e3820fdb`; denne nye del er ikke installeret. Krav-ID'er: JOB-05, JOB-09, SYS-02/03/07 og adgangsdelene i ORG-03/04. Det er videre implementering af D02, ikke samlet P0-accept.

## Kontrakt

- Operationel status er en versionsgemt erklæring på den samme opgave og konkrete plan-, tildelings- og udførelsesrevisioner. Der oprettes intet nyt projekt-, udførelses-, upload- eller fakturaregister. Manglende status er eksplicit ukendt; ingen historisk status fabrikeres.
- Kladde → Planlagt kræver ansvarlig, profil og instruktion. Ukendt planlagt dato er en synlig mangel og blokerer ikke. Tildelt kræver en konkret gyldig person-/gruppe-/puljetildeling. Projektansvar og direkte udføreradgang er ikke alene en operationel modtager.
- Påbegyndt kræver den tildelte udførers egen bekræftelse, angivet faktisk tidspunkt med tidszone og kilde. Registreringstid er serverens egen tid. Ukendt tidspunkt bliver ikke automatisk nu. Kontoret kan fortsat registrere faktiske udførelsesdata uden at udgive sig for workerens egen startbekræftelse.
- Udført kræver den aktuelle faktiske dato, metode og dækning på eksisterende workspace-binding. Bilagsmangler kan stadig være åbne. Almindelige statusmutationer og direkte tabel-INSERT kan ikke sætte Afleveret, Godkendt, Returneret eller Genåbnet; de kræver D05's versionsbundne afleverings-/reviewkontrakt.
- Grundlagsrettelser ændrer ikke gamle statusversioner. Læsning markerer ændret kontekst; en begrundet bekræftelse kan fastholde samme operationelle status på et aktuelt, gyldigt grundlag. En udførelsesrevision skal selv være bundet til den aktuelle plan/tildeling. Statusbekræftelse omskriver ikke udførelsen.
- Afventer er en separat blokering med årsag, ansvarlig, næste handling og valgfri frist. Ophævelse kræver begrundelse og ændrer ikke operationel status. Tidlig annullering kræver projektansvarlig og begrundelse; faktisk arbejde og tidligere blokeringer bevares historisk.
- Manuelle noter, afvigelsesnoter og overdragelser er append-only versioner. En rettelse kræver forfatter eller projektansvarlig og en årsag. Note og det oprindeligt åbnede plan-/tildelings-/udførelses-/statusgrundlag kan ikke flyttes ved en rettelse. En kladde om et ældre grundlag må gemmes med den eksplicitte historiske reference.
- Fælles logbog genbruger audit_events og de uforanderlige kilderevisioner. Kun kilder for den autoriserede opgave projiceres; ekstern opgaveadgang giver ingen projektbred audit- eller medlemsliste. Manuelle og systemskabte poster mærkes hver for sig. Klientskabte work_order-systemhændelser afvises. Falske/dublerede audit-rækker skaber ikke ekstra logposter; manglende auditbevis vises eksplicit.
- Logbogens nøglesider bruger tidspunkt og unik kildenøgle samt fast as-of. PostgreSQL-mikrosekunder bevares. En ny hændelse mellem to sider kan ikke flytte sig ind i det allerede åbnede snapshot. Hver side er begrænset til højst 50 poster.

## Ændrede dele og prøver

Migration `20261029203920_work_order_lifecycle_and_logbook.sql` er oprettet med eksisterende Supabase CLI. Den tilføjer to relaterede tabeller med RLS, sammensatte scope-FK'er og uforanderlig historik. Mutationer bruger samme opgavelås, forventet version og request-ID. Noter har selvstændig versionslås. Audit skrives atomisk; ingen udgående consumer tilføjes.

Postgres-gennemgangen bruger Supabases retningslinjer for nøglebaseret pagination, RLS og transaktionslåse. Noteforespørgslen anvender projekt/opgave-føringen i sit tidsindeks. Auditkvitteringer har et afgrænset indeks på projekt, objekt, hændelse og request-ID, så hver logpost ikke skal afsøge hele projektets audit. Ingen p95- eller storskalapåstand udledes af indeksdesignet; belastningsmålingen hører fortsat til D04/D08.

Nye datakontrakter/serverfunktioner ligger i `src/lib/work-order-lifecycle.ts` og `work-order-lifecycle.functions.ts`; request-klienten og fejlhåndteringen genbruges i `src/services/work-order-lifecycle-service.ts`.

126 fokuserede lokale prøver i ni filer bestod, inklusive 32 service-/kontraktprøver og 11 nye mobilformularprøver. App-typecheck og fokuseret lint bestod. Mobilvisningen åbnes under **Status og logbog** på Mine opgaver og i projektets eksisterende planpanel. Plan, tildeling, adgang og status/note redigeres hver for sig. Åbne kladder låser listeopdatering og puljeovertagelse; kontoskift rydder den gamle formular. Starttid er tom, indtil udføreren angiver tidspunkt eller eksplicit vælger at indsætte nu.

Kerne-CI 40953136344 på `9a4b3e3c92d7a87cf423b3a9ea1a8b943e368c37` bestod frisk replay og 1.398 SQL-assertions i 21 filer. Samtidighedsharnessen stoppede derefter, fordi den nye assertion læste `sqlstate` i stedet for harnessens eksisterende `result`-felt. Aflæsningen er rettet uden at svække kravet om faktisk lås og PT409. Den aktuelle UI-/forfatterudvidelse og fulde pipeline skal fortsat verificeres på ny revision før installation.

SQL-prøven dækker overgange, roller, kendte tværgående referencer, direkte API-bypass, blokering, historisk grundlag, note-/auditadskillelse, fast pagination og auditrollback. Den oprindelige noteforfatter bevares særskilt fra den konkrete rettelsesaktør, også efter en projektansvarlig har rettet på vedkommendes vegne. Samtidighedsharnessen er udvidet med fire status-/notescenarier samt to ekstra HTTP 409-prøver.

## Åbent arbejde og rollback

Samlet CI og stagingprøve er endnu i gang. D05's aflevering/returnering/godkendelse implementeres på denne revisionsmodel, når skema-/evidenskrav fra D03–D04 kan fryses og kontrolleres. Logbogens private bilagsrelationer genbruger den kommende D03-vej. D02e må ikke markeres som færdig ved kun grønne serviceprøver.

Ingen eksisterende status, noter, faktiske udførelser eller audit slettes ved rollback. Indgangen kan deaktiveres, mens de nye tabeller bevares. Gamle plan-/tildelings-/udførelsesmutationer genbruges. Ingen e-mail, SMS, invitation, betalt provider, merge eller produktionsændring er udført. Browser-/telefon-/faglig pilotaccept og fuld faktisk filrestore er fortsat åbne.
