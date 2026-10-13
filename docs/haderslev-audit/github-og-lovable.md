# GitHub og Lovable — status før Haderslev-planen

Undersøgt 13. oktober 2026 med read-only GitHub- og Lovable-connectors samt lokale metadata. Ingen projekter, databaser, deploys, PR'er eller branches er ændret. Alle tider nedenfor er UTC, medmindre andet står.

Mødet med Haderslev Kommune er oplyst til **10. november 2026**. Det giver cirka fire uger fra denne audit; den tidligere septemberdato i PRODUCT_SCOPE er passeret og skal behandles som historik.

## Konklusion

Det aktuelle produktarbejde ligger i **JESRI-C/freyra-hub, branch codex/gofreyra-p0**. Arbejdsbranchens head er `97782c0986d13971fd684240662a79eb70296db6` fra 13. september 2026 kl. 19:53:34. Den er **35 commits foran main og 0 bagud**, med 141 ændrede filer.

Lovable **Freyra Hub** og GitHub **main** er stadig på samme juli-version `03dca0727fb4bef4b16d07732bbd6318f4707a49`. Septemberarbejdet i upload, auth, geometri og sikkerhed er derfor ikke en del af den Lovable-version, brugeren normalt ser. Det forklarer en væsentlig del af oplevelsen af flere parallelle programmer.

Det aktuelle lokale arbejdsområde er en anden, meget ældre prototype. Videreudvikling bør baseres på freyra-hub og de eksisterende P0-dokumenter, når den rette arbejdscheckout er valgt. Auditmateriale i dette lokale repo er dokumentation, ikke nye produktændringer.

Kilder: [arbejdsbranch](https://github.com/JESRI-C/freyra-hub/tree/codex/gofreyra-p0), [compare main → P0](https://github.com/JESRI-C/freyra-hub/compare/03dca0727fb4bef4b16d07732bbd6318f4707a49...97782c0986d13971fd684240662a79eb70296db6), [Lovable-editor](https://lovable.dev/projects/7ec0fad1-a130-4304-819c-d085c76dc4bd).

## Versionskort

| Kilde | Verificeret version/tid | Rolle og konsekvens |
| --- | --- | --- |
| [freyra-hub / codex/gofreyra-p0](https://github.com/JESRI-C/freyra-hub/tree/codex/gofreyra-p0) | `97782c0986d13971fd684240662a79eb70296db6`, 2026-09-13 19:53:34 | Aktuelt P0-arbejde, droneintake og Haderslev Før/Efter. |
| [freyra-hub / main](https://github.com/JESRI-C/freyra-hub/tree/main) | `03dca0727fb4bef4b16d07732bbd6318f4707a49`, 2026-07-18 07:03:13 | Seneste merge #14; lavbund MRV og rapportdesign. |
| [Lovable Freyra Hub](https://lovable.dev/projects/7ec0fad1-a130-4304-819c-d085c76dc4bd) | Samme `03dca072…`; last_edited_at 2026-07-18 07:03:19.306 | Projekt id `7ec0fad1-a130-4304-819c-d085c76dc4bd`, publiceret, agentFinished true. “Ready/completed” er byggestatus, ikke produktaccept. |
| Dokumenteret Cloudflare-staging | Appcommit `f337920be67f1c05e3f5f2eee3c83ee4135f7694`; deploy 2026-09-13 | Worker `75f856e9-5915-44ad-9923-e2dd41f3d573`; seneste `97782c0` evidence-pathrettelse står som ikke deployet. Dette er historisk repository-evidens, ikke en frisk runtimeverifikation. |
| [gofreyra-dashboard](https://github.com/JESRI-C/gofreyra-dashboard) | `f63ebcbdcfb4ddb0a0c136ccc8023022b60d2c2c`, 2026-05-04 06:38:27 | Separat Manus-prototype med DecisionsIQ; bør vurderes som reference, ikke kanonisk P0. |
| [gofreyra](https://github.com/JESRI-C/gofreyra) + Lovable Data For Impact | `1c848b25dfb54d178f23a0dcb8f561263efc5d2f`, 2026-05-26 20:49:06 | Hjemmeside/salg, ikke den operative kundesag. Lovable id `bccf28ad-20f9-4810-8b86-be685855e5e2`. |
| [Freyra-Dashboard](https://github.com/JESRI-C/Freyra-Dashboard) | main `388f46636dd2d17d73abed4efc7944e77f3843ae`, 2026-03-31 21:40:21 | Ældre monorepo, hovedet er blog/Shopify-arbejde. Majaktivitet findes på Monil-branches og åbne PR'er. |
| [Frontend-dev-25052025](https://github.com/JESRI-C/Frontend-dev-25052025) | main `7980087007141857fde8f88f3a7277e32976b906`, 2025-11-13 21:17:22 | Ældre frontend. |
| [Freyra](https://github.com/JESRI-C/Freyra) | main `95bedd411dfdfdd2e7b68dfc7a806a012d4fec55`, 2025-05-23 19:26:28 | Tidligere dashboard, metadata-homepage https://freyra.vercel.app. |
| [Freyra-dashboard-28032025](https://github.com/JESRI-C/Freyra-dashboard-28032025) | Remote main `3b7eb74aa612ad6e9a7e1c1697527e0d80a1429d`, 2025-12-11 18:42:38 | Det nuværende lokale origin. Lokal main er kun `6da1a8690f3383bbe3c7c100f2cf1b8327eda6f0`, first commit 2025-12-11 19:38:02+01:00. |
| [Lovable Project Bridge](https://lovable.dev/projects/5cdcb499-6848-479c-ae67-e330ac17a025) | `fa36451687e41b30783271ace41b718359215b90`; last edit 2026-05-18 14:48:10.922 | Digital whitepaper, ikke kunderapporteringsmotoren. |

Yderligere repositories i kontoen: freyra-frontend, Dashboard_UI, Dashboard_frontend og Frontend-dev. Seneste push for disse er maj 2025. Der er ikke fundet nyere operative kundeleverancer dér.

Lokalt findes også søstermappen `C:\Users\jespe\JBR Freelance\Freyra development - Dokumenter\4. Produktudvikling\freyra-hub`, med src, docs og supabase. Efter godkendt read-only shelladgang i hovedauditten blev søstercheckout verificeret som ren `main` på `03dca072…`. Septemberbranchens P0-arbejde ligger dermed heller ikke i den lokale søstercheckouts aktive version. Der er ikke foretaget checkout/fetch/reset i søstermappen.

## Hvad GitHub-historikken faktisk viser

Alle 14 PR'er i freyra-hub er lukkede og merged, senest [#14](https://github.com/JESRI-C/freyra-hub/pull/14) 18. juli. Ingen åbne issues eller PR'er blev fundet i repoet. P0-backloggen ligger i Markdown, ikke i GitHub Issues.

Det merged juliarbejde omfatter:

- [#1](https://github.com/JESRI-C/freyra-hub/pull/1), [#3](https://github.com/JESRI-C/freyra-hub/pull/3) og [#4](https://github.com/JESRI-C/freyra-hub/pull/4): ingestmotor, kortgeometri/naturlag, NDVI-bandberegning og DMI-nedbøradapter.
- [#6](https://github.com/JESRI-C/freyra-hub/pull/6)–[#8](https://github.com/JESRI-C/freyra-hub/pull/8): lavbundsskriveveje, ledger-persistens, kildeark/faktortest og HOBO-import.
- [#10](https://github.com/JESRI-C/freyra-hub/pull/10)–[#14](https://github.com/JESRI-C/freyra-hub/pull/14): lovet kontra målt, baseline/efter-skille, rapportdesign, interpoleret vandstandslag og leverancemodel.

PR-beskrivelsernes testpåstande er historiske forfatteroplysninger. Der er ikke genkørt tests i denne audit.

Septemberbranchens seneste konkrete ændringer omfatter [dronekamera-positioner](https://github.com/JESRI-C/freyra-hub/commit/175cbb0c2a47d71769489516a893e324d1940924), [sikre uploaddownloads](https://github.com/JESRI-C/freyra-hub/commit/14cbf284250f68d69783549b4093b02a0d72d283), [atomisk observationsingest](https://github.com/JESRI-C/freyra-hub/commit/f337920be67f1c05e3f5f2eee3c83ee4135f7694) og [eksakte evidence-paths](https://github.com/JESRI-C/freyra-hub/commit/97782c0986d13971fd684240662a79eb70296db6).

Branch `feature/project-workspace-media-layer` fra maj indeholder en tidlig simuleret uploadgrænseflade. Den skal ikke forveksles med septemberbranchens private Storage/TUS-intake.

## Leverancestatus: rapport og drone

Den eksisterende [PRODUCT_SCOPE.md](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/docs/PRODUCT_SCOPE.md) definerer allerede Haderslev Vandløb Før/Efter som bindende P0. Den aktuelle [EXECUTION_STATE.md](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/docs/EXECUTION_STATE.md) siger **P0 og produktion NO-GO**.

Dokumenteret på staging i september: login, organisationsvalg, projekt create/open/reload, gemt Polygon, en officiel Bykær Bæk-reference og én syntetisk DJI-JPEG via privat TUS/Storage/finalize/reload. Uploadcenteret viste senere 12 originale dronefiler. Dette er nyttig infrastruktur, men de 12 filer stod “Afventer validering / Ikke kortklar”.

Følgende er udtrykkeligt udestående i [P0_BACKLOG.md](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/docs/P0_BACKLOG.md):

- servervalideret hash/EXIF/UTC og canonical drone_assets;
- survey rounds, billedanalyse, menneskelig review, fotopar og Før/Efter;
- præcis projektstrækning/stationering og kommunal reference;
- reproducerbar selvstændig FØR-baseline-PDF, senere Før/Efter-rapport og datamanifest;
- versionsfaste rapporter, godkendelse og immutable input-/evidenssnapshot;
- fuld Storage-, tenant-, auth- og runtimeaccept.

Kodebekræftelse: [reports-data.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/reports-data.ts) kalder sig selv mockdata til senere Supabase/PDF-erstatning. [reports-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/reports-service.ts) indeholder persistens og statusovergange; `exportReport` ændrer status til exported, uden selv at generere et dokument. [documents-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/documents-service.ts) genererer en enkel jsPDF med projekt, sites, indikatorer og handlinger. Den er ikke P0's versionsfaste drone-/datakilderapport.

Lavbundsrapporten er et særskilt, mere udbygget domæne. Den kan genbruge design, faktorproveniens og revisionsprincipper, men dokumenterer ikke automatisk et vandløbs droneundersøgelse.

Den faglige [vandløbsmetodekontrakt](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/docs/4dm-watercourse-monitoring-method.md) adskiller rå kameraposition, processeret produkt og kontrolleret georeferering. Upload med GPS er derfor ikke i sig selv et analyserbart ortofoto eller dokumentation for arter, dybde og hydraulik.

## Aktuelle miljødata: vigtig forskel fra septemberstatus

Hovedauditten har 13. oktober læst Lovables produktionsdatabase gennem `get_database_status` og read-only `query_database` samt stagingmetadata gennem Supabase. Ingen miljøer er aktiveret eller ændret. Dette er nyere evidens end september-runloggen:

| Miljø | Aktuel read-only observation | Konsekvens |
| --- | --- | --- |
| Lovable-produktion `ikrmcetjutqcjtwfhzfv` | 12 projects, 4 reports og 1 document; **0** uploads, drone_flights, drone_assets, project_media, connector_fetch_logs, observations, lavbund_projekter og lavbund_ledger | Det synlige program har ikke et eksisterende dronedatasæt eller lavbundsrevisionsspor, der kan genbruges som faktisk kommunal evidens. Rapportmetadata er ikke i sig selv en færdig kunderapport. |
| Isoleret staging `xdvqdzdpyceojbdknofi` | Supabase `list_projects` viser **INACTIVE** 13. oktober | Septemberdokumentets ACTIVE_HEALTHY-status er historisk. En ny runtimeaccept kan ikke baseres på de gamle testresultater alene. |

Direkte Supabase-connectoradgang til Lovable-produktionen er ikke synlig; tabellæsningen foregår via den tilsluttede Lovable-connector. Count-resultater er hovedaudittens live observationer, ikke genkørt af denne delagent. Miljøstatus skal afklares før planens første ende-til-ende-test.

## Offentlige data og kundesag

[DATA_SOURCE_CATALOG.md](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/docs/DATA_SOURCE_CATALOG.md) har registreret MARS, Arealdata, Dataforsyningen/Datafordeleren, Sentinel-2, DMI og GEUS. De fleste står stadig AFVENTER med hensyn til live svar, lag, licens, CRS og anvendte snapshots. Adapterkode og et kortlag er ikke bevis for en komplet automatisk dataindsamling pr. projekt.

MARS-adapter, kildevalg/proveniensaccept og live smoke er planlagt. Datakontekst fra offentlige registre skal gemmes særskilt fra verificerede drone-/feltfund. Det ønskede forløb “afgræns vandløb → hent relevante offentlige data → målrettet droneverifikation → beslutningsrapport” skal derfor gøres til den konkrete brugerrejse og accepttest.

Projektmaster skal verificeres: historikken bruger Skallebæk/Haderslev, staging bruger Bykær Bæk, og brugerens eksempel er Byskov Bæk. Ingen af navnene må lydløst erstatte den faktiske kundestrækning.

## CI og release-evidens

GitHub returnerede 27 historiske workflowruns. De 20 senest hentede er alle failure og vedrører den ældre migrationsworkflow. Seneste run [29277785428](https://github.com/JESRI-C/freyra-hub/actions/runs/29277785428) fra 2026-07-13 19:15:49 fejlede ved “Link project”; “Push migrations” blev skipped. De gamle joblogs er ikke længere tilgængelige (HTTP 410), så årsagen er ikke fastslået.

Main-head `03dca072…` har 0 check-runs og 0 statuschecks. P0-head `97782c0…` har 0 workflowruns. Der er ingen releases.

Ny [.github/workflows/ci.yml](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/.github/workflows/ci.yml) findes kun på arbejdsbranchen: Node 22.14.0, npm ci, typecheck, faktorverifikation, serial tests og build. Trigger er PR, push til main og manuel dispatch; featurebranch-push trigger ikke. Da der ikke er en P0-PR, er manglende hosted run forventeligt. Lokal dokumentation om grønne tests skal suppleres af frisk CI, før release kan vurderes.

EXECUTION_STATE angiver historisk 542 tests/build PASS, global lint 5.188 errors/23 warnings og 17 npm advisories. Tallene er septemberstatus og skal genmåles i den aktuelle checkout; de er ikke et frisk testresultat.

## URLs og verificeringsgrænser

- [Lovable preview](https://id-preview--7ec0fad1-a130-4304-819c-d085c76dc4bd.lovable.app): connector returnerer preview og publiceret-status, men ingen published_url.
- [Historisk Lovable deployment](https://gofreyra-compass.lovable.app): nævnt i juli-chat; ikke frisk runtimeverificeret.
- [Cloudflare-staging login](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/login): september-runlog bekræfter HTTP 200; den aktuelle web-reader kunne ikke åbne URL'en. Det beviser ikke, at tjenesten er nede.
- [app.gofreyra.com](https://app.gofreyra.com): juli-chat beskriver domæneplan og nødvendige DNS-/emailtrin. Aktuel domæne-/mail-/loginaccept er ikke dokumenteret af denne audit; web-reader kunne ikke åbne URL'en.
- [gofreyra.com](https://gofreyra.com): kunne læses som offentlig marketingside. Sidens beskrivelser af drone/satellit/rapporter er ikke funktionel accept af dashboardet.

Lovable-chatten fra 18. juli registrerer problemer med auth-mails, efterfulgt af brugerens oplysning om oprettede DNS-records og agentens vejledning om domæneverifikation. Der er ikke fundet en afsluttende verificeret mailtest i de ti seneste beskeder. Ingen mails eller beskeder blev sendt under auditten.

Næste plan bør fastholde ét versionskort (arbejdsbranch, main/Lovable, staging, produktion), gøre outputkontrakten konkret og afprøve én reel vandløbssag fra offentligt datagrundlag til reviewet FØR-rapport. Den store plan bør opdatere den eksisterende P0-backlog, så tidligere arbejde og udestående gates ikke forsvinder.

## Bred modulmatrix til planen for 10. november

Matrixen bygger på konkrete service-/route-læsninger på `97782c0986d13971fd684240662a79eb70296db6` og de aktuelle miljøobservationer ovenfor. Den er en kildeaudit af repræsentative flows, **ikke** en påstand om, at alle routes eller knapper er runtimeafprøvet. “Reel implementering” betyder her faktisk kode for læsning, skrivning eller beregning; fungerende produktion kræver separat accept.

| Produktområde | Reel implementering fundet | Demo, simulation eller uafklaret accept | Relevans før 10. november |
| --- | --- | --- | --- |
| Dashboard / projektportefølje | [app.overview.tsx](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.overview.tsx) læser projektsammendrag, handlinger og rapporter gennem services; [platform-live.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/platform-live.ts) læser audit/åbne handlinger. | Flere underliggende services har seed-fallback ved manglende config/tabeller. DB-rækker kan også være seed/startdata. | Vis kun kundesagens faktisk registrerede data og næste nødvendige handling. |
| Projekter, sites, handlinger, indikatorer | [projects-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/projects-service.ts) og [indicators-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/indicators-service.ts) har DB-CRUD, målinger og audit. | `createProject` kalder `seedProjectStarterData`: faste sites på 12,4/3,1 ha samt kilder med online-status/“synket nu” indsættes uden et faktisk kildekald. Indikatorhistorik kan genereres fra seed, hvis DB-historik er tom. | Fjern eller tydeliggør konstruerede startdata i reel kundesag, så oprettelse ikke fremstår som dokumenteret baseline. |
| Kort, geometri og vandløbsreference | Polygonvalidering, areal/centroid, gem/reload og eksport findes i [geo-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/geo-service.ts); officiel vandløbsreference har serverfunktion og provenance. | Septemberaccept dækker manuel Polygon og fuld navngivet Bykær-linje; præcis delstrækning/stationering, immutable revision og samtidige writes er AFVENTER. MultiPolygon/FeatureCollection er ikke understøttet i den aktuelle slice. | Nødvendigt: entydig kommunal strækning, gemt geometri og kildegrundlag. |
| Offentlige data, satellit og vejr | [environmental.functions.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/environmental.functions.ts) henter bl.a. natur, jord, terræn og DMI; [ndvi-engine.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/satellite/ndvi-engine.ts) orkestrerer satellitberegning og DB-resultat. | Klima-norm og nul/ukendt/defaults bruges ved fravær/fejl. Katalog/licens/CRS og projektbundne snapshots er ikke generelt accepteret. [app.data.tsx](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.data.tsx) har faste datakatalogtal. | Kerneflow: relevante kilder indsamles før droneanalyse, med synlig fejl/manglende data og kildeversionsspor. |
| Connect / sensorer og enheder | [devices-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/monitoring/devices-service.ts) har DB-CRUD/status; devices-route bruger denne og DeviceWizard. | [iot-simulation-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/iot-simulation-service.ts) genererer deterministiske sensorer. [connect/live](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.connect.live.tsx) viser statiske LIVE_OBSERVATIONS og faste KPI'er. | Kun nødvendigt i mødeleverancen, hvis faktisk felt-/sensordata indgår; undgå simuleret livefeed som kundebevis. |
| Connect / integrationer | [integrations-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/monitoring/integrations-service.ts) kan gemme projektbundne connections. | [connect/integrations](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.connect.integrations.tsx) bruger fast ACTIVE/INTEGRATIONS med MQTT/DMI/Sentinel-syncoplysninger. Forbindelsesmetadata er ikke en faktisk datastream. | Udvælg få nødvendige offentlige kilder og dokumentér deres virkelige status. |
| Connect / datakvalitet og alarmer | Quality-/alertmotorer, regelservices og DB-issues/alarmer findes; [quality-route](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.connect.quality.tsx) og [alerts-route](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.connect.alerts.tsx) har kørsel og statusaktioner. | Quality-readiness er delvist faste tal. Alerts bruger demo-ALERTS, når den faktiske liste er tom. Scheduler/Worker-secrets og rigtig automatisk kørsel står AFVENTER. | QA for kilde- og droneinput er nødvendigt; avanceret automatisk drift kan begrænses. Tom liste skal fremstå som tom. |
| Drone, upload og evidens | Privat TUS-intake, projektbundne upload-intents, signer-download og rå kamerapunkter er implementeret på P0-branchen. | Metadata-preview er ubetroet; serverextractor, canonical fotoaktiver, procesjob, review, rounds og parring mangler. Produktion har 0 droneaktiver/uploads. | Højeste funktionelle prioritet sammen med sikkerhed og rapport: brug et reelt datasæt ende til ende. |
| Natur-/klimaberegninger | [biodiversity-engine.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/nature/biodiversity-engine.ts) beregner en vægtet score; [carbon-engine.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/nature/carbon-engine.ts) beregner faktormodeller. | Source-mode kan være simulated; en selvdefineret vægtet score er ikke i sig selv en valideret biologisk tilstand eller målt CO₂-effekt. Kommunespecifik metode-/resultataccept mangler. | Brug kun fagligt godkendte mål fra datakontrakten; bred impactscore må ikke erstatte vandløbsrapporten. |
| DecisionsIQ | AI-assistentens [serverfunktion](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/decisions-assistant.functions.ts) kalder en AI-gateway og validerer svarformat; assistenten læser indikatorer/handlinger. | Recommendations/scenarios importerer [decisions-data.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/decisions-data.ts) mockdata. Assistentens sensorinput er simulation; flere handlingsknapper viser kun toast. Runtime/autorisation og evidensfast konklusion er ikke accepteret i denne audit. | Kort fagligt reviewet beslutningsafsnit fra den virkelige sag; fuld AI-beslutningsplatform er ikke nødvendig for mødet. |
| ESG Ledger / audit | [audit-service.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/audit-service.ts) læser/skriver audit; audit-route har faktisk datafeed. [ledgerService.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/ledgerService.ts) har SHA-256-kæde og lavbundspersistens. | Metrics/overview bruger [ledger-data.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/ledger-data.ts) mock. Hash-ledger for andre moduler er in-memory; en hashkæde alene beviser ikke hele kommunesagens input-/rapportversion. | Audit på uploads, datakilder, review og godkendt rapport er P0; bred ESG/CSRD-visning er sekundær. |
| Impact Exchange / credits / public impact | Porteføljevalg/sammenligning er implementeret som browserstate i [impact-state.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/impact-state.ts). | Credits bruger [impact-data.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/impact-data.ts) demoaktiver; portefølje er localStorage/sessionStorage. [Public impact](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.public-impact.tsx) har fast publicerings-/besøgsliste. Ingen creditudstedelse/transaktion eller verificeret publiceringsflow er vist. | Udskyd credits/markedsplads; ingen kommunal leverance bør afhænge af dem. |
| LavbundsMRV | Beregningsmotor, officielle faktorark/checksums, HOBO/manuelle readings, rapport/print, JSON-snapshot og hash-ledger findes. | [lavbundService.ts](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/services/lavbundService.ts) bruger mockdata ved tom/manglende DB; produktion har 0 projekter/ledgerposter. Vandstandslaget kan være beregnet interpolation og er ikke direkte måling af hele arealet. | Bevar som separat gennemarbejdet spor og genbrug komponenter; medtag kun som reel Haderslev-leverance, hvis kommunen bestiller det og leverer valide data. |
| Rapporter / dokumenter | Grundlæggende DB-statusflow, jsPDF og lavbundsdokumentdesign findes. | Generel rapportdata er mock; eksportstatus er ikke dokumentgenerering. FØR-baseline, senere Før/Efter, manifest, snapshots og immutable rapportversion mangler. | Kerneleverancen: læsbar rapport med fund, kilder, fotos, metode, usikkerhed og reviewer. |
| Auth, organisationsvalg og administration | [auth.tsx](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/lib/auth.tsx) har faktisk session-/org-/projektbootstrap og logout; P0-branchen konsoliderer klient/cache. | Septemberaccept dækker ikke hele reset/logout/refresh/account-switch. [settings/index](https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/src/routes/app.settings.index.tsx) “Gem” udløser kun SavedToast. Users/security bruger settings-data mock, med faste 2FA-/sikkerhedstal; billing er eksplicit planlagt til senere. | Reel tenantadgang, testkonti og login/reset skal bestå. Demo-admin må ikke fremstilles som fungerende invitation/2FA/policykontrol. |

## Aktuelt sikkerheds- og Storagefund: prioritet før kundedata

Hovedaudittens read-only produktionslæsning 13. oktober viser en `project_members` INSERT-policy med `WITH CHECK = is_project_admin(project_id, auth.uid()) OR user_id = auth.uid()`. **Self-insert-leddet er stadig til stede i produktion**, selv om septemberdokumenterne beskriver, at det blev lukket på staging. Policyudtrykket tillader semantisk, at en bruger indsætter sit eget user_id uden at bestå adminleddet; praktisk rækkeadgang afhænger også af grants, constraints, andre policies og eksponerede flows. Der er ikke udført et exploit eller ændret nogen medlemsrækker.

Dette skal stå som **første P0-sikkerhedsopgave**: verificér hele produktionskontrakten read-only, forbered en versioneret rettelse, test owner/admin/editor/viewer og fremmed organisation i isoleret testmiljø, og verificér den godkendte produktionsændring separat. En auth-gate i UI eller stagingtest er ikke tilstrækkelig evidens for produktionsisolering. [Supabases RLS-dokumentation](https://supabase.com/docs/guides/database/postgres/row-level-security) forklarer, at grants og policies begge indgår i rækkeadgangen.

Produktionsbucket-inventeringen fandt af de tre forventede filområder kun `monitoring-uploads`; `project-media` og `evidence-files` mangler. `monitoring-uploads` er privat, men bucketfelterne `allowed_mime_types` og `file_size_limit` er null. Det dokumenterer manglende bucket-specifikke begrænsninger, ikke nødvendigvis ubegrænset upload: globale indstillinger og andre valideringer kan stadig gælde. [Supabases bucketdokumentation](https://supabase.com/docs/guides/storage/buckets/creating-buckets) beskriver MIME-/størrelsesbegrænsningerne.

Planen skal derfor også prioritere et verificeret, sammenhængende Storage-flow med de nødvendige private buckets, medlemsbaserede policies, eksplicit filkontrakt, servervalidering og download/revoke/expiry/cleanupaccept. Det er en konkret funktionel og sikkerhedsmæssig forudsætning for kommunens billeder og evidens. Der er ikke oprettet buckets eller rettet policies under auditten.
