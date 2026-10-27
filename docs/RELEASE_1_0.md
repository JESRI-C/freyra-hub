# Freyra release 1.0

**27.10.2026: NO-GO for kommunal driftsibrugtagning. Produktion: NO-GO.** Testappen og nedenstående tekniske prøver fungerer. Verificerede loginmails, samlet hostet gendannelse, aktiv løbende overvågning og navngiven faglig accept mangler. En teknisk prøve er ikke en kommunal godkendelse.

Ingen push/merge til main, produktionsmigration eller produktionsudgivelse er udført. Fallback 625781906a4f49d120b6b3581261279dd889e6de er urørt. Arbejdet ligger på codex/release-1.0, oprettet direkte derfra. [Draft-PR 19](https://github.com/JESRI-C/freyra-hub/pull/19) går ind i codex/haderslev-demo-2710 og merges ikke af agenten.

## Version og bevisgrænse

[Testapp](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev): Worker 0896f4ff-d130-495c-bafc-efef2fa3b8cd, appkilde a99c322542263b0e12bc37f9bfc6de64f8b3addb. Senere commits ændrer prøver, driftsscripts og dokumentation; produktets appkode er uændret. [Deploymentkvittering](release-1.0/deployment.json).

Kun stagingdatabasen xdvqdzdpyceojbdknofi er ændret. Produktion ikrmcetjutqcjtwfhzfv er ikke ændret. Produktions-SMTP og migrationsledger er **ikke verificeret** med den tilgængelige konto.

[Grøn CI](https://github.com/JESRI-C/freyra-hub/actions/runs/40466400151), commit 77aed71dbd51471bd33e523ae01d2f7cc7f0c0b7: **2.892 tests i 198 filer, 814 PostgreSQL-kontroller i 12 filer og 29 samtidighedsscenarier**; typecheck, lint og build består. Lint: 0 fejl, 24 eksisterende advarsler. [Kvittering](release-1.0/ci-summary.json).

Browserprøverne bruger originale fotobytes og offentlige kilder i tydeligt mærkede tekniske testsager. De erstatter hverken kundens sag eller faglig accept. [Gældende Drive-reference](https://drive.google.com/file/d/1BynA_7pBq91XG96qHuCJ1z8sV_1Wv070/view): rapporten fra 26.10, ændret 26.10.2026 kl. 20:14 UTC, 17.766.312 bytes. Ingen antalsramme for træer er opfundet.

## Kontrol a–j

| Punkt                     | Status           | Bevis og grænse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a Demodata og UI          | OK               | Offlineeksempler fjernet fra kundens datastier; mangler giver tomme tilstande. 20 underfaner, 16 kategorier og 7 indstillingssider består inklusive gemning/projektskift. 67 direkte links består rendering og kontrol af synlig demotekst. [Faner](release-1.0/workspace-browser.json), [links](release-1.0/route-catalogue-browser.json), b77518c. Eksterne tjenester uden nøgler er ikke dermed driftsgodkendt.                                                                                                                       |
| b PR 18 og RLS            | OK               | Sikkerhedsrettelse før integration. 79 isolerede PostgreSQL/RLS-assertions; seks migrationsfiler genafspillet to gange. 20 kontroller med en virkelig ny viewer mod hostet API/storage samt ren browserlogin består. [Viewer](release-1.0/viewer-live.json), [browser](release-1.0/reader-browser.json), dae6afa, 6547c57.                                                                                                                                                                                                               |
| c Login og SMTP           | FEJL             | Testlæser oprettet med det eksisterende provisionsscript; ren login består. Kommunens adresser mangler. Egen SMTP er slået fra i staging. [SMTP](screens/release-1.0/smtp-staging.png), [login](screens/release-1.0/08-laeser-ren-login.png). Maillevering/nulstilling og produktion er **ikke verificeret**.                                                                                                                                                                                                                            |
| d Samlet browserflow      | OK               | To end-to-end-prøver består på den hostede release: original/EXIF, offentlige data, manuel fotogennemgang, baseline, beplantningsskitse, rapport/PDF/ZIP samt opret/genåbn sag. Fire rapporttyper, versionsgemning, afvist forhastet godkendelse og PDF/DOCX/CSV/GeoJSON består. [Skærmbilleder](screens/release-1.0/), [rapporter](release-1.0/report-workflows-browser.json). Faglig accept er **ikke verificeret**.                                                                                                                   |
| e Build og tests          | OK               | Ovenstående grønne CI, 79 separate RLS-kontroller, 20 hostede viewerkontroller og to komplette browserprøver. [Bevis](release-1.0/ci-summary.json). Tidligere lokal fuld kørsel ramte ressourcegrænsen og tælles ikke som bestået.                                                                                                                                                                                                                                                                                                       |
| f Backup/gendannelse      | IKKE VERIFICERET | Fuld PostgreSQL-dump med Auth, metadata, policies og rapportversion er gendannet til separat database i disponibelt Supabase-miljø. Projekt, rapportversioner og releasepolicies er sammenlignet. Privat stagingoriginal på 14.158.283 bytes er sikkerhedskopieret/gendannet lokalt med identisk SHA-256 og EXIF-GPS. [Original](release-1.0/original-recovery.json), [CI-gendannelse](https://github.com/JESRI-C/freyra-hub/actions/runs/40466400151). Komplet hostet gendannelse og automatisk ekstern backup er **ikke verificeret**. |
| g Fejlalarm               | IKKE VERIFICERET | Virkelig HTTP-server gav kontrolleret 503. Alarmen blev automatisk leveret og tildelt JESRI-C som [issue 20](https://github.com/JESRI-C/freyra-hub/issues/20); genkørsel genbruger alarmen. [Kvittering](release-1.0/alarm-delivery.json). Femminutterskontrol er implementeret; schedule kræver default-grenen og er ikke aktiveret via main. Kontinuerlig drift og kvittering via mail/telefon er **ikke verificeret**.                                                                                                                |
| h Roller/tabeller/buckets | OK               | Stagingkatalog: 89 tabeller, 331 policies og fire private buckets gennemgået. Kun PostGIS' extensionejede spatial_ref_sys mangler RLS. Projektgrænser, scoped helpers, append-only spor og storagepolitikker gennemgået med database-/viewertests. [Katalog](release-1.0/roles-catalogue.json). Advisor-forhold nedenfor; produktionsparitet er **ikke verificeret**.                                                                                                                                                                    |
| i Rollbackplan            | OK               | Urørt remotegren og kildecommit kontrolleret; præcise trin nedenfor bevarer data og stram RLS. Faktisk tilbageførsel med den nye database er **ikke verificeret** og kræves i generalprøven.                                                                                                                                                                                                                                                                                                                                             |
| j Driftsansvar            | IKKE VERIFICERET | Jesper Riel valgt som første tekniske eskalation; alarmen er tildelt hans verificerede GitHub-konto. Fagligt ansvar placeres hos Haderslevs vandløbsfagperson/Natur og Vand. Navngiven godkender, stedfortræder og accepteret vagt-/reaktionsaftale mangler.                                                                                                                                                                                                                                                                             |

OK gælder den beskrevne stagingprøve eller dokumentation, ikke automatisk produktionsgodkendelse. Alt mærket **ikke verificeret** er fortsat åbent.

## Rettelser med commits

| Commit                    | Rettelse                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dae6afa                   | Læsergrænser og gentagelige migrationsfiler før PR 18.                                                                                                   |
| 6547c57                   | PR 18 integreret oven på fallback; sikrede migrationsfiler beholdt.                                                                                      |
| b77518c                   | Offlineeksempler fjernet; eksisterende projektdata genbrugt; kommunalt flow uafhængigt af demoflag; Freyra-branding og rollebeskyttet rapportredigering. |
| a99c322                   | Formateret RLS-regression; appversionen er bygget og hostet i staging.                                                                                   |
| f901af1, 50a036e          | Virkelig viewer/API/storage-prøve og regression for forbudt offlinefallback.                                                                             |
| 67f10cd                   | Sammenligning af 44 motorfiler/funktioner med fallback.                                                                                                  |
| 1c678fe, 8e35bea, 77aed71 | Leveret/deduplikeret alarm, ren læserlogin og fuld isoleret databasegendannelse med systemfunktioner.                                                    |

44 beskyttede motorfiler/funktioner er identiske med fallback: baseline, plante-, natur-, satellit-, monitorerings- og rapportmotor samt to beregningsfunktioner for byggeri. Kun linjeskift normaliseres. [Hashbevis](release-1.0/engine-preservation.json). Præsentationen viser manglende grundlag frem for opfundne resultater.

Historiske ubrugte typesamlinger kan stadig have eksempelnavne i kildehistorikken; de bruges ikke som kundedata. Den gamle seedorganisation med UUID 00000000-0000-0000-0000-000000000001 findes i staging, men havde nul medlemskaber og vises ikke i afprøvet kundeadgang. Den må ikke importeres som produktionskundedata. Ingen ukontrolleret kaskadesletning af historiske rækker er udført.

## Browserbeviser

1. [Før upload](screens/release-1.0/01-billeder-foer-upload.png).
2. [Original uploadet](screens/release-1.0/02-original-uploadet.png). SHA-256: 7a72d47c9151900ce5cfccecbef0c0a7d9177e337d308d4b1c969a0a7035b0d3.
3. [Offentlige data](screens/release-1.0/03-offentlige-data.png).
4. [Fotogennemgang](screens/release-1.0/04-fotogennemgang.png). Testen afviser bevidst faglig godkendelse; den udgiver sig ikke for en fagperson.
5. [Baseline](screens/release-1.0/05-baseline.png).
6. [Beplantning](screens/release-1.0/06-beplantning.png), mærket som skitse der kræver faglig validering.
7. [Rapport/eksport](screens/release-1.0/07-rapport-eksporteret.png). ZIP-manifestets fillængder og checksums samt PDF-signatur er kontrolleret.
8. [Ren læserlogin](screens/release-1.0/08-laeser-ren-login.png) og [rapportadgang](screens/release-1.0/09-laeser-rapportadgang.png). Ingen auth-session er indsat i denne loginprøve.

Automatisk billedvurdering er særskilt spærret til kommunal brug; fotogennemgang er manuel. Tekstassistentens godkendte projektdataflow når serveren, men LOVABLE_API_KEY mangler: modelsvaret er **ikke verificeret**. Ingen loginoplysninger eller servernøgler er sendt til Lovable.

## SMTP og brugere

Simply er kandidat ved lav startvolumen, hvis reel Freyra-postkasse og levering verificeres. [Simplys vejledning](https://www.simply.com/dk/support/faq/mail/115-opsaetning-af-mail/) angiver smtp.simply.com, port 587, STARTTLS og hele mailadressen som login. [websmtp.simply.com](https://www.simply.com/dk/support/faq/mail/23-udgaende-mailserver-til-scripts/) er til Simplys egne webservere og vælges ikke til Supabase.

DNS 27.10 viste Google MX for gofreyra.com og \_dmarc som CNAME til dmarc.simply.com med p=reject. Det beviser ikke en fungerende Simply-postkasse. Ingen SPF-record blev observeret i TXT-svaret; DKIM-selector og SMTP-login er **ikke verificeret**. Eksisterende mail/MX flyttes ikke som en genvej.

Før c bliver OK: vælg reel afsender; indtast mailbox-hemmeligheden direkte i Supabases beskyttede SMTP-felter; kontroller SPF/DKIM/DMARC; afprøv invitation/login og nulstilling med aftalt modtager, leveringslog og ren session. Ingen hemmeligheder i chat, repo, browserklient eller Lovable.

Kun .invalid-testbrugere er oprettet; ingen invitationer er sendt. Kommunens adresser skal komme fra Jesper. Provisionsscriptet er låst til staging. En gennemgået produktionsguard og produktionstest kræves før produktionsinvitationer; stagingbeskyttelsen må ikke omgås ved blot at skifte miljøvariabler.

## Adgang og kendte sikkerhedsforhold

Læseren må læse sin tildelte sag og eksportere gemte versioner. Læseren må ikke skabe rapportdokumenter/-versioner, vandløbsversioner, droneflyvninger/-jobs eller originaler. Editor/manager følger private.can_write_project; feltbidrag følger private.can_contribute_project. Organisationsmedlemskab alene giver ikke skriveret. Restrictive policies begrænser ældre permissive policies. Originaler kan ikke overskrives/slettes gennem kommunale roller.

Buckets evidence-files, monitoring-uploads, project-media og project-originals er private. Ældre droneoriginaler beholder deres kanoniske reference i monitoring-uploads; denne sti indgår i gendannelsesprøven. De to originale flows omdøbes ikke uden kontrolleret datamigration.

Eksisterende advisor-forhold: PostGIS i public, extensionejede st_estimatedextent med brede EXECUTE-grants, interne private RLS-tabeller uden klientpolicies og deaktiveret beskyttelse mod lækkede adgangskoder. Privilegieeffekt skal vurderes i produktion før GO. Motor/extension er ikke flyttet blindt for at skjule advarsler. Produktionsparitet og ekstern sikkerhedsrevision er **ikke verificeret**.

## Backup og driftsansvar

CI-gendannelsen bruger separat tom database, lokal supabase_admin og fuld pg_dump/pg_restore. Dump med Auth-data offentliggøres ikke; kun teknisk log, checksum og kvittering uploades. Det er mekanismeprøve, ikke kundens backup.

Før produktion kræves automatisk krypteret backup til uafhængig destination: database/Auth/migrationshistorik, Storage-metadata og originalbytes. Databasebackup indeholder ikke objektbytes eller eksterne Cloudflare-/SMTP-hemmeligheder; sikker genskabelse af konfiguration/nøgler planlægges separat. Foreslået til godkendelse: daglig backup, 30 dages retention, RPO højst 24 timer, RTO højst 4 timer. Det er mål, **ikke målte eller lovede serviceniveauer**. Komplet hostet gendannelse skal afprøves med login, roller, rapportversioner og filchecksums, efter større skemaændringer og mindst kvartalsvis. Ingen betalt plan er aktiveret.

**Første tekniske eskalation: Jesper Riel / JESRI-C.** Valget støttes af eksisterende MailOps-ejerbeskrivelse og verificeret GitHub-konto; alarmen er faktisk tildelt kontoen. Det etablerer ikke accepteret døgnvagt eller stedfortræder.

**Faglig godkendelse: Haderslevs ansvarlige vandløbsfagperson i Natur og Vand**, eventuelt sammen med navngiven Freyra-fagperson. [Kommunens egen side](https://www.haderslev.dk/service/natur-og-klima/vandloeb/) angiver naturogvand@haderslev.dk som faglig kontakt. Det er et kontaktpunkt, ikke en indgået godkendelsesaftale. Ingen mail er sendt, og adressen er ikke oprettet som kundelogin. Navnet skal bekræftes ved overdragelsen.

| Overvågning                                | Ansvar og handling                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Offentlig login/release-metadata           | Femminuttersprobe; Jesper får GitHub-issue og vurderer hændelse/kundepåvirkning.                                                    |
| Auth, API, roller, upload/download         | Navngiven teknisk drift og separat autentificeret canary; stop skriverier ved integritetsrisiko. Offentlig probe dækker ikke dette. |
| SMTP/afvisninger                           | Teknisk drift følger leveringslog/domæneautentificering; undgår gentagne invitationer.                                              |
| Backup/checksums/retention/plads           | Teknisk drift dagligt; isoleret gendannelse kvartalsvis; fejl eskaleres straks.                                                     |
| Kildealder/baseline/artsvalg/rapport       | Navngiven fagperson; ukendt/kladde beholdes indtil kontrol.                                                                         |
| Fejlrate/forbrug/rolleændringer/nøgleudløb | Teknisk drift; logs/issues uden tokens eller persondata.                                                                            |

release-operations.yml er afprøvet med faktisk alarmlevering/deduplikering. GitHub schedules kræver default-grenen og er ikke aktiveret via main. De kan være forsinkede og er ikke døgnvagtsgaranti. Produktion kræver accepteret reaktionstid, stedfortræder og aktiv kanal; personlig læsning via mail/telefon er **ikke verificeret**.

## Go-live-plan til Jespers godkendelse

1. Luk c, f, g og j: adresser, verificeret SMTP, navngiven faglig godkender, aktiv overvågning/vagt og komplet hostet gendannelse. Foretag ny GO/NO-GO.
2. Fastlås konkret release-SHA og beviserne. Bevar 6257819/fallback-grenen urørt. Draft-PR'en merges ikke som del af prøven.
3. Læs produktionens faktiske migrationsledger/bindings og afstem version/checksum. PR 18-filer: 20261026150933_bykaer_reports, 20261026150952_watercourse_versions, 20261026151127_drone_originals_and_jobs, 20261026203728_project_workspace_entries, 20261026204749_workspace_audit_uuid_fix. Sikkerhedsrettelse: 20261027055753_release_1_0_reader_boundaries. Antal manglende produktionsmigrationer er **ikke verificeret**. Dry-run/genafspilning sker på kopi af den faktiske database.
4. Tag verificeret komplet backup, mål gendannelse og gennemfør rollbackgeneralprøve. Registrér tidligere produktions-Worker/bindings uden hemmeligheder i repo.
5. **Jesper skriver ja til konkret SHA, migrationsliste, målprojekt, deploymål, brugeradresser og rollback.** Ingen push/merge til main eller db push mod ikrmcetjutqcjtwfhzfv før dette ja. Main-merge kan udløse produktionsmigrationer.
6. Efter godkendelse: afstemte idempotente migrationer og stram RLS før kommunale brugere; deploy tilsvarende godkendt produktionsbuild med korrekte mål/bevarede serverhemmeligheder. Kontroller bundle/bindings. Ingen demoflag eller seed-script.
7. Klargør gennemgået produktionsguard til provisionsscriptet. Opret kun godkendte adresser som viewers til Haderslev/Bykær Bæk. Test ren login, projektafgrænsning, læsning/eksport, afviste skriverier og mails.
8. Afprøv flowet på den rigtige sag og gennemgå kilder/fotos med navngiven fagperson. Baseline, beplantning og konkret rapportversion godkendes særskilt. Aktivér overvågning og dokumentér overdragelse. Denne vurdering giver ikke GO.

## Rollback til 6257819

Remote fallback er verificeret som 625781906a4f49d120b6b3581261279dd889e6de. Historisk Worker 3d08217c-faf9-457f-b060-b4fb2e6a30c8 findes uden commit-tag og må **ikke** kaldes bevist 6257819-build. Seneste version før releasen, f8a754ca-cab7-433d-a45a-f8aa161b4989, var 49e9364 og er heller ikke 6257819.

1.  Stop kundens nye skriverier; registrér Worker/ledger/tidspunkt og tag komplet backup. Slet ingen rapportversioner, audits eller originaler.
2.  Eksportér uden at flytte en gren:

        git archive --format=zip --output=tmp/freyra-6257819.zip 625781906a4f49d120b6b3581261279dd889e6de

    Udpak til ny isoleret mappe, kontrollér indhold mod committen og brug dens package-lock.json, npm ci og særskilt godkendte miljøindstillinger.

3.  Byg med fallbackens egne buildkrav; typecheck/test og kontroller bindings/bundle. Kopiér ikke releasekode ind i fallback. Hvis den kræver gamle demoflag/viser eksempler, forbliver kommunale brugere spærret: fallback er da kun teknisk fejlafhjælpning.
4.  Deploy først til eksplicit staging-Worker og prøv ren login, projektgrænser, rapport og originaldownload mod databasekopi med nye migrationer. Gem bestået Worker-version med commit-tag 6257819. Build alene beviser ikke datakompatibilitet.
5.  Efter særskilt godkendelse: deploy afprøvet fallback til verificeret produktionsmål, eller brug Wrangler rollback med korrekt mærket/verificeret versions-ID, eksplicit Worker-navn og miljø. Produktionens faktiske navn/rollback-ID er **ikke verificeret** her; testappens navn bruges aldrig som gæt.
6.  Behold additive tabeller og stram RLS. Ingen reverse-migration, db reset, historiksletning eller genåbning af viewerskrivninger. Hvis gammel frontend ikke fungerer sikkert, behold vedligeholdelsestilstand og ret fremad.
7.  Genkør browserprøve/checksums og dokumentér ejer/genåbning. Ved dataskade gendannes til isoleret nyt mål før kontrolleret skift; overskriv ikke eneste kopi.

Ingen faktisk rollback er udført. Generalprøve, produktionsbindinger og browseradfærd efter tilbageførsel er **ikke verificeret**.

## Åbent for Jesper

- Kommunens adresser og navngiven faglig godkender. Fællespostkassen bliver ikke gættet personlig loginadresse.
- Reel Freyra-afsender og sikker SMTP-opsætning; Simply-postkasse/levering mangler verificering. Ingen hemmeligheder i chatten.
- Godkend ansvarskæde: Jesper som første eskalation, navngiven udførende/stedfortræder og realistisk reaktionstid.
- Sikker ekstern backupdestination/kapacitet og adgang til komplet hostet gendannelse. Komponentprøver lukker ikke f alene.
- Eventuel AI-nøgle direkte i testappens serverhemmeligheder til tekstassistentens modelsvar.
- Udtrykkeligt ja til senere afstemt produktionsplan. Draft-PR/stagingprøve giver ingen tilladelse til main-merge eller produktionsmigration.
