# Rapport, fotoatlas og fuldt dashboard

## Gældende grundlag

Jesper har bekræftet det tidligere fulde dashboard. Alle 16 hovedmenuhenvisninger og projektets 14 faner er bevaret. Den guidede sagsgang kan fortsat åbnes med eksplicit sagstrin. Designrettelser: 9c68f54 og a53a1c2. Browserbevis: `release-1.0/dashboard-restored-browser.json` og `screens/dashboard-restored/`.

Drive-mappen er kontrolleret igen 27.10.2026. Den tidligere reference fra 26.10 er ikke den seneste udgave. Ingen af de private originaler, rapporter eller billeddatasæt lægges i Git.

| Reference | Drive-ID | Senest kontrollerede revision |
| --- | --- | --- |
| Hovedrapport | 1BynA_7pBq91XG96qHuCJ1z8sV_1Wv070 | Ændret 27.10 kl. 21:33:56 UTC, 25.376.583 bytes, 26 sider. SHA-256 e0cddc667eb92166ea00a8193c49bc1645e84e94e5559387eb06cbfdfb9b7548. Forside og indholdsside visuelt gennemgået. |
| Fuld rapport med 274 dronefotos | 18Rap_E6W4P6yL3_bXXZCXCrPjdCQ7Yqk | Ændret 27.10 kl. 12:14:57 UTC, 63.455.221 bytes. Tekst gennemgået. |
| HTML-fotoatlas | 187z7-urI0CByr86OLX7GHVlreYzesBq0 | Ændret 27.10 kl. 12:15:39 UTC, 51.826.074 bytes. Hele datasættet og illustrationerne indlæst. |
| Baseline-JSON | 1OBQCM6vc7FPXkWPSu8Dlmil7lMWB5MAw | Ændret 27.10 kl. 12:15:45 UTC, 280.139 bytes. Alle 274 poster sammenholdt med atlasset. |

274 foto-ID'er, filnavne og registrerede originalchecksums stemmer mellem atlas og baseline. Alle 274 har indlejret illustration. Optagedatoerne er 24.08, 07.09 og 16.09.2026; vandløbstilknytningerne omfatter Bykær Bæk, Barsbøl Bæk, Ørsted Å og Uafklaret. Usikre poster flyttes ikke automatisk til et bestemt vandløb. Billedgruppe er ikke det samme som en geografisk delstrækning. Lokalt EXIF-klokkeslæt uden offset omregnes ikke til UTC.

## Genbrug og konkret ændring

| Område | Eksisterende grundlag | Ændring og afgrænsning |
| --- | --- | --- |
| Organisation og projekt | Auth-valg, arbejdsplads, kommunale roller, projektskabeloner, projektgeometri og vandløbsversioner | Fuld navigation tilbage. Atlas er altid afgrænset af både organisation og projekt. Vandløbs-ID, billedgruppe, kameraposition og brugerregistreret delstrækning vises særskilt. En delstrækning uden geometri bliver ikke opfundet. |
| Originaler og batch | Kanonisk dronebatch, EXIF/XMP-udtræk, SHA-256, TUS og private originaler | Samme metadataudtræk bruges til at bygge atlas fra eksisterende originalfotos. Uploadtid bruges ikke som optagetid. Visningskopier ændrer aldrig originalen. |
| Fotoatlas | Mediegalleri, kort og private kildefiler | HTML/JSON-import, søgning, dato/vandløb/gruppefiltre, kortpunkter, zoom, sidenavigation og versionsgemt gennemgang. HTML fra en upload udføres aldrig; kun det validerede JSON-datasæt læses. |
| Arter og vegetation | Observationer og faglig rapportgennemgang | Artsbud og brugerregistreret feltkontrol holdes adskilt. Bekræftelse kræver navn, metode/kontrolreference og artsnavn. Ingen økologisk klasse fra dronefotos. |
| Drift og beplantning | Eksisterende arbejdsnoter, planteplan og rapportversioner | Stedreference, adgang, naturhensyn, arbejdsdato, arbejdsgrænse/kilde, udførelsesfotos, planteforslag, dokumenteret udførelse og opfølgning på det enkelte foto. Ingen beregnet maskinkapacitet eller fast antalsramme. |
| Sammenligning | Eksisterende billedsammenligner | Rene billedpar hedder optagelse A/B. Dokumenteret før/efter kræver to forskellige originaler, optagedatoer på hver side af arbejdsdatoen, arbejdsreference og begrundelse for samme sted. Det er brugerregistreret dokumentation, ikke automatisk faglig accept. |
| Rapport og eksport | Versions-RPC, rapporteditor, kildechecksums, kortkomposition, PDF/DOCX/CSV/GeoJSON | Atlas danner en rapportkladde med otte afsnit, fotobaseline, metode og kilder. PDF-adapteren henter atlas gennem rapportens autoriserede projektrække og kræver samme kildefilhash og originalreference som den gemte version. Kilderegisterets opdatering bevarer disse referencer. |
| Delbart atlas | Eksisterende HTML-data genbruges | Selvstændig HTML-eksport med indlejrede illustrationer, søgning, filtre, zoom og positionsskitse. Kan deles som fil. Der aktiveres ikke et offentligt kundelink eller offentlig bucket. Modtageren får de valgte oplysninger i filen. |
| Målinger og sensorer | indicator_measurements, device_measurements, datakilder og eksisterende målesider | Genbruges; ingen nye sensortal eller ændringer i beregningsmotorerne. Rapporten skriver udtrykkeligt, når vandstand, temperatur, ilt og pH ikke er målt. |

## Sikkerhed og afprøvning

Ingen nye databasetabeller eller migrationer. Kildedatasæt gemmes i eksisterende private `evidence-files` med en `evidence_files`-reference. Gennemgange gemmes som nye versioner i eksisterende `project_workspace_entries`; en ændring omskriver ikke tidligere gennemgang. Forfatterens rolle og projektadgang håndhæves af eksisterende database- og storagepolicies. En læser får ingen import-, skrive- eller kladdeknapper.

Nye og ændrede funktioner er **ikke verificeret** i hostet browser, før den konkrete acceptkvittering foreligger. Lokal test er ikke lig med kundens faglige godkendelse. Den samlede releasevurdering og de resterende driftskrav fremgår af `RELEASE_1_0.md`.

## Afventer dokumentation eller aftale

- Navngiven fagperson og faktisk kontrol af arter, delstrækninger, adgang, arbejdsgrænser og beplantningsforslag.
- Daterede driftsregistreringer, udførelsesfotos og senere opfølgning, når en indsats er udført.
- Kundemailadresser, fungerende SMTP, fuld hostet gendannelsesprøve og aftalt ansvar for driftsalarmer.
- AI-servernøgle til en ekstern AI-assistent; manuel faglig registrering og rapporteksport skal fungere uden denne nøgle.

Produktion og main er fortsat under Jespers særskilte godkendelse. Arbejdet udføres på releasegrenen; fallback 6257819 og beregningsmotorerne bevares.
