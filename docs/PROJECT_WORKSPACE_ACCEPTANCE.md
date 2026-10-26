# Projektfaner: dataforbindelser og acceptprøve

Afprøvet på den hostede testapp 26. oktober 2026. De 20 underfaner bruger det valgte projekts registreringer. Den guidede kommunale arbejdsgang og alle eksisterende kategorier er bevaret gennem genbrug af den tidligere redesigngren.

- Testapp: [Log ind](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/login).
- Udgivet programkode: `49e9364ce896cd61515c16102ee3b0ad8259a23f`.
- Cloudflare-testversion: `f8a754ca-cab7-433d-a45a-f8aa161b4989`.
- Buildmetadata på testadressen er læst tilbage og matcher programkoden og staging-miljøet.
- De tre CI-kontroller består: [app og database](https://github.com/JESRI-C/freyra-hub/actions/runs/40410415967), [evidensforløb](https://github.com/JESRI-C/freyra-hub/actions/runs/40410416025).

## Genbrug og datagrundlag

Fælles indlæsning bruger den eksisterende, autentificerede Supabase-klient og de eksisterende forespørgsler. Organisation og projekt kontrolleres før afhængige læsninger. Cache og editorer adskilles efter bruger, organisation og projekt. Fejl vises som ukendt datastatus; der indsættes ikke eksempeldata.

| Underfane             | Faktisk datagrundlag / genbrug                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Anbefalinger          | `actions`, eksisterende ActionItem og bilagsdialog; oprettelse og vedvarende status                                         |
| Risiko & lodsejer     | `environmental_risks`, eksisterende risikotabel med vedvarende status, versionsgemte interessenter                          |
| Scenarier             | Versionsgemte planforudsætninger, kilde og sammenligning; ingen opdigtede modelberegninger                                  |
| Metode & datakvalitet | Indikatorer, kvalitetsvurderinger, registrerede problemer og eksisterende datakildepanel                                    |
| Beslutningsnotater    | Append-only notater med grundlag, alternativer, usikkerheder og kilde                                                       |
| AI-assistent          | Autentificeret serverforbindelse til Lovable AI med et afgrænset projektgrundlag; tydelig besked om manglende servernøgle   |
| Metrics & indikatorer | `indicators`, eksisterende målehistorik og konfiguration; tom historik forbliver tom                                        |
| CSRD/ESRS             | Versionsgemte ESRS-datapunkter og dokumentation; ingen automatisk compliance-erklæring                                      |
| CO₂-regnskab          | Registrerede CO₂-poster med afgrænsning, metode og kilde samt `calculated_metrics`; forskellige afgrænsninger summeres ikke |
| Datakilder            | `data_sources`, `sites`, eksisterende datakildepanel og oprettelsesguide                                                    |
| Audit trail           | `audit_events`, eksisterende filtrering og CSV-eksport                                                                      |
| Dokumenter & bilag    | `documents`, `evidence_files` og fælles rapportbibliotek                                                                    |
| Rapportering          | Projektets dokumenter og den eksisterende rapport-/eksportmotor                                                             |
| Projekter             | Faktiske, tilgængelige projekter i den valgte organisation                                                                  |
| Projektprofil         | Projektets stamdata, indikatorer, kort og rapportforløb                                                                     |
| Portefølje            | Organisationens tilgængelige projekter; forskellige effektenheder sammenlægges ikke                                         |
| Finansiering & midler | Versionsgemte finansieringsregistreringer og `impact_units`; ingen salg eller udstedelse af credits                         |
| Verifikation          | Faktisk registreret verifikationsstatus samt kvalitetsvurderinger og begrænsninger                                          |
| Partnere & fonde      | Versionsgemte projektpartnere, roller og aftalereferencer                                                                   |
| Impact-rapporter      | Samme projekt, dokumenter og rapportmotor som resten af arbejdsforløbet                                                     |

De tre kategorioversigter bruger samme datagrundlag. Public impact gemmer formidlingskladder uden offentliggørelse. Organisationsprofil og projektmedlemmer bruger eksisterende tabeller og medlemsfunktioner. De øvrige indstillingsfaner peger på faktiske projekter, ESRS-registreringer, alarmregler, loginfaktorer og dataforbindelser. Abonnement, pris og fakturaer vises som ukendte, fordi en faktureringskilde mangler.

## Database og adgang

Fem additive migrationer er afprøvet isoleret og lagt i testprojektet `xdvqdzdpyceojbdknofi`: rapportversioner, vandløbsversioner, private droneoriginaler/jobs, projektregistreringer og rettelsen til audit-ID. Migrationshistorikkens versionsnumre er læst tilbage og afstemt med de lokale filnavne. Produktionsprojektet er ikke ændret.

`project_workspace_entries` genbruger samme versionsprincip som rapporterne. Registreringer har projekt, organisation, type, versionsnummer og forfatter. RLS begrænser adgang; skrivning kræver en redigerende rolle. UPDATE/DELETE er ikke tilladt. En database-trigger afviser forældede versioner og flytning mellem sager og skriver audit i samme transaktion.

## Kontrolleret resultat på den hostede app

- Alle 20 underfaner, 16 kategoriindgange og syv ekstra indstillingsfaner: **43 ruter** uden registrerede browserfejl eller uventede omdirigeringer.
- Notat oprettet i brugerfladen, genindlæst og fraværende ved skift til en anden testsag. Handling og risiko gemt og bekræftet i både browser og testdatabase.
- Læsebruger kunne læse notater, bilag og målehistorik uden skrivekontroller. Direkte skriveforsøg, forkert organisation og forældede versioner blev afvist.
- Alle seks guidede sagstrin åbnet med den aktuelle testsag. Den eksisterende browserprøve af ny sag, nulstilling, gemning og genåbning består på den hostede app.
- Alle fire rapporttyper åbnet. En tydeligt mærket teknisk kladde blev gemt og genåbnet. Godkendelse af den ufuldstændige rapport var spærret.
- Den gemte kladde blev eksporteret som PDF, DOCX, CSV og GeoJSON; filsignaturer/JSON-struktur og ikke-tomme filer blev kontrolleret.
- AI-knappen nåede den autentificerede Freyra-server og viste korrekt, at Lovables servernøgle mangler. Ingen ny AI-providerforespørgsel er udført.
- **2.896 tests i 198 filer**, typekontrol, lint uden fejl og staging-bygning består. Desuden består de uafhængige CI-app-, evidens- og databasekontroller, inklusive migrationer fra tom lokal database samt adgangs- og samtidighedskontroller.

Testsagerne hedder **TEKNISK FANETEST** eller **TEKNISK UI**. Deres registreringer er tekniske testdata, aldrig kundedata eller faglige resultater. Skærmbilledet af Metrics er visuelt kontrolleret.

Credential-frie resultater findes i [project-workspace-acceptance.json](project-workspace-acceptance.json). De reproducerbare browserprøver er `scripts/test-project-workspace-staging.mjs`, `scripts/test-hosted-project-workflows.mjs` og den eksisterende oprettelsesprøve i `e2e/haderslev-delivery.spec.ts`. Rå resultater, eksportfiler og skærmbillede ligger lokalt i `tmp/workspace-acceptance/`. Loginoplysninger og lokal miljøkonfiguration er ikke indchecket.

## AI, grænser og resterende arbejde

Brugeren har udtrykkeligt godkendt Lovable-tilkoblingen med projektdata og uden loginoplysninger. Den tidligere automatiske afvisning er afløst af denne tilladelse. Serveren kontrollerer bruger og projektadgang og udvælger kun navn/beskrivelse, indikatorer, handlinger, risici, datakilder og spørgsmålet. Login-tokenet bruges kun over for Freyras egen server og Supabase; providerens datagrundlag indeholder ingen loginoplysninger. Tekst med kendte hemmeligheder eller credential-mønstre afvises. Ukendte kildehenvisninger og ugyldige AI-svar vises ikke.

`LOVABLE_API_KEY` mangler fortsat i testappens serverhemmeligheder. Brugeren har udsat dette til næste morgen. Den levende modelgenerering kan derfor først afprøves efter nøglens tilføjelse. Nøglen må ikke skrives i chatten eller indgå i browserkoden.

De seks sagstrin er navigationstestet; den fulde prøve fra originalfoto over offentlig datahentning og faglig fotogennemgang til kommunal ZIP er ikke gentaget i denne udgivelse. En tilgængelig rapportillustration matcher ikke originalens forventede checksum og er ikke brugt som erstatning. Det eksisterende originale E2E-forløb er bevaret.

Tekniske prøver dokumenterer de nævnte funktioner. De erstatter ikke afprøvning af enhver dataleverandør, kommunal faglig accept eller kundegodkendelse af rapportindhold. Scenarier, finansiering og ESRS-datapunkter er registreringer med kildekrav. Rapportskabeloner er redigerbare strukturer; de gengiver ikke automatisk hele referencerapporten. Produktion og hovedgrenen er ikke ændret.
