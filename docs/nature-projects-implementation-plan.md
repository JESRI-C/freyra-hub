# Naturprojekter — Implementeringsplan

Sidst opdateret: 2026-07-05

Se `nature-projects-audit.md` for fane-for-fane status. Dette dokument
beskriver *hvad* der bygges i hver fase, *hvilke filer* der ændres og
*hvordan* det testes.

## Overordnet strategi

Vi bygger i faser. Hver fase skal levere:
- Konkret UI som brugeren kan bruge fra dag 1
- Ingen døde knapper introduceres
- Migrations kører før koden der bruger dem
- Kort test-notat i `docs/nature-projects-test-plan.md`
- Hvad der ikke er med, er tydeligt beskrevet (ingen "coming soon" i UI)

Realistisk estimat: **8-10 iterationer** for at nå masteropgavens fulde
acceptance criteria. En "iteration" ≈ ét fokuseret leverance-loop.

---

## Fase 1 — Overblik og hygiejne

Formål: Overblik-fanen leverer det den lover, projekt-header er fuldt
funktionel, ingen døde tællere.

### Ændrede filer
- `src/components/project/ProjectHeader.tsx` — tællere bliver `<Link>` med
  søgeparametre; status-dropdown; edit-projekt-dialog
- `src/components/project/IndicatorCard.tsx` — klik åbner detalje-drawer;
  "Ikke beregnet endnu" når `value === null`
- `src/routes/app.projects.$slug.tsx` — fane-state fra `useSearch()`;
  header-tællere linker med `?tab=sites&filter=...`
- `src/services/projects-service.ts` — ny `updateProjectStatus`
- Ny `src/components/project/IndicatorDetailDrawer.tsx`
- Ny `src/components/project/EditProjectDialog.tsx`

### DB
Ingen migrations. `projects` har allerede alle nødvendige felter.

### Test
- Klik på "3 sites" i header → viser sites-fanen
- Klik på "Aktiv" i header → dropdown skifter til "Kladde", audit-event vises
- Klik på KPI-kort → drawer åbner med indikatorens seneste værdi og kilde

---

## Fase 2 — Sites

### Ændrede filer
- `src/services/sites-service.ts` (ny) — CRUD, arkivér, geometri
- `src/lib/supabase/queries.ts` — nye sites-queries
- `src/components/sites/SiteList.tsx` (ny) — grid + filtre + søgning
- `src/components/sites/SiteFormDialog.tsx` (ny) — opret/rediger
- `src/components/sites/SiteDetailDrawer.tsx` (ny) — geometri, datakilder,
  indikatorer, handlinger, medier
- `src/components/sites/SiteGeometryPicker.tsx` (ny) — genbrug af
  `MapEditorMap`, mulighed for "brug del af projektgrænse"
- `src/routes/app.projects.$slug.tsx` — udskift Sites-fane med `<SiteList>`

### DB
Migration `add_sites_geometry_and_status`:
```sql
alter table public.sites
  add column geometry_polygon jsonb,
  add column geometry_centroid_lat double precision,
  add column geometry_centroid_lng double precision,
  add column status text not null default 'active',
  add column archived_at timestamptz,
  add column municipality text,
  add column description text,
  add column tags text[];
create index sites_project_status_idx on public.sites (project_id, status);
```
GRANTs og policies opdateres (allerede scoped til projektejer via RLS).

### Test
- Opret site manuelt → optræder i liste + audit
- Åbn site → drawer viser 0 datakilder, 0 handlinger
- Tegn site-geometri → gemmes, areal beregnes, vises på oversigtskort
- Arkivér site → fjernes fra aktiv liste, kan gendannes fra "Arkiverede"

---

## Fase 3 — Datakilder-wizard og sync-log

### Ændrede filer
- `src/services/data-sources-service.ts` — udvid med `triggerSync`,
  `testConnection`, `getRuns`
- `src/components/data-sources/AddDataSourceWizard.tsx` (ny) — 4-trins
- `src/components/data-sources/DataSourceRunsPanel.tsx` (ny)
- `src/components/data-sources/DataQualityBreakdown.tsx` (ny)
- `src/lib/data-source-sync.functions.ts` (ny server function) — kører reelt
  eller markerer sync som "manuel"

### DB
Migration `add_data_source_runs_and_config`:
```sql
create table public.data_source_runs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources on delete cascade,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_received int,
  records_processed int,
  records_failed int,
  quality_score numeric,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
-- GRANTs + RLS scoped til projektejer via join
alter table public.data_sources
  add column configuration jsonb,
  add column sync_frequency text,
  add column next_sync_at timestamptz,
  add column data_quality_score numeric;
```

### Test
- Wizard opret upload-kilde → CSV-preview → import kører → run gemmes
- "Sync nu" på API-kilde → run oprettes, evt. fejl vises i log
- Datakvalitet vises med breakdown

---

## Fase 4 — Indikator-tidsserie

### Ændrede filer
- `src/services/indicators-service.ts` — nye funktioner til measurements
- `src/components/indicators/IndicatorDetail.tsx` (ny) — graf via `recharts`
- `src/components/indicators/IndicatorConfigDialog.tsx` (ny)

### DB
Migration `add_indicator_definitions_and_measurements`:
```sql
create table public.indicator_definitions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  category text not null,
  unit text,
  calculation_method text,
  threshold_warning numeric,
  threshold_critical numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.indicator_measurements (
  id uuid primary key default gen_random_uuid(),
  project_indicator_id uuid not null references public.indicators on delete cascade,
  measured_at timestamptz not null default now(),
  value numeric,
  unit text,
  source_id uuid,
  confidence_score numeric,
  method text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index measurements_indicator_time_idx
  on public.indicator_measurements (project_indicator_id, measured_at desc);
```

### Test
- Åbn indikator → historisk graf med data points fra `measurements`
- Skift periode (30d/90d/12m) → graf opdateres
- Threshold-linjer vises
- Overskredet threshold → automatisk handling oprettes med
  "Oprettet automatisk fra indikator"

---

## Fase 5 — Handlinger++

### DB
Migration `add_action_evidence_and_metadata`:
```sql
create table public.action_evidence (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions on delete cascade,
  evidence_type text not null,
  document_id uuid,
  media_id uuid references public.project_media on delete set null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.actions
  add column site_id uuid references public.sites on delete set null,
  add column action_type text,
  add column linked_indicator_id uuid references public.indicators on delete set null,
  add column expected_impact text,
  add column actual_impact text,
  add column requires_evidence boolean not null default false,
  add column started_at timestamptz,
  add column completed_at timestamptz;
```

### Test
- Opret handling med "kræver bevis" → kan ikke afsluttes uden evidens
- Vedhæft foto ved afslutning → foto vises i handling og medie-galleri
- Filter på site/status/prioritet virker

---

## Fase 6 — Dokumentation & generator

### DB
Migration `add_documents_table`:
```sql
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  site_id uuid references public.sites on delete set null,
  action_id uuid references public.actions on delete set null,
  title text not null,
  document_type text not null,
  status text not null default 'draft',
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  version int not null default 1,
  generated_from text,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Kode
- `src/lib/document-generator.functions.ts` (ny server function) — genererer
  PDF via `@react-pdf/renderer` eller HTML→print
- `src/components/documents/DocumentList.tsx` (ny)
- `src/components/documents/GenerateReportDialog.tsx` (ny)
- `src/components/documents/DocumentationScore.tsx` (ny)

### Test
- "Generér projektstatusrapport" → PDF downloades + gemmes som `documents`-row
- Score falder når foto mangler for seneste handling

---

## Fase 7 — Medier++

### DB
```sql
alter table public.project_media
  add column action_id uuid references public.actions on delete set null,
  add column document_id uuid references public.documents on delete set null,
  add column tags text[],
  add column direction numeric,
  add column before_media_id uuid references public.project_media on delete set null;
```

### Kode
- `src/components/project-workspace/MediaLightbox.tsx` (ny)
- `src/components/project-workspace/BeforeAfterCompare.tsx` (ny)

---

## Fase 8 — Audit-forbedringer

### DB
```sql
alter table public.audit_events
  add column entity_type text,
  add column entity_id uuid,
  add column before_data jsonb,
  add column after_data jsonb;
```

### Kode
- Alle skrive-services udvides så de også skriver før/efter
- Filter-panel + eksport-knap

---

## Fase 9 — Roller

### DB
```sql
create type public.project_role as enum
  ('admin','project_manager','editor','field','viewer','external');
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null,
  role project_role not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
-- has_project_role() security-definer function
-- RLS opdateres på alle projektnære tabeller
```

---

## Fase 10 — Test, mobil, polish

- Vitest-tests for alle nye services
- Playwright-flow gennem hver fane
- Mobile audit på iPhone/iPad breakpoints
- Alle tomme tilstande får CTA
- Alle fejlbeskeder er specifikke

---

## Environment variables

Ingen nye nødvendige for Fase 1-2. Fase 6 kræver evt. `PDF_FONT_URL` hvis
custom fonts bruges.

## Eksterne integrationer

Ingen nye i Fase 1-2. Fase 3 wizard kan tilføje DMI/Sentinel/GEUS med
eksisterende connector-kode.

## Kendte begrænsninger

- IoT-sensordata er simuleret indtil ægte broker findes
- PDF-generering vil være enkel (rapportlayout), ikke pixel-perfekt
- Roller kræver at brugere er inviteret via Cloud (findes)
