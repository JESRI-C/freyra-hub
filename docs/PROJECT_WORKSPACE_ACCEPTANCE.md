# Projektfaner: dataforbindelser og acceptprøve

Afprøvet 26. oktober 2026. De 20 underfaner under Project Intelligence, Dokumentation & audit og Funding & impact bruger nu det valgte projekts registreringer. Alle kategorier og ruter er bevaret.

## Genbrug og datagrundlag

Fælles indlæsning bruger den eksisterende, autentificerede Supabase-klient og de eksisterende forespørgsler. Organisation og projekt kontrolleres før afhængige læsninger. Cache og editorer adskilles efter bruger, organisation og projekt. Fejl vises som ukendt datastatus; der indsættes ikke eksempeldata.

| Underfane | Faktisk datagrundlag / genbrug |
| --- | --- |
| Anbefalinger | `actions`, eksisterende ActionItem og bilagsdialog; oprettelse og vedvarende status |
| Risiko & lodsejer | `environmental_risks`, eksisterende risikotabel med vedvarende status, versionsgemte interessenter |
| Scenarier | Versionsgemte planforudsætninger, kilde og sammenligning; ingen opdigtede modelberegninger |
| Metode & datakvalitet | Indikatorer, kvalitetsvurderinger, registrerede problemer og eksisterende datakildepanel |
| Beslutningsnotater | Append-only notater med grundlag, alternativer, usikkerheder og kilde |
| AI-assistent | Tydeligt mærket regelbaseret gennemgang af sagens registreringer; ny ekstern AI-tilkobling afventer tilladelse |
| Metrics & indikatorer | `indicators`, eksisterende målehistorik og konfiguration; tom historik forbliver tom |
| CSRD/ESRS | Versionsgemte ESRS-datapunkter og dokumentation; ingen automatisk compliance-erklæring |
| CO₂-regnskab | Registrerede CO₂-poster med afgrænsning, metode og kilde samt `calculated_metrics`; forskellige afgrænsninger summeres ikke |
| Datakilder | `data_sources`, `sites`, eksisterende datakildepanel og oprettelsesguide |
| Audit trail | `audit_events`, eksisterende filtrering og CSV-eksport |
| Dokumenter & bilag | `documents`, `evidence_files` og fælles rapportbibliotek |
| Rapportering | Projektets dokumenter og den eksisterende rapport-/eksportmotor |
| Projekter | Faktiske, tilgængelige projekter i den valgte organisation |
| Projektprofil | Projektets stamdata, indikatorer, kort og rapportforløb |
| Portefølje | Organisationens tilgængelige projekter; forskellige effektenheder sammenlægges ikke |
| Finansiering & midler | Versionsgemte finansieringsregistreringer og `impact_units`; ingen salg eller udstedelse af credits |
| Verifikation | Faktisk registreret verifikationsstatus samt kvalitetsvurderinger og begrænsninger |
| Partnere & fonde | Versionsgemte projektpartnere, roller og aftalereferencer |
| Impact-rapporter | Samme projekt, dokumenter og rapportmotor som resten af arbejdsforløbet |

De tre kategorioversigter bruger samme datagrundlag. Public impact gemmer formidlingskladder uden offentliggørelse. Organisationsprofil og projektmedlemmer bruger eksisterende tabeller og medlemsfunktioner. De øvrige indstillingsfaner peger på faktiske projekter, ESRS-registreringer, alarmregler, loginfaktorer og dataforbindelser. Abonnement, pris og fakturaer vises som ukendte, fordi en faktureringskilde mangler.

## Database og adgang

Fem additive migrationer er afprøvet isoleret og lagt i testprojektet `xdvqdzdpyceojbdknofi`: rapportversioner, vandløbsversioner, private droneoriginaler/jobs, projektregistreringer og rettelsen til audit-ID. Migrationshistorikkens versionsnumre er læst tilbage og afstemt med de lokale filnavne. Produktionsprojektet er ikke ændret.

`project_workspace_entries` genbruger samme versionsprincip som rapporterne. Registreringer har projekt, organisation, type, versionsnummer og forfatter. RLS begrænser adgang; skrivning kræver en redigerende rolle. UPDATE/DELETE er ikke tilladt. En database-trigger afviser forældede versioner og flytning mellem sager og skriver audit i samme transaktion.

## Kontrolleret resultat

- 20 underfaner åbnet i en rigtig browser med den valgte testsags data.
- Alle 15 kategoriindgange og de yderligere syv indstillingsfaner åbnet: 42 kontrollerede ruter i alt, uden registrerede browserfejl eller uventede omdirigeringer.
- Notat oprettet gennem brugerfladen, læst efter genindlæsning og fraværende ved skift til den anden testsag.
- Handling startet og afsluttet; både genindlæst brugerflade og database bekræftede den gemte status.
- Risikostatus gemt gennem brugerfladen og bekræftet ved genindlæsning og databaseopslag.
- Læsebruger kunne læse notater, bilag og målehistorik. Redigerings- og slettekontroller var fraværende; direkte skriveforsøg blev afvist i databasen.
- Forkert organisationsreference og en forældet version blev afvist i testdatabasen.
- 61 isolerede PostgreSQL-/RLS-kontroller bestod med alle fem migrationer.
- [Ubuntu-kontrollen på a1e964e](https://github.com/JESRI-C/freyra-hub/actions/runs/40401858657/job/121849541686) bestod: 277 tests i 50 filer, typekontrol og fuld bygning. Den efterfølgende ændring til læsning af bilag blev særskilt prøvet i browseren og indgår i samme PR.

Browserprøven brugte den lokale app på `http://127.0.0.1:8788` med den rigtige Supabase-testdatabase. Den eksisterende offentlige testadresse er ikke opdateret af denne ændring. Testsagerne er mærket **TEKNISK FANETEST**; deres tal er testregistreringer og må ikke bruges som kundedata eller faglige resultater.

Rå testresultater og skærmbillede findes lokalt under `tmp/workspace-acceptance/`. Den indcheckede, credential-frie sammenfatning er `project-workspace-acceptance.json`. Loginoplysninger, sessioner og den lokale testkonfiguration er ikke indchecket.

## Grænser og resterende godkendelse

Ruteprøverne beviser adgang og de beskrevne arbejdsgange. De er ikke en fuld accept af alle dataleverandører, alle øvrige underfaner, geoprocessering eller kommunal faglig aflevering. Scenarier, finansiering og ESRS-datapunkter er registreringer med kildekrav, ikke automatisk dokumenterede effekter.

Den nye eksterne AI-tilkobling er ikke aktiveret. Automatisk godkendelseskontrol afviste tilkoblingen med den begrundelse, at den vurderede risiko for overførsel af login- og projektoplysninger til Lovables AI-forbindelse uden særskilt tilladelse. Den forberedte serverkode kontrollerer login og projektadgang og samler et afgrænset datagrundlag; browserkoblingen blev ikke tilføjet. Ingen ny AI-forespørgsel, beskedafsendelse, publicering, produktionsmigration eller produktionsudrulning er udført.
