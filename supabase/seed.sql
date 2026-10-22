-- GoFreyra Demo Seed
-- Paste this entire file into: Supabase → SQL Editor → Run
-- Safe to re-run (uses ON CONFLICT DO NOTHING / DO UPDATE)

-- ─── 1. Organisation ─────────────────────────────────────────────────────────
insert into organizations (id, name, type, country)
values ('00000000-0000-0000-0000-000000000001', 'GoFreyra Demo Org', 'ngo', 'Denmark')
on conflict (id) do nothing;

-- ─── 2. Projekter ────────────────────────────────────────────────────────────
insert into projects (
  id, organization_id, name, slug, project_type, location_name, municipality,
  status, description, start_date,
  geometry_centroid_lat, geometry_centroid_lng, geometry_area_ha, geometry_source,
  geometry_polygon
) values
(
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Skallebæk Biodiversity Pilot',
  'skallebaek-biodiversity-pilot',
  'nature_restoration',
  'Skallebæk Å-dal',
  'Vejle',
  'active',
  'Pilotprojekt for biodiversitetsgendannelse langs Skallebæk Å med fokus på §3-natur, fugleovervågning og jordbundsrestauration.',
  '2024-01-15',
  55.252, 9.4828, 7.3, 'manual',
  '{"type":"Polygon","coordinates":[[[9.4821,55.2514],[9.4835,55.2514],[9.4835,55.2525],[9.4821,55.2525],[9.4821,55.2514]]]}'::jsonb
),
(
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Vejle Ådal Rewilding',
  'vejle-aadal-rewilding',
  'rewilding',
  'Vejle Ådal',
  'Vejle',
  'active',
  'Rewilding af 42 ha ådalsterræn med naturlig hydrologi og vilde dyr.',
  '2023-09-01',
  55.706, 9.536, 42.0, 'manual',
  '{"type":"Polygon","coordinates":[[[9.530,55.700],[9.542,55.700],[9.542,55.712],[9.530,55.712],[9.530,55.700]]]}'::jsonb
),
(
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Mols Bjerge Naturprojekt',
  'mols-bjerge-naturprojekt',
  'nature_restoration',
  'Mols Bjerge',
  'Syddjurs',
  'planning',
  'Planlægning af hegning og invasiv arts-bekæmpelse i Nationalpark Mols Bjerge.',
  '2024-06-01',
  56.218, 10.548, 18.5, 'manual',
  '{"type":"Polygon","coordinates":[[[10.542,56.213],[10.554,56.213],[10.554,56.223],[10.542,56.223],[10.542,56.213]]]}'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  status = excluded.status;

-- ─── 3. Map Layers ───────────────────────────────────────────────────────────
insert into map_layers (name, slug, category, provider, layer_type, is_active, requires_api_key, refresh_interval, status) values
  ('Projektområde',          'project_area',      'nature',    null,           'geojson', true,  false, null,       'preview'),
  ('Beskyttet natur (§3)',   'protected_nature',  'nature',    'Miljøportal',  'wfs',     true,  false, '24h',      'preview'),
  ('Vandløb',                'watercourses',      'water',     'Miljøportal',  'wfs',     true,  false, '24h',      'preview'),
  ('Jordbundstyper',         'soil_types',        'terrain',   'GEUS',         'wms',     true,  false, '7d',       'preview'),
  ('Sentinel-2 NDVI',        'sentinel_ndvi',     'satellite', 'Copernicus',   'tile',    false, true,  '5d',       'preview'),
  ('IoT Feltsensorer',       'sensors',           'sensors',   'GoFreyra IoT', 'sensor',  true,  false, 'realtime', 'preview')
on conflict (slug) do nothing;

-- ─── 4. Projektområde (geo) ──────────────────────────────────────────────────
insert into project_areas (project_id, name, area_type, geojson, area_ha)
values (
  '10000000-0000-0000-0000-000000000001',
  'Skallebæk Pilotområde',
  'pilot_area',
  '{"type":"Polygon","coordinates":[[[9.4821,55.2514],[9.4835,55.2514],[9.4835,55.2525],[9.4821,55.2525],[9.4821,55.2514]]]}'::jsonb,
  7.3
)
on conflict do nothing;

-- ─── 5. Geo-observationer (Skallebæk) ────────────────────────────────────────
insert into geo_observations (project_id, observation_type, value, unit, properties, observed_at, geojson) values
  ('10000000-0000-0000-0000-000000000001', 'soil_moisture',     38.2, '%',    '{"zone":"A","depth_cm":20}'::jsonb,          now() - interval '2 hours',  '{"type":"Point","coordinates":[9.4823,55.2516]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'temperature',       14.7, '°C',   '{"zone":"A","sensor":"T-01"}'::jsonb,        now() - interval '1 hour',   '{"type":"Point","coordinates":[9.4826,55.2518]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'acoustic_activity', 72.1, 'dB',   '{"zone":"B","species":"fugle"}'::jsonb,      now() - interval '30 min',   '{"type":"Point","coordinates":[9.4830,55.2521]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'vegetation_index',  0.68, 'NDVI', '{"source":"sentinel-2"}'::jsonb,             now() - interval '5 days',   '{"type":"Point","coordinates":[9.4828,55.2520]}'::jsonb),
  ('10000000-0000-0000-0000-000000000001', 'water_level',       1.23, 'm',    '{"zone":"C","stream":"Skallebæk Å"}'::jsonb, now() - interval '45 min',   '{"type":"Point","coordinates":[9.4832,55.2515]}'::jsonb)
on conflict do nothing;

-- ─── 6. Beregnede metrics (Skallebæk) ────────────────────────────────────────
insert into calculated_metrics (project_id, metric_key, metric_label, value, unit, method) values
  ('10000000-0000-0000-0000-000000000001', 'total_area_ha',                  'Samlet areal',              7.3,  'ha',  'shoelace'),
  ('10000000-0000-0000-0000-000000000001', 'protected_nature_overlap_ha',    'Beskyttet natur overlap',   4.1,  'ha',  'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'nearest_watercourse_distance_m', 'Nærmeste vandløb',         85.0,  'm',   'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'ndvi_mean',                      'NDVI (Sentinel-2)',          0.68,  null, 'simulated'),
  ('10000000-0000-0000-0000-000000000001', 'data_completeness_score',        'Datakomplethed',            78.0,  '%',   'simulated')
on conflict do nothing;

-- ─── 7. Indikatorer ──────────────────────────────────────────────────────────
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
on conflict (project_id, key) do update set
  value      = excluded.value,
  trend      = excluded.trend,
  status     = excluded.status,
  updated_at = now();

-- ─── 8. Handlinger (actions) ─────────────────────────────────────────────────
insert into actions (project_id, title, description, priority, status, due_date, owner) values
  ('10000000-0000-0000-0000-000000000001', 'Fjern invasive bjørneklo',      'Mekanisk bekæmpelse langs sydlig skovkant', 'Høj',    'open', current_date + 14, 'Lars Nielsen'),
  ('10000000-0000-0000-0000-000000000001', 'Upload jordbundsanalyse Q2',    'Lab-rapport fra maj-prøvetagning',          'Medium', 'open', current_date + 7,  'Anna Skov'),
  ('10000000-0000-0000-0000-000000000001', 'Kalibrér sensor T-03',          'Temperaturafvigelse registreret',           'Høj',    'open', current_date + 3,  'IoT Team'),
  ('10000000-0000-0000-0000-000000000001', 'Feltregistrering fugle (juni)', 'Transektoptælling zone B og C',             'Medium', 'open', current_date + 21, 'Marie Fugl'),
  ('10000000-0000-0000-0000-000000000001', 'Opdatér §3-kortlægning',        'Ny afgrænsning efter vinteropmåling',       'Lav',    'open', current_date + 45, 'GIS-team'),
  ('10000000-0000-0000-0000-000000000002', 'Opsæt vandstandsmåler',         'Sensor mangler ved bæk-indløb nord',        'Høj',    'open', current_date + 10, 'IoT Team'),
  ('10000000-0000-0000-0000-000000000002', 'Indhent tilladelse til hegning','Ansøgning til Vejle Kommune',               'Høj',    'open', current_date + 30, 'Projekt PM'),
  ('10000000-0000-0000-0000-000000000003', 'Kickoff-møde med lodsejere',    'Første orienteringsmøde om projektet',      'Høj',    'open', current_date + 7,  'Projekt PM')
on conflict do nothing;

-- ─── 9. Observationer ────────────────────────────────────────────────────────
insert into observations (project_id, observation_type, indicator_key, value, unit, confidence, observed_at) values
  ('10000000-0000-0000-0000-000000000001', 'field',  'biodiversity_index', 68.0, 'point', 0.85, now() - interval '3 days'),
  ('10000000-0000-0000-0000-000000000001', 'sensor', 'soil_moisture',      38.2, '%',     0.95, now() - interval '2 hours'),
  ('10000000-0000-0000-0000-000000000001', 'sensor', 'soil_carbon',         3.2, '%',     0.90, now() - interval '1 day'),
  ('10000000-0000-0000-0000-000000000001', 'remote', 'vegetation_index',    0.68,'NDVI',  0.80, now() - interval '5 days'),
  ('10000000-0000-0000-0000-000000000002', 'field',  'biodiversity_index', 55.0, 'point', 0.75, now() - interval '7 days')
on conflict do nothing;

-- ─── 10. Audit events ────────────────────────────────────────────────────────
insert into audit_events (project_id, event_type, title, description, actor, source) values
  ('10000000-0000-0000-0000-000000000001', 'data_upload',    'Jordbundsanalyse uploadet',      'Q1 lab-rapport fra ECO-Lab',        'Anna Skov',  'manual'),
  ('10000000-0000-0000-0000-000000000001', 'sensor_event',   'Ny sensoraflæsning registreret', 'Sensor T-01 rapporterede 14.7°C',   'IoT system', 'automated'),
  ('10000000-0000-0000-0000-000000000001', 'field_survey',   'Feltregistrering gennemført',    '23 fuglearter observeret i zone B', 'Marie Fugl', 'manual'),
  ('10000000-0000-0000-0000-000000000001', 'report_created', 'Kvartalsrapport oprettet',       'Q1 2024 rapport klar til review',   'Lars Nielsen','manual'),
  ('10000000-0000-0000-0000-000000000002', 'project_created','Projekt oprettet',               'Vejle Ådal Rewilding projekt sat i gang','Projekt PM','manual')
on conflict do nothing;

-- ─── 11. Rapporter ───────────────────────────────────────────────────────────
insert into reports (project_id, title, report_type, status, period_start, period_end, summary) values
  ('10000000-0000-0000-0000-000000000001', 'Q1 2024 Naturstatus',   'quarterly', 'approved', '2024-01-01', '2024-03-31', 'Stabil biodiversitetsudvikling. 23 fuglearter, jordbundskulstof +0.2%.'),
  ('10000000-0000-0000-0000-000000000001', 'Årsrapport 2023',       'annual',    'approved', '2023-01-01', '2023-12-31', 'Første driftsår. Baseline etableret, invasive arter reduceret med 40%.'),
  ('10000000-0000-0000-0000-000000000001', 'Q2 2024 Naturstatus',   'quarterly', 'draft',    '2024-04-01', '2024-06-30', null),
  ('10000000-0000-0000-0000-000000000002', 'Baseline-rapport 2023', 'baseline',  'approved', '2023-09-01', '2023-12-31', 'Udgangspunkt for rewilding-intervention dokumenteret.')
on conflict do nothing;

-- ─── 12. RLS: åbn for INSERT/UPDATE i dev ────────────────────────────────────
-- Kør dette så app'en kan skrive data uden auth.
-- VIGTIGT: erstat med bruger-baserede policies inden produktion!
do $$
declare
  tbl text;
  tbls text[] := array[
    'organizations','projects','sites','data_sources','sensors','observations',
    'indicators','reports','evidence_files','audit_events','actions','impact_units',
    'map_layers','project_areas','geo_features','geo_observations','calculated_metrics'
  ];
begin
  foreach tbl in array tbls loop
    begin
      execute format(
        'create policy "dev_all" on %I for all using (true) with check (true)', tbl
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ─── Tjek resultater ─────────────────────────────────────────────────────────
select 'projects'          as tabel, count(*) as rækker from projects
union all
select 'indicators',       count(*) from indicators
union all
select 'actions',          count(*) from actions
union all
select 'map_layers',       count(*) from map_layers
union all
select 'project_areas',    count(*) from project_areas
union all
select 'geo_observations', count(*) from geo_observations
union all
select 'calculated_metrics', count(*) from calculated_metrics
union all
select 'reports',          count(*) from reports
union all
select 'audit_events',     count(*) from audit_events
order by tabel;
