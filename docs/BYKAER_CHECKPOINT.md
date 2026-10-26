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

The configured production backend is `ikrmcetjutqcjtwfhzfv`. On continuation, the existing municipal staging configuration in `freyra-hub-redesign-2710/scripts/verify-staging-env.mjs` identified the connected project `xdvqdzdpyceojbdknofi` as the previously used staging environment. A read-only schema query confirmed that the new `report_documents`, `report_revisions`, `watercourse_versions`, `watercourse_observations`, `watercourse_observation_reviews` and `drone_processing_jobs` tables are absent there. Do not confuse this shared staging environment with production or apply migrations without approval of the staging change. No cause of missing signup mail is established. UI distinguishes signup accepted from mail delivery and handles immediate authenticated sessions. No email was triggered in tests.

New schema files are additive and have been tested in an isolated PostgreSQL fixture. **The existing GitHub workflow automatically pushes migrations when main receives migration changes.** Review the target, backups, grants and staging test before merging. A PR is not deployment authorization.

Existing legacy customer data has not been edited or deleted. Historic fake starter data may already exist and needs a read-only classification audit before any separately approved cleanup.

## Next concrete action

Review this branch and approve the three existing migrations for the confirmed staging environment (or provision a dedicated isolated copy). Check target schema compatibility and existing access policies before applying them, configure verified official dataset distributions and an authorized worker, then run the two-organization browser journey: login without mail-triggering account creation, choose project, import line, upload batch including duplicates/no-GPS/failure, retry, review before/after, save report, export, reopen in a fresh session and verify the old revision is unchanged. Complete unsupported raster reprojection, verified survey coverage and automated analysis before claiming the entire eight-part brief is finished.

## Continuation: review fixes

- Auth events for the same user no longer set the blocking workspace loading state. Initial hydration still blocks; identity changes still clear cached private data and unmount the old workspace. Five mounted React regression tests verify token refresh, repeated sign-in, user updates, account switching and sign-out, including preservation of an unsaved draft.
- Watercourse import recognizes the explicitly marked centerline in the panel's own GeoJSON export and ignores exported segment features. Tests include reordered features and rejection of multiple competing centerlines, unlabelled competing lines and segment-only input. Importing a geometry creates a draft; existing saved revisions and segment IDs are never overwritten.
- The MCP Vite plugin receives a native Windows root path so its existing containment check accepts the actual routes directory. The check remains enabled, and other platforms retain the original hook.
- `npm test -- --maxWorkers=2 --testTimeout=20000`: **254 tests in 44 files passed**. The unrestricted first run timed out importing an existing nature-layer test under concurrent load; the bounded run passed all files. Network remains disabled in unit tests. `jsdom@26.1.0` is a pinned development-only dependency for mounted React tests.
- `npm run typecheck`: passed after the source and Vite changes.
- Full local Windows build: **not passed**. The MCP path mismatch was fixed and client compilation completed on one run, but subsequent server bundling encountered process/resource failures and `UNKNOWN realpath` errors in installed dependencies. Running the build alone with a 4 GiB Node heap and `GOMAXPROCS=2` did not complete it. The earlier Linux build result above belongs to the original commit; it does not certify this revision. A clean build in CI or a working build environment remains a release gate.
- No new SQL changes, migrations applied, merge, deployment, account creation, mail or paid worker activation in this continuation.
