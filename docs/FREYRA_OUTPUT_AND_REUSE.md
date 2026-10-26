# Freyra: fra kundeleverance til fungerende platform

## Kundemål og status

Kommuner og private bygherrer/lodsejere er de første kundegrupper. Byggeri skal kunne begynde med en dokumenteret naturbaseline og fortsætte gennem indsats, kontrol og opfølgning. Vandløbsrapporten er et konkret eksempel på en leverance, ikke hele produktets afgrænsning. Alle eksisterende kategorier bevares.

Brugeren har valgt, at agenten også skal kunne udføre godkendte arbejdsgange automatisk i testmiljøet. Det er ikke en generel produktions- eller publiceringsgodkendelse. Faglige godkendelser skal være særskilte fra gennemførte tekniske trin.

Dette dokument kombinerer en læst rapportreference, kildekodeaudit og research. Det er ikke dokumentation for, at alle kategorier eller den fulde brugerrejse virker live.

## Aktuelt materiale og versionskontrol

Gældende hovedreference er [Bedre natur og variation i vandløbene](https://drive.google.com/file/d/1BynA_7pBq91XG96qHuCJ1z8sV_1Wv070/view). Den blev opdateret 26. oktober 2026 kl. 21.14 dansk tid og hentet igen efter brugerens besked om den nye udgave. Den lokale kopi er 17.766.312 bytes, 26 sider, SHA-256 `0d667064cc4be96376fc2448c2d59aa24142648edb9149d0f22acbf2f7c9fd09`. Hele teksten er læst, og side 1, 3, 9, 19, 22 og 26 er renderet og visuelt inspiceret for struktur og layout.

Den tidligere kopi af samme fil var 22.105.869 bytes og indeholdt en bestillingsramme på 1.000 træer. Den må ikke bruges som gældende produktkrav. Den nye rapport bestemmer ikke et samlet antal på forhånd; en principskitse med et antal modelplanter er ikke et bestilt eller dokumenteret projektantal.

| Materiale | Verificeret status | Anvendelse |
| --- | --- | --- |
| Hovedrapport, samme Drive-id | Ny udgave, opdateret kl. 21.14 | Gældende reference for leverance og præsentation |
| [Fotoatlas og øvrige leverancer](https://drive.google.com/drive/folders/1Spcomfntax5tUxChnls4lWUInWKnKD9U) | Atlas, fuld fotorapport og ZIP er fra tidligere samme dag | Sammenholdes med den nye hovedrapport før fælles eksport; ingen automatisk antagelse om ens revisionsindhold |
| [Droneoriginaler før/efter](https://drive.google.com/drive/folders/1FkxxWY52vVVTuEgMn0Yj1PtiPedaKqew) | Eksisterende originale undersøgelser | Evidens beholder oprindelig optagedato; en ny upload gør ikke en gammel observation ny |
| [4DM-rapportmodul v0.2](https://drive.google.com/file/d/1z2GC-B2DP7sZ-9eGh_r4rc5xmgeREdir/view) | Fra august 2026 | Historisk arkitekturbaggrund, ikke seneste kravversion |

En reference skal identificeres med fil-id, ændringstidspunkt, checksum og anvendelse. Filnavn eller seneste uploadtid alene er utilstrækkeligt. Underliggende data får egen observations-/gyldighedsdato, metode og geografisk dækning. Den gældende rapport er en outputreference; dens faglige tal er ikke automatisk genverificeret ved at læse PDF'en.

## Arbejd baglæns fra rapporten

| Output i referencen | Nødvendigt datagrundlag | Eksisterende kode at genbruge | Åben leverance |
| --- | --- | --- | --- |
| Forside, formål og kundevendt anbefaling | Projekt, kunde, scope, rapportversion | `report-document.ts`, `ReportWorkspace.tsx`, `report-export.ts` | Referencebaseret design med logo, sidehierarki og redigerbar DOCX |
| Samlet indsats og delstrækninger | Versionsbundet centerlinje, grupper, naturhensyn og fagligt review | `watercourse-service.ts`, `watercourse-geometry.ts`, `WatercoursePanel.tsx` | Udførelsesgrupper og egnede arealer skal være selvstændige objekter; ingen fast antalsramme |
| Område- og plantekort | Officielle lag, projektgrænse, kamerapunkter, lagdato og målestok | Eksisterende projektkort, GeoTIFF-preview og `report-map.ts` | Eksport af samme faglige lag som kortvisningen; kamera-GPS erstatter ikke målegrundlag |
| Billedgrundlag og før/nu | Originaler, checksum, metadata, fotoroller og kvalitetsflag | `project-media-service.ts`, `report-assets.ts`, `watercourse-observations.ts` | Test med faktiske originaler og ens referencebinding på alle eksportformer |
| Vandløbstilstand, natur, jord og historiske arter | Officiel kilde, dataversion, identitet og dækning | Eksisterende connectorer og naturservices | Aktuelle endpoint-/typenavne, pagination og eksplicit kildefejl; PDF-tekst er ikke en ny datakilde |
| Artsforslag og bevaring | Stedbunden observation og faglig bestemmelse | Observationer med kilde-/delstrækningsbinding og særskilt review | Artsniveau og usikkerhed skal følge resultatet helt til rapporten |
| Sol- og skyggefigurer | Solposition, tidszone, antaget/målt krone, højde, vandflade og terræn | Geometri og eksisterende versionerede analysejob | Beregningsmodul med gemte forudsætninger; modelillustration må ikke udlægges som dokumenteret biologisk effekt |
| Etablering og pleje | Tiltag, ansvar, feltlog, faktiske mængder og udført arbejde | Eksisterende action-/auditservices | Gemte udførelses- og plejeobjekter, ikke kun rapportprosa |
| Årsstatus og sammenligning frem mod 2030 | Registreret plantet/levende antal, art, gruppe, prøvetræer, gentagelsespunkter og metode | Surveys, observationer, rapportversioner og kildechecksums | Baseline og opfølgning skal kunne sammenlignes; en undersøgelse efter indgreb er ikke en førmåling |
| Databilag og metode | Kildearkiv, figurinput, beregningsversion og eksportmanifest | PDF/DOCX/CSV/GeoJSON-eksport | Samlet revisionsbundet ZIP og kontrol af, at bilag tilhører den valgte rapportrevision |

Det fælles forløb er projektvalg → baseline/datakilder → registrering/analyse → forslag → fagligt review → leverance → indsats → opfølgning. Byggeri bruger samme evidens-, versions- og rapportmotor, men egne faglige input og rapportafsnit.

## Alle eksisterende kategorier

`node scripts/audit-category-surface.mjs` genererer [det maskinlæsbare kildekodeinventar](category-source-audit.json). Det læser sidemenuen og routedefinitionerne direkte. Aktuelt er der 15 menuindgange. Et fundet routefilnavn er aldrig et funktionelt PASS. Auditens statiske importkontrol er et signal, ikke en fuldstændig analyse af alle services og faner.

| Kategori | Genbrug / kildekodefund | Krav for at kalde den fungerende |
| --- | --- | --- |
| Dashboard | Eksisterende projekt-/handlings-/rapportservices | Beregn status fra det autoriserede projekts faktiske data; ingen opfundet metodeprocent |
| Naturprojekter | Eksisterende projektmodel og fælles projektvalg | Opret, åbn og genåbn rette projekt uden uvedkommende organisationsdata |
| Rapporter | Vedvarende revisioner og reelle eksportfiler | Kundetype/skabelon, kildegrundlag, kladdebevarelse, review, eksport og genåbning |
| Kort & zoner | Projektkort, centerlinje, original-GPS og geometri | Gem og genindlæs korrekte objekter og lag med kilde, CRS og dækning |
| Byggeri & natur | Construction-service, naturkontekst, afvanding, risici og afværgetiltag | Baseline før indgreb, datobundet påvirkning, lokale forhold og dokumenteret opfølgning; seed-fallback må ikke fremstå som kundedata |
| Monitoring & feltdata | Upload, surveys, observationer og måleservices | Faktiske målinger, roller, gentagelse, fejl/genforsøg og versionsbinding |
| LavbundsMRV | Eksisterende projektpersistence og beregningsmotor | Faktiske input og synlig metode-/faktorversion; beregnet potentiale må ikke blive verificeret kredit |
| Project Intelligence | Layout viser statustekst uden `Outlet`; seks underfaner importerer demonstrationsdata | Bind eksisterende faner til projektets gennemgåede observationer, beslutninger og faktiske indikatorer før åbning |
| Dokumentation & audit | Layout viser statustekst uden `Outlet`; syv underfaner importerer demonstrationsdata | Genbrug faktiske dokument-, kilde- og auditservices; genåbn fanerne med korrekt scope og fejltilstande |
| Data & metoder | Connector-register og eksisterende kildeadaptere | Skeln mellem implementeret adapter, konfigureret forbindelse og vellykket aktuelt dataudtræk |
| Funding & impact | Layout viser statustekst uden `Outlet`; syv underfaner importerer demonstrationsdata | Faktiske aftaler, finansieringsgrundlag og dokumenterede effekter; fravær af data må ikke blive tal |
| Public impact | Statisk `PUBLIC_PAGES` med eksempeltal | Rigtige godkendte projektversioner, faktisk publiceringsstatus og særskilt publiceringshandling |
| Indstillinger | Eksisterende sider; flere bruger statisk `settings-data` | Gemte organisationsindstillinger, adgangskontrol og readback |
| Brugere & roller | Importerer `USERS`/`ROLES` fra `settings-data` | Faktiske medlemskaber og rollegrænser; et åbnet invitationsvindue er ikke en sendt invitation |
| System Test | Eksisterende tekniske kontroller | Aktuelle, scoped resultater, skelnen mellem PASS/FAIL/UNKNOWN og ingen skjult ændring af kundeprojekter |

At indsætte `Outlet` i de tre blokerede layouts alene ville gøre gamle eksempeltal synlige igen. Databinding og fejlhåndtering kommer før åbning af de faner. Kategoriadgang og faglig beregning skal verificeres særskilt.

## Genbrug af kode og danske løsninger

### Egen kode fundet i den aktuelle dags datapakke

ZIP-filen er hentet læsende og dens 100 poster har bestået ZIP/CRC-kontrol. Den indeholder faktisk den tidligere rapportgenerator og beregningskode, ikke kun færdige billeder. De fire nedenstående programmer er læst/AST-inventeret uden at blive kørt. Pakkens README og planteplan indeholder stadig den tidligere bestillingsramme, så programmets projektspecifikke tekst og tal er ikke aktuelle krav trods pakkens nye dato.

| Fil i pakken | Faktisk genbrugspunkt | Nødvendig tilpasning |
| --- | --- | --- |
| `report_work/build_report.py` | 13 layoutfunktioner til sider, afsnit, tabeller, fotos, billedpar og billedtekster | Udskil ReportLab-design fra hardkodet tekst, projektstier og data; nyeste tekstrevision kommer fra gældende rapportindhold |
| `report_work/solar_model.py` | NOAA-solposition, lokal tangent, modeltræer, vandprøvepunkter og ellipsoide kroners skygge | Udskil metode fra projektspecifikke datoer/stationer og fast UTC+02; gem forudsætninger og metodeversion, før modellen tilbydes generelt |
| `report_work/revision_v2/build_reaches.py` | Shapely/pyproj-opdeling af forløb, arbejdsstrimler og overlap | Erstat hardkodet `PLAN`, arter og mængder med godkendte projektinput. GIS-strimmel er ikke opmålt brink eller tilladt planteafstand |
| `report_work/revision_v2/render_maps_v2.py` | Kortlag, afgrænsninger, etiketter og kildebaggrunde | Parametrisér lag og projektrevision; genbrug samme geometri/versionsgrundlag i app og rapport |

Dette er første genbrugsspor før nye eksterne biblioteker. Den eksisterende webeditor og PDF/DOCX-eksport forbliver den fælles vej til gemte rapporter. De Python-baserede geoprocesserings-/figurfunktioner kan tilkobles som en versionsbundet worker, så to parallelle projekt-/rapportdatamodeller undgås. Rå scripts med top-level filskrivning, netkald og gamle projektkonstanter importeres ikke direkte i produktet.

### Eksterne kandidater

Researchen herunder er en vurdering af dokumenterede grænseflader og kilderepositorier. Ingen ekstern kode er endnu installeret eller erklæret kompatibel med Freyra. Et produktwebsite giver inspiration og eventuelle integrationsmuligheder; det giver ikke adgang til produktets interne kode.

| Kandidat | Dokumenteret anvendelse | Beslutning for Freyra |
| --- | --- | --- |
| [NodeODM](https://github.com/OpenDroneMap/NodeODM) | REST-API til behandling af luftfotos; AGPL-3.0 | Første kandidat til en serverworker bag eksisterende `PhotogrammetryAdapter`; afprøv API, ressourcebehov og licens før integration |
| [WebODM](https://github.com/WebODM/WebODM) | Georefererede kort, højdemodeller og punktskyer; AGPL-3.0 | Sammenlign som færdigt behandlingssystem. Projektet har skiftet organisation/enginer; antag ikke kompatibilitet med gamle OpenDroneMap-vejledninger |
| [Septima Malstrøm](https://github.com/Septima/malstroem) | Danske terrænbaserede bluespot-/strømningsscreeninger; GPL-2.0 eller senere ifølge README | Kandidat til selvstændig GIS-worker; ældre installations-/kompileringskrav skal afprøves. Ikke en færdig hydraulisk model |
| [DHI MIKE IO](https://github.com/DHI/mikeio) | Læsning/skrivning af DFS-/DFSU-/mesh-data; BSD-3-Clause | Integration, når kommunen/rådgiveren leverer faktiske MIKE-data. Biblioteket erstatter ikke en MIKE-beregningsmotor |
| [Scalgo Live](https://scalgo.com/da/) | Terræn-, vand- og naturplanlægning | Dansk produktreference og mulig data-/arbejdsgangsintegration; proprietær løsning, ikke kildekode til direkte indkopiering |
| [Danmarks Miljøportal](https://www.miljoeportal.dk/) | Nationale natur-/miljøkilder og værktøjer | Genbrug eksisterende Freyra-adaptere og verificér aktuelle distributioner, licenser og hentede versioner |
| [QGIS](https://github.com/qgis/QGIS) | Modent GIS-miljø og processing | Ekspertkontrol og worker-pipelines; undgå at genbygge generel GIS-redigering i webappen |
| [SunCalc](https://github.com/mourner/suncalc) | Solposition og soltider | Kandidat til solgeometri, som skal sammenholdes med rapportens NOAA-forudsætninger. Ikke en vækst-/effektmodel |
| Eksisterende Turf, proj4, geotiff, EXIF, jsPDF og DOCX-kode | Allerede anvendt i Freyra | Genbrug først. Tilføj kun en ny pakke ved et dokumenteret hul |
| [Vercel AI SDK](https://github.com/vercel/ai) og eksisterende MCP | Allerede indbygget AI-gateway og autoriserede værktøjer | Udvid nuværende værktøjer og jobstyring, før et nyt agentframework overvejes |

## Agenten skal styre dokumenterede trin

Agenten skal kunne afgøre, hvilke input der mangler, kalde eksisterende autoriserede services, følge jobstatus og samle et revisionsbundet udkast. Beregninger udføres i metodeversionerede funktioner, ikke som modelgæt. Hver kørsel bindes til organisation, projekt, survey-/rapportversion, inputchecksums og metodeversion.

Planen genbruger `drone-processing.ts` og de eksisterende report-/observationsservices: datainventar → kildevalidering → eventuel geoprocessering → observationer/forslag → fagligt review → eksport. Manglende provider, utilstrækkelig dækning eller modstridende revisioner skal blive en konkret blokering med næste handling. Automatisk gennemførelse i testmiljø skal kunne genoptages uden dobbelt upload, dobbelt job eller omskrivning af en godkendt version. Før produktion kræves en faktisk gennemført stagingprøve.

Eksisterende MCP dækker aktuelt kun echo og to lavbundslæsninger. Det er ikke en agent, der kan gennemføre rapport- og byggeforløbet. Næste værktøjer bør være projektets evidensstatus, kilderegister, survey-/jobstatus og oprettelse af rapportkladde med allerede eksisterende adgangskontrol. Hver ny skrivehandling afprøves særskilt i testmiljøet.

## Danske podcasts og YouTube

Der er søgt bredt efter danske programmer om SaaS, software og praktisk AI og kontrolleret officielle episodeoversigter, beskrivelser og tilgængelige tekstuddrag. Det er ikke en påstand om, at alle danske podcasts er fundet eller alle afsnit set. Tekniske integrationsbeslutninger bygger på kode og officielle dokumentationer, ikke en podcastdemonstration alene.

| Kilde | Kontrolleret materiale / video | Anvendelse på Freyra |
| --- | --- | --- |
| [SaaS Købmænd](https://xn--saaskbmnd-m3a9q.dk/) | Officiel oversigt har YouTube-links; bl.a. professionel AI-programmering, AI-agenter og Niels Hartvig | Prioritér leverance, genbrug og en driftsbar arbejdsgang frem for flere isolerede demoer |
| [Verbos](https://verbospodcast.dk/) | Officiel side linker YouTube; afsnit om agentic engineering, determinisme og kodeagenter er identificeret | Fast metode-/værktøjslag, reproducerbarhed og afgrænsede agentopgaver |
| [Produktland](https://produktland.dk/produktland/) | Officiel side har YouTube og detaljerede afsnitsbeskrivelser | Arbejd baglæns fra kundens beslutning og workflow; genbrug designsystem og kodebase |
| [Marketingpod: Vibe coding for begyndere](https://marketingpod.dk/episodes/vibe-coding-for-begyndere-om-41-minutter-kan-du-kode) | Officielt afsnit og beskrivelse af praktiske app-eksempler; video omtales i tekstuddrag | Brug konkrete eksempelfiler og en kendt leverance som acceptgrundlag |
| [AI Mennesker](https://podcasts.apple.com/dk/podcast/ai-mennesker/id1741788842) | Aktuel officiel podcastoversigt; værten har også offentliggjort YouTube-links | Inspiration til anvendelser og menneskelig gennemgang; lavere prioritet som kodekilde |
| [HverdagsAI](https://hverdagsai.dk/) | Officiel podcastsektion med praktiske agent-/workflow-emner; YouTube-udgave ikke bekræftet her | Enkel kundebetjening og tydelige næste handlinger |
| [TI-POD 162](https://www.teknologisk.dk/47801) | Officiel introduktion til vibe coding; YouTube-udgave ikke bekræftet her | Supplerende introduktion, ikke en færdig integrationsopskrift |
| [Marketing Perspektivet 38](https://www.generaxion.com/dk/38-vibe-coding/) | Officiel episode om vibe coding; YouTube-udgave ikke bekræftet her | Supplerende værktøjsoverblik; ingen ny stack vælges alene herfra |

De konkrete forslag i højre kolonne er vores anvendelse af de beskrevne temaer, ikke ordrette anbefalinger fra værterne.

## Rækkefølge for implementering og accept

1. Lås gældende referencer med indhold/checksum og registrér ældre bilag særskilt.
2. Bevar fælles projektvalg og kladder ved auth-/datagenindlæsning. Genbrug én rapportmotor til vandløb, bygge-/naturbaseline og årsstatus.
3. Få en ren buildverifikation og den eksisterende revisions-/originalmodel afprøvet i det rigtige testmiljø. Ingen lokal buildfejl eller manglende browserprøve tæller som PASS.
4. Gennemfør ét kommunalt vandløbsforløb og ét byggeprojekt med baseline, faktiske kilder, review, eksport og genåbning.
5. Bind audit, dokumenter, indikatorer og beslutninger til de samme vedvarende projektobjekter. Erstat statiske data i de blokerede underfaner, og genåbn dem derefter.
6. Afprøv én ekstern geoprocesseringsworker på et egnet, autoriseret datasæt. Tilføj automation omkring det gennemprøvede forløb.
7. Afslut hver af de 15 menuindgange med browseraccept og rolle-/projektgrænser. Public impact kræver separat godkendt publicering; finansiering/effekt kræver faktisk datagrundlag.

Rapportskabelonerne til baseline og årsstatus er en genbrugelig oprettelsesmulighed. De gør ikke feltdata, solmodeller, myndighedsscreening eller resten af de åbne kategoriopgaver færdige i sig selv.
