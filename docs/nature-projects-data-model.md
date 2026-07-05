# Naturprojekter — Datamodel

Sidst opdateret: 2026-07-05

Definerer den fulde måldatamodel. Migrations rulles ud fase for fase (se
`nature-projects-implementation-plan.md`). Alle tabeller ligger i `public`,
har `id uuid default gen_random_uuid()`, `created_at`, `updated_at` hvor
relevant, og en `updated_at`-trigger.

Alle nye tabeller får:
```sql
grant select, insert, update, delete on public.<t> to authenticated;
grant all on public.<t> to service_role;
alter table public.<t> enable row level security;
-- policy: authenticated bruger kan læse/skrive rows for projekter hvor
--         de er project_members eller organization_memberships-medlem
```

## Kernetabeller (findes allerede)

- `projects` — id, organization_id, name, slug, project_type, status,
  location_name, municipality, description, start_date, end_date,
  geometry_polygon, geometry_centroid_lat/lng, geometry_area_ha,
  geometry_source
- `organizations` / `organization_memberships`
- `profiles`

## Sites (udvidelse)

Efter Fase 2:
```
sites
- id
- project_id → projects
- name
- description
- site_type
- status ('active' | 'archived' | 'planning')
- geometry_polygon (jsonb, GeoJSON)
- geometry_centroid_lat
- geometry_centroid_lng
- area_ha
- municipality
- address
- source_type ('manual' | 'parcel' | 'field_block' | 'geojson' | 'copied')
- source_metadata (jsonb)
- baseline_status
- tags text[]
- archived_at
- created_at / updated_at
```

## Project boundaries (versioner — fase 2/3)

```
project_boundaries
- id
- project_id → projects
- site_id → sites (nullable)
- geometry_polygon jsonb
- area_ha
- centroid_lat / centroid_lng
- source_type
- source_metadata jsonb
- version int
- is_current bool
- created_by uuid
- created_at
```

Der er én current-row pr. (project_id, site_id).

## Data sources (udvidelse — fase 3)

```
data_sources (findes)
+ configuration jsonb
+ sync_frequency text
+ next_sync_at timestamptz
+ data_quality_score numeric  -- overall
+ quality_completeness numeric
+ quality_timeliness numeric
+ quality_validation numeric
+ quality_consistency numeric
+ site_id → sites (nullable)

data_source_runs (ny)
- id
- data_source_id → data_sources
- status ('success' | 'partial' | 'failed' | 'running')
- started_at / completed_at
- records_received / processed / failed
- quality_score
- error_message
- metadata jsonb
```

## Indicators (udvidelse — fase 4)

```
indicator_definitions (ny)
- id
- key text unique
- name / category / unit
- description
- calculation_method
- data_requirements jsonb
- threshold_warning / threshold_critical
- is_active
- created_at / updated_at

indicators (findes — bliver "project_indicators")
+ indicator_definition_id → indicator_definitions
+ previous_value
+ confidence_score
+ source_summary jsonb
+ site_id (nullable)

indicator_measurements (ny)
- id
- project_indicator_id → indicators
- measured_at
- value / unit
- source_id (→ data_sources, nullable)
- confidence_score
- method
- metadata jsonb
```

## Actions (udvidelse — fase 5)

```
actions (findes)
+ site_id → sites (nullable)
+ action_type text
+ linked_indicator_id → indicators (nullable)
+ linked_risk_id → environmental_risks (nullable)
+ expected_impact / actual_impact text
+ requires_evidence bool
+ started_at / completed_at
+ assigned_to uuid (auth.users)

action_evidence (ny)
- id
- action_id → actions
- evidence_type ('document' | 'media' | 'note')
- document_id → documents (nullable)
- media_id → project_media (nullable)
- note text
- created_by uuid
- created_at
```

## Documents (ny — fase 6)

Adskilt fra `evidence_files` som forbliver som "certifikater/attester".
`documents` er den brede dokumenttabel:

```
documents (ny)
- id
- project_id / site_id / action_id (site+action nullable)
- title / document_type
- status ('draft' | 'in_review' | 'approved' | 'archived' | 'expired')
- storage_path / file_name / mime_type / file_size
- version int
- generated_from text  -- e.g. 'status_report_template_v1'
- metadata jsonb
- created_by uuid
- created_at / updated_at
```

## Media (udvidelse — fase 7)

```
project_media (findes)
+ action_id → actions (nullable)
+ document_id → documents (nullable)
+ tags text[]
+ direction numeric  -- kompas-retning fra EXIF
+ before_media_id → project_media (nullable)  -- før/efter-relation
```

## Audit (udvidelse — fase 8)

```
audit_events (findes)
+ entity_type text
+ entity_id uuid
+ before_data jsonb
+ after_data jsonb
+ site_id → sites (nullable)
+ actor_id uuid (auth.users, nullable)
```

## Roller (ny — fase 9)

```
project_role enum: ('admin','project_manager','editor','field','viewer','external')

project_members (ny)
- id
- project_id → projects
- user_id → auth.users
- role project_role
- created_at
- unique(project_id, user_id)
```

Security-definer function:
```sql
create function public.has_project_role(_project_id uuid, _user_id uuid, _role project_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members
                 where project_id = _project_id and user_id = _user_id and role = _role);
$$;
```

RLS på alle projektnære tabeller ændres til at bruge `has_project_role` eller
`is_project_member` (svarende til at rollen != null).

## Indekser

Vigtige:
- `sites (project_id, status)`
- `indicators (project_id, category)`
- `indicator_measurements (project_indicator_id, measured_at desc)`
- `actions (project_id, status, due_date)`
- `audit_events (project_id, created_at desc)`
- `data_source_runs (data_source_id, started_at desc)`
- `project_media (project_id, taken_at desc)`
- `documents (project_id, document_type, status)`
