# Registreringstype i den godkendte arbejdsopgaves rapport

4. november 2026 · REP-05/S05/S11 · teknisk efterprøvet kandidat, samlet accept åben.

## Fund og løsning

Hosted prøve `2ebb507c` på PR48 gemte synthetic i den frosne aflevering,
men rapport `c0533856` havde ingen tilsvarende mærkning. SQL-generatoren
kopierede dato og metode, men udelod udførelsens dataBasis. Rapportens
godkendte grundlag kunne derfor læses uden den nødvendige skelnen mellem
faktisk arbejde og prøvedata.

Migration `20261104091051_work_order_report_execution_data_basis.sql`
udvider den eksisterende private report-trigger. Nye rapporter får
executionDataBasis og executionRevisionId fra den præcise, godkendte
aflevering. Der læses ikke fra den aktuelle udførelse, og et caller-input kan
ikke bestemme mærkningen. Eksisterende adgang, review-/scopekontrol,
idempotens, originalreferencer og indikatorens frosne mål bevares.
Ingen gamle rapporter, afleveringer, originaler eller historik opdateres.

ReportContentSchema bevarer de to nye oplysninger som et par. Rapporten
kan ikke få en klassifikation uden den tilhørende udførelsesversion.
Ugyldige værdier afvises. Ældre rapporter uden begge felter kan stadig
indlæses; brugerfladen siger, at registreringstypen ikke er gemt i den
rapportversion. Der antages ikke faktisk arbejde ud fra en godkendelse.

| Frosset type | Visning og nye eksporter |
| --- | --- |
| real | Udførelsesregistrering: Faktisk arbejde. Mærkningen dokumenterer ikke i sig selv en målt natureffekt. |
| synthetic | Syntetiske prøvedata. Rapporten dokumenterer ikke en faktisk naturindsats eller natureffekt. |
| demo | Demonstrationsdata med samme afgrænsning. |
| Mangler i historisk rapport | Ukendt i brugerfladen; kontrollér den godkendte aflevering. Den historiske eksport genskabes uændret. |

Samme tekstfunktion bruges i brugerflade og nye PDF-/Word-eksporter.
CSV og GeoJSON medtager registreringstype og udførelses-id. Kildepakken
med disse oplysninger har schema freyra.work-order-report-package/v2 og
fastholder klassifikationen i inputversioner.json. Eksisterende pakker uden
mærkning beholder v1 og deres bytes. Nye klassificerede PDF'er bruger UTC
til den frosne oprettelsesdato og kan genskabes i forskellige tidszoner.
Der bygges ikke en parallel rapportmotor.

## Bevis og afgrænsning

36 lokale prøver i fire filer består: validering, de tre typer, parrede
metadata, ukendt historisk type, brugerflade og alle eksportformater.
Fem SHA-256-kontrolsummer blev fastlagt på legacy-generatoren før
eksportrettelsen og består fortsat for PDF, DOCX, CSV, GeoJSON og ZIP.
En ny klassificeret PDF har identiske bytes i Honolulu og København.
En syntetisk test-PDF er tekstudtrukket og alle dens sider gengivet med
Poppler og visuelt kontrolleret. Strict typecheck består; lint har ingen
fejl og den eksisterende Fast Refresh-advarsel for ReportWorkspace.

Den eksisterende SQL-reviewprøve er udvidet: En nyere real-udførelse
gemmes gennem den normale RPC, før rapporten dannes fra den tidligere
godkendte synthetic-aflevering. Rapporten skal stadig pinne den gamle
udførelse og synthetic. Invoker-sikkerhed og manglende direkte adgang til
triggeren kontrolleres. [CI 41804257496](https://github.com/JESRI-C/freyra-hub/actions/runs/41804257496)
består på kilde `12d348b1`: 3.623 applikationsprøver i 270 filer og 1.915
databasekontroller i 28 filer, inklusive faktisk samtidighed, frisk
migrationsafspilning og database-restore. Ingen kendte runtime-sårbarheder
blev fundet. Dette erstatter ikke den samlede sikkerhedsgodkendelse.

Migrationen er anvendt i staging. Den blev lokalt oprettet som 84455 med CLI
2.116.0 og er omdøbt til den faktisk registrerede version 91051, uden ændret
SQL. Normaliseret SQL-MD5 er `adbc58e3d1285347e6d6b626379d97fc`.
Readback bekræfter invoker-sikkerhed og ingen direkte authenticated-adgang
til triggeren. Sikkerhedsanmærkningerne er uændrede, bortset fra måletid.
De eksisterende PostGIS-/Auth-forhold er fortsat åbne; konkrete
[afhjælpningslinks og antal](report-source-classification-staging-receipt-2026-11-04.json)
fremgår af kvitteringen.

Den separate Worker `6b7b1177-dfa3-496a-b94c-0b5347a9381b` viser kilde
`12d348b1`. [Hosted bc2887fb](report-source-classification-staging-receipt-2026-11-04.json)
består fra Mine opgaver gennem offlinefoto/jobkort, udførelse, eksplicitte
koblinger, aflevering, teknisk review og rapport. Browser- og SDK-trin er
angivet særskilt. Den nye rapport viser synthetic og præcis udførelsesversion
i både UI ved 390/1280 px og den hentede PDF. Begge PDF-sider er tekstudtrukket,
gengivet med Poppler og visuelt kontrolleret. CSV/GeoJSON/Word/ZIP v2 har
unit-bevis; deres browserdownload er ikke gentaget i denne prøve.

Den tidligere rapport `c0533856` blev åbnet gennem den samme normale
klargør-/åbn-handling. Den fik ingen ny version eller omskrevet indhold.
Række- og indholdshash er identiske før/efter; dens faktisk hentede PDF har
fortsat SHA-256 `23f2953c0aa80c8681dfdd58bf1a41fcdb78c32c256237ee5471f98c1b0df5f5`.
Ældre rapporter viser oplysning om manglende type i UI, mens historisk
eksport genskabes uændret. Egne fire testsessioner, midlertidigt feltmedlem
og reviewgrant er efterkontrolleret som lukket/fjernet/inaktiv version 2.

Prøv [den separate version](https://6b7b1177-gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/login)
med eksisterende testlogin. Aktiv staging står fortsat på `4be325d`/Worker
`94906bdf` med 100 % trafik. Ingen produktion eller merge. Ældre appversioner
kan ignorere de to additive felter; rapportrettelsen er kun synlig med den
nye læser. Den skal derfor bevares i den fælles kandidat før trafik flyttes.

Fysisk telefon, uassisteret kommunal brugeraccept, metodeprofiler og
faglig effektgodkendelse forbliver særskilte, åbne krav. Mærkningen gælder
udførelsesregistreringens type; den klassificerer ikke automatisk andre
målinger, observationer eller AI-resultater i sagen. Den samlede kandidat
med den parallelle gren og drifts-/produktionsaccept er fortsat åben.
