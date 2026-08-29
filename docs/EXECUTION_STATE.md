# GoFreyra execution state

Opdateret: 2026-08-29, første manuelle P0-cyklus.

## Seneste verificerede checkpoint

- Repository/remote: `JESRI-C/freyra-hub`; branch `codex/gofreyra-p0`.
- Baseline HEAD: `03dca07`, samme commit som `origin/main` ved cyklusstart.
- Faktisk stack og centrale auth-, API-, migrations-, kort-, upload-, Før/Efter-, målings-, kilde- og rapportveje er statisk auditeret.
- Runtime er fastlåst til Node `>=22 <23` og npm 10.9.2; frisk `npm ci` består med den synkroniserede lockfil.
- `npm run typecheck`: exit 0 efter alle ændringer.
- Målrettet lint på alle ændrede TypeScript-filer: exit 0. Global `npm run lint`: exit 1 med 5.453 fund (5.428 errors, 25 warnings), hovedsageligt eksisterende Prettier-gæld.
- Målrettede endpoint-/ledger-tests: 27/27 består. Hele Vitest-suiten: 27 filer og 193/193 tests består.
- `npm run build`: exit 0. Buildscriptet giver Node 4 GB heap; Windows-dev springer den fejlende Lovable MCP-routegenerator over, mens de versionsstyrede MCP-ruter bevares.
- Browser-smoke: `/` sender til `/login`, loginformularen renderes, og der er ingen browserfejl. En advarsel om flere GoTrue-klienter under samme storage key er registreret.
- Begge sikrede endpoints returnerer 503 før databaseadgang, når deres nye dedikerede secrets mangler.
- Verificerede checkpoints: `61bf18b` (runtime/npm/ledger), `106c825` (endpoint-sikkerhed/env/cutover) og `142b9f4` (P0-styringsbaseline). Featurebranchen er pushet til `origin/codex/gofreyra-p0`. Ingen PR, merge, deploy eller produktionsændring er udført.
- Samme-chat-automationen `gofreyra-p0-90-min-cyklus` er aktiv og fortsætter hver 90. minut med én afgrænset P0-opgave, de dokumenterede gates og automatisk stop/pause efter bestået P0.

## Aktiv højeste opgave

`SEC-P0-01B`: autorisér og afgræns resterende privilegerede projektflows. `SEC-P0-01A` har lukket observations- og monitoring-endpoints, men natur-serverfunktionen og projektscope for eksternt ingest er endnu ikke færdigverificeret.

## Aktive blokeringer

1. Natur-geodata serverfunktionen har ikke verificeret brugerautentifikation/tenantautorisation før mulig service-role-persistens; et globalt ingest-secret er heller ikke projektspecifikt scope.
2. Migrationshistorikken indeholder legacy åbne policies, og `project_members` tillader self-insert uden at begrænse rolle. Effektiv live RLS er ikke kendt.
3. Supabase-connectoren har ikke adgang til den konfigurerede instans `ikrmcetjutqcjtwfhzfv`; live schema, Storage, secret-provisionering og to-tenant-tests er blokeret.
4. Der er to Supabase GoTrue-klienter under samme storage key; browseren advarer om mulig udefineret adfærd.
5. Global lint er rød, og npm audit rapporterer 17 advisories (2 low, 5 moderate, 10 high). Buildet består, men store chunks og bundler-advarsler mangler triage.
6. Endeligt Haderslev/Skallebæk-projektnavn og reelt P0-datasæt er **AFVENTER** projektmaster.

## Næste handlinger

1. Lad næste 90-minutters arbejdscyklus fortsætte med `SEC-P0-01B`; provisionering af to stærke, uafhængige server-secrets og rotation af eventuelle historiske credentials kræver fortsat miljøejerens bekræftelse.
2. Udfør `SEC-P0-01B`: beskyt naturpersistens og giv eksternt ingest eksplicit projekt-/tenant-scope.
3. Få Supabase dev/test-adgang og udfør RLS-policyinventar samt negativ test med to organisationer.
4. Konsolidér GoTrue-klientlaget, og fortsæt derefter med næste ublokerede opgave i `P0_BACKLOG.md`.

## Genoptagelseskontrol

Læs dette dokument, backlog, QA-matrix, beslutninger og seneste run-log. Kør derefter `git status --short --branch`, kontrollér at eksisterende ændringer tilhører den aktive cyklus, og overskriv dem ikke. Der må ikke startes P1/P2, commit/push eller ekstern handling uden opfyldt gate og mandat.
