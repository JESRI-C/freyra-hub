# Registreringstype i den godkendte arbejdsopgaves rapport

4. november 2026 · REP-05/S05/S11 · under teknisk efterprøvning.

## Fund og løsning

Hosted prøve `2ebb507c` på PR48 gemte synthetic i den frosne aflevering,
men rapport `c0533856` havde ingen tilsvarende mærkning. SQL-generatoren
kopierede dato og metode, men udelod udførelsens dataBasis. Rapportens
godkendte grundlag kunne derfor læses uden den nødvendige skelnen mellem
faktisk arbejde og prøvedata.

Migration `20261104084455_work_order_report_execution_data_basis.sql`
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
triggeren kontrolleres. SQL-prøven, fuld CI og hosted visning er endnu ikke
kørt med denne migration. Der er endnu ingen ændring i stagingdatabasen.

Fysisk telefon, uassisteret kommunal brugeraccept, metodeprofiler og
faglig effektgodkendelse forbliver særskilte, åbne krav. Mærkningen gælder
udførelsesregistreringens type; den klassificerer ikke automatisk andre
målinger, observationer eller AI-resultater i sagen. Den samlede kandidat
med den parallelle gren og drifts-/produktionsaccept er fortsat åben.
