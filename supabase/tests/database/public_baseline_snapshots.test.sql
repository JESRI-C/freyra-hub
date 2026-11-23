-- Disposable local database only. Fixtures and assertions roll back together.
-- Never run with --linked or against a customer environment.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

-- Test-only manifest constructor; no network or real customer data is used.
create function pg_temp.baseline_manifest() returns jsonb language sql as $$
 select jsonb_build_object(
   'schema', 'gofreyra.public-baseline/v1',
   'project', jsonb_build_object('id', project.id, 'name', project.name,
      'crs', 'EPSG:4326', 'polygon', project.geometry_polygon, 'polygonSha256', repeat('a',64)),
   'period', jsonb_build_object('from','2026-09-01','to','2026-09-30'),
   'reference', jsonb_build_object('zoneId', zone.id, 'id', zone.source_metadata ->> 'source_id',
      'geometry',zone.geometry,'sourceUrl',zone.source_metadata ->> 'source_url'),
   'sources', jsonb_build_array(jsonb_build_object('id','synthetic-test-reference',
      'mode','import','status','partial','payload',null,'payloadSha256',null))
 ) from public.projects project join public.monitoring_zones zone on zone.project_id=project.id
 where project.id='d2000000-0000-4000-8000-000000000001'
$$;

select ok((select relrowsecurity from pg_class where oid='public.project_baseline_snapshots'::regclass), 'snapshot RLS is enabled');
select ok(not has_table_privilege('authenticated','public.project_baseline_snapshots','INSERT'), 'authenticated cannot forge source provenance by direct INSERT');
select ok(not has_function_privilege('authenticated','public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)','EXECUTE'), 'authenticated cannot call trusted writer RPC');
select ok(has_function_privilege('service_role','public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)','EXECUTE'), 'only service-role writer has RPC execution');

set local role service_role;
select lives_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',pg_temp.baseline_manifest(),repeat('b',64)) $q$, 'an authorized server actor captures a version');
select lives_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001',pg_temp.baseline_manifest(),repeat('b',64)) $q$, 'same request replays safely');
select is((select count(*) from public.project_baseline_snapshots),1::bigint,'idempotent replay creates only one version');
select lives_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',pg_temp.baseline_manifest(),repeat('b',64)) $q$, 'a new request creates another immutable version');
select is((select max(version_no) from public.project_baseline_snapshots),2,'version numbers are assigned by the database');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000003',pg_temp.baseline_manifest(),repeat('b',64)) $q$, '42501', 'Project access denied', 'server role still rejects a viewer actor');
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000003',pg_temp.baseline_manifest(),repeat('b',64)) $q$, '42501', 'Project access denied', 'server role still rejects an actor from another tenant');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.project_baseline_snapshots),2::bigint,'project viewer may read saved versions');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.project_baseline_snapshots),0::bigint,'another tenant cannot read snapshots');
reset role;

select throws_ok($q$ update public.project_baseline_snapshots set manifest_sha256=repeat('c',64) $q$,'23514','A saved baseline is immutable; create a new version','saved metadata is immutable even for the table owner');
select throws_ok($q$ delete from public.project_baseline_snapshots $q$,'23514','A saved baseline is immutable; create a new version','saved versions cannot be silently deleted');

-- A collection assembled before a boundary edit must not commit afterward.
create temp table baseline_old_manifest as select pg_temp.baseline_manifest() as manifest;
grant select on baseline_old_manifest to service_role;
update public.projects set geometry_polygon='{"type":"Polygon","coordinates":[[[9,55],[9.2,55],[9.2,55.2],[9,55.2],[9,55]]]}'
 where id='d2000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000004',(select manifest from baseline_old_manifest),repeat('b',64)) $q$,'23514','Invalid or stale canonical baseline input','stale canonical polygon is denied at commit');
reset role;
delete from public.project_members where project_id='d2000000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000004',pg_temp.baseline_manifest(),repeat('b',64)) $q$,'42501','Project access denied','membership revoked after collection is denied at commit');
reset role;
select is((select count(*) from public.project_baseline_snapshots),2::bigint,'failed attempts preserve the original versions');
select * from finish();
rollback;
