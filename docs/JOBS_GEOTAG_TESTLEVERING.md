# Arbejdsopgaver i den opdaterede testapp

Testappen har nu mobilformular til plan og historik, konkret personers udførelses-/kontroladgang samt faktisk udførelse bundet til en præcis planversion. Det er D01 og dele af D02; hele Jobs/Geotag-forløbet er ikke færdigt.

[Åbn testopgavernes Udførelse](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/6b560dd2-ec96-42f2-90b5-b395ca0109af?step=udfoerelse). Den almindelige projektside har også planformularen under **Handlinger**. Genindlæs appen, hvis den gamle udgave står åben. Brug den eksisterende testkonto.

## Kort mobilprøve

1. Vælg **TEST · Vandløbsbesøg** i Arbejdsopgaver. Åbn **Rediger plan som ny version**.
2. Ret instruktion eller planlagt dato, angiv årsag, gem og genåbn. Den gamle planversion skal stadig kunne læses. Et tomt datofelt skal forblive uafklaret.
3. Åbn **Tildeling og kontroladgang**, vælg testpersonen og kontroller den særskilte udføreradgang. Revieweradgang er et selvstændigt valg og er ingen dokumentationsgodkendelse.
4. Vælg samme handling i **Faktisk udførelse** længere nede. De planlagte datoer/metode vises ved siden af de faktiske felter. Testregistreringen starter som planlagt, med syntetisk datagrundlag og uden påstand om udført arbejde.
5. Gem en rettelse med begrundelse og genåbn. Planens tidligere version og den faktisk registrerede version skal stadig være sporbare. Ingen mail/SMS sendes.

De øvrige eksisterende testopgaver er **Naturtilsyn**, **Byggeri og natur** og **Græsningspleje**. De har også en første plan. Eksisterende jobkort, foto-upload og navigation er bevaret.

## Teknisk kvittering

- Kode og installeret app: `625e2dab3447e6402be9e7caceb33bbbde09fae0`. Cloudflare-version `a563c7cb-4980-438b-a397-2d69d5ca392c` er læst tilbage som aktiv ved 100 procent.
- [CI 40942472409](https://github.com/JESRI-C/freyra-hub/actions/runs/40942472409) bestod 3.176 appprøver i 236 filer, app-/worker-typechecks, lint (0 fejl, 24 eksisterende advarsler), lokal Images-prøve og build. Databasejobbet bestod frisk migrationsreplay, 1.219 assertions i 19 filer, faktisk PostgreSQL-samtidighed, tre negative HTTP-API-prøver, database-dump/restore og funktionskontrol.
- Fem migrationer er installeret i isoleret staging, med indholdsfingeraftryk og de CLI-genererede versionsnumre. De fire nye tabeller har RLS. Browserrollen kan hverken overskrive historik eller kalde den private integritetstrigger direkte.
- Hosted API-prøve med eksisterende testkonto bestod: fire planer, identiske genforsøg, afviste forældede versioner, personers tildeling, én syntetisk endnu-ikke-udført registrering og to scope-afslag. Hver domænemutation har præcis én intern audit-hændelse; genforsøg gav ingen dubletter.
- Alle 50 projekter, 16 handlinger, 110 mediereferencer og 252 Storage-objekter er bevaret. Workspace steg fra 31 til 32 med den ene udtrykkeligt syntetiske testregistrering. Testkontoen er gjort til eksplicit projektansvarlig på sit eget isolerede testprojekt, uden invitation eller Auth-oprettelse. Andre brugerprojekter ændres ikke.
- [Maskinlæsbar kvittering](jobs-geotag-staging-delivery.json), [kravmatrix](JOBS_GEOTAG_KRAVMATRIX.md) og [D02c's kontrakt/rollback](JOBS_GEOTAG_D02C.md). [PR 28](https://github.com/JESRI-C/freyra-hub/pull/28), [PR 29](https://github.com/JESRI-C/freyra-hub/pull/29), [PR 30](https://github.com/JESRI-C/freyra-hub/pull/30) og [PR 31](https://github.com/JESRI-C/freyra-hub/pull/31) er reviewbare drafts; ingen merge eller produktion.

Den hosted API-prøve fandt først, at en forventet versionskonflikt blev håndteret som en serverfejl og gentaget. Rettelsen giver `PT409`/HTTP 409 og er verificeret både i disponibel HTTP-prøve og hosted API. Oprindelige migrationer blev bevaret; rettelsen er en additiv migration.

## Åbent arbejde

D02 mangler grupper, atomisk puljeovertagelse, serverstyret livscyklus og samlet logbog. D03-D05 skal færdiggøre konkret felt-/ekstern observation og filadgang, fælles kort/filtre/totaler, tjeklister og versionsbundet aflevering/review. D06 er importsporet; D07 skal medtage plan-/udførelsesbinding og originalfiler i komplet rapport/eksport. D08 kræver blandt andet fuld filrestore og faktisk Bykær-accept. Ingen af disse dele markeres færdige af denne testlevering.

Browseradgangskontrollen afviste tidligere både hosted og lokal visning, og Jesper valgte selv at afprøve. Derfor er mobilrendering, kamera/HEIC, hosted serverfunktionernes samlede klikforløb og fysisk offline luk/genåbn ikke godkendt. Administrative deploymentoplysninger og API-kald er teknisk bevis, ikke en visuel eller faglig accept.

Der er ingen nye arbejdsordre-fund i stagingens sikkerhedsadvisor. Eksisterende advisories om [PostGIS/public-schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [udførbare definer-funktioner](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) og [adgangskodebeskyttelse](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) er særskilt D08-triage. De private tabellers deny-all-politik åbnes ikke for at fjerne en informationsmeddelelse. Der aktiveres ingen mail/SMS, invitation, AI-provider, betalt billedbehandling eller produktionsrelease.
