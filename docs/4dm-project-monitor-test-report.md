# 4DM Project Monitor — teststrategi og løbende rapport

Status: første 4DM-checkpoint, 2026-08-31. Resultater opdateres efter hver vertikal slice. Dette er ikke en P0-godkendelse.

## Verificeret baseline

| Gate             | Observeret resultat                                        | Status                           |
| ---------------- | ---------------------------------------------------------- | -------------------------------- |
| Node/npm         | Node 22.14, npm 10.9.2, kanonisk npm-lock                  | Verificeret tidligere checkpoint |
| Ren installation | `npm ci`, 823 pakker                                       | Verificeret tidligere checkpoint |
| TypeScript       | `npm run typecheck`, exit 0                                | Verificeret efter 4DM-slice      |
| Ændret lint      | 0 fejl, 2 kendte Fast Refresh-warnings                     | Verificeret efter 4DM-slice      |
| Global lint      | 5.407 errors, 25 warnings ved seneste fulde kørsel         | Releasegate fejlet               |
| Unit/service     | 8 målrettede filer: 68/68; ren solo-fuldkørsel: 308/308    | Verificeret efter 4DM-slice      |
| Build            | `npm run build`, exit 0                                    | Verificeret efter 4DM-slice      |
| Browser-E2E      | Ingen Playwright/Cypress-harness; lokal URL policyblokeret | **AFVENTER**                     |
| RLS/Storage      | Ingen live to-tenant-test                                  | **AFVENTER**, deploy NO-GO       |

## Observeret slice: canonical projektgrænse

Kørt lokalt på branch `codex/gofreyra-p0` med baseline `0f2afbd`:

| Område       | Observeret evidens                                                                                                                                                             | Resultat                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Geometri     | Lukning, range, unikke/nabopunkter, selvskæring, nulareal, huller, hul-topologi, areal/centroid, 500-vertex-grænse og unsupported typer                                        | Bestået i målrettet suite       |
| Import       | Feature/Polygon, forkert/malformed JSON, 2 MiB pre-read-grænse og ingen delvis skrivning                                                                                       | Bestået i målrettet suite       |
| Persistence  | Canonical payload, afledte felter, clear uden seed-genoplivning, DB-row readback, fejloversættelse og samtidige writes i samme hook                                            | Bestået i målrettet suite       |
| Edit-state   | Ugemte edits blokerer tegning, upload, clear, projektskift og canonical download, mens Gem/Annuller er tilgængelige                                                            | Bestået i målrettet suite       |
| Eksport      | Boundary erstatter legacy-geometri; seks GeoJSON-geometrityper dybdevalideres; project truth, malformed data, preview/RPC-fejl og ≥200 observationsfeatures afvises            | Bestået i målrettet suite       |
| Metrics      | Project-ID, endelige tal og gyldigt `calculated_at` valideres; boundary save/clear invaliderer cache. Sammenhæng til boundary-version kan ikke bevises uden schema-/RPC-støtte | Delvist; freshness **AFVENTER** |
| CSV          | Canonical observations-CSV har korrekt escaping og neutralisering af regnearksformler; Connect metrics-/zone-CSV er separate udtræk                                            | Bestået for observations-CSV    |
| Browser/live | Gem/reload/download i rigtig browser og database                                                                                                                               | **AFVENTER**                    |

Gatekørsler:

- Målrettet Vitest: 8 filer, 68/68 tests, exit 0.
- Fuld Vitest: ren solo-genkørsel bestod 37 filer, 308/308 tests, exit 0. En tidligere parallel kørsel ramte timeoutstøj i urørte natur-/ledger-tests; den rene solo-kørsel er det aktuelle gate-resultat og timeoutstøjen registreres ikke som produktfejl.
- TypeScript: exit 0.
- ESLint på alle berørte TypeScript-filer: 0 fejl; 2 eksisterende Fast Refresh-warnings i `MapEditorMap.tsx`.
- Produktionsbuild: exit 0 med kendte geotiff-, chunk-, module-directive- og Nitro/Cloudflare-advarsler.
- Global lint er ikke grøn og tæller fortsat som fejlet releasegate.

## Testpyramide

### Pure unit

- Geometri: closure, finite/range, unikke punkter, self-intersection, areal/centroid og unsupported typer.
- Upload: MIME/extension, SHA-256, duplicate key, EXIF/XMP/GPS/UTC/orientation og readiness.
- Import: GeoJSON/KML/GPX/CSV mapping, CRS og invalid rows/features.
- Adaptere: WMS/WFS capabilities, STAC normalisering og COG metadata/math.
- Domæne: survey rounds, parring, change-event/review/action transitions.
- Rapport: canonical snapshot/manifestserialisering og hash.

Fixtures er deterministiske og må ikke afhænge af aktuelle datoer eller live endpoints.

### Adapter contract

Mock HTTP-fixtures dækker 200, tomt/malformed svar, paging, timeout, 401/403, 429 og 5xx. Testen beviser, at live-fejl ikke bliver preview-success, og at secrets ikke lækker til log, fejl eller provenance.

### Service integration

- Geometri: savepayload → reloadmapping → export er geometrisk identisk; invalid input skriver ikke.
- Upload: duplicate, transportfejl, retry/resume-state, Storage-success/DB-fail rollback, jobstatus.
- Datakilder: project scope, atomisk source+mappings og health.
- Evidens/audit: checksum, actor, before/after, metodeversion og append-only.
- Rapport: låst snapshot → deterministisk manifest/outputhash → ny version uden overskrivning.

### RLS/Storage — releasekritisk

To organisationer og mindst owner/editor/viewer testes via direkte Supabase-kald. Dæk CRUD, membership self-join, cross-project FK, objekt-list/read/write/delete, path spoofing og signed URLs. Service role tæller ikke som RLS-evidens. Miljøet er **AFVENTER**.

### Browser-E2E — bindende rejser

1. Login og projektvalg/-oprettelse.
2. Tegn/importér boundary; redigér; Gem/Annuller; reload; eksport.
3. Opret før-flyvning; upload fotos; afbryd/genoptag; håndtér dublet og manglende metadata.
4. Registrér intervention og efter-flyvning.
5. Par Før/Efter; swipe og side-by-side med synkroniseret kort.
6. Opret måling, review, handling og evidens.
7. Håndtér WMS/WFS/MARS-opstrømsfejl synligt.
8. Generér, download og genåbn versionsfast rapport.
9. Gentag kritiske URL/API/Storage-kald fra anden tenant og forvent afvisning.

Kør desktop, 768×1024 tablet og 390×844 mobil. Browserharness/testbrugere er **AFVENTER**.

### PDF/visuel QA

Render PDF til billeder og kontrollér obligatoriske sektioner, kort, Før/Efter, sidetal, klip, tomme sektioner, kilde-/metodebilag og læsbarhed. Snapshot/manifest/hash skal være deterministisk; volatile PDF-metadata normaliseres i sammenligning.

## Gate pr. slice

`målrettede tests → typecheck → lint på ændrede filer → relevant integration/browser → samlet Vitest → build`

Før P0-release kræves global lint 0, grøn browserrejse, grøn to-tenant RLS/Storage, dokumenterede live adapter-smokes og visuelt godkendt PDF. Ikke-observerede forhold markeres `AFVENTER`, aldrig bestået.
