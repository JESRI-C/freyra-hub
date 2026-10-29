# D02d: arbejdsgrupper og atomiske puljeopgaver

Arbejdet er i gang på `codex/work-order-groups-pools-v1`, stablet på D02c. JOB-04 og ORG-03/04 samt SYS-02/03 er hovedkravene. Den eksisterende kravpakke viste ingen organisatorisk gruppe-/medlemsmodel, som kunne genbruges. Nye projektbundne grupper er derfor operationelle medlemslister; de erstatter hverken organisation, projekt, auth eller projektmedlemskab.

## Fastlagt adfærd

- Gruppeversionen gemmer de konkrete personer og deres aktuelle rollegrundlag. Ændringer er nye versioner med begrundelse. Arkivering bevarer det sidst registrerede medlemsgrundlag.
- En opgave tildeles person, gruppe eller pulje; ophævelse er en ny version. Planversion og den valgte gruppeversion fastlåses. Nye gruppemedlemmer får ikke automatisk adgang til gamle opgavetildelinger; en opdateret gruppe skal anvendes eksplicit på opgaven. Fjernelse/arkivering stopper derimod gruppens afledte adgang ved næste forespørgsel.
- Pulje kræver overtagelse med forventet version og request-ID. To forskellige samtidige kandidater skal give én ejer og én HTTP 409. En manager kan genåbne puljen gennem en ny tildelingsversion. Historiske ejere og faktiske udførere ændres ikke.
- De eksisterende `private.can_read_work_order`/`can_execute_work_order` genbruges. Puljeovertagelse opretter ingen ekstra grant-tabel. Professionelt review er fortsat en særskilt D01-kapabilitet. En demotion til læser invaliderer også gamle direkte udførergrants.
- Uafhængige direkte opgavegrants og projektroller har fortsat deres eksplicitte betydning. En åben pulje kan ikke udføres, før den er overtaget. Efter overtagelse kan en projektredaktør dokumentere på vegne af ejeren, mens øvrige kandidater ikke får udføreradgang alene ved kandidatur.
- Næste faktiske udførelsesrevision skal pinne tildelings-ID/-version sammen med den allerede fastlåste plan. Gamle revisioner får ingen opdigtet tildeling. Udeladt eller forældet kontekst giver konflikt, når en aktuel tildeling findes.
- “Mine opgaver” skal vise kun konkret opgaveadgang og kandidat-/udførertildeling. Det bliver ingen projektbred indgang for eksterne. Ny rosterlæsning bevarer organisationsejerens faktiske rolle uden at opfinde et projektmedlemskab.

## Ændringer og aktuelle prøver

Migration `20261029195747_work_order_groups_and_pool_assignments.sql` er oprettet med Supabase CLI. Den tilføjer to tabeller med RLS og sammensatte FK'er, afgrænsede private medlemsopslag, versionsstyret gruppe/tildeling/pulje, intern atomisk audit og læse-RPCer. Udførelsens eksisterende lagring genbruges med en valgfri historisk FK og en kompatibel RPC-signatur, hvis der ikke findes en tildeling.

`src/lib/work-order-assignments.ts`, tilhørende serverfunktioner og `src/services/work-order-assignments-service.ts` bruger eksisterende autentificeret request-klient og fejlgrænse. 35 fokuserede service-/kontraktprøver, app-typecheck og fokuseret lint er bestået lokalt.

`work_order_groups_pools.test.sql` afprøver faktisk adgang, rolleændring, grupper, arkiv/historik, én puljeejer, aktør, idempotens, scope og auditrollback i disponibel database. Den eksisterende PostgreSQL-samtidighedsprøve er udvidet med fire gruppe-/puljescenarier og tre yderligere HTTP-konfliktprøver; forbindelser og lockvidne genbruges. Faktisk CI afventer.

## Resterende arbejde i denne del

Mobilbetjening, gruppe-/personvælger, “Mine opgaver”, udførelsens kontekstindlæsning og deres UI-prøver er endnu i gang. D02d er ikke færdig og er ikke deployet. D02's livscyklus/logbog samt D03's konkrete felt-/eksterne fil- og observationsvej følger. Eksisterende workspace/Storage åbnes ikke projektbredt. Ingen e-mail, SMS, invitation, betalt provider, merge eller produktion er udført.

## Rollback

Historik slettes ikke. En kompatibel klient skal beholde tildelingskonteksten eller deaktivere gemning ved aktuel tildeling. Gamle kald uden tildeling bevarer deres vej. Grupper kan arkiveres, og tildeling kan ophæves gennem nye versioner. Aktuelle direkte grants og projektroller skal vurderes særskilt, når adgang ønskes helt fjernet.
