-- The guarded CI runner has committed the migration; this is a new connection.
begin;
do $prepared$
begin
 if to_regclass('postgis_upgrade_acceptance.proof') is null then
   raise exception 'Run only after the guarded disposable fixture'; end if;
end $prepared$;
create extension if not exists pgtap with schema extensions;
select no_plan();
select is((select n.nspname::text from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis'),
 'extensions','PostGIS is outside the public API schema');
select is(to_regclass('public.spatial_ref_sys')::text,null::text,'reference data has no public table endpoint');
select is(to_regtype('public.geometry')::text,null::text,'public PostGIS types are removed');
select is(postgis_upgrade_acceptance.capture('extensions'),
 (select payload from postgis_upgrade_acceptance.proof where kind='state'),
 'all original rows, EWKB, references and RPC privileges are unchanged');
select is((select count(*)::integer from pg_attribute where attrelid in
 ('public.geo_features'::regclass,'public.geo_observations'::regclass,'public.project_areas'::regclass)
 and attname='geom' and atttypid='extensions.geometry'::regtype),3,'all three columns use the restored geometry type');
select is(col_description('public.geo_observations'::regclass,9),
 'Synthetic migration preservation check','the original column position and comment survive');
select ok((select attacl is not null from pg_attribute
 where attrelid='public.geo_observations'::regclass and attname='geom'),'column privileges survive');
select is((select count(*)::integer from pg_index where indexrelid in
 ('public.idx_geo_features_geom'::regclass,'public.idx_geo_obs_geom'::regclass,'public.idx_project_areas_geom'::regclass)
 and indisvalid and indisready),3,'all three spatial indexes are valid and ready');
select is((select extensions.st_asgeojson(geom)::jsonb from public.geo_observations
 where id='fc550000-0000-4000-8000-000000000041'),'{"type":"Point","coordinates":[0,0]}'::jsonb,
 'measured zero coordinates stay zero');
select ok((select geom is null and geojson->>'type'='Point' from public.geo_observations
 where id='fc550000-0000-4000-8000-000000000042'),'GeoJSON fallback remains separate from nullable geometry');
select ok((select geom is null and geojson is null from public.geo_observations
 where id='fc550000-0000-4000-8000-000000000043'),'a missing location is not fabricated');
select ok((select value=0 and properties->'checked'='false'::jsonb from public.geo_observations
 where id='fc550000-0000-4000-8000-000000000041'),'non-spatial zero and false survive');
select ok((select extensions.st_isvalid(geom) from public.project_areas
 where id='fc550000-0000-4000-8000-000000000051'),'the typed polygon remains valid');
select is((select count(*)::integer from extensions.spatial_ref_sys where srid=4326),1,'standard SRID lookup works');
select is((select auth_name::text from extensions.spatial_ref_sys where srid=998998),'SYNTHETIC','custom SRIDs survive');
select is(extensions.st_srid(extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(9,55),4326),25832)),
 25832,'a fresh connection can transform with restored reference data');
select ok(extensions.st_x(extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(9,55),4326),25832))
 between 499000 and 501000,'coordinate conversion has the expected UTM central meridian');
select ok(not has_function_privilege('anon','public.get_project_geojson(uuid)','EXECUTE'),'anonymous RPC access remains denied');
select ok(not (select prosecdef from pg_proc where oid='public.get_project_geojson(uuid)'::regprocedure),'GeoJSON RPC remains invoker');
select is((select proconfig from pg_proc where oid='public.get_project_geojson(uuid)'::regprocedure),
 array['search_path=""']::text[],'GeoJSON RPC keeps its locked search path');
create temp table expected_rpc as select payload from postgis_upgrade_acceptance.proof where kind='rpc';
grant select on expected_rpc to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','fc550000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fc550000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_project_geojson('fc550000-0000-4000-8000-000000000021')-'generated_at',
 (select payload from expected_rpc),'normal actor gets the exact original scoped GeoJSON');
select is(jsonb_array_length(public.get_project_geojson('fc550000-0000-4000-8000-000000000021')->'features'),
 4,'own typed and fallback features are included once');
select is((select count(*) from public.geo_observations where project_id='fc550000-0000-4000-8000-000000000022'),
 0::bigint,'foreign rows remain hidden under normal RLS');
select throws_ok($$select public.get_project_geojson('fc550000-0000-4000-8000-000000000022')$$,
 '42501',null,'an unrelated project remains inaccessible');
select set_config('request.jwt.claim.sub','fc550000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"fc550000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.get_project_geojson('fc550000-0000-4000-8000-000000000021')$$,
 '42501',null,'the reverse cross-organization path remains denied');
select is(jsonb_array_length(public.get_project_geojson('fc550000-0000-4000-8000-000000000022')->'features'),
 2,'the second actor retains the second project features only');
reset role;
select * from finish();
rollback;
