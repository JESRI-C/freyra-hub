# H03: afhængigheder og sikkerhed

Dato: 13. oktober 2026. Scope: appens npm-lock, installerede afhængighedsveje og konkrete inputflader. Dette er en triage af sikkerhedsrisiko; den erstatter ikke kontrol af det faktisk deployede miljø.

## Auditgrundlag og status

| Snapshot | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| September, tidligere notat i `docs/EXECUTION_STATE.md` | 0 | 10 | 5 | 2 | 17 |
| 13. oktober, før rettelser | 3 | 21 | 11 | 7 | 42 |
| Efter Seroval, proxy-addr og shell-quote | 0 | 21 | 11 | 7 | 39 |
| Efter officiel SheetJS 0.20.3 | 0 | 20 | 11 | 7 | 38 |

Før-snapshot: `tmp/haderslev-npm-audit.json`, filtid 13. oktober 2026 kl. 11:57:05 Europe/Copenhagen. SHA-256: `2b417992f7ffd8bfd4d0d36cd3472f27630c2a27b7a216b2e209f0fb3291cd08`. Efter-snapshot: `tmp/haderslev-npm-audit-after.json`; de to eftermålinger og deres checks er rapporteret af root-agenten. Septembertallet er et historisk notat, ikke en genkørt sammenligning med samme advisorydatabase.

Tallene er npm's antal sårbare **pakkeentries**, inklusive forældre markeret gennem transitive afhængigheder. Før-snapshot indeholder 71 forskellige advisory-URL'er i `via`; 42 er derfor ikke 42 selvstændige CVE'er eller dokumenterede angrebsveje. Nye advisories og ændrede lockversioner kan begge påvirke sammenligningen. Efter rettelserne er der fortsat **38 fund**; audit er ikke lukket.

## P0: konkrete kundesurfaces

### Seroval: serverfunktioners deserialisering

Før: `seroval@1.5.4` gennem `@tanstack/router-core`, `@tanstack/start-server-core` og `@tanstack/start-client-core`. Det installerede `start-server-core/dist/esm/server-functions-handler.js` kalder `fromJSON` på request-JSON, GET-payload og serialiseret FormData-context **før** `action(...)`. Appens autentificering og inputvalidatorer for serverfunktionen ligger inde i den efterfølgende action; `src/start.ts` har ingen generel adgangskontrol før deserialisering.

En lille Seroval-payload kan udløse stor TypedArray-allokering og CPU-/hukommelsesudmattelse. En anden advisory beskriver utilsigtet kald af plugin-producerede funktioner gennem Promise-deserialisering; kodeudførelse i netop denne app er ikke demonstreret. P0-prioriteten er allerede begrundet af den konkrete DoS-flade. [TypedArray-advisory og patch 1.6.3](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-jp82-f5mq-hwhp), [Promise-advisory](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-p6vx-979v-rg4c).

Rettelse: root har installeret præcis override `seroval: "1.6.3"`. Dette er inden for TanStack-pakkernes `^1.5.4` og `seroval-plugins`' peer `^1.0`. Root rapporterer ren install, typecheck, målrettede tests og build PASS. Det aktuelle npm-snapshot markerer ikke længere Seroval som sårbar. En regressionskontrol af rå framework-ingress med en lille ugyldig TypedArray-node vil give stærkere evidens end tests, der kun kalder appens handler direkte; ingen stor allokering eller angreb mod live miljø er udført i denne triage.

### SheetJS: Excelimport fra brugerfiler

Før: direkte `xlsx@0.18.5`. `UploadWizard.tsx` kalder `parseExcel` i `upload-import-service.ts`, som læser brugerfilen og kalder `XLSX.read`. Den eksisterende CSV-previewgrænse beskytter ikke Excelparseren. Fladen er brugerens browserimport; der er ikke påvist automatisk serverkodeudførelse. Excelimport med den gamle parser var P0 før kundebrug.

Leverandøren angiver prototype pollution ved læsning af særligt udformede filer indtil 0.19.2 og ReDoS indtil 0.20.1. npm's `fixAvailable: false` betyder her, at npm-registryens gamle `xlsx`-distribution ikke tilbyder rettelsen. Den officielle distribution har en rettelse. [SheetJS prototype pollution](https://cdn.sheetjs.com/advisories/CVE-2023-30533), [SheetJS ReDoS](https://cdn.sheetjs.com/advisories/CVE-2024-22363), [officiel installation og vendoring](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

Rettelse: root har vendoreret `vendor/xlsx-0.20.3.tgz` fra `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` og ændret pakkespecifikationen til `file:vendor/xlsx-0.20.3.tgz`. SHA-256 er `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`. `vendor/README.md` dokumenterer kilde og integritet; lockfilen fastholder npm-integritet. Rettelsen er kommitteret som `20964e9`.

Root rapporterer to integrationstests med rigtige XLS/XLSX-buffere PASS; de fandt og rettede håndtering af danske kolonneoverskrifter. Ren install, typecheck, build og den fulde suite 79 filer/764 tests bestod efter vendoropgraderingen. Checksums dokumenterer de valgte downloadbytes og reproducerbar installation; de er ikke en uafhængig leverandørsignatur. Versionen løser de to identificerede advisories, men dokumenterer ikke generel modstandsdygtighed mod store eller komprimerede arbejdsbøger. Før batchimport bør der også være en selvstændig parser-/ressourcegrænse.

## P1: prioriterede betingede fund

| Pakke og installeret vej før rettelser | Exploitbetingelse og faktisk brug | Minimum / status |
| --- | --- | --- |
| `proxy-addr@2.0.7` via MCP SDK → Express 5.2.1 | IP-tillid kan blive for bred ved bestemte IPv4-mapped IPv6-prefixer. Appen bruger WebStandard MCP-servertransport; ingen Express `trust proxy`-konfiguration eller IP-baseret adgangskontrol fundet. Ingen konkret kundebypass påvist. | Root har installeret override **2.0.8**, tilladt af Express `^2.0.7`. |
| `shell-quote@1.9.0` via Lovable devconfig → launch-editor 2.14.1 | Shellinjektion kræver `quote()` med comment-token og efterfølgende linjeskift samt shell-eksekvering. Observeret launch-editor bruger `parse()` på editorkonfiguration; ikke en kunderapport-/uploadsti. | Root har installeret override **1.11.0**, tilladt af launch-editor `^1.8.4`. npm's før-snapshot kalder fundet critical; leverandørens aktuelle advisory kalder det high. |
| `@modelcontextprotocol/sdk@1.28.0` via `@lovable.dev/mcp-js@0.20.1` | OAuth-klient kan sende eksisterende credentials til en servervalgt issuer. Vores adapter importerer SDK-servermoduler og WebStandard-servertransport. Ingen outbound OAuth-client fundet; leverandøren undtager eksplicit MCP-serverbrug. | **1.31.0** er patch. Lovable pinner **1.28.0**, og npm viser `fixAvailable: false`. Et scoped override eller leverandøropgradering skal kompatibilitetstestes; ingen sådan ændring er gennemført her. |

Kilder: [proxy-addr advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [shell-quote advisory](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv), [MCP SDK advisory og klientbetingelser](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h).

MCP-klientbrug i fremtidige integrationer ændrer prioriteten: patched SDK er ikke alene nok for gamle credentials uden issuer eller bundled providers uden forventet issuer. Den konkrete leverandørvejledning skal følges før en sådan klient aktiveres. Den nuværende P1-vurdering er afgrænset til observeret serverbrug.

## Øvrige high-entries: tooling og kompatibilitet

Følgende versioner er minimumskandidater for advisories i det undersøgte snapshot, ikke en påstand om at de er installeret eller testet i denne ændring. Ingen konkret kundeinputsti til en yderligere P0 blev fundet. Npm's prod/dev-flag afgør ikke alene deployment: flere build-/emulatorværktøjer er deklareret som `dependencies`.

| Pakke før rettelser | Minimumskandidat | Observeret scope / begrænsning |
| --- | --- | --- |
| Vite 7.3.3 | **7.3.5** | Windows dev-server: filadgangs-/editorproblemer. Eksisterende `^7.3.1` tillader patch. Eksponeret dev-server øger prioriteten; det er ikke det færdige Worker-build. [Vendor](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff). |
| PostCSS 8.5.14 | **8.5.23** | Build; kildekort-filreads kræver angriberstyret CSS. [Vendor](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp). |
| source-map-js 1.2.1 | **1.2.2** | Build-kildekort; tilladt af observerede PostCSS/Tailwind-ranges. [Release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2). |
| fast-uri 3.1.6 | **3.1.8** | AJV i MCP SDK; ingen app-hostallowlist bygget på denne parser fundet. [Release](https://github.com/fastify/fast-uri/releases/tag/v3.1.8). |
| js-yaml 4.1.1 | **4.3.2** | ESLint/xmlbuilder2; ingen kundestyret YAML-parser fundet. [Vendor](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh). |
| Browserslist 4.28.2 | **4.28.7** | Babel/build-konfiguration. [Vendor](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx). |
| nanoid 3.3.12 | **3.3.18** | PostCSS non-secure-generator bruger observeret konstant størrelse 6; advisoryens ugyldige størrelser er ikke nået af dette kald. [Release](https://github.com/ai/nanoid/releases/tag/3.3.18). |
| brace-expansion 1.1.14 / 5.0.6 | **1.1.21 / 5.0.12** | ESLint-/glob-tooling; bevar separate major-versioner. Minimum udledt af alle ranges i audit-snapshot; install ikke testet. |
| braces 3.0.3 via chokidar 3.6.0 | **Ingen bekræftet patch** | TanStack router-plugin bruger chokidar i rspack/webpack-watchhooks; denne app bruger Vite. Npm `fixAvailable: true` er en forældresti, ikke bevis på en braces-patch. [Upstream issue](https://github.com/micromatch/braces/issues/70). |
| Undici 7.24.8 / 7.28.0 | **7.29.1** | Cheerio/build og Miniflare. Miniflare pinner versioner; parentopgradering eller testet override kræves. Node 22's indbyggede fetch og Cloudflare fetch er særskilte runtimes og dækkes ikke automatisk af en npm-override. [Release](https://github.com/nodejs/undici/releases/tag/v7.29.1). |
| ws 8.18.0 | **8.21.0** | Cloudflare Vite-plugin/Miniflare pinner 8.18.0; andre eksisterende 8.21.0-kopier er ikke berørt. [Vendor](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p). |
| sharp 0.34.5 / 0.35.2 | **0.35.5 stable**, kandidat | Optional billedbehandling i Miniflare. Native biblioteker og platformpakker skal opdateres samlet; kundens nye JPEG-validering bruger ikke sharp. Minimum fra audit-ranges; installation og native kompatibilitet ikke testet. |

Meta-entries for `@tanstack/react-start`, `react-start-rsc`, `router-plugin`, `start-plugin-core` og `miniflare` arver flere af disse fund. De er ikke fem nye selvstændige angrebsbeviser. De installerede Cloudflare-/Nitro-veje omfatter to Miniflare-kopier; kontrollér begge efter en opgradering.

Npm foreslår for dele af emulatorstien Nitro `3.0.260903-beta` med `isSemVerMajor: true`, mens projektet pinner `3.0.260603-beta`. Dette er ikke en minimal verificeret kompatibel rettelse. Undgå `npm audit fix --force` som blanketløsning. Tving ikke chokidar 4 ind under et chokidar 3-kontrakt: version 4 fjerner glob-support, og forældren skal opgraderes eller tilpasses. [Chokidar migrationsvejledning](https://github.com/paulmillr/chokidar#upgrading).

## Prioriteret lukning og releaseaccept

1. **P0 gennemført i kode:** Seroval 1.6.3 og officiel vendoreret SheetJS 0.20.3. Bevar præcise overrides, vendorchecksum og lockintegritet. Kunde-Excelimport kræver den nye parser, ikke den gamle registryversion.
2. **P1 gennemført i lock:** proxy-addr 2.0.8 og shell-quote 1.11.0. Der er fortsat ingen påvist udnyttelse i kundestien.
3. **P1 næste afgrænsede dependency-slice:** kompatible patchopgraderinger af buildpakker, derefter separat Cloudflare/Miniflare/Nitro- og MCP-leverandørvurdering. Ingen bred framework-/nativeopgradering er valideret i denne triage.
4. **Accept før næste kunderelease:** arkivér fresh audit mod præcis commit/lock; vis resterende fund og begrundede inputflader; kør ren Linux-install/CI, typecheck, parser-/serverfunktionschecks og staging-build. Verificér at dev-/emulatorservere ikke udgør kundens eksponerede runtime. Build-PASS alene beviser ikke advisorylukning.
5. **Separat H08-acceptpunkt:** den nye private originaldownload har deadline og bytegrænse, men 32 MiB-filer, samtidighed/hukommelse på faktisk Cloudflare-runtime og SQL-replay kræver fortsat runtimeevidens. Dependencyrettelser lukker ikke dette punkt.

Status: De konkrete identificerede P0 dependencyårsager har rettelser med lokale checks rapporteret af root. **38 npm-fund består**, med observerede resterende high-stier hovedsageligt i tooling eller betinget, ikke-aktiveret klientbrug. Hosted/deployed runtimeaccept og den fulde resterende dependencytriage er ikke erklæret afsluttet.
