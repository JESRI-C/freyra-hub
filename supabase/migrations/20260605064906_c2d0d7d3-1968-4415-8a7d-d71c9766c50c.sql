-- ─── MIGRATION 001: Core Schema ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

create table if not exists organizations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  type       text,
  country    text default 'Denmark',
  created_at timestamptz default now()
);

create table if not exists projects (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  name            text not null,
  slug            text unique,
  project_type    text,
  location_name   text,
  municipality    text,
  country         text default 'Denmark',
  status          text,
  start_date      date,
  end_date        date,
  description     text,
  created_at      timestamptz default now()
);

create table if not exists sites (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid references projects(id) on delete cascade,
  name             text not null,
  site_type        text,
  area_ha          numeric,
  geometry_geojson jsonb,
  baseline_status  text,
  created_at       timestamptz default now()
);

create table if not exists data_sources (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid references projects(id) on delete cascade,
  name         text not null,
  source_type  text,
  provider     text,
  status       text,
  last_sync_at timestamptz,
  created_at   timestamptz default now()
);

create table if not exists sensors (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid references projects(id) on delete cascade,
  site_id      uuid references sites(id) on delete set null,
  name         text not null,
  sensor_type  text,
  status       text,
  lat          numeric,
  lng          numeric,
  last_seen_at timestamptz,
  created_at   timestamptz default now()
);

create table if not exists observations (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid references projects(id) on delete cascade,
  site_id          uuid references sites(id) on delete set null,
  source_id        uuid references data_sources(id) on delete set null,
  observation_type text,
  indicator_key    text,
  value            numeric,
  unit             text,
  confidence       numeric,
  observed_at      timestamptz,
  metadata         jsonb,
  created_at       timestamptz default now()
);

create index if not exists observations_project_id_idx    on observations(project_id);
create index if not exists observations_observed_at_idx   on observations(observed_at desc);
create index if not exists observations_indicator_key_idx on observations(indicator_key);

create table if not exists indicators (
  id         uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  key        text not null,
  label      text not null,
  category   text,
  value      numeric,
  unit       text,
  trend      text,
  status     text,
  updated_at timestamptz default now()
);

create index if not exists indicators_project_id_idx  on indicators(project_id);
create unique index if not exists indicators_project_key_idx on indicators(project_id, key);

create table if not exists reports (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid references projects(id) on delete cascade,
  title        text not null,
  report_type  text,
  status       text,
  period_start date,
  period_end   date,
  summary      text,
  created_at   timestamptz default now()
);

create table if not exists evidence_files (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid references projects(id) on delete cascade,
  report_id     uuid references reports(id) on delete set null,
  title         text not null,
  file_type     text,
  file_url      text,
  evidence_type text,
  created_at    timestamptz default now()
);

create table if not exists audit_events (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid references projects(id) on delete cascade,
  event_type  text,
  title       text not null,
  description text,
  actor       text,
  source      text,
  hash        text,
  created_at  timestamptz default now()
);

create index if not exists audit_events_project_id_idx on audit_events(project_id);
create index if not exists audit_events_created_at_idx on audit_events(created_at desc);

create table if not exists actions (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid references projects(id) on delete cascade,
  title       text not null,
  description text,
  priority    text,
  status      text,
  due_date    date,
  owner       text,
  created_at  timestamptz default now()
);

create table if not exists impact_units (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid references projects(id) on delete cascade,
  unit_type           text,
  quantity            numeric,
  status              text,
  verification_status text,
  issued_at           timestamptz,
  metadata            jsonb,
  created_at          timestamptz default now()
);

-- ─── MIGRATION 003: Construction & Nature ────────────────────────────────────
create table if not exists construction_projects (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references projects(id) on delete cascade,
  developer_name      text,
  contractor_name     text,
  consultant_name     text,
  construction_type   text,
  construction_phase  text,
  parcel_reference    text,
  building_area_m2    numeric,
  paved_area_m2       numeric,
  expected_start_date date,
  expected_end_date   date,
  authority_contact   text,
  created_at          timestamptz default now()
);

create table if not exists nature_contexts (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid references projects(id) on delete cascade,
  adjacent_nature_type      text,
  watercourse_present       boolean,
  watercourse_name          text,
  distance_to_watercourse_m numeric,
  protected_nature_present  boolean,
  protected_nature_type     text,
  natura2000_nearby         boolean,
  distance_to_natura2000_m  numeric,
  buffer_zone_m             numeric,
  terrain_slope_description text,
  sensitive_receptors       text,
  created_at                timestamptz default now()
);

create table if not exists runoff_profiles (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid references projects(id) on delete cascade,
  runoff_destination          text,
  drainage_principle          text,
  retention_solution          text,
  treatment_solution          text,
  oil_separator_present       boolean,
  sediment_control_present    boolean,
  discharge_point_description text,
  estimated_runoff_volume_m3  numeric,
  design_rain_event           text,
  maintenance_responsibility  text,
  created_at                  timestamptz default now()
);

create table if not exists environmental_risks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects(id) on delete cascade,
  risk_type          text,
  title              text not null,
  description        text,
  severity           text,
  likelihood         text,
  status             text,
  mitigation_summary text,
  responsible_party  text,
  created_at         timestamptz default now()
);

create table if not exists mitigation_measures (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references projects(id) on delete cascade,
  risk_id             uuid references environmental_risks(id) on delete set null,
  title               text not null,
  description         text,
  measure_type        text,
  status              text,
  due_date            date,
  responsible_party   text,
  verification_method text,
  created_at          timestamptz default now()
);

create table if not exists authority_submissions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete cascade,
  title             text not null,
  authority_name    text,
  submission_type   text,
  status            text,
  submitted_at      timestamptz,
  response_due_date date,
  summary           text,
  created_at        timestamptz default now()
);

-- ─── MIGRATION 004: Connector Logs ───────────────────────────────────────────
create table if not exists connector_fetch_logs (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references projects(id) on delete cascade,
  connector_id   text not null,
  connector_name text not null,
  status         text not null,
  summary        text,
  fetched_at     timestamptz default now(),
  metadata       jsonb
);

create index if not exists idx_connector_fetch_logs_project on connector_fetch_logs(project_id, fetched_at desc);

-- ─── MIGRATION 005: Project Geometry ─────────────────────────────────────────
alter table projects
  add column if not exists geometry_polygon        jsonb,
  add column if not exists geometry_centroid_lat   numeric,
  add column if not exists geometry_centroid_lng   numeric,
  add column if not exists geometry_area_ha        numeric,
  add column if not exists geometry_source         text default 'none';

create index if not exists idx_projects_centroid
  on projects(geometry_centroid_lat, geometry_centroid_lng)
  where geometry_centroid_lat is not null;

-- ─── MIGRATION 006: Project Media ────────────────────────────────────────────
create table if not exists project_media (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  title           text not null,
  description     text,
  category        text not null,
  source          text not null,
  file_path       text not null,
  url             text not null,
  thumbnail_url   text,
  uploaded_at     timestamptz not null default now(),
  captured_at     timestamptz,
  lat             double precision,
  lng             double precision,
  altitude_m      double precision,
  accuracy_m      double precision,
  is_report_ready boolean not null default false,
  tags            text[] not null default '{}',
  status          text not null default 'uploaded',
  file_size_bytes bigint,
  mime_type       text
);

-- ─── MIGRATION 007: Geospatial MVP ───────────────────────────────────────────
create extension if not exists postgis;

create table if not exists project_areas (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name       text not null,
  area_type  text default 'pilot_area',
  geom       geometry(Polygon, 4326),
  geojson    jsonb,
  area_ha    numeric,
  created_at timestamptz default now()
);

create index if not exists idx_project_areas_project_id on project_areas(project_id);

create table if not exists map_layers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text unique not null,
  category         text not null,
  provider         text,
  layer_type       text not null,
  source_url       text,
  is_active        boolean default true,
  requires_api_key boolean default false,
  refresh_interval text,
  status           text default 'preview',
  created_at       timestamptz default now()
);

create table if not exists geo_features (
  id           uuid primary key default gen_random_uuid(),
  layer_id     uuid references map_layers(id) on delete cascade,
  external_id  text,
  name         text,
  feature_type text,
  properties   jsonb default '{}',
  geom         geometry(Geometry, 4326),
  geojson      jsonb,
  valid_from   date,
  valid_to     date,
  created_at   timestamptz default now()
);

create table if not exists geo_observations (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references projects(id) on delete cascade,
  layer_id         uuid references map_layers(id),
  observation_type text not null,
  value            numeric,
  unit             text,
  properties       jsonb default '{}',
  observed_at      timestamptz not null,
  geom             geometry(Point, 4326),
  geojson          jsonb,
  created_at       timestamptz default now()
);

create table if not exists calculated_metrics (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  project_area_id uuid references project_areas(id) on delete cascade,
  metric_key      text not null,
  metric_label    text not null,
  value           numeric,
  unit            text,
  method          text,
  calculated_at   timestamptz default now(),
  properties      jsonb default '{}'
);

-- SQL functions
create or replace function get_project_geojson(input_project_id uuid)
returns jsonb language sql stable
set search_path = public
as $$
  with
  proj as (select id, name from projects where id = input_project_id),
  areas as (
    select json_build_object(
      'type','Feature','id',pa.id,
      'geometry', coalesce(st_asgeojson(pa.geom)::jsonb, pa.geojson),
      'properties', json_build_object('feature_class','project_area','name',pa.name,'area_type',pa.area_type,'area_ha',pa.area_ha)
    ) as feature
    from project_areas pa
    where pa.project_id = input_project_id and (pa.geom is not null or pa.geojson is not null)
  ),
  obs as (
    select json_build_object(
      'type','Feature','id',go.id,
      'geometry', coalesce(st_asgeojson(go.geom)::jsonb, go.geojson),
      'properties', json_build_object('feature_class','observation','observation_type',go.observation_type,'value',go.value,'unit',go.unit,'observed_at',go.observed_at)
    ) as feature
    from geo_observations go
    where go.project_id = input_project_id and (go.geom is not null or go.geojson is not null)
    limit 200
  ),
  all_features as (select feature from areas union all select feature from obs)
  select json_build_object(
    'type','FeatureCollection','project_id',input_project_id,
    'project_name',(select name from proj),
    'generated_at',now(),
    'features',coalesce(json_agg(feature),'[]'::json)
  )::jsonb from all_features
$$;

create or replace function get_project_metrics(input_project_id uuid)
returns jsonb language sql stable
set search_path = public
as $$
  with
  proj as (select geometry_area_ha from projects where id = input_project_id),
  obs_count as (select count(*) as cnt from geo_observations where project_id = input_project_id),
  latest_ndvi as (select value from calculated_metrics where project_id = input_project_id and metric_key='ndvi_mean' order by calculated_at desc limit 1),
  overlap_ha as (select value from calculated_metrics where project_id = input_project_id and metric_key='protected_nature_overlap_ha' order by calculated_at desc limit 1),
  watercourse_dist as (select value from calculated_metrics where project_id = input_project_id and metric_key='nearest_watercourse_distance_m' order by calculated_at desc limit 1),
  completeness as (select value from calculated_metrics where project_id = input_project_id and metric_key='data_completeness_score' order by calculated_at desc limit 1)
  select json_build_object(
    'project_id', input_project_id,
    'total_area_ha', coalesce((select geometry_area_ha from proj),0),
    'protected_nature_overlap_ha', (select value from overlap_ha),
    'observation_count', (select cnt from obs_count),
    'nearest_watercourse_distance_m', (select value from watercourse_dist),
    'latest_ndvi', (select value from latest_ndvi),
    'data_completeness_score', (select value from completeness),
    'calculated_at', now()
  )::jsonb
$$;

-- ─── GRANTS for public tables ────────────────────────────────────────────────
do $$
declare
  tbl text;
  tbls text[] := array[
    'organizations','projects','sites','data_sources','sensors','observations',
    'indicators','reports','evidence_files','audit_events','actions','impact_units',
    'construction_projects','nature_contexts','runoff_profiles','environmental_risks',
    'mitigation_measures','authority_submissions','connector_fetch_logs','project_media',
    'map_layers','project_areas','geo_features','geo_observations','calculated_metrics'
  ];
begin
  foreach tbl in array tbls loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
    begin
      execute format('alter table public.%I enable row level security', tbl);
    exception when others then null;
    end;
    begin
      execute format('create policy "dev_all" on public.%I for all using (true) with check (true)', tbl);
    exception when duplicate_object then null; when others then null;
    end;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

insert into organizations (id, name, type, country)
values ('00000000-0000-0000-0000-000000000001', 'GoFreyra Demo Org', 'ngo', 'Denmark')
on conflict (id) do nothing;

insert into projects (
  id, organization_id, name, slug, project_type, location_name, municipality,
  status, description, start_date,
  geometry_centroid_lat, geometry_centroid_lng, geometry_area_ha, geometry_source, geometry_polygon
) values
(
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Skallebæk Biodiversity Pilot', 'skallebaek-biodiversity-pilot', 'nature_restoration',
  'Skallebæk Å-dal', 'Vejle', 'active',
  'Pilotprojekt for biodiversitetsgendannelse langs Skallebæk Å.', '2024-01-15',
  55.252, 9.4828, 7.3, 'manual',
  '{"type":"Polygon","coordinates":[[[9.4821,55.2514],[9.4835,55.2514],[9.4835,55.2525],[9.4821,55.2525],[9.4821,55.2514]]]}'::jsonb
),
(
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Vejle Ådal Rewilding', 'vejle-aadal-rewilding', 'rewilding',
  'Vejle Ådal', 'Vejle', 'active',
  'Rewilding af 42 ha ådalsterræn med naturlig hydrologi.', '2023-09-01',
  55.706, 9.536, 42.0, 'manual',
  '{"type":"Polygon","coordinates":[[[9.530,55.700],[9.542,55.700],[9.542,55.712],[9.530,55.712],[9.530,55.700]]]}'::jsonb
),
(
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Mols Bjerge Naturprojekt', 'mols-bjerge-naturprojekt', 'nature_restoration',
  'Mols Bjerge', 'Syddjurs', 'planning',
  'Hegning og invasiv arts-bekæmpelse i Nationalpark Mols Bjerge.', '2024-06-01',
  56.218, 10.548, 18.5, 'manual',
  '{"type":"Polygon","coordinates":[[[10.542,56.213],[10.554,56.213],[10.554,56.223],[10.542,56.223],[10.542,56.213]]]}'::jsonb
)
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into map_layers (name, slug, category, provider, layer_type, is_active, requires_api_key, refresh_interval, status) values
  ('Projektområde',        'project_area',     'nature',    null,           'geojson', true,  false, null,       'preview'),
  ('Beskyttet natur (§3)', 'protected_nature', 'nature',    'Miljøportal',  'wfs',     true,  false, '24h',      'preview'),
  ('Vandløb',              'watercourses',     'water',     'Miljøportal',  'wfs',     true,  false, '24h',      'preview'),
  ('Jordbundstyper',       'soil_types',       'terrain',   'GEUS',         'wms',     true,  false, '7d',       'preview'),
  ('Sentinel-2 NDVI',      'sentinel_ndvi',    'satellite', 'Copernicus',   'tile',    false, true,  '5d',       'preview'),
  ('IoT Feltsensorer',     'sensors',          'sensors',   'GoFreyra IoT', 'sensor',  true,  false, 'realtime', 'preview')
on conflict (slug) do nothing;

insert into project_areas (project_id, name, area_type, geojson, area_ha) values
  ('10000000-0000-0000-0000-000000000001', 'Skallebæk Pilotområde', 'pilot_area',
   '{"type":"Polygon","coordinates":[[[9.4821,55.2514],[9.4835,55.2514],[9.4835,55.2525],[9.4821,55.2525],[9.4821,55.2514]]]}'::jsonb, 7.3)
on conflict do nothing;

insert into geo_observations (project_id, observation_type, value, unit, properties, observed_at, geojson) values
  ('10000000-0000-0000-0000-000000000001', 'soil_moisture',     38.2, '%',    '{"zone":"A"}'::jsonb, now()-interval '2h',  '{"type":"Point","coordinates":[9.4823,55.2516]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'temperature',       14.7, '°C',   '{"zone":"A"}'::jsonb, now()-interval '1h',  '{"type":"Point","coordinates":[9.4826,55.2518]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'acoustic_activity', 72.1, 'dB',   '{"zone":"B"}'::jsonb, now()-interval '30m', '{"type":"Point","coordinates":[9.4830,55.2521]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'vegetation_index',  0.68, 'NDVI', '{"zone":"B"}'::jsonb, now()-interval '5d',  '{"type":"Point","coordinates":[9.4828,55.2520]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'water_level',       1.23, 'm',    '{"zone":"C"}'::jsonb, now()-interval '45m', '{"type":"Point","coordinates":[9.4832,55.2515]}'::jsonb)
on conflict do nothing;

insert into calculated_metrics (project_id, metric_key, metric_label, value, unit, method) values
  ('10000000-0000-0000-0000-000000000001', 'total_area_ha',                  'Samlet areal',            7.3,  'ha', 'shoelace'),
  ('10000000-0000-0000-0000-000000000001', 'protected_nature_overlap_ha',    'Beskyttet natur overlap',  4.1,  'ha', 'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'nearest_watercourse_distance_m', 'Nærmeste vandløb',        85.0,  'm',  'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'ndvi_mean',                      'NDVI (Sentinel-2)',        0.68, null, 'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'data_completeness_score',        'Datakomplethed',          78.0,  '%',  'simulated')
on conflict do nothing;

insert into indicators (project_id, key, label, category, value, unit, trend, status) values
  ('10000000-0000-0000-0000-000000000001', 'biodiversity_index', 'Biodiversitetsindeks',  'biodiversity', 68.0, 'point', 'up',    'good'),
  ('10000000-0000-0000-0000-000000000001', 'soil_carbon',        'Jordbundskulstof',      'soil',          3.2, '%',     'up',    'good'),
  ('10000000-0000-0000-0000-000000000001', 'water_quality',      'Vandkvalitet',          'water',        82.0, 'point', 'stable','good'),
  ('10000000-0000-0000-0000-000000000001', 'invasive_species',   'Invasive arter',        'nature',        2.0, 'arter', 'down',  'warning'),
  ('10000000-0000-0000-0000-000000000001', 'bird_species_count', 'Fuglearter observeret', 'biodiversity', 23.0, 'arter', 'up',    'good'),
  ('10000000-0000-0000-0000-000000000001', 'co2_sequestration',  'CO₂-binding',           'climate',      12.4, 't/år',  'up',    'good'),
  ('10000000-0000-0000-0000-000000000002', 'biodiversity_index', 'Biodiversitetsindeks',  'biodiversity', 55.0, 'point', 'stable','warning'),
  ('10000000-0000-0000-0000-000000000002', 'rewilding_progress', 'Rewilding fremskridt',  'nature',       34.0, '%',     'up',    'warning'),
  ('10000000-0000-0000-0000-000000000003', 'biodiversity_index', 'Biodiversitetsindeks',  'biodiversity', 40.0, 'point', 'stable','warning')
on conflict (project_id, key) do update set value=excluded.value, trend=excluded.trend, status=excluded.status, updated_at=now();

insert into actions (project_id, title, description, priority, status, due_date, owner) values
  ('10000000-0000-0000-0000-000000000001', 'Fjern invasive bjørneklo',      'Mekanisk bekæmpelse langs sydlig skovkant', 'Høj',    'open', current_date+14, 'Lars Nielsen'),
  ('10000000-0000-0000-0000-000000000001', 'Upload jordbundsanalyse Q2',    'Lab-rapport fra maj-prøvetagning',          'Medium', 'open', current_date+7,  'Anna Skov'),
  ('10000000-0000-0000-0000-000000000001', 'Kalibrér sensor T-03',          'Temperaturafvigelse registreret',           'Høj',    'open', current_date+3,  'IoT Team'),
  ('10000000-0000-0000-0000-000000000001', 'Feltregistrering fugle (juni)', 'Transektoptælling zone B og C',             'Medium', 'open', current_date+21, 'Marie Fugl'),
  ('10000000-0000-0000-0000-000000000002', 'Opsæt vandstandsmåler',         'Sensor mangler ved bæk-indløb nord',        'Høj',    'open', current_date+10, 'IoT Team'),
  ('10000000-0000-0000-0000-000000000002', 'Indhent tilladelse til hegning','Ansøgning til Vejle Kommune',               'Høj',    'open', current_date+30, 'Projekt PM'),
  ('10000000-0000-0000-0000-000000000003', 'Kickoff-møde med lodsejere',    'Første orienteringsmøde om projektet',      'Høj',    'open', current_date+7,  'Projekt PM')
on conflict do nothing;

insert into audit_events (project_id, event_type, title, description, actor, source) values
  ('10000000-0000-0000-0000-000000000001', 'data_upload',    'Jordbundsanalyse uploadet',      'Q1 lab-rapport fra ECO-Lab',        'Anna Skov',  'manual'),
  ('10000000-0000-0000-0000-000000000001', 'sensor_event',   'Ny sensoraflæsning registreret', 'Sensor T-01 rapporterede 14.7°C',   'IoT system', 'automated'),
  ('10000000-0000-0000-0000-000000000001', 'field_survey',   'Feltregistrering gennemført',    '23 fuglearter observeret i zone B', 'Marie Fugl', 'manual'),
  ('10000000-0000-0000-0000-000000000002', 'project_created','Projekt oprettet',               'Vejle Ådal Rewilding sat i gang',   'Projekt PM', 'manual')
on conflict do nothing;

insert into reports (project_id, title, report_type, status, period_start, period_end, summary) values
  ('10000000-0000-0000-0000-000000000001', 'Q1 2024 Naturstatus',   'quarterly', 'approved', '2024-01-01','2024-03-31','Stabil biodiversitetsudvikling. 23 fuglearter, jordbundskulstof +0.2%.'),
  ('10000000-0000-0000-0000-000000000001', 'Årsrapport 2023',       'annual',    'approved', '2023-01-01','2023-12-31','Første driftsår. Baseline etableret, invasive arter reduceret med 40%.'),
  ('10000000-0000-0000-0000-000000000001', 'Q2 2024 Naturstatus',   'quarterly', 'draft',    '2024-04-01','2024-06-30', null),
  ('10000000-0000-0000-0000-000000000002', 'Baseline-rapport 2023', 'baseline',  'approved', '2023-09-01','2023-12-31','Udgangspunkt for rewilding-intervention dokumenteret.')
on conflict do nothing;