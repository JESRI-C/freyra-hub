# Arbejdsopgaver i den opdaterede testapp

Testappen har mobil plan/historik, særskilt personers udførelses-/kontroladgang, arbejdsgrupper, atomisk puljeovertagelse, versionsbundet status, fælles logbog og faktisk udførelse bundet til konkrete plan-/tildelingsversioner. Det er D01 og dele af D02; hele Jobs/Geotag-forløbet er fortsat åbent.

[Åbn Mine opgaver på telefonen](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/opgaver). Brug den eksisterende testkonto, og genindlæs en allerede åben app. Indgangen findes også som **Mine opgaver** i hovedmenuen. Eksterne får opgaveadgang uden en projektbred indgang.

## Kort mobilprøve

1. Find **TEST · Græsningspleje** på Mine opgaver. Åbn **Se arbejdsgrundlag** og læs instruktionen. Den er en ledig pulje ved denne levering.
2. Åbn **Status og logbog** på et opgavekort. Her kan du registrere start, sætte/ophæve afventer og skrive eller rette en note. Starttid er tom, indtil du angiver den eller vælger **Indsæt tidspunkt nu**; kilde er påkrævet. **TEST · Byggeri og natur** har mærket syntetisk start-/blokeringshistorik og to noteversioner til gennemsyn.
3. Tryk **Overtag opgaven** på **TEST · Græsningspleje**. Den skal blive markeret **Overtaget af dig**. En anden samtidig kandidat må ikke også kunne overtage den; det er automatisk afprøvet i disponibel database, ikke fysisk på to telefoner.
4. Åbn [testprojektets Udførelse](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/6b560dd2-ec96-42f2-90b5-b395ca0109af?step=udfoerelse). Vælg en opgave i **Arbejdsopgaver · plan og historik**. **Arbejdsfordeling** giver person, gruppe og pulje. **Arbejdsgrupper på projektet** giver oprettelse, rettelse, arkivering og historik. Angiv en begrundelse ved ændringer.
5. Åbn **TEST · Vandløbsbesøg** og ret instruktion eller planlagt dato som ny planversion. Gem og genåbn. Den gamle version skal stadig kunne læses; tom dato er uafklaret. **TEST · Naturtilsyn** har en gruppetildeling, og **TEST · Byggeri og natur** har en teknisk overtagelsesprøve.
6. Vælg en handling i **Faktisk udførelse** længere nede. Plan og faktisk dato/metode vises hver for sig. En ledig pulje skal overtages før gemning; knappen inde i formularen bevarer indtastningerne. Vandløbsregistreringen starter som planlagt og syntetisk, uden påstand om udført arbejde.
7. Gem en rettelse med begrundelse og genåbn. Plan-/tildelingsversion og faktisk udfører skal stadig være sporbare. **Tildeling og kontroladgang** har selvstændig revieweradgang; overtagelse er ingen dokumentationsgodkendelse.

Eksisterende jobkort, foto-upload og navigation er bevaret. Den nye opgaveliste er endnu ikke et offline-snapshot; den eksisterende `/felt`-fotokø indgår i næste feltpakke. Opgavespecifik felt-/ekstern skrivning og privat filadgang færdiggøres i D03.

## Teknisk kvittering

- Installeret kode: `28fb7d325eecc56eb1dc5bccd5340d7eb8e8a054`. Cloudflare-version `2e1f086a-f436-43df-aa4e-4f3e34ab8d42` er læst tilbage som aktiv ved 100 procent.
- [CI 40955139531](https://github.com/JESRI-C/freyra-hub/actions/runs/40955139531) bestod 3.270 appprøver i 241 filer, app-/worker-typechecks, lint, lokal Images-prøve og build. Databasejobbet bestod frisk replay, 1.407 assertions i 21 filer, faktisk PostgreSQL-samtidighed, otte negative HTTP-API-prøver, dump/restore og funktionskontrol. En tidligere menutest med fast antal blev rettet til den nye, 17. indgang.
- Syv Jobs/Geotag-migrationer er installeret i isoleret staging med indholdsfingeraftryk og CLI-genererede versionsnumre. De otte tabeller har RLS. Browserrollen kan ikke overskrive gruppe-/tildelingshistorik. Den nye state-RPC afviser anonym adgang.
- Hosted status-/logbogs-API bestod fire opgaver, 14 statusrevisioner, identiske genforsøg, 14 HTTP 409-konflikter, blokering/ophævelse og to uforanderlige noteversioner med oprindelig forfatter. Begge gennemløb efterlod præcis 14 status- og to notehændelser. Falsk systemaudit, overskrivning af historik, direkte godkendelse, ikke-overtaget puljestart og fremmed projektlog blev afvist. Tidligere plan-/gruppeprøver er bevaret som historisk evidens i kvitteringen. Græsningspuljen er stadig ledig til brugerens prøve.
- Alle 50 projekter, 16 handlinger, 110 mediereferencer, 252 Storage-objekter, fire planversioner og 32 workspace-revisioner er bevaret. Denne del tilføjede ingen faktisk udførelsesrevision. Den tidligere syntetiske, endnu-ikke-udførte vandløbsregistrering bevares. Andre brugerprojekter ændres ikke.
- [Maskinlæsbar kvittering](jobs-geotag-staging-delivery.json), [kravmatrix](JOBS_GEOTAG_KRAVMATRIX.md) og [D02e's kontrakt/rollback](JOBS_GEOTAG_D02E.md). [PR 33](https://github.com/JESRI-C/freyra-hub/pull/33) er en draft oven på PR 32; ingen merge eller produktion.

## Åbent arbejde

Operationel status og logbog er installeret. Afleveret/Godkendt/Returneret/Genåbnet kræver stadig D05s frosne skema-/evidensgrundlag. Logbogens private bilag og en modtagerspecifik tildelingsindbakke er åbne dele. D03-D05 skal færdiggøre konkret felt-/ekstern observation og filadgang, fælles kort/filtre/totaler, tjeklister og versionsbundet aflevering/review. D06 er importsporet; D07 skal medtage plan-/udførelsesbinding og originalfiler i komplet rapport/eksport. D08 kræver blandt andet fuld filrestore og faktisk Bykær-accept. Ingen af disse dele markeres færdige af denne testlevering.

Browseradgangskontrollen afviste tidligere både hosted og lokal visning, og Jesper valgte selv at afprøve. Derfor er mobilrendering, kamera/HEIC, hosted serverfunktionernes samlede klikforløb og fysisk offline luk/genåbn ikke godkendt. Administrative deploymentoplysninger og API-kald er teknisk bevis, ikke visuel eller faglig accept.

Der er ingen nye arbejdsordre-fund i stagingens sikkerhedsadvisor. Eksisterende advisories om [PostGIS/public-schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [udførbare definer-funktioner](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) og [adgangskodebeskyttelse](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) er særskilt D08-triage. De private tabellers deny-all-politik åbnes ikke for at fjerne en informationsmeddelelse. Der aktiveres ingen mail/SMS, invitation, AI-provider, betalt billedbehandling eller produktionsrelease.
