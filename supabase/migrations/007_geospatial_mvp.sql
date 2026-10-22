-- GoFreyra Geospatial MVP — Migration 007
-- Adds: project_areas, map_layers, geo_features, calculated_metrics
-- SQL functions: get_project_geojson, get_project_metrics
-- Run via: Supabase SQL Editor or `supabase db push`

-- ─── PostGIS ─────────────────────────────────────────────────────────────────
-- PostGIS is used if available. If your Supabase plan does not include it,
-- remove the 'geom' columns and rely solely on the 'geojson jsonb' fallback.
create extension if not exists postgis;

-- ─── project_areas ────────────────────────────────────────────────────────────
-- Polygon boundaries for a project (can have multiple zones per project)
create table if not exists project_areas (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade,
  name         text not null,
  area_type    text default 'pilot_area',   -- pilot_area | buffer | exclusion | reference
  geom         geometry(Polygon, 4326),     -- PostGIS column (nullable fallback)
  geojson      jsonb,                       -- always stored for non-PostGIS fallback
  area_ha      numeric,
  created_at   timestamptz default now()
);

create index if not exists idx_project_areas_project_id on project_areas(project_id);
create index if not exists idx_project_areas_geom on project_areas using gist(geom)
  where geom is not null;

-- ─── map_layers ───────────────────────────────────────────────────────────────
-- Registry of available data layers (nature, satellite, sensors, etc.)
create table if not exists map_layers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text unique not null,
  category          text not null,          -- nature | satellite | sensors | terrain | water
  provider          text,
  layer_type        text not null,          -- geojson | wms | wfs | tile | sensor
  source_url        text,
  is_active         boolean default true,
  requires_api_key  boolean default false,
  refresh_interval  text,                   -- e.g. '1h', '24h', 'realtime'
  status            text default 'preview', -- live | preview | unavailable
  created_at        timestamptz default now()
);

create index if not exists idx_map_layers_slug on map_layers(slug);
create index if not exists idx_map_layers_category on map_layers(category);

-- ─── geo_features ─────────────────────────────────────────────────────────────
-- Individual geographic features belonging to a layer
create table if not exists geo_features (
  id           uuid primary key default gen_random_uuid(),
  layer_id     uuid references map_layers(id) on delete cascade,
  external_id  text,
  name         text,
  feature_type text,
  properties   jsonb default '{}',
  geom         geometry(Geometry, 4326),   -- PostGIS (nullable)
  geojson      jsonb,                      -- GeoJSON fallback always stored
  valid_from   date,
  valid_to     date,
  created_at   timestamptz default now()
);

create index if not exists idx_geo_features_layer_id on geo_features(layer_id);
create index if not exists idx_geo_features_geom on geo_features using gist(geom)
  where geom is not null;
create index if not exists idx_geo_features_properties on geo_features using gin(properties);

-- ─── observations (geospatial extension) ──────────────────────────────────────
-- Point observations linked to a project and optional layer
-- (supplements the core schema's indicator-based observations)
create table if not exists geo_observations (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references projects(id) on delete cascade,
  layer_id         uuid references map_layers(id),
  observation_type text not null,
  value            numeric,
  unit             text,
  properties       jsonb default '{}',
  observed_at      timestamptz not null,
  geom             geometry(Point, 4326),  -- PostGIS (nullable)
  geojson          jsonb,                  -- {type:'Point', coordinates:[lng,lat]}
  created_at       timestamptz default now()
);

create index if not exists idx_geo_obs_project_id on geo_observations(project_id);
create index if not exists idx_geo_obs_observed_at on geo_observations(observed_at desc);
create index if not exists idx_geo_obs_geom on geo_observations using gist(geom)
  where geom is not null;
create index if not exists idx_geo_obs_properties on geo_observations using gin(properties);

-- ─── calculated_metrics ───────────────────────────────────────────────────────
-- Pre-calculated or cached metrics per project / project area
create table if not exists calculated_metrics (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references projects(id) on delete cascade,
  project_area_id  uuid references project_areas(id) on delete cascade,
  metric_key       text not null,   -- e.g. total_area_ha, ndvi_mean, overlap_ha
  metric_label     text not null,
  value            numeric,
  unit             text,
  method           text,            -- shoelace | postgis | sentinel | simulated
  calculated_at    timestamptz default now(),
  properties       jsonb default '{}'
);

create index if not exists idx_metrics_project_id on calculated_metrics(project_id);
create index if not exists idx_metrics_key on calculated_metrics(metric_key);
create index if not exists idx_metrics_properties on calculated_metrics using gin(properties);

-- ─── SQL function: get_project_geojson ───────────────────────────────────────
-- Returns a GeoJSON FeatureCollection with:
--   - project areas (polygon features)
--   - geo_features within ~1 km of project centroid (point/polygon features)
--   - geo_observations for the project (point features)
create or replace function get_project_geojson(input_project_id uuid)
returns jsonb
language sql
stable
as $$
  with
  proj as (
    select
      id,
      name,
      geometry_centroid_lat as lat,
      geometry_centroid_lng as lng,
      geometry_polygon as polygon_geojson
    from projects
    where id = input_project_id
  ),
  areas as (
    select
      json_build_object(
        'type', 'Feature',
        'id', pa.id,
        'geometry', coalesce(
          st_asgeojson(pa.geom)::jsonb,
          pa.geojson
        ),
        'properties', json_build_object(
          'feature_class', 'project_area',
          'name', pa.name,
          'area_type', pa.area_type,
          'area_ha', pa.area_ha
        )
      ) as feature
    from project_areas pa
    where pa.project_id = input_project_id
      and (pa.geom is not null or pa.geojson is not null)
  ),
  observations as (
    select
      json_build_object(
        'type', 'Feature',
        'id', go.id,
        'geometry', coalesce(
          st_asgeojson(go.geom)::jsonb,
          go.geojson
        ),
        'properties', json_build_object(
          'feature_class', 'observation',
          'observation_type', go.observation_type,
          'value', go.value,
          'unit', go.unit,
          'observed_at', go.observed_at
        )
      ) as feature
    from geo_observations go
    where go.project_id = input_project_id
      and (go.geom is not null or go.geojson is not null)
    limit 200
  ),
  all_features as (
    select feature from areas
    union all
    select feature from observations
  )
  select json_build_object(
    'type', 'FeatureCollection',
    'project_id', input_project_id,
    'project_name', (select name from proj),
    'generated_at', now(),
    'features', coalesce(json_agg(feature), '[]'::json)
  )::jsonb
  from all_features
$$;

-- ─── SQL function: get_project_metrics ───────────────────────────────────────
-- Returns aggregated metrics for a project.
-- Falls back to calculated_metrics table; computes from geometry if possible.
create or replace function get_project_metrics(input_project_id uuid)
returns jsonb
language sql
stable
as $$
  with
  proj as (
    select
      geometry_area_ha,
      geometry_centroid_lat as lat,
      geometry_centroid_lng as lng
    from projects
    where id = input_project_id
  ),
  obs_count as (
    select count(*) as cnt
    from geo_observations
    where project_id = input_project_id
  ),
  latest_ndvi as (
    select value
    from calculated_metrics
    where project_id = input_project_id
      and metric_key = 'ndvi_mean'
    order by calculated_at desc
    limit 1
  ),
  overlap_ha as (
    select value
    from calculated_metrics
    where project_id = input_project_id
      and metric_key = 'protected_nature_overlap_ha'
    order by calculated_at desc
    limit 1
  ),
  watercourse_dist as (
    select value
    from calculated_metrics
    where project_id = input_project_id
      and metric_key = 'nearest_watercourse_distance_m'
    order by calculated_at desc
    limit 1
  ),
  completeness as (
    select value
    from calculated_metrics
    where project_id = input_project_id
      and metric_key = 'data_completeness_score'
    order by calculated_at desc
    limit 1
  )
  select json_build_object(
    'project_id', input_project_id,
    'total_area_ha', coalesce((select geometry_area_ha from proj), 0),
    'protected_nature_overlap_ha', coalesce((select value from overlap_ha), null),
    'observation_count', (select cnt from obs_count),
    'nearest_watercourse_distance_m', coalesce((select value from watercourse_dist), null),
    'latest_ndvi', coalesce((select value from latest_ndvi), null),
    'data_completeness_score', coalesce((select value from completeness), null),
    'calculated_at', now()
  )::jsonb
$$;

-- ─── Seed: map_layers ────────────────────────────────────────────────────────
insert into map_layers (name, slug, category, provider, layer_type, is_active, requires_api_key, refresh_interval, status) values
  ('Beskyttet natur (§3)',   'protected_nature',  'nature',    'Miljøportal',  'wfs',    true,  false, '24h',      'preview'),
  ('Vandløb',                'watercourses',      'water',     'Miljøportal',  'wfs',    true,  false, '24h',      'preview'),
  ('Jordbundstyper',         'soil_types',        'terrain',   'GEUS',         'wms',    true,  false, '7d',       'preview'),
  ('Sentinel-2 NDVI',        'sentinel_ndvi',     'satellite', 'Copernicus',   'tile',   true,  true,  '5d',       'preview'),
  ('IoT Feltsensorer',       'sensors',           'sensors',   'GoFreyra IoT', 'sensor', true,  false, 'realtime', 'preview')
on conflict (slug) do nothing;

-- ─── Seed: project area for Skallebæk ────────────────────────────────────────
-- Uses the same coordinates as SEED_PROJECT_GEOMETRIES in platform-seed.ts
insert into project_areas (project_id, name, area_type, geojson, area_ha)
values (
  '10000000-0000-0000-0000-000000000001',
  'Skallebæk Pilotområde',
  'pilot_area',
  '{
    "type": "Polygon",
    "coordinates": [[[9.4821,55.2514],[9.4835,55.2514],[9.4835,55.2525],[9.4821,55.2525],[9.4821,55.2514]]]
  }'::jsonb,
  7.3
)
on conflict do nothing;

-- ─── Seed: demo geo_observations for Skallebæk ───────────────────────────────
insert into geo_observations (project_id, observation_type, value, unit, properties, observed_at, geojson) values
  ('10000000-0000-0000-0000-000000000001', 'soil_moisture',     38.2, '%',    '{"zone":"A","depth_cm":20}'::jsonb,  now() - interval '2 hours',   '{"type":"Point","coordinates":[9.4823,55.2516]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'temperature',       14.7, '°C',   '{"zone":"A","sensor":"T-01"}'::jsonb, now() - interval '1 hour',    '{"type":"Point","coordinates":[9.4826,55.2518]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'acoustic_activity', 72.1, 'dB',   '{"zone":"B","species":"fugle"}'::jsonb, now() - interval '30 min', '{"type":"Point","coordinates":[9.4830,55.2521]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'vegetation_index',  0.68, 'NDVI', '{"source":"sentinel-2"}'::jsonb,      now() - interval '5 days',   '{"type":"Point","coordinates":[9.4828,55.2520]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'water_level',       1.23, 'm',    '{"zone":"C","stream":"Skallebæk Å"}'::jsonb, now() - interval '45 min', '{"type":"Point","coordinates":[9.4832,55.2515]}'::jsonb)
on conflict do nothing;

-- ─── Seed: calculated_metrics for Skallebæk ──────────────────────────────────
insert into calculated_metrics (project_id, metric_key, metric_label, value, unit, method) values
  ('10000000-0000-0000-0000-000000000001', 'total_area_ha',                    'Samlet areal',              7.3,   'ha',   'shoelace'),
  ('10000000-0000-0000-0000-000000000001', 'protected_nature_overlap_ha',      'Beskyttet natur overlap',   4.1,   'ha',   'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'nearest_watercourse_distance_m',   'Nærmeste vandløb',          85,    'm',    'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'ndvi_mean',                        'NDVI (Sentinel-2)',         0.68,  null,   'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'data_completeness_score',          'Datakomplethed',            78,    '%',    'simulated')
on conflict do nothing;
