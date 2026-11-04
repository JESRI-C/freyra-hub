# Fælles kommunal kandidat

4. november 2026. Kode under samling; kandidatens samlede tekniske og brugerrettede accept er åben.

Slutmålet er fortsat hele det kommunale forløb og alle kortlagte Jobs-/Geotag-områder med Freyras fagmoduler. Denne pakke samler eksisterende leverancer på én gren, så projektleder, feltmedarbejder og faglig gennemgang kan prøves på samme version.

## Kilder og bevaret funktionalitet

- Produkt-/felt-/rapportgrundlag: PR49, `20e58564e82011a692e8b46fae4802219b6f3a61`, med afprøvet runtime `12d348b1`.
- Leder-/observations-/statusgrundlag: PR47, `3c5c2f348bd52be605ac024c0e21eec0d36ea298`, med afleveret navigationsrettelse `b5cf82b76fede2dd266f347a6cfb394bfff6f474` og fjernbuild-workflow `4314bf9ca905bf376aa1cec07cc662ae7074644c`.
- Isoleret gren: `codex/combined-municipal-workflow`. De oprindelige checkouts og brugerens lokale ændringer ændres ikke.

Samlingen genbruger lederens fælles kort/liste/tavle og autoriserede statusprojektion, oprettelse af opgavekladde fra bevarede observationskilder, et fokuseret jobkort og de nyere feltfotos/jobkort, eksplicit dokumentationskobling, aflevering, gennemgang og rapport.

Afleverede jobs åbner afleveringen, næste handling følger senest registrerede status, og jobkort/tavle bruger samme statusfarve med særskilt markering af blokering. Retur til lederens arbejdsordrer kræver den eksisterende lederadgang og respekterer kladdelåsen. En statusopdatering flytter ikke automatisk brugeren til en anden fane.

`actions.id`, organisation, projekt, plan-/tildelings-/udførelsesversioner, originalreferencer og eksisterende URL-parametre bevares. Den nyere FieldOfflineWorkspace og Mine opgaver beholdes frem for at indføre det parallelle spors ældre udgave. Opgavens fotooptagelsesadgang, planbundne kravkort, køversion 1/2, 0/false, tabt svar/genforsøg og historiske rapporteksporter må ikke gå tabt.

De fire additive manager-/observationsmigrationer, som allerede findes i staging, indgår nu også i kandidatens kildegrundlag. Rapportmigration `20261104091051` og fotomigration `20261104064006` bevares. Ingen migration genanvendes som del af kildekopieringen.

Restoreprøven medtager den parallelle leverances ACL'er, normal authenticated-adgang til bevaret observationsgrundlag efter kildesletning og afvisning af ekstern læsning. Reel samtidighed for observationskladder kobles til den eksisterende database-CI. Dette er endnu ikke en prøve af hosted fuld gendannelse eller Storage-originalernes bytes.

Alle 68 krav er forenet pr. id. Begge spors kode-, migrations-, test- og bevishenvisninger bevares; deres tidligere PASS er historiske delprøver og gælder ikke automatisk denne kandidat.

## Kontrol i denne pakke

Seks tekstkonflikter er gennemgået: kravregister, feltvisning, Mine opgaver og tre testfiler. P10's kompakte projektramme og bevarelse af allerede besøgte redigeringsfelter beholdes. Planens kravkorttest venter på den faktiske fejlmeddelelse frem for at svække forventningerne.

Den lokale typecheck blev afbrudt uden resultat under dokumenteret hukommelsespres; selv en lille Git-allokering fejlede. Der startes ingen nye lokale builds/tests, mens maskinen er presset. Fuld typecheck, tests, build, migrationsafspilning, samtidighed og restore skal derfor køres på GitHub for det præcise kandidatcommit. Den afbrudte prøve er ikke et PASS og heller ikke bevis for en kodefejl.

Den eksisterende stagingartifact-workflow genbruges med ét ekstra præcist same-repo-grenpar: base `codex/report-source-classification`, head `codex/combined-municipal-workflow`. Offentlige stagingværdier og `contents: read` bevares; jobbet har ingen deploy- eller trafikrettighed. Den eksisterende pilot-/managerkørsel bevares.

Efter grøn kandidat-CI skal en separat stagingpreview afprøves med normale roller: problem/observation → opgavekladde → plan/tildeling → mobilregistrering og original → udførelse → dokumentation → aflevering → gennemgang → rapport og kildepakke. Browsertrin og eventuelle SDK-fixturetrin registreres særskilt. Genforsøg, kladder, adgangstab og eksisterende historik efterkontrolleres.

Fysisk telefon, uassisteret kommunal UX, faglige metoder/natureffekt, fuld paritet, sikkerhedsrestarbejde, opstart/support og drifts-/produktionsbeslutning forbliver åbne. Der flyttes ingen aktiv trafik som del af kildeintegrationen.
