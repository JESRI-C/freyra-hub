-- Disposable LOCAL database only: no --linked, hosted state or customer data.
-- SQL-only trusted fixtures exercise database boundaries. App DTO/generator
-- equality, canonical serialization and zero-network checks have separate tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);
select ok(not has_any_column_privilege('service_role', 'public.project_baseline_snapshots', 'UPDATE'),
  'Plan persistence needs no UPDATE privilege on its immutable baseline input');

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000001','authenticated','authenticated','plan-editor@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000002','authenticated','authenticated','plan-viewer@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000003','authenticated','authenticated','plan-foreign@example.test','',now(),'{"provider":"email"}','{}',now(),now());
insert into public.organizations(id,name,type,country) values
 ('e0000000-0000-4000-8000-000000000001','Plan fixture A','test','Denmark'),
 ('e0000000-0000-4000-8000-000000000002','Plan fixture B','test','Denmark');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('e0000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','viewer'),
 ('e0000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','viewer'),
 ('e0000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000003','owner');
insert into public.projects(id,organization_id,name,geometry_polygon) values
 ('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','Plan fixture A','{"type":"Polygon","coordinates":[[[9,55],[9.1,55],[9.1,55.1],[9,55.1],[9,55]]]}'),
 ('e2000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','Plan fixture B','{"type":"Polygon","coordinates":[[[10,56],[10.1,56],[10.1,56.1],[10,56.1],[10,56]]]}');
insert into public.project_members(project_id,user_id,role) values
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','editor'),
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','viewer');

create function pg_temp.baseline_manifest(p_project uuid,p_schema text) returns jsonb language sql as $$
 select jsonb_build_object('schema',p_schema,
  'project',jsonb_build_object('id',id,'crs','EPSG:4326','polygon',geometry_polygon,'polygonSha256',repeat('a',64)),
  'period',jsonb_build_object('from','2026-08-24','to','2026-09-07'),
  'reference',jsonb_build_object('geometry','{"type":"MultiLineString","coordinates":[[[9.01,55.01],[9.09,55.09]]]}'::jsonb),
  'sources',jsonb_build_array(
   jsonb_build_object('id','official-watercourse-reference','provider','Synthetic official reference','dataset','Synthetic location',
    'mode','live','status','complete','payload',jsonb_build_object('synthetic',true),'payloadSha256',repeat('b',64),'error',null,
    'fetchedAt','2026-10-13T12:00:00Z','sourceModifiedAt',null,
    'coverage',jsonb_build_object('observedFrom',null,'observedTo',null),
    'quality',jsonb_build_object('evidenceKind','official_registration')),
   jsonb_build_object('id','synthetic-weather-gap','provider','Synthetic DMI','dataset','Historical weather',
    'mode','error','status','not_configured','payload',null,'payloadSha256',null,
    'error',jsonb_build_object('code','not_configured','message','Fixture weather access missing')),
   jsonb_build_object('id','synthetic-scenes','provider','Synthetic Copernicus','dataset','Scene catalogue',
    'mode','live','status','complete','payload',jsonb_build_object('synthetic',true),'payloadSha256',repeat('c',64),'error',null)
  )) from public.projects where id=p_project
$$;
insert into public.project_baseline_snapshots(id,project_id,version_no,schema_version,created_by,request_id,
 geometry_sha256,manifest_sha256,manifest) values
 ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',1,1,'e1000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),pg_temp.baseline_manifest('e2000000-0000-4000-8000-000000000001','gofreyra.public-baseline/v1')),
 ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001',2,2,'e1000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002',repeat('a',64),repeat('c',64),pg_temp.baseline_manifest('e2000000-0000-4000-8000-000000000001','gofreyra.public-baseline/v2')),
 ('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002',1,1,'e1000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000003',repeat('a',64),repeat('d',64),pg_temp.baseline_manifest('e2000000-0000-4000-8000-000000000002','gofreyra.public-baseline/v1'));

create function pg_temp.plan_manifest(p_baseline uuid default 'e3000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select jsonb_build_object('schema','gofreyra.verification-plan/v1','generatorVersion','gofreyra.reference-location-plan/v1',
  'baselineSchema',manifest->>'schema','status','draft','projectId',project_id,'snapshotId',id,'snapshotSha256',manifest_sha256,
  'questions',jsonb_build_array(jsonb_build_object('id','verification:'||id::text||':official-reference-location:v1',
   'snapshotId',id,'snapshotSha256',manifest_sha256,'sourceIds',jsonb_build_array('official-watercourse-reference'),
   'priority','normal','title','Fixture location question','question','Compare synthetic reference',
   'rationale','Fixture rationale','area',jsonb_build_object('crs','EPSG:4326','aoi',manifest#>'{project,polygon}',
    'referenceGeometry',manifest#>'{reference,geometry}','restriction','Only synthetic AOI'),
   'dates',jsonb_build_object('baselineFrom',manifest#>'{period,from}','baselineTo',manifest#>'{period,to}',
    'sourceFetchedAt','2026-10-13T12:00:00Z','sourceModifiedAt',null,'sourceObservedFrom',null,'sourceObservedTo',null),
   'method','Fixture method','requiredEvidence',jsonb_build_array('synthetic'),'uncertainty',jsonb_build_array('Unknown legal reach'),
   'allowedResults',jsonb_build_array('supported','refuted','inconclusive','site_visit'),'result',null)),
  'baselineDataGaps',jsonb_build_array(jsonb_build_object('sourceId','synthetic-weather-gap','provider','Synthetic DMI',
   'dataset','Historical weather','reason','Fixture weather access missing')),
  'contextSourceIds',jsonb_build_array('synthetic-scenes'),'warnings',jsonb_build_array('Draft only; no approval'))
 from public.project_baseline_snapshots where id=p_baseline
$$;
-- Fixture-only serializer; no production SQL generator or service privilege change.
create function pg_temp.canonical_fixture(value jsonb) returns text language plpgsql immutable as $$
declare result text;
begin
 if jsonb_typeof(value)='object' then
  select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||pg_temp.canonical_fixture(item),',' order by key collate "C"),'')||'}'
   into result from jsonb_each(value) as entries(key,item);
 elsif jsonb_typeof(value)='array' then
  select '['||coalesce(string_agg(pg_temp.canonical_fixture(item),',' order by item_ordinal),'')||']'
   into result from jsonb_array_elements(value) with ordinality as entries(item,item_ordinal);
 else result:=value::text;
 end if;
 return result;
end
$$;
create function pg_temp.save_plan(p_request uuid,p_baseline uuid default 'e3000000-0000-4000-8000-000000000001',p_actor uuid default 'e1000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.persist_verification_plan('e2000000-0000-4000-8000-000000000001',p_actor,p_request,
  p_baseline,(select manifest_sha256 from public.project_baseline_snapshots where id=p_baseline),
  pg_temp.canonical_fixture(pg_temp.plan_manifest(p_baseline)))
$$;
create function pg_temp.save_changed(p_manifest jsonb) returns jsonb language sql as $$
 select public.persist_verification_plan('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
  'e6000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001',repeat('b',64),pg_temp.canonical_fixture(p_manifest))
$$;

select ok((select relrowsecurity from pg_class where oid='public.verification_plan_versions'::regclass),'plan RLS enabled');
select ok(has_table_privilege('authenticated','public.verification_plan_versions','SELECT'),'authenticated keeps scoped SELECT');
select ok(not has_table_privilege('anon','public.verification_plan_versions','SELECT'),'anon has no plan SELECT');
select ok(not has_table_privilege('authenticated','public.verification_plan_versions','INSERT'),'browser INSERT revoked');
select ok(not has_table_privilege('authenticated','public.verification_plan_versions','UPDATE'),'browser UPDATE revoked');
select ok(not has_table_privilege('authenticated','public.verification_plan_versions','DELETE'),'browser DELETE revoked');
select ok(has_table_privilege('service_role','public.verification_plan_versions','INSERT'),'server may insert plans');
select ok(not has_table_privilege('service_role','public.verification_plan_versions','UPDATE'),'service UPDATE revoked');
select ok(not has_table_privilege('service_role','public.verification_plan_versions','DELETE'),'service DELETE revoked');
select ok(not has_function_privilege('authenticated','public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'browser writer RPC revoked');
select ok(not has_function_privilege('anon','public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'anon writer RPC revoked');
select ok(has_function_privilege('service_role','public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'service writer RPC granted');

set local role service_role;
select lives_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000001') $q$,'save draft from legacy baseline');
select is((select count(*) from public.verification_plan_versions),1::bigint,'first request creates one plan');
select is((select manifest_sha256 from public.verification_plan_versions),encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture(pg_temp.plan_manifest()),'UTF8')),'hex'),'DB hashes actual canonical input bytes');
select lives_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000001') $q$,'identical retry returns saved plan');
select is((select count(*) from public.verification_plan_versions),1::bigint,'retry creates no version');
select lives_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002') $q$,'new request captures draft from modern baseline');
select is((select max(version_no) from public.verification_plan_versions),2,'server allocates project versions');
select is((select generator_version from public.verification_plan_versions where version_no=2),'gofreyra.reference-location-plan/v1','generator version is frozen');
select is((select manifest#>'{questions,0,result}' from public.verification_plan_versions where version_no=2),'null'::jsonb,'saved result remains unset');
select is((select manifest->'contextSourceIds' from public.verification_plan_versions where version_no=2),'["synthetic-scenes"]'::jsonb,'scene metadata remains context');
select is((select manifest#>>'{baselineDataGaps,0,reason}' from public.verification_plan_versions where version_no=2),'Fixture weather access missing','weather gap reason remains unchanged');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.verification_plan_versions),2::bigint,'viewer can read actual plan rows');
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.verification_plan_versions),0::bigint,'foreign tenant cannot read any plan row');
select throws_ok($q$ insert into public.verification_plan_versions(project_id) values('e2000000-0000-4000-8000-000000000001') $q$,'42501',null,'browser direct insert denied');
select throws_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000009') $q$,'42501',null,'authenticated RPC denied');
reset role;
set local role anon;
select throws_ok($q$ select * from public.verification_plan_versions $q$,'42501',null,'anonymous direct read denied');
reset role;
set local role service_role;
select throws_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002') $q$,'42501',null,'writer rejects viewer actor');
select throws_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003') $q$,'42501',null,'writer rejects foreign actor');
select throws_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000003') $q$,'23514',null,'writer rejects baseline from another project');
select throws_ok($q$ select public.persist_verification_plan('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001',repeat('c',64),pg_temp.canonical_fixture(pg_temp.plan_manifest())) $q$,'23514',null,'writer rejects wrong baseline hash');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{status}','"approved"')) $q$,'23514',null,'plan cannot approve itself');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{questions,0,result}','"supported"')) $q$,'23514',null,'plan cannot register an observation result');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{questions,0,sourceIds}','["synthetic-scenes"]')) $q$,'23514',null,'question cannot substitute context as evidence');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{questions,0,dates,sourceFetchedAt}','"2026-11-10T12:00:00Z"')) $q$,'23514',null,'question cannot invent a new source date');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{questions,0,area,aoi}','{"type":"Polygon","coordinates":[]}')) $q$,'23514',null,'question cannot substitute geometry');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{baselineDataGaps}','[]')) $q$,'23514',null,'missing public data cannot disappear');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{contextSourceIds}','["forged-context"]')) $q$,'23514',null,'context sources must exist in saved baseline');
select throws_ok($q$ select pg_temp.save_changed(jsonb_set(pg_temp.plan_manifest(),'{generatorVersion}','"unknown/v2"')) $q$,'23514',null,'unknown generator cannot replace v1');
select throws_ok($q$ select public.persist_verification_plan('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001',repeat('b',64),repeat('x',2097153)) $q$,'23514',null,'oversized UTF-8 input denied before parsing');
select throws_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002') $q$,'23514',null,'same request with another baseline conflicts');
select throws_ok($q$ select public.persist_verification_plan('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',repeat('b',64),pg_temp.canonical_fixture(jsonb_set(pg_temp.plan_manifest(),'{warnings}','["Changed warning"]'))) $q$,'23514',null,'same request with changed content conflicts');
reset role;
select throws_ok($q$ update public.verification_plan_versions set manifest_sha256=repeat('a',64) $q$,'23514',null,'owner cannot mutate saved metadata');
select throws_ok($q$ delete from public.verification_plan_versions $q$,'23514',null,'owner cannot silently delete saved plan');
select throws_ok($q$ insert into public.verification_plan_versions(project_id,version_no,baseline_id,baseline_sha256,generator_version,manifest_sha256,manifest,created_by,request_id) values('e2000000-0000-4000-8000-000000000001',3,'e3000000-0000-4000-8000-000000000003',repeat('d',64),'gofreyra.reference-location-plan/v1',repeat('e',64),jsonb_set(pg_temp.plan_manifest('e3000000-0000-4000-8000-000000000003'),'{projectId}','"e2000000-0000-4000-8000-000000000001"'),'e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000009') $q$,'23503',null,'typed FK prevents cross-project baseline binding');
select throws_ok($q$ insert into public.verification_plan_versions(project_id,version_no,baseline_id,baseline_sha256,generator_version,manifest_sha256,manifest,created_by,request_id) values('e2000000-0000-4000-8000-000000000001',3,'e3000000-0000-4000-8000-000000000001',repeat('e',64),'gofreyra.reference-location-plan/v1',repeat('e',64),jsonb_set(pg_temp.plan_manifest(),'{snapshotSha256}',to_jsonb(repeat('e',64))),'e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000009') $q$,'23503',null,'typed FK prevents wrong baseline hash even on direct insert');
select throws_ok($q$ update public.project_baseline_snapshots set manifest_sha256=repeat('f',64) $q$,'23514',null,'plan feature does not weaken baseline immutability');

update public.projects set geometry_polygon='{"type":"Polygon","coordinates":[[[11,56],[11.1,56],[11.1,56.1],[11,56.1],[11,56]]]}'
 where id='e2000000-0000-4000-8000-000000000001';
set local role service_role;
select lives_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000003') $q$,'new draft still uses frozen baseline after project geometry edit');
reset role;
delete from public.project_members where project_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000001') $q$,'42501',null,'revoked actor cannot replay writer request');
reset role;
delete from public.organization_memberships where organization_id='e0000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.verification_plan_versions),0::bigint,'same JWT loses plan read immediately after organization revoke');
reset role;
select is((select manifest_sha256 from public.project_baseline_snapshots where id='e3000000-0000-4000-8000-000000000001'),repeat('b',64),'legacy baseline hash unchanged');
select is((select count(*) from public.verification_plan_versions),3::bigint,'failed writes leave exactly three immutable drafts');

insert into public.project_members(project_id,user_id,role) values('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','editor');
set local role service_role;
select throws_ok($q$ select public.persist_verification_plan('e2000000-0000-4000-8000-000000000001',null,'e6000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001',repeat('b',64),pg_temp.canonical_fixture(pg_temp.plan_manifest())) $q$,'22023',null,'actor must be verified');
select throws_ok($q$ select pg_temp.save_changed(pg_temp.plan_manifest()-'questions') $q$,'23514',null,'missing questions array fails closed');
select throws_ok($q$ select pg_temp.save_changed(pg_temp.plan_manifest()#-'{questions,0,dates,sourceObservedFrom}') $q$,'23514',null,'nullable observed date must remain explicitly present');
reset role;
select * from finish();
rollback;
