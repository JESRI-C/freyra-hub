# Platformfunktioner: offentligt grundlag, drone og rapport

Read-only kodeaudit 13.10.2026 af GitHub `JESRI-C/freyra-hub`, branch `codex/gofreyra-p0`, fastlåst til SHA `97782c0986d13971fd684240662a79eb70296db6`. Den lokale juli/main-kopi er ikke brugt som facit. Ingen database-, hosting-, repository- eller produktændringer er udført. Denne audit viser kodeadfærd og tidligere dokumenteret runtime-evidens; den genudfører ikke runtime-tests. GitHub-kilden er nyere end det stagingdeploy `f337920`, som `EXECUTION_STATE.md` beskriver. Hovedauditens live opslag 13.10.2026 viser staging som `INACTIVE`; de nedenstående staging-checkpoints er derfor historisk evidens. Kilde, deployment og live data skal fortsat holdes adskilt.

## Konklusion

Platformen har brugbare byggesten: projektgeometri, officiel vandløbsreference, offentlig konteksthentning, Sentinel-båndberegning, privat resumérbar FØR-upload og download. Den fulde leverancekæde **offentligt stedgrundlag → spørgsmål til dronen → verificeret observation → fagligt review → versionsfast kommunerapport** er endnu ikke bundet sammen. P0-dokumentationen erklærer selv P0 og produktion NO-GO. [1–2]

Der er især tre adskilte forløb: offentlige data bliver til aktuelle kontekstkort/indikatorer; FØR-upload bliver til modtagne filer med ubetroet browsermetadata; rapporter bliver enten simple projektlister i PDF eller præsentationssider med hardcodet indhold. En godkendt kommunerapport kan endnu ikke følge et låst offentligt grundlag og et godkendt dronesurvey gennem disse forløb.

## Offentlige data: hentning findes, baseline mangler

**Triggeren matcher endnu ikke den ønskede rækkefølge.** `createProject` kalder en starter-seed, ikke en stedundersøgelse. Seedet opretter eksempelområder på 12,4 og 3,1 ha, skriver DMI og Miljøportalen som `online` med aktuelt `last_sync_at` og opretter indikatorværdier på nul med status `afventer`. Det er ikke hentede observationer. Projektoversigten henter derefter miljøkontekst ved visning; `NdviCard`/`useNdvi` kan automatisk hente og skrive NDVI, når projektet har centroid. FØR-upload-CTA kræver valid projektpolygon, men kræver ikke et færdigt offentligt baseline-snapshot. [3–5]

**Satellit har flere parallelle veje.** `sentinel-service` finder STAC-scener og forsøger rigtig B04/B08-båndmatematik. Beregningen tager median i et lille pixelvindue ved centroid fra et valgt overview, ikke en klippet vandløbskorridor. Den læser ikke en lokal sky-/skyggeklassifikation i denne kæde. Hvis båndlæsning fejler, estimeres værdien først fra hele scenens RGB-thumbnail og til sidst fra en generel sæsonformel. Metoden er mærket `sentinel2_estimated`, men `ndvi-engine` kan stadig gemme resultatet som `ndvi_mean`/`vegetation_index`; `good/warning/critical` og `up/stable/down` bestemmes af det aktuelle niveau, ikke en målt tidsserie. Estimatets metode/confidence gemmes på metrics-rækken, men føres ikke med i det generiske indikatorobjekt. [6–7]

Et separat Copernicus-connector kan hente scenemetadata og har preview-NDVI 0,68; `connector-service`'s `fetchSatelliteVegetation` er stadig en preview/TODO-vej. Miljøcontextens `LiveDataSnapshot` bruger kun vejret og naturdelen fra den hentede live bundle, selv om bundlen også indeholder satellit og steder. Der er således ikke én autoritativ satellitbaseline. [8–9]

**Vejr er ikke bundet til flyvedato eller indsatsperiode.** DMI-connectoren efterspørger fire seneste observationsposter i en stor bbox. Miljøbundlen efterspørger foregående kalenderårs nedbør og falder tilbage til en vest/øst-formel; dimensioneringsregn er også formelbaseret. DMI-connectorfejl kan returnere preview med status `ok`. Der findes ikke i det læste forløb en dateret survey-vejrserie, stationsvalg/afstand og et låst nedbørsvindue før optagelsen. [10–11]

**Offentlig geometri er ofte centroid-screening.** `fetchParagraph3` summerer arealegenskaber for features i bbox og begrænser summen til 90 % af projektarealet; dette er ikke en polygonintersection. Vandløbsafstand beregnes til kortlinjens vertices. Flere upstream-fejl reduceres til nul eller null, og miljøkontekstens completeness tæller ikke-null resultater inklusive fallback. Disse tal skal ændres eller navngives præcist, før kommunen kan læse dem som dokumenteret overlap, afstand eller datadækning. [9, 11]

## Drone: sikker modtagelse er længere fremme end behandling

FØR-batchguiden accepterer op til 200 billeder, læser metadata/hash og overfører højst to ad gangen. `uploads-service` bruger serverudstedt, idempotent intent, privat TUS-overførsel, finalisering og projektscopet signeret originaldownload. Guiden gemmer fase/batch og browseraflæste data i `user_metadata.client_preview`; koden siger eksplicit, at serveren skal genudtrække metadata før faglig brug. [12–13]

`drone-upload-map-service` viser alene konsistente, modtagne FØR-filer med komplette metadata som `raw_unvalidated`-kamerapunkter. Status `ready` gør ikke browserpositionen valideret. Det er en god kvalitetsgrænse. `drone-service` kan oprette/liste flyvninger og liste eksisterende `drone_assets`, men den læste intake-kæde opretter dem ikke og forbinder ikke filerne til survey rounds, offentlig indikation, analysejob eller reviewbeslutning. [14–15]

Checkpointet dokumenterer én syntetisk JPEG gennem rigtig TUS/finalize/reload og 12 modtagne Bykær-filer, der korrekt står `Ikke kortklar`. Serverekstraktion, canonical aktiver, billedanalyse, menneskelig artsreview, rounds og fotopar er fortsat AFVENTER. At metadata-parseren virker i browseren er derfor ikke det samme som behandlet droneevidens. [1–2]

Der findes samtidig et generisk `project_media`-flow: brugeren kan manuelt markere en fil rapportklar og vælge projektcentroid som dens placering. Det flow har en anden kvalitetskontrakt end FØR-intake. Rapportpreviewets readiness får bonus for `isReportReady` og enhver koordinat. Kvalitetsstatus skal derfor konsolideres, så en manuel mediemarkering ikke kommer til at ligne godkendt droneverifikation. [16–17]

## Rapport: eksport og godkendelse er ikke samme produkt

| Funktion | Faktisk adfærd i koden | Manglende forbindelse |
|---|---|---|
| Projektets “Generér rapport” | `documents-service` laver en rigtig jsPDF med projekt, sites, indikatorer og handlinger. `reportType` ændrer metadata/titel, ikke det faglige datagrundlag. Browseren henter blobben. | Ingen dronebilleder, kildeperioder, reviewerbeslutninger, offentlig baseline, manifest eller methodsnapshot i input. |
| “Gemt på projektet” | Indsætter metadata i `documents`, altid `version: 1`, med filnavn/størrelse. | PDF-blobben uploades ikke til Storage; ingen `storage_path` eller PDF-hash sættes. `DocumentList` viser kun download, hvis en path eksisterer. En databasepost er derfor ikke en arkiveret PDF. |
| Reportservice | `approveReport`, `submitReportForReview` og `exportReport` opdaterer kun status på `reports` og skriver audit. | Ingen kobling til den genererede blob, en bestemt inputversion, reviewerens faglige kriterier eller et immutable snapshot. `createReport` har ikke projekt-ID i input/insert. |
| Rapportbygger og preview | Valg ligger lokalt i React-state. Preview viser hardcodet Skallebæk, 82 % klarhed, KPI'er, personer og kommentarer. | Valgene er ikke et gemt Bykær-dokument. Previewets PDF-/reviewknapper har ingen handling. |
| Godkendelse og eksport | Checklistens flags er lokal state; eksportknappen kalder `setExported(e.key)` og skifter tekst til “Klar til download”. | Ingen filgenerering/download eller persisteret godkendelse. Checklistens `allOk` blokerer ikke eksportknappen. |

Kilder: [18–22]. Rapportmotorens generiske tekst kan desuden sige “ingen signifikante tendenser” eller “ingen identificerede risici”, når de få indikatorer/handlinger ikke udløser reglerne. Der er ingen statistisk signifikansberegning eller fuldstændig risikoundersøgelse bag disse fallbacktekster. De bør omtale datagrundlagets mangler direkte. [17]

## Foreslået første samlede programleverance

1. **Lås et stedgrundlag.** Bekræftet reach/AOI, kildeversioner, dataperiode, spatial dækning, licens, faktisk metode og synlige fejl. Brug målt, estimeret, preview og manglende som forskellige tilstande. Et fejlet raster må ikke producere et kommunalt NDVI-fund.
2. **Lav verifikationspunkter ud fra stedgrundlaget.** Hvert punkt får kilde-/indikations-ID, spørgsmål, prioritet og krav til foto/feltmåling. Offentlige artsforekomster bliver kontekst, ikke en art i billedet.
3. **Forbind upload til et survey og betroet behandling.** P0 er batch-upload af originale JPEG, TUS-resume og særskilte afledte thumbnails; ZIP-import er sekundært scope. Servergenudtræk af originale bytes/hash, metadata og timezone-status; canonical aktiv, synlig jobstatus, retry og review. Kortlag skelner kamera, observeret objekt og kontrolleret footprint.
4. **Gem en faglig reviewbeslutning.** Understøttet, afkræftet eller uafklaret med reviewer, tid, evidens og metode. Et FØR-snapshot kan færdiggøres før AFTER eksisterer. Visuel fotogentagelse kan bruges uden at love pixelbaseret måling.
5. **Generér og godkend én version.** PDF/DOCX og datapakke fra samme låste input; gem faktiske filer privat, checksum og manifest; download efter reload. Godkendelsen refererer til denne version. Regenerering giver ny version og ændrer ikke det godkendte dokument.

Mødedemoen den **10. november 2026** skal være ét konkret Bykær-forløb gennem alle fem trin. Et succesfuldt upload, grønt readiness-tal eller status `exported` må ikke alene tælle som afsluttet kommunal leverance. Hovedauditens read-only produktionsoptælling 13.10.2026 fandt ingen uploads/droneposter, fire reports (tre approved, én draft) og ét documents-dokument; antal og status er ikke accept af den ovenstående rapportrejse. `REPORT-P0-01`, `BA-P0-01` og metodekontrakten understøtter allerede retningen; de skal omsættes til faktisk bundet funktionalitet. [2, 23]

## Kildereferencer på auditeret SHA

Alle kodehenvisninger er læst fra `https://github.com/JESRI-C/freyra-hub/blob/97782c0986d13971fd684240662a79eb70296db6/`:

1. `docs/EXECUTION_STATE.md` — seneste checkpoint og aktive blokeringer.
2. `docs/P0_BACKLOG.md` — især GEO-P0-02, BA-P0-01 og REPORT-P0-01.
3. `src/services/projects-service.ts:77` og `:276` — create og starter-seed.
4. `src/routes/app.projects.$slug.tsx:171` og `:1014` — view-fetch og FØR-gate.
5. `src/hooks/useNdvi.ts:14`; `src/components/project/NdviCard.tsx:12`.
6. `src/services/satellite/sentinel-service.ts:155`; `src/services/satellite/ndvi-band-math.ts:82` og `:145`.
7. `src/services/satellite/ndvi-engine.ts:67` — metric/indicator-persistens.
8. `src/services/live-data/connectors/copernicus-client.ts`.
9. `src/services/connector-service.ts:123` og `:393`.
10. `src/services/live-data/connectors/dmi-client.ts:73`.
11. `src/lib/environmental.functions.ts:115`, `:312` og `:363`.
12. `src/components/monitoring/DroneBeforeBatchWizard.tsx:213`.
13. `src/services/monitoring/uploads-service.ts` — intent/TUS/finalize/download.
14. `src/services/monitoring/drone-upload-map-service.ts:207`.
15. `src/services/monitoring/drone-service.ts`.
16. `src/components/project-workspace/ProjectMediaUploadPanel.tsx:107`; `src/services/project-media-service.ts`.
17. `src/lib/report-engine.ts`.
18. `src/services/documents-service.ts:50` og `:151`.
19. `src/components/documents/GenerateReportDialog.tsx:27`; `src/components/documents/DocumentList.tsx:52`.
20. `src/services/reports-service.ts`; `src/lib/supabase/queries.ts:550`.
21. `src/routes/app.reports.builder.tsx`; `src/routes/app.reports.new.tsx`; `src/routes/app.reports.preview.tsx`.
22. `src/routes/app.reports.approval.tsx:30`, `:161` og `:296`.
23. `docs/4dm-watercourse-monitoring-method.md`.
