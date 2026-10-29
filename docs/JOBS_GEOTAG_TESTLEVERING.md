# Arbejdsopgaver i den opdaterede testapp

Testappen har mobil plan/historik, særskilt personers udførelses-/kontroladgang, arbejdsgrupper, atomisk puljeovertagelse og faktisk udførelse bundet til konkrete plan-/tildelingsversioner. Det er D01 og dele af D02; hele Jobs/Geotag-forløbet er fortsat åbent.

[Åbn Mine opgaver på telefonen](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/opgaver). Brug den eksisterende testkonto, og genindlæs en allerede åben app. Indgangen findes også som **Mine opgaver** i hovedmenuen. Eksterne får opgaveadgang uden en projektbred indgang.

## Kort mobilprøve

1. Find **TEST · Græsningspleje** på Mine opgaver. Åbn **Se arbejdsgrundlag** og læs instruktionen. Den er en ledig pulje ved denne levering.
2. Tryk **Overtag opgaven**. Den skal blive markeret **Overtaget af dig**. En anden samtidig kandidat må ikke også kunne overtage den; det er automatisk afprøvet i disponibel database, ikke fysisk på to telefoner.
3. Åbn [testprojektets Udførelse](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/6b560dd2-ec96-42f2-90b5-b395ca0109af?step=udfoerelse). Vælg en opgave i **Arbejdsopgaver · plan og historik**. **Arbejdsfordeling** giver person, gruppe og pulje. **Arbejdsgrupper på projektet** giver oprettelse, rettelse, arkivering og historik. Angiv en begrundelse ved ændringer.
4. Åbn **TEST · Vandløbsbesøg** og ret instruktion eller planlagt dato som ny planversion. Gem og genåbn. Den gamle version skal stadig kunne læses; tom dato er uafklaret. **TEST · Naturtilsyn** har en gruppetildeling, og **TEST · Byggeri og natur** har en teknisk overtagelsesprøve.
5. Vælg en handling i **Faktisk udførelse** længere nede. Plan og faktisk dato/metode vises hver for sig. En ledig pulje skal overtages før gemning; knappen inde i formularen bevarer indtastningerne. Vandløbsregistreringen starter som planlagt og syntetisk, uden påstand om udført arbejde.
6. Gem en rettelse med begrundelse og genåbn. Plan-/tildelingsversion og faktisk udfører skal stadig være sporbare. **Tildeling og kontroladgang** har selvstændig revieweradgang; overtagelse er ingen dokumentationsgodkendelse.

Eksisterende jobkort, foto-upload og navigation er bevaret. Den nye opgaveliste er endnu ikke et offline-snapshot; den eksisterende `/felt`-fotokø indgår i næste feltpakke. Opgavespecifik felt-/ekstern skrivning og privat filadgang færdiggøres i D03.

## Teknisk kvittering

- Installeret kode: `6413a946e87f12c94bc09da18a521e39e3820fdb`. Cloudflare-version `827e1ec1-886c-4c92-9144-32ded6ee734e` er læst tilbage som aktiv ved 100 procent.
- [CI 40949524564](https://github.com/JESRI-C/freyra-hub/actions/runs/40949524564) bestod 3.226 appprøver i 239 filer, app-/worker-typechecks, lint, lokal Images-prøve og build. Databasejobbet bestod frisk replay, 1.304 assertions i 20 filer, faktisk PostgreSQL-samtidighed, seks negative HTTP-API-prøver, dump/restore og funktionskontrol. En tidligere menutest med fast antal blev rettet til den nye, 17. indgang.
- Seks Jobs/Geotag-migrationer er installeret i isoleret staging med indholdsfingeraftryk og CLI-genererede versionsnumre. De seks tabeller har RLS. Browserrollen kan ikke overskrive gruppe-/tildelingshistorik. Den nye state-RPC afviser anonym adgang.
- Hosted API-prøve bestod eksisterende fire planer og udførelsesregression samt én gruppe, tre konkrete tildelinger, én puljeovertagelse, idempotente genforsøg, HTTP 409 og afvist forkert projektscope. Audit har præcis én gruppehændelse, tre tildelingshændelser og én overtagelseshændelse. Græsningspuljen er efterladt ledig til brugerens prøve.
- Alle 50 projekter, 16 handlinger, 110 mediereferencer, 252 Storage-objekter, fire planversioner og 32 workspace-revisioner er bevaret. Denne del tilføjede ingen faktisk udførelsesrevision. Den tidligere syntetiske, endnu-ikke-udførte vandløbsregistrering bevares. Andre brugerprojekter ændres ikke.
- [Maskinlæsbar kvittering](jobs-geotag-staging-delivery.json), [kravmatrix](JOBS_GEOTAG_KRAVMATRIX.md) og [D02d's kontrakt/rollback](JOBS_GEOTAG_D02D.md). [PR 32](https://github.com/JESRI-C/freyra-hub/pull/32) er en draft oven på PR 31; ingen merge eller produktion.

## Åbent arbejde

D02 mangler serverstyret livscyklus og samlet logbog. D03-D05 skal færdiggøre konkret felt-/ekstern observation og filadgang, fælles kort/filtre/totaler, tjeklister og versionsbundet aflevering/review. D06 er importsporet; D07 skal medtage plan-/udførelsesbinding og originalfiler i komplet rapport/eksport. D08 kræver blandt andet fuld filrestore og faktisk Bykær-accept. Ingen af disse dele markeres færdige af denne testlevering.

Browseradgangskontrollen afviste tidligere både hosted og lokal visning, og Jesper valgte selv at afprøve. Derfor er mobilrendering, kamera/HEIC, hosted serverfunktionernes samlede klikforløb og fysisk offline luk/genåbn ikke godkendt. Administrative deploymentoplysninger og API-kald er teknisk bevis, ikke visuel eller faglig accept.

Der er ingen nye arbejdsordre-fund i stagingens sikkerhedsadvisor. Eksisterende advisories om [PostGIS/public-schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [udførbare definer-funktioner](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) og [adgangskodebeskyttelse](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) er særskilt D08-triage. De private tabellers deny-all-politik åbnes ikke for at fjerne en informationsmeddelelse. Der aktiveres ingen mail/SMS, invitation, AI-provider, betalt billedbehandling eller produktionsrelease.
