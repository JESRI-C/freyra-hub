# Freyra: kode- og sikkerhedskontrol

3. november 2026 · S11 · `codex/security-hardening-v1` · [Draft PR42](https://github.com/JESRI-C/freyra-hub/pull/42).

**Resultat:** Kendte kritiske og høje pakkeadvarsler er rettet, private appsvar
har eksplicit cachebeskyttelse, og eksisterende funktioner og rapporthistorik
er bevaret. Der er fortsat konkrete åbne drifts- og værktøjsfund nedenfor.
Dette er en teknisk testleverance, ikke en generel sikkerheds- eller produktionsgodkendelse.

Kildekandidat: `ce2ff55c1c28aa3d2cc3919a0785c33fff511304`.
Staging-Worker: `d912e6bf-d2d6-4a0d-aec1-32370219bd3f`.
[CI 41555566168](https://github.com/JESRI-C/freyra-hub/actions/runs/41555566168)
består på denne kandidat, inklusive ren npm-installation, faktisk lokal
billedafkodning, app-build og den disponible databases fulde gates.
Testadresse: <https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev>.
[Maskinkvittering](security-staging-receipt-2026-11-03.json) indeholder de
faktiske 291 visningsmålinger, roller, originalhash, audit og HTTP-headers
på denne samme kildekandidat. Alle disse prøver består.

## Rettet og bevaret

| Fund | Leveret rettelse |
|---|---|
| Kritisk reflekteret XSS i serverfunktionstransporten | TanStack Start 1.168.60 med start-server-core 1.169.39 og kompatible router-/pluginversioner. Vite 7 bevares; ingen tvungen peer-omgåelse. |
| Sårbar serialisering, validering og MCP-afhængighed | Seroval 1.6.11, Zod 4.6.7 og MCP SDK 1.32.2; relevante transitive pakker opdateret i låsefilen. |
| Billed-/HTTP-/buildafhængigheder med kendte fund | Rettede Sharp-, Undici-, fast-uri-, esbuild-, Vite- og Vitest-versioner. AI provider-utils følger den faktisk krævede 4.0.63-version. |
| Private dynamiske svar manglede eksplicit cachebeskyttelse | `src/lib/application-response.ts` anvendes fra den eksisterende serverindgang, også på fejl. `private, no-store`, `nosniff` og referrer-politik afprøves med faktiske staging-svar. Streams, separate cookies og redirects bevares. Offentlige statiske assets og den neutrale offline-skal genbruges. |
| Pakkehåndtering fejlede internt med det opdaterede træ | Node 22.14.0/npm 11.6.0 er dokumenteret og fastlagt i CI. Låsefilen prøves med ren installation. |
| CI-billedtesten importerede en udeklareret, transitiv Miniflare og fik en inkompatibel beta | Stabil Miniflare 4.20260730.0 deklareres direkte som udviklingsafhængighed. Den eksisterende prøve afkoder virkelige syntetiske PNG-bytes til JPEG via lokal Images-binding. |
| Ny geografiversion ændrede historisk rapportmanifest | Turf-familiens eksisterende 7.3.5-versioner bevares i låsefilen. Den gamle validator gav samme manifest som den rettede; forskellen blev isoleret til geografipakken. Ingen historisk snapshot eller kontrolsum blev omskrevet for at få grønt resultat. |
| Ny frameworkversion kræver serverkontekst i en auth-test | Testen bruger den reelle AsyncLocalStorage-kontekst og den eksisterende middlewarekæde. Auth-kontroller fjernes ikke. Fejlkomponenter håndterer frameworkets `unknown`-fejltype. |

`npm run audit:runtime` er tilføjet som CI-gate og afviser kendte fund fra
laveste severity i runtime-pakketræet. Den fulde audit er fortsat separat og
viser de åbne udviklingsværktøjsfund; de er ikke skjult via allowlist.

## Kontrolgrundlag

| Kontrol | Faktisk bevis |
|---|---|
| Fuld lokal app-/workersuite | 3.449 tests i 260 filer består. Herunder auth, originaler, genforsøg, opgaveaflevering og historisk rapport-replay. |
| Typekontrol | App og isoleret feltfoto-worker består. |
| Lint | Ingen fejl; 24 eksisterende hook-/fast-refresh-advarsler. |
| Beregningskilder | Eksisterende faktorkontrol består. |
| Billedafkodning | 134 syntetiske PNG-bytes → 302 JPEG-bytes, 8 × 4 pixels; ind-/udhash kontrolleres, ingen fjernudbyder. |
| Runtime-audit | 0 kendte sårbarheder efter rettelsen. |
| Fuld npm-audit | Før: 54 poster (6 kritiske, 19 høje, 27 moderate, 2 lave). Efter: 14 moderate poster, alle i udviklingsværktøjernes minimatch-kæde. Antallet omfatter også berørte overordnede pakker, ikke 54 uafhængige fejl. |
| Begrænset secretsøgning | 1.264 tekstfiler i Git undersøgt for konkrete nøgle-/service-role-mønstre; ingen fund. Eksisterende staging-preflight kontrollerer servernøglers faktiske værdier mod browserbundlen. Dette er ikke en fuldstændig secrets- eller historikcertificering. |
| Routebevaring | Den nye generator ændrer sortering, men de 93 routekontrakter og deres parentrelationer er identiske. Den eksisterende genererede kildefil bevares. |
| Visning | Alle 97 aktive indgange genprøvet ved 1280, 390 og 320 pixels. Syv fagprojektafhængige indgange har fortsat kun bevis til projektvalg, jf. tidligere visningskontrol. |
| Faktisk projektforløb | Samme opgave og godkendte afleveringsversion, projektspecifikt kortlink og eksplicit rapportmodtager genprøvet. Originalfilen har fortsat SHA-256 `8343c81af5a4d07b716cf60482c91c5422e7721554eed642f1102e8c2c3be23e`. |
| Roller | Tilbagekaldt ekstern adgang giver `42501` og tom opgaveliste. Anonyme opgave-/projektvisninger kræver login. Ingen roller eller midlertidige grants ændret. |
| Offline og browsercache | Neutral `/felt`-skal genindlæses uden net i isoleret Chrome ved telefonbredde. De 200 cacheposter er neutral skal/offentlige assets; ingen private app-/API-/serverfunktionssvar gemmes i denne prøve. Bundle-mønstersøgning i 206 offentlige filer finder ingen service-role-/secret-nøgler. |
| CI og disponibel database | 3.449 app-tests/260 filer og 1.568 databasekontroller/24 filer består på kandidaten. Frisk migrationsreplay, DB-lint, tre samtidighedsforløb og virkelig dump/restore samt oprydning består. Staging genprøves på samme kandidat; se maskinkvitteringen. |

## Database og Auth: konkrete åbne fund

Staging `xdvqdzdpyceojbdknofi` er inspiceret læsende: 46 migrationer,
PostgreSQL 17.6 og PostGIS 3.3.7. Security Advisor gav seks grupper med i alt
21 konkrete fund. At en gruppe findes er ikke i sig selv
bevis for en omgåelig adgangskontrol.

| Fund | Vurdering og næste konkrete handling |
|---|---|
| `public.spatial_ref_sys` uden RLS; PostGIS i public; tre `st_estimatedextent`-overloads med anon/auth EXECUTE | Objekterne ejes af `supabase_admin`; den tilgængelige postgres-rolle er hverken ejer, superuser, medlem af ejerrollen eller berettiget til at tilbagekalde deres grants. Ingen runtime-brug af `st_estimatedextent` er fundet i appen. Driftsudbyderen skal gennemgå og begrænse eksponering/grants med ejerrettigheder og genprøve eksisterende GIS/RPC'er. Udvidelsen er ikke relocatable; en blind flytning eller RLS-policy er ikke en dokumenteret rettelse. |
| Seks rollehjælpere og tre uploadfunktioner er tilsigtede SECURITY DEFINER-indgange | De eksisterende definitioner er gennemgået for actor, organisations-/projektscope, tom search_path og afvisning af anonyme kald. Rollehjælpere binder den angivne bruger til `auth.uid()`. Uploadkontroller og genforsøgsidentitet bevares. De omskrives ikke til invoker alene for at fjerne en advarsel. |
| Tre private/service-tabeller har RLS uden brugerpolicy | Bevidst deny-all/service-only på backupmetadata, billedinspektionsrequests og oprydningsleases. Der oprettes ingen åben policy for at få en grøn rådgiver. |
| Leaked-password protection er deaktiveret | Afklar planens understøttelse og aktivér i staging-Auth med efterfølgende prøve af afvist lækket password og gyldigt login. Det tilgængelige connector-API eksponerer ikke Auth-konfigurationsændringen. Ingen betalingsplan er ændret. |
| Managed Postgres 17.6 | Forbered understøttet sikkerhedsopgradering, backup-/restorebevis, kontrol af udvidelser/operatorer, aftalt vedligeholdelse og efterfølgende replay-/GIS-/rolleprøve. Leverandørens 17.11-notat beskriver sikkerhedsrettelser; ingen hosted engine-opgradering er udført her. |

Driftsudbyderens arbejdsordre er dermed konkret: undersøg de tre navngivne
PostGIS-funktioners grants, metadata-tabellens brugerprivilegier og API-scope;
bevar GIS-funktioner/data; genkør Security Advisor og de faktiske rolle-/GIS-prøver.
Den skal udføres med udvidelsesejerens rettigheder. Der er ikke sendt en besked.

Performance Advisor fandt 127 ikke-indekserede foreign keys, 46 RLS-initplan-
advarsler, 65 ubrugte indeks, 20 multipolicy-fund og to dublerede indeks.
De er særskilte ydelsesopgaver og er ikke løst ved blind indeks-/policyoprydning.

Logkontrollen fandt seks 500-svar fra `finalize_field_photo_upload` og præcis
seks `P0002` fra funktionens objektopslag. Den eksisterende klient bruger
udtrykkeligt dette missing-object-svar før TUS-overførsel og håndterer det med
genforsøg; en tilladelses- eller bindingsfejl giver ikke tilladelse til genupload.
Kontrakten og de tilhørende tests bevares. En fremtidig kompatibel HTTP-kontrakt
bør skelne denne ventetilstand fra driftsfejl i overvågningen. Der gives ikke
et misvisende generelt nul-fejl-resultat for loggene.

## Resterende arbejde og afgrænsning

1. Luk de navngivne PostGIS-/Auth-/engine-opgaver med relevante driftsrettigheder.
2. Flyt udviklingsværktøjerne til en understøttet, kompatibel lintkæde, som bruger
   rettet minimatch. Fundet kræver angriberstyrede globmønstre; de berørte pakker
   er `dev: true` i låsefilen. Version 11 har en anden API end legacy-version 3,
   så et globalt override ville bryde ESLint. Dette er en åben opgave, ikke en accept.
3. Fortsæt planens eksisterende S04-fagkrav og S05-rapportbinding efter denne
   sikkerhedsleverance. Fuld Skyhost-paritet, fagprojekternes komplette datavisning,
   fysisk telefon og faglig/brugeraccept er fortsat åbne.

Eksisterende filer, medlemskaber, originaler, versionshistorik og gamle links
er bevaret. Brugerens ændringer i `JOBS_GEOTAG_KRAVMATRIX.md` og
`JOBS_GEOTAG_TESTLEVERING.md` er bytekontrolleret og holdt uden for commits.
Ingen hosted DDL, produktionsændring, merge, beskedafsendelse eller betalt
provideraktivering er gennemført i denne leverance.

## Primære kilder

- [TanStack XSS og rettede versioner](https://github.com/advisories/GHSA-qx66-fv34-fjm8).
- [Minimatchs globmønster-forstærkning](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- [PostgreSQL 17.11: leverandørens opgraderingsnotat](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- [HTTP-cachekontrol](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) og [Workers-svarheaders](https://developers.cloudflare.com/workers/examples/alter-headers/).
