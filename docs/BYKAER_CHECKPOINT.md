# Bykær Bæk implementation checkpoint

Date: 2026-10-26. Base: `7dc33f4c75e431d7ceba47d16d54cd1f5cdbb30e`.
Branch: `codex/bykaer-evidence-flow`. No merge, deployment, production migration, mail or paid service activation performed.

## What changed

| Brief part | Implemented | Remaining acceptance work |
| --- | --- | --- |
| 1. Shared context and honest status | Membership-bound URL/global/map selection; invalid links fail closed; account-change cache clearing; no first-project fallback; no fake starter records, sensors or geometry; legacy demo modules display explicit unavailable status. | Signed-in browser regression and existing stored demo-data audit (existing customer records left unchanged). |
| 2. Persisted reports | Organization/project scoped documents, immutable revisions, atomic version checks, saved scope/audience/section order, shared report routes. Server validates and canonicalizes source ownership and checksums. | Target database deployment and reopen in a new real session. |
| 3. Watercourse | Separate versioned EPSG:4326 line, direction, geodesic stationing/segments, GeoJSON/KML/GPX import, immutable geometry and export. Unknown area remains null. | Browser roundtrip on target project. |
| 4. Drone batches | Multi-file survey upload, before/after/follow-up, original bytes, EXIF/XMP, own GPS/direction, SHA-256, private bucket, duplicate detection, per-file retry/resume. Pagination handles manifests above the default row cap. | Hosted Storage API verification with actual drone originals; resume is file-level, not byte-level; sidecar XMP is preserved but not automatically paired. |
| 5. Maps and jobs | Own-GPS photo layer, missing-GPS indication, official source/error handling, actual polygon overlap, durable blocked jobs and provider-neutral worker contract with input versions/checksums, GeoTIFF metadata validation and bounded north-up EPSG:4326/3857 raster overlay in both maps. | Verified official WFS endpoint/type configuration and pagination; actual photogrammetry worker; EPSG:25832/rotated/oversized raster reprojection and accuracy approval. |
| 6. Before/after and analysis | Side-by-side photos, quality flags, qualitative vegetation/water/tree/species/recommendation observations, segment/source linkage, explicit immutable review, duplicate object guards, deterministic geometry calculations. | Automated image interpretation and calibrated orthophoto-derived quantitative vegetation/area analysis. RGB photos are never presented as biomass, hydraulic capacity or NDVI. |
| 7. Evidence-bound AI | Existing gateway reused only server-side after user and exact report revision authorization; reviewed source-linked input and validated output source IDs; proposals remain unreviewed. Legacy arbitrary-context handler blocked. | No live AI request made. Actual server key and authorized gateway configuration must be checked in target environment. Separate automated image/geoprocessing workers are not implemented. |
| 8. Export/review | Real PDF, editable DOCX, CSV and GeoJSON bytes with SHA-256, frozen revision/source register, reviewed actor/time, original-checksum-verified image atlas and attributed OSM viewport shown before export (explicit schematic fallback on tile failure). | Verified survey coverage and official nature binding layers; real project export and new-session re-open. Fixture rendering is not customer report acceptance. |

## Verification and reproducibility

- Install: `npm ci --ignore-scripts --legacy-peer-deps`. The original npm lock was stale; lockfile was refreshed without changing package.json requirements. Existing Vite/TanStack peer constraints require the legacy peer flag.
- Unit/integration: `npm test`: 248 tests across 43 files passed. `vitest.config.ts` disables env loading; setup blocks unmocked fetch. No production credentials, mail or network calls are used.
- Types: `npm run typecheck` passed.
- Build: `NODE_OPTIONS=--max-old-space-size=6144 npm run build`. Default Node heap was insufficient; larger heap completed the build.
- SQL/RLS: `node scripts/test-bykaer-rls.mjs /path/to/@electric-sql/pglite/dist/index.js`. Isolated PostgreSQL fixture applies the actual migrations with two organizations and explicit roles. 48 assertions passed. This is not a live Supabase test.
- Lint: run ESLint on changed TS/TSX files. Full baseline lint at the untouched base already has 5,478 errors and 25 warnings; unrelated formatting debt is not silently rewritten.
- Export visual QA: 3 PDF pages and 3 DOCX pages rendered and inspected with local fixtures; no customer measurements or approvals invented.
- Browser: connected browser unavailable; cloud browser cannot reach the local server. No login, upload or production browser journey is claimed as tested.

## External dependencies and safety

The configured backend is `ikrmcetjutqcjtwfhzfv`; the connected Supabase account exposes a different project. Do not run these migrations against that other project. No cause of missing signup mail is established. UI now distinguishes signup accepted from mail delivery and handles immediate authenticated sessions. No email was triggered in tests.

New schema files are additive and have been tested in an isolated PostgreSQL fixture. **The existing GitHub workflow automatically pushes migrations when main receives migration changes.** Review the target, backups, grants and staging test before merging. A PR is not deployment authorization.

Existing legacy customer data has not been edited or deleted. Historic fake starter data may already exist and needs a read-only classification audit before any separately approved cleanup.

## Next concrete action

Review this branch and provision an isolated staging copy of the correct project. Apply the three new migrations there, configure verified official dataset distributions and an authorized worker, then run the two-organization browser journey: login without mail-triggering account creation, choose project, import line, upload batch including duplicates/no-GPS/failure, retry, review before/after, save report, export, reopen in a fresh session and verify the old revision is unchanged. Complete unsupported raster reprojection, verified survey coverage and automated analysis before claiming the entire eight-part brief is finished.
