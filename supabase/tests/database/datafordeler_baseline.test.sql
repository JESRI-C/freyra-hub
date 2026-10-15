-- Disposable local database only. Fixtures and assertions roll back together.
-- Never run with --linked or against a customer environment.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'baseline-editor@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
 ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'baseline-viewer@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
 ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'baseline-other-tenant@example.test', '', now(), '{"provider":"email"}', '{}', now(), now());
insert into public.organizations (id, name, type, country) values
 ('d0000000-0000-4000-8000-000000000001', 'Baseline fixture A', 'test', 'Denmark'),
 ('d0000000-0000-4000-8000-000000000002', 'Baseline fixture B', 'test', 'Denmark');
insert into public.organization_memberships (organization_id, user_id, role) values
 ('d0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'viewer'),
 ('d0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'viewer'),
 ('d0000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000003', 'owner');
insert into public.projects (id, organization_id, name, geometry_polygon) values
 ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Baseline fixture A', '{"type":"Polygon","coordinates":[[[9,55],[9.1,55],[9.1,55.1],[9,55.1],[9,55]]]}'),
 ('d2000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'Baseline fixture B', '{"type":"Polygon","coordinates":[[[10,56],[10.1,56],[10.1,56.1],[10,56.1],[10,56]]]}');
insert into public.project_members (project_id, user_id, role) values
 ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'editor'),
 ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'viewer');
insert into public.monitoring_zones (id, project_id, name, zone_type, status, source_type, geometry, source_metadata)
values ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Fixture reference', 'watercourse', 'active', 'imported',
 '{"type":"MultiLineString","coordinates":[[[9.01,55.01],[9.09,55.09]]]}',
 '{"schema":"gofreyra.watercourse-reach-source/v1","source_system":"SDFI Danske Stednavne","crs":"EPSG:4326","source_id":"d4000000-0000-4000-8000-000000000001","source_url":"https://api.dataforsyningen.dk/steder/d4000000-0000-4000-8000-000000000001?format=geojson&srid=4326"}');

-- SQL-only trusted-writer fixture; app DTO/hash and actual WFS fetch are separate tests.
update public.monitoring_zones set source_metadata=jsonb_build_object(
  'schema','gofreyra.watercourse-reach-source/v2',
  'source_system','KDS Datafordeler Danske Stednavne',
  'source_provider','datafordeler-ds-bearbejdet-wfs/v1',
  'crs','EPSG:4326','source_crs','EPSG:4326','source_axis_order','lat-lng',
  'dataset_version','static-2025-09','source_modified_at',null,'geometry_version',null,
  'source_registered_at','2024-02-23T10:41:59Z','source_valid_from',null,'official_length_m',1000,
  'source_id','d4000000-0000-4000-8000-000000000001',
  'source_url','https://wfs.datafordeler.dk/Stednavn/STEDNAVNE_BEARBEJDET_GML3SFP/1/WFS')
where id='d3000000-0000-4000-8000-000000000001';
create function pg_temp.modern_manifest() returns jsonb language sql as $$
 select jsonb_build_object(
   'schema','gofreyra.public-baseline/v2',
   'project',jsonb_build_object('id',project.id,'name',project.name,'crs','EPSG:4326',
     'polygon',project.geometry_polygon,'polygonSha256',repeat('a',64)),
   'period',jsonb_build_object('from','2026-09-01','to','2026-09-30'),
   'reference',jsonb_build_object('zoneId',zone.id,'id',zone.source_metadata->>'source_id',
     'geometry',zone.geometry,'sourceUrl',zone.source_metadata->>'source_url',
     'sourceProvider','datafordeler-ds-bearbejdet-wfs/v1','sourceCrs','EPSG:4326',
     'sourceAxisOrder','lat-lng','datasetVersion','static-2025-09',
     'sourceRegisteredAt',zone.source_metadata->'source_registered_at',
     'sourceValidFrom',zone.source_metadata->'source_valid_from',
     'officialLengthM',zone.source_metadata->'official_length_m',
     'modifiedAt',null,'geometryVersion',null),
   'sources',jsonb_build_array(jsonb_build_object('id','synthetic-sql-reference',
     'mode','import','status','partial','payload',null,'payloadSha256',null)))
 from public.projects project join public.monitoring_zones zone on zone.project_id=project.id
 where project.id='d2000000-0000-4000-8000-000000000001'
$$;

select ok(not has_function_privilege('authenticated','public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)','EXECUTE'),'new provider does not widen writer access');
set local role service_role;
select lives_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',pg_temp.modern_manifest(),repeat('b',64)) $q$,'trusted actor captures Datafordeler v2');
select is((select schema_version::integer from public.project_baseline_snapshots),2,'writer assigns v2 schema number');
select lives_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',pg_temp.modern_manifest(),repeat('b',64)) $q$,'same modern request replays');
select is((select count(*) from public.project_baseline_snapshots),1::bigint,'retry does not create a duplicate');
select is((select manifest#>>'{reference,sourceRegisteredAt}' from public.project_baseline_snapshots),'2024-02-23T10:41:59Z','registration timestamp retained separately');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.modern_manifest(),'{reference,sourceAxisOrder}',to_jsonb('lng-lat'::text)),repeat('b',64)) $q$,'23514',null,'wrong source axis denied');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',pg_temp.modern_manifest() #- '{reference,sourceValidFrom}',repeat('b',64)) $q$,'23514',null,'missing nullable source field denied');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.modern_manifest(),'{reference,modifiedAt}',to_jsonb('2026-10-13T12:00:00Z'::text)),repeat('b',64)) $q$,'23514',null,'registration cannot become measured geometry date');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.modern_manifest(),'{reference,sourceRegisteredAt}',to_jsonb('2025-02-23T10:41:59Z'::text)),repeat('b',64)) $q$,'23514',null,'source registration must match locked reference');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.modern_manifest(),'{reference,sourceUrl}',to_jsonb('https://example.invalid/not-official'::text)),repeat('b',64)) $q$,'23514',null,'different source URL denied');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',jsonb_set(pg_temp.modern_manifest(),'{schema}',to_jsonb('gofreyra.public-baseline/v1'::text)),repeat('b',64)) $q$,'23514',null,'modern reference cannot relabel itself legacy');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002',pg_temp.modern_manifest(),repeat('b',64)) $q$,'42501',null,'viewer denied by writer');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000002',pg_temp.modern_manifest(),repeat('b',64)) $q$,'42501',null,'foreign actor denied by writer');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.project_baseline_snapshots),1::bigint,'viewer reads scoped modern version');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.project_baseline_snapshots),0::bigint,'foreign tenant cannot read modern version');
reset role;
select throws_ok($q$ update public.project_baseline_snapshots set manifest_sha256=repeat('c',64) $q$,'23514',null,'modern snapshot immutable');
select throws_ok($q$ insert into public.project_baseline_snapshots(project_id,version_no,schema_version,created_by,request_id,geometry_sha256,manifest_sha256,manifest) values('d2000000-0000-4000-8000-000000000001',2,1,'d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',repeat('a',64),repeat('b',64),pg_temp.modern_manifest()) $q$,'23514',null,'table rejects schema number/manifest disagreement');

update public.monitoring_zones set source_metadata=jsonb_build_object(
  'schema','gofreyra.watercourse-reach-source/v1','source_system','SDFI Danske Stednavne',
  'crs','EPSG:4326','source_id','d4000000-0000-4000-8000-000000000001',
  'source_url','https://api.dataforsyningen.dk/steder/d4000000-0000-4000-8000-000000000001?format=geojson&srid=4326')
 where id='d3000000-0000-4000-8000-000000000001';
create function pg_temp.legacy_manifest() returns jsonb language sql as $$
 select jsonb_set(jsonb_set(pg_temp.modern_manifest(),'{schema}',to_jsonb('gofreyra.public-baseline/v1'::text)),
   '{reference}',(pg_temp.modern_manifest()->'reference')-
     array['sourceProvider','sourceCrs','sourceAxisOrder','datasetVersion','sourceRegisteredAt','sourceValidFrom','officialLengthM'])
$$;
set local role service_role;
select lives_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',pg_temp.legacy_manifest(),repeat('c',64)) $q$,'legacy writer branch remains valid');
select is((select schema_version::integer from public.project_baseline_snapshots where version_no=2),1,'legacy writer preserves schema1');
select is((select manifest_sha256 from public.project_baseline_snapshots where version_no=1),repeat('b',64),'new current source never rewrites prior modern snapshot');
reset role;
delete from public.project_members where project_id='d2000000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000003',pg_temp.legacy_manifest(),repeat('c',64)) $q$,'42501',null,'revoked membership cannot write either provider');
reset role;
select is((select count(*) from public.project_baseline_snapshots),2::bigint,'failed writes leave both versions untouched');
select * from finish();
rollback;