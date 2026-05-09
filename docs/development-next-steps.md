# GoFreyra — Development Next Steps

Status after sprint 3 (feature/gofreyra-data-foundation-dk-eu): Data Foundation complete. Connector Registry with 11 Danish and EU open data connectors, environmental context service with preview scoring, new Connector Registry route, environmental context tab on project detail pages.

---

## Completed in sprint 3

### Data Foundation — Connector Registry & Environmental Context
- `src/lib/supabase/types.ts` — Added `ConnectorStatus`, `ConnectorCategory`, `DataConnector`, `EnvironmentalContextResult`, `ProjectEnvironmentalContext` types
- `src/data/connectors-registry.ts` — Static registry of 11 connectors (Sentinel-2, Copernicus CLMS, Miljøportal, Naturdatabasen, Datafordeler Matrikel, Datafordeler DHM, DMI Open Data, GEUS Jupiter, Natura 2000, EU-Hydro, ESDAC)
- `src/services/connector-service.ts` — Fetch functions per connector with fallback/preview data; `buildProjectEnvironmentalContext()` aggregate builder
- `src/components/data-foundation/ConnectorRegistryTable.tsx` — Full table with category/status chips, API key indicator, docs links
- `src/components/data-foundation/EnvironmentalContextCard.tsx` — Card component for one connector result
- `src/components/data-foundation/ProjectEnvironmentalDashboard.tsx` — Full dashboard with score chips and card grid
- `src/components/data-foundation/DataFoundationOverview.tsx` — Summary card with stats and next steps
- `src/routes/app.connect.registry.tsx` — `/app/connect/registry` page with category filter pills and full table
- `src/routes/app.connect.sources.tsx` — Added Data Foundation overview section at top
- `src/routes/app.projects.$slug.tsx` — Added "Miljødata" tab (9th tab) with environmental dashboard
- `src/components/AppSidebar.tsx` — Added "Connector Registry" nav item under Data & Intelligence
- `supabase/migrations/004_data_foundation_connectors.sql` — `connector_fetch_logs` table for activity logging
- `docs/data-foundation.md` — Full documentation of architecture, connectors, scoring, and integration plan

---

Status after sprint 2 (feature/gofreyra-project-monitor-report-engine): Project Monitor + Report Engine complete. Full project detail pages with 8 tabs, evidence service, sensor/observation services, and report preview engine are live on seed data.

---

## Completed in this sprint

### Project Monitor & Report Engine
- `src/routes/app.projects.index.tsx` — `/app/projects` overview with stat bar, search, filter pills, project cards
- `src/routes/app.projects.$slug.tsx` — `/app/projects/:slug` detail with 8-tab layout
- `src/lib/report-engine.ts` — `generateProjectReportPreview()` + `getRecommendedNextAction()`
- `src/services/evidence-service.ts` — evidence file queries + Danish type labels
- `src/services/sensors-service.ts` — sensor queries + status tone
- `src/services/observations-service.ts` — observation queries + type labels
- Extended `src/data/platform-seed.ts` — sensors, observations, evidence files, impact units
- Extended `src/lib/supabase/queries.ts` — sensor/observation/evidence query functions
- New components in `src/components/project/`: `ProjectMonitorCard`, `ProjectHeader`, `ProjectTabs`, `IndicatorCard`, `ActionItem`, `EvidenceList`, `EvidenceUploadForm`, `ReportPreviewCard`
- Navigation: "Projekter" link added to AppSidebar
- Docs: `supabase-auth-plan.md`, `supabase-rls-plan.md`

---

## Immediate (next sprint)

### Auth setup
- Enable Supabase Auth (Magic Link recommended for the pilot)

---

## Immediate (next sprint)

### Auth setup
- Enable Supabase Auth (Magic Link recommended for the pilot)
- Create `profiles` table linked to `auth.users`
- Replace `src/lib/auth.tsx` demo context with real Supabase session
- Add per-org RLS policies on all tables

### Wire remaining modules to data layer
- `Smart Connect` → `data_sources` + `sensors` + `observations`
- `DecisionsIQ` → `actions` + `indicators`
- `ESG Ledger` → `audit_events` + `evidence_files` + `reports`
- `Reports` → `reports` + `evidence_files`

### Observations ingest
- Implement `POST /api/observations` edge function (Supabase Edge Function or Cloudflare Worker)
- Accept MQTT payloads, validate with Zod, write to `observations`
- Aggregate observations → `indicators` on upsert trigger

---

## Near-term (1–2 months)

### Real-time
- Enable Supabase Realtime on `observations` and `alerts`
- Replace mock live-feed in Smart Connect with `supabase.channel(...).on('postgres_changes', ...)` subscription

### File storage
- Use Supabase Storage for `evidence_files.file_url`
- Build upload flow in Smart Connect (drone uploads, CSV, field photos)

### Indicator calculation engine
- PostgreSQL function or Edge Function that recalculates `indicators` from `observations`
- Trigger on new observation insert
- Start with: `biodiversity_index`, `data_quality`, `co2e_reduced`

### Multi-project selector
- Wire `GlobalContextBar.tsx` project switcher to real `projects` table
- Store selected `org_id` + `project_id` in Supabase session or localStorage

---

## Medium-term (2–4 months)

### ESG Ledger hardening
- Sign `audit_events.hash` with a deterministic hash of all fields (SHA-256)
- Store hash on write, verify on read — tamper-evident chain
- Export audit trail as PDF with Supabase Edge Function

### Report generation
- Edge Function: collect indicators + evidence files → generate structured JSON
- Client-side PDF render (react-pdf) or server-side (Puppeteer on Cloudflare)
- ESRS E4 template as first report type

### Impact Units
- Issuance flow: verified project → issue `impact_units` records
- Status machine: `draft → pending_verification → issued → retired`
- Prepare for Impact Exchange marketplace (Phase 2)

### Notifications & alerts
- `alerts` table (derived from `observations` anomalies)
- Push via Supabase Edge Function → email / Slack
- Surface in Smart Connect `alerts` tab

---

## Infrastructure

| Item | Current | Target |
|---|---|---|
| Hosting | Cloudflare Workers (wrangler) | Same |
| Database | Seed data (TypeScript) | Supabase PostgreSQL |
| Auth | Demo localStorage | Supabase Auth (Magic Link) |
| File storage | None | Supabase Storage |
| Real-time | Mock | Supabase Realtime |
| Edge functions | None | Supabase Edge Functions |

---

## Environment variables needed

```env
# Required for Supabase connection
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Optional: Supabase service role key (server-side only, never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=

# Data Foundation — connector API keys (all optional; fallback/preview data used if absent)
VITE_COPERNICUS_TOKEN=          # Copernicus Sentinel-2 — https://dataspace.copernicus.eu
VITE_DMI_API_KEY=               # DMI Open Data — https://opendatadocs.dmi.govcloud.dk
VITE_DATAFORDELER_KEY=          # Datafordeler (DHM + Matrikel) — https://datafordeler.dk
```

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Cloudflare Pages → Settings → Environment Variables for production. Data Foundation connector keys are optional — the app displays preview data without them.
