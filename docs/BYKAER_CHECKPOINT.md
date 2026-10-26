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

## Shared municipal/private workflow and current reference

The current report, refreshed on Drive after the user's clarification, is the 26-page **Bedre natur og variation i vandløbene**, 17,766,312 bytes, checksum `0d667064cc4be96376fc2448c2d59aa24142648edb9149d0f22acbf2f7c9fd09`. Its Drive modification time is `2026-10-26T20:14:34.965Z`. The previous 1,000-tree version is superseded as a requirements reference. Companion exports from earlier the same day need revision reconciliation. The August 4DM specification is historical context, not the latest requirement set.

- [Output requirements, all-category inventory, reuse research and implementation order](FREYRA_OUTPUT_AND_REUSE.md) documents the shared municipal/private baseline workflow, actual code reuse points, Danish products and podcast sources, with verified scope and remaining work.
- The report editor now offers watercourse/planting, construction baseline, nature baseline and annual follow-up through the existing persistence, evidence approval and export engine. Template identity is optional for historical revisions. These are blank, editable report structures; they do not generate factual findings or reproduce all 26 pages of the reference automatically.
- Actual report drafts now survive equivalent auth/project objects and same-revision data refetches. Deliberate project/version changes still hydrate a different draft. Six mounted-editor tests cover the behavior and construction-template routing.
- `node scripts/audit-category-surface.mjs` inventories the 15 sidebar entries and 88 matched route definitions. Three parent layouts hide child routes behind `ProjectEvidenceStatus`; their 20 child tabs import legacy demonstration data. The audit is source-only and never a live functional PASS.
- 266 tests in 46 files passed using a single test worker and disabled file parallelism. The earlier parallel run had three timeouts in existing dynamic-import tests; the serial run passed every test. Lint of changed report modules: no errors, one existing component-export warning.
- A PR-only GitHub validation workflow runs inventory, offline tests, typecheck and a build on Ubuntu. It has read-only repository permission and no deploy or migration step. Its execution result must be read back before claiming a clean build.
- [Clean Ubuntu validation](https://github.com/JESRI-C/freyra-hub/actions/runs/40395498020/job/121827310184) subsequently completed successfully on code commit `53d1946c8a7cda51ba1bc6c18467a15c546a996f`: locked install, source inventory, all offline tests, typecheck and full build passed. This is a technical build gate, not browser or municipal acceptance. The local Windows limitations above remain separately recorded.
- The same-day datapackage was fetched and its 100 ZIP entries passed CRC checks. It contains the actual earlier report, map, reach-building and solar-model source. Four Python files were inspected without execution. Their reusable functions are inventoried in the output/reuse document; hardcoded project quantities and the older 1,000-tree text are not adopted as current requirements.
- All 15 categories still require functional/browser acceptance and several require data binding. No category was removed or claimed complete from route presence alone. No live database writes or production actions were made for this extension.

## Project-data continuation — supersedes the open tab-binding status above

See [the project workspace acceptance record](PROJECT_WORKSPACE_ACCEPTANCE.md) and [credential-free results](project-workspace-acceptance.json). The 20 project intelligence/ledger/impact child tabs now use scoped project data and append-only registrations. All 15 category entries plus seven additional settings tabs passed the documented navigation probe (42 routes). Note persistence, project switching, action/risk persistence and reader boundaries were verified against the staging database. Read-only evidence and measurement detail were separately browser-tested.

Five additive migrations were applied only to staging `xdvqdzdpyceojbdknofi`; migration-history versions were reconciled and read back. All five passed the isolated 61-assertion PostgreSQL/RLS harness. Application commit `a1e964e` passed 277 tests, typecheck and a full Ubuntu build. This is not a production rollout or a full professional acceptance of every integration. New external assistant wiring remains disabled following an automatic approval rejection; the visible data review is explicitly rule based. No customer-facing publication, mail or new AI-provider call was made.
