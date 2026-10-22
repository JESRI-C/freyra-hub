# Freyra — Haderslev 27.10.2026

[Aktuel plan](docs/HADERSLEV_PLAN_2026-11-10.md) · [15-minutters mødemanuskript og go/no-go](docs/HADERSLEV_DEMO_2710.md)

Arbejde på `codex/haderslev-demo-2710`, PR mod `codex/haderslev-delivery`. Ingen merge til main eller skift til produktion.

## Kommunens brugerflade

Sæt `VITE_DEMO_MODE=true` i ignoreret `.env.staging` **før build**. Koden eksponerer flaget som `DEMO_MODE`. Sagen samles i Billeder → Datagrundlag → Gennemgang → Beplantning → Rapport og aflevering. Irrelevante moduler skjules også ved direkte navigation. Flaget ændrer ingen adgangsrettigheder og må ikke forveksles med `VITE_APP_DATA_MODE=demo`: kommunens sag bruger altid faktiske data og RLS.

Automatisk billed-AI er ikke frigivet til kommunal brug og ligger i roadmap. Med `DEMO_MODE=true` oprettes datagrundlag, runde og fototilknytninger uden modelkald; start/genforsøg til AI vises ikke. Sammenhold originaler og offentlige kilder manuelt i **Gennemgang**. Gemte AI-resultater, deres begrænsninger og faglige beslutninger bevares. Prøven af de seks originaler gav fire gyldige kvalitetsafvisninger og to ugyldige svar: ingen brugbare AI-observationer. Uden demoflaget bevares det eksisterende automatiske flow med afgrænset genforsøg og gemt fallback.

Nye rapporter bruger generatoren `municipal-evidence-report/v3`, som viser gemte AI-kategorier med faste danske formuleringer. Oprindelig AI-JSON og proveniens bevares. Historiske rapporter fra v1/v2 genåbnes uændret; generatorens version er adskilt fra sagens løbende rapportnummer. Den nye kombination af DEMO-forløb og rapportgenerator skal browserprøves på den valgte release. [Kontrolnotatet](docs/HADERSLEV_KONTROL_2026-10-22.md) angiver, hvilken tidligere release der faktisk er prøvet.

```powershell
npm ci
npm run typecheck
npm run lint
npm test -- --maxWorkers=1 --no-file-parallelism
node scripts/verify-staging-env.mjs --require-municipal-demo
$env:CLOUDFLARE_ENV = 'staging'
npm run build:staging
node scripts/verify-staging-env.mjs --require-municipal-demo --check-bundle
```

## Idempotent sag og originaler

Originalfotos ligger ikke i Git. Scriptet kræver en lokal mappe og ændrer ingen originaler. Alle seks filer kontrolleres **før nogen skrivning**: kamera, lokal EXIF-dato, EXIF/XMP-GPS, faktiske JPEG-pixelmål mod EXIF og seks forskellige SHA-256. Nedskalerede rapportbilleder afvises.

```powershell
# Lokal kontrol uden upload:
npm run seed:haderslev -- "D:/originaler/Bykaer"
# Anvend på den udtrykkeligt valgte stagingarbejdsplads:
node --env-file=.env.staging.local scripts/seed-haderslev-demo.mjs "D:/originaler/Bykaer" --org "ARBEJDSPLADSENS-UUID" --apply
```

Den ignorerede miljøfil skal have `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `HADERSLEV_STAGING_PROJECT_REF=xdvqdzdpyceojbdknofi`, `HADERSLEV_OPERATOR_EMAIL` og `HADERSLEV_OPERATOR_PASSWORD`. Brug en operator med skriverettighed til arbejdspladsen. Ingen nøgler/adgangskoder i kommandolinjen eller Git. Produktion må ikke vælges.

Punktkortet er P02→DJI_0040.JPG, P06→DJI_0060.JPG, P11→DJI_0103.JPG, P14→DJI_0123.JPG, P17→DJI_0135.JPG og P20→DJI_0149.JPG. Ved omdøbte filer bruges `--points sti/points.json` med samme seks punktnøgler og relative JPEG-stier. Stier uden for originalmappen afvises. Datoen er 24.08.2026, kameraet DJI FC3411.

Sagens ID bestemmes af arbejdspladsen. Upload-ID bestemmes af sag, bruger, fotopunkt og filhash. Genkørsel med samme operator/originaler genbruger dem; ændrede originaler overskriver ikke tidligere evidens. Alle seks originaler genhentes og hashes efter upload. Kvittering: ignoreret `tmp/haderslev-seed.json` eller `--output`.

Åbn sagen → Billeder → **Kontrollér og åbn de gemte originaler**. Dette kører den normale servervalidering og tilknytning. Fortsæt til Datagrundlag → Billedgruppe → **Alle seriens fotopunkter — 6 fotos**. Billederne ligger i to GPS-grupper; det samlede valg er eksplicit og begrænset til 5 km diagonal og 10 km². Vælg den entydige officielle Bykær Bæk-reference, bekræft 24.08.2026 og kontrollér **6 af seriens 6 fotos** før gemning. Søgeområdet beregnes fra de faktiske GPS-positioner; det er ikke en godkendt kommunal strækning eller et billedfootprint. A–E og faglige beslutninger opfindes ikke af seedet.

## Kommunal læser og rigtige brugere

Rollen genbruger `viewer`: organisationsmedlemskab `viewer` giver ikke adgang til alle organisationens sager; hver aftalt sag kræver et særskilt `project_members`-medlemskab med `viewer`. Org-owner/admin har bredere adgang og må ikke bruges som kommunens læsekonto. RLS gælder også ved direkte API-kald.

1. Opret den rigtige bruger i **stagingprojektets Supabase Auth** med aftalt e-mail og sikker aktivering. Brug en separat kommunekonto, hvis en eksisterende medarbejder allerede har bredere rettigheder.
2. Sæt `SUPABASE_SERVICE_ROLE_KEY` i en ignoreret lokal miljøfil uden `VITE_`-prefix. Kør scriptet fra et betroet administratormiljø. Scriptet sender ingen invitation.
3. Gentag sagsmedlemskab pr. faktisk aftalt sag. Test normalt login, egne rapporter og fremmed sag. Projekt-, foto-, vurderings- og rapportskrivninger skal afvises. Genprøv efter genindlæsning og ophævet medlemskab.

```powershell
node --env-file=.env.staging.local scripts/provision-municipal-reader.mjs --project "SAGENS-UUID" --email "kommunens-aftalte-adresse" --output tmp/private-haderslev/kommune.json
# Særskilt testkonto. Ingen e-mail sendes. Tilfældig kode gemmes kun lokalt:
node --env-file=.env.staging.local scripts/provision-municipal-reader.mjs --project "SAGENS-UUID" --email "haderslev-laeseproeve@freyra.invalid" --test
```

Scriptet kræver eksakt stagingmål og genlæser roller. Ny testkonto prøves med en almindelig brugerklient: præcis tildelt sag synlig, skrivning afvist. Private kvitteringer og adgangskoder må ikke deles i PR eller mødemateriale. En `.invalid`-konto er kun til teknisk prøve; kommunen skal have egne reelle brugere med fungerende aktivering.

## Browserprøve med Playwright

`npm run test:e2e` bruger rigtige uploads, kilder og browserdownloads uden mocks. Kræver den nye stagingbuild med `VITE_DEMO_MODE=true`, migrationerne og serverbindingerne. Prøven opretter en separat `TEKNISK E2E`-sag, uploader P02-originalen, kræver en entydig Bykær-reference, kontrollerer nul AI-forsøg, registrerer en tydeligt teknisk **afvisning** ved manuel gennemgang og kontrollerer PDF samt alle ZIP-filhashes. Den udgiver ingen faglig godkendelse; testsagen bevares til inspektion.

```powershell
npx playwright install chromium
# Alternativt kan allerede installeret Edge bruges på Windows:
# $env:HADERSLEV_E2E_BROWSER_CHANNEL = 'msedge'
# Indlæs nedenstående miljøvariabler i processen fra jeres sikre lokale opsætning.
npm run test:e2e
```

Kræver `HADERSLEV_E2E_BASE_URL` (localhost eller navngiven staging-Worker), `HADERSLEV_E2E_ORG_ID`, `HADERSLEV_ORIGINALS_DIR` samt operator-/Supabase-variablerne ovenfor. Manglende opsætning fejler, ikke et grønt skip. Downloads og screenshots gemmes under ignoreret `tmp/`; trace er slået fra af hensyn til private originaler/tokens. Gentag på endelig release og supplér med kommunens læselogin.

## Drift

Servernøgler, herunder `SUPABASE_SERVICE_ROLE_KEY` og `DATAFORDELER_API_KEY`, holdes i staging-Workerens secrets. Datafordeler-nøglen bruges til ortofoto, skov og Matriklen2. De nu tilsluttede DMI-, Sentinel- og GEUS-jordartskilder kræver ingen ny nøgle. Manglende kildeadgang vises som datamangel. Der må ikke lægges hemmelige nøgler i browservariabler.

[Kildeoversigten](docs/HADERSLEV_KILDER_2710.md) beskriver de faktiske geometrier, frosne billedpixels, hentedatoer, tidsgrænser og præcise mangler. Nye Sentinel-versioner gemmer det valgte billede, når hentningen lykkes; ældre versioner med kun en billed-URL er tydeligt markeret som netafhængige. DMI viser stationsnedbør, herunder periodens sidste dato, men ingen temperatur eller vind. DHM er fortsat filmetadata. De nye adapteres formatprøver er ikke live-accept af den samlede sag med seks fotos.

Backup/genopretning, varig stagingdrift, fejlalarm og faglig accept af det viste grundlag og dets mangler er særskilte go/no-go-krav i manuskriptet. Ukendte A–E-hektar er accepteret, indtil en faglig afgrænsning foreligger; geometrier og tal må ikke opfindes.
