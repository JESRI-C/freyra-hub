-- ============ MIGRATION 001: Core schema ============
create extension if not exists "uuid-ossp";

create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null, type text, country text default 'Denmark',
  created_at timestamptz default now()
);

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null, slug text unique, project_type text,
  location_name text, municipality text, country text default 'Denmark',
  status text, start_date date, end_date date, description text,
  created_at timestamptz default now()
);

create table if not exists sites (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  name text not null, site_type text, area_ha numeric,
  geometry_geojson jsonb, baseline_status text,
  created_at timestamptz default now()
);

create table if not exists data_sources (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  name text not null, source_type text, provider text, status text,
  last_sync_at timestamptz, created_at timestamptz default now()
);

create table if not exists sensors (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  site_id uuid references sites(id) on delete set null,
  name text not null, sensor_type text, status text,
  lat numeric, lng numeric, last_seen_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists observations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  site_id uuid references sites(id) on delete set null,
  source_id uuid references data_sources(id) on delete set null,
  observation_type text, indicator_key text, value numeric, unit text,
  confidence numeric, observed_at timestamptz, metadata jsonb,
  created_at timestamptz default now()
);
create index if not exists observations_project_id_idx on observations(project_id);
create index if not exists observations_observed_at_idx on observations(observed_at desc);
create index if not exists observations_indicator_key_idx on observations(indicator_key);

create table if not exists indicators (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  key text not null, label text not null, category text,
  value numeric, unit text, trend text, status text,
  updated_at timestamptz default now()
);
create index if not exists indicators_project_id_idx on indicators(project_id);
create unique index if not exists indicators_project_key_idx on indicators(project_id, key);

create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  title text not null, report_type text, status text,
  period_start date, period_end date, summary text,
  created_at timestamptz default now()
);

create table if not exists evidence_files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  report_id uuid references reports(id) on delete set null,
  title text not null, file_type text, file_url text, evidence_type text,
  created_at timestamptz default now()
);

create table if not exists audit_events (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  event_type text, title text not null, description text,
  actor text, source text, hash text,
  created_at timestamptz default now()
);
create index if not exists audit_events_project_id_idx on audit_events(project_id);
create index if not exists audit_events_created_at_idx on audit_events(created_at desc);

create table if not exists actions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  title text not null, description text, priority text, status text,
  due_date date, owner text, created_at timestamptz default now()
);

create table if not exists impact_units (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  unit_type text, quantity numeric, status text,
  verification_status text, issued_at timestamptz, metadata jsonb,
  created_at timestamptz default now()
);

-- ============ MIGRATION 003: Construction ============
create table if not exists construction_projects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  developer_name text, contractor_name text, consultant_name text,
  construction_type text, construction_phase text, parcel_reference text,
  building_area_m2 numeric, paved_area_m2 numeric,
  expected_start_date date, expected_end_date date,
  authority_contact text, created_at timestamptz default now()
);
create index if not exists construction_projects_project_id_idx on construction_projects(project_id);

create table if not exists nature_contexts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  adjacent_nature_type text, watercourse_present boolean, watercourse_name text,
  distance_to_watercourse_m numeric, protected_nature_present boolean,
  protected_nature_type text, natura2000_nearby boolean,
  distance_to_natura2000_m numeric, buffer_zone_m numeric,
  terrain_slope_description text, sensitive_receptors text,
  created_at timestamptz default now()
);
create index if not exists nature_contexts_project_id_idx on nature_contexts(project_id);

create table if not exists runoff_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  runoff_destination text, drainage_principle text, retention_solution text,
  treatment_solution text, oil_separator_present boolean,
  sediment_control_present boolean, discharge_point_description text,
  estimated_runoff_volume_m3 numeric, design_rain_event text,
  maintenance_responsibility text, created_at timestamptz default now()
);
create index if not exists runoff_profiles_project_id_idx on runoff_profiles(project_id);

create table if not exists environmental_risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  risk_type text, title text not null, description text,
  severity text, likelihood text, status text,
  mitigation_summary text, responsible_party text,
  created_at timestamptz default now()
);
create index if not exists environmental_risks_project_id_idx on environmental_risks(project_id);
create index if not exists environmental_risks_severity_idx on environmental_risks(severity);
create index if not exists environmental_risks_status_idx on environmental_risks(status);

create table if not exists mitigation_measures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  risk_id uuid references environmental_risks(id) on delete set null,
  title text not null, description text, measure_type text, status text,
  due_date date, responsible_party text, verification_method text,
  created_at timestamptz default now()
);
create index if not exists mitigation_measures_project_id_idx on mitigation_measures(project_id);
create index if not exists mitigation_measures_risk_id_idx on mitigation_measures(risk_id);
create index if not exists mitigation_measures_status_idx on mitigation_measures(status);

create table if not exists authority_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null, authority_name text, submission_type text,
  status text, submitted_at timestamptz, response_due_date date,
  summary text, created_at timestamptz default now()
);
create index if not exists authority_submissions_project_id_idx on authority_submissions(project_id);
create index if not exists authority_submissions_status_idx on authority_submissions(status);

-- ============ MIGRATION 004: Connector logs ============
create table if not exists connector_fetch_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  connector_id text not null, connector_name text not null,
  status text not null, summary text,
  fetched_at timestamptz default now(), metadata jsonb
);
create index if not exists idx_connector_fetch_logs_project on connector_fetch_logs(project_id, fetched_at desc);

-- ============ MIGRATION 005: Project geometry ============
alter table projects
  add column if not exists geometry_polygon jsonb,
  add column if not exists geometry_centroid_lat numeric,
  add column if not exists geometry_centroid_lng numeric,
  add column if not exists geometry_area_ha numeric,
  add column if not exists geometry_source text default 'none';
create index if not exists idx_projects_centroid
  on projects(geometry_centroid_lat, geometry_centroid_lng)
  where geometry_centroid_lat is not null;

-- ============ MIGRATION 006: Project media ============
create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, description text,
  category text not null check (category in ('field_photo','drone_image','satellite_snapshot','before_after','document_scan','biodiversity_observation','water_observation','soil_observation')),
  source text not null check (source in ('field_upload','drone','copernicus','drone_api','manual')),
  file_path text not null, url text not null, thumbnail_url text,
  uploaded_at timestamptz not null default now(),
  captured_at timestamptz,
  lat double precision, lng double precision,
  altitude_m double precision, accuracy_m double precision,
  is_report_ready boolean not null default false,
  tags text[] not null default '{}',
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','report_ready','archived')),
  file_size_bytes bigint, mime_type text
);

-- ============ MIGRATION 007: Geospatial MVP ============
create extension if not exists postgis;

create table if not exists project_areas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null, area_type text default 'pilot_area',
  geom geometry(Polygon, 4326), geojson jsonb,
  area_ha numeric, created_at timestamptz default now()
);
create index if not exists idx_project_areas_project_id on project_areas(project_id);
create index if not exists idx_project_areas_geom on project_areas using gist(geom) where geom is not null;

create table if not exists map_layers (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null, category text not null,
  provider text, layer_type text not null, source_url text,
  is_active boolean default true, requires_api_key boolean default false,
  refresh_interval text, status text default 'preview',
  created_at timestamptz default now()
);
create index if not exists idx_map_layers_slug on map_layers(slug);
create index if not exists idx_map_layers_category on map_layers(category);

create table if not exists geo_features (
  id uuid primary key default gen_random_uuid(),
  layer_id uuid references map_layers(id) on delete cascade,
  external_id text, name text, feature_type text,
  properties jsonb default '{}', geom geometry(Geometry, 4326), geojson jsonb,
  valid_from date, valid_to date, created_at timestamptz default now()
);
create index if not exists idx_geo_features_layer_id on geo_features(layer_id);
create index if not exists idx_geo_features_geom on geo_features using gist(geom) where geom is not null;
create index if not exists idx_geo_features_properties on geo_features using gin(properties);

create table if not exists geo_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  layer_id uuid references map_layers(id),
  observation_type text not null, value numeric, unit text,
  properties jsonb default '{}', observed_at timestamptz not null,
  geom geometry(Point, 4326), geojson jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_geo_obs_project_id on geo_observations(project_id);
create index if not exists idx_geo_obs_observed_at on geo_observations(observed_at desc);
create index if not exists idx_geo_obs_geom on geo_observations using gist(geom) where geom is not null;
create index if not exists idx_geo_obs_properties on geo_observations using gin(properties);

create table if not exists calculated_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  project_area_id uuid references project_areas(id) on delete cascade,
  metric_key text not null, metric_label text not null,
  value numeric, unit text, method text,
  calculated_at timestamptz default now(),
  properties jsonb default '{}'
);
create index if not exists idx_metrics_project_id on calculated_metrics(project_id);
create index if not exists idx_metrics_key on calculated_metrics(metric_key);
create index if not exists idx_metrics_properties on calculated_metrics using gin(properties);

-- ============ RLS + GRANTS for all created tables ============
do $$
declare t text;
begin
  for t in select unnest(array[
    'organizations','projects','sites','data_sources','sensors','observations',
    'indicators','reports','evidence_files','audit_events','actions','impact_units',
    'construction_projects','nature_contexts','runoff_profiles','environmental_risks',
    'mitigation_measures','authority_submissions','connector_fetch_logs',
    'project_media','project_areas','map_layers','geo_features','geo_observations',
    'calculated_metrics'
  ]) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant all on public.%I to service_role', t);
    begin
      execute format('create policy "dev_read_all" on public.%I for select using (true)', t);
    exception when duplicate_object then null; end;
    begin
      execute format('create policy "auth_write_all" on public.%I for insert to authenticated with check (true)', t);
    exception when duplicate_object then null; end;
    begin
      execute format('create policy "auth_update_all" on public.%I for update to authenticated using (true) with check (true)', t);
    exception when duplicate_object then null; end;
    begin
      execute format('create policy "auth_delete_all" on public.%I for delete to authenticated using (true)', t);
    exception when duplicate_object then null; end;
  end loop;
end$$;