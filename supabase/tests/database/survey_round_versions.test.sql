-- Disposable LOCAL database only: no --linked, hosted state or customer data.
-- SQL-only trusted fixtures exercise database boundaries. App DTO/generator
-- equality, canonical serialization and zero-network checks have separate tests.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
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


-- These are LOCAL rollback fixtures. No hosted/customer IDs or secrets.
set local role service_role;
select lives_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000001') $q$,'fixture creates a trusted draft plan on baseline 1');
select lives_ok($q$ select pg_temp.save_plan('e6000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002') $q$,'fixture creates a trusted draft plan on baseline 2');
reset role;

create temporary table round_before_graph as select jsonb_build_object(
 'baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),
 'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),
 'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),
 'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),
 'promotionRequests',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row)
) as value;

create function pg_temp.round_manifest(p_plan_request uuid default 'e6000000-0000-4000-8000-000000000001',p_title text default 'Synthetic BEFORE round')
returns jsonb language sql as $$
 select jsonb_build_object('schema','gofreyra.survey-round/v1','builderVersion','gofreyra.survey-round-draft/v1',
  'status','draft','projectId',project_id,'baselineId',baseline_id,'baselineSha256',baseline_sha256,
  'baselineSchema',manifest->>'baselineSchema','planId',id,'planSha256',manifest_sha256,
  'planSchema','gofreyra.verification-plan/v1','planGeneratorVersion',generator_version,
  'kind','before','title',p_title,
  'recordingWindow',jsonb_build_object('dateFrom','2026-10-13','dateTo','2026-10-14',
   'timeZone','Europe/Copenhagen','datePrecision','calendar_date','actualCoverage','not_verified'),
  'questionIds',(select jsonb_agg(question->'id' order by question->>'id' collate "C") from jsonb_array_elements(manifest->'questions') as questions(question)),
  'acceptance',jsonb_build_object('municipalScopeApproved',false,'professionalApproved',false,'reportAccepted',false))
 from public.verification_plan_versions where request_id=p_plan_request
$$;
create function pg_temp.save_round(p_request uuid,p_actor uuid default 'e1000000-0000-4000-8000-000000000001',p_plan_request uuid default 'e6000000-0000-4000-8000-000000000001')
returns jsonb language sql as $$
 select public.persist_survey_round(project_id,p_actor,p_request,baseline_id,baseline_sha256,id,manifest_sha256,
  pg_temp.canonical_fixture(pg_temp.round_manifest(p_plan_request))) from public.verification_plan_versions where request_id=p_plan_request
$$;
create function pg_temp.save_round_changed(p_manifest jsonb,p_request uuid default 'e7000000-0000-4000-8000-000000000009')
returns jsonb language sql as $$
 select public.persist_survey_round(project_id,'e1000000-0000-4000-8000-000000000001',p_request,
  baseline_id,baseline_sha256,id,manifest_sha256,pg_temp.canonical_fixture(p_manifest))
 from public.verification_plan_versions where request_id='e6000000-0000-4000-8000-000000000001'
$$;

select ok((select relrowsecurity from pg_class where oid='public.survey_round_versions'::regclass),'round RLS enabled');
select ok(has_table_privilege('authenticated','public.survey_round_versions','SELECT'),'browser has scoped SELECT only');
select ok(not has_table_privilege('anon','public.survey_round_versions','SELECT'),'anon lacks SELECT');
select ok(not has_table_privilege('authenticated','public.survey_round_versions','INSERT'),'browser INSERT revoked');
select ok(not has_table_privilege('authenticated','public.survey_round_versions','UPDATE'),'browser UPDATE revoked');
select ok(not has_table_privilege('authenticated','public.survey_round_versions','DELETE'),'browser DELETE revoked');
select ok(has_table_privilege('service_role','public.survey_round_versions','INSERT'),'server may insert immutable rounds');
select ok(not has_table_privilege('service_role','public.survey_round_versions','UPDATE'),'service UPDATE revoked');
select ok(not has_table_privilege('service_role','public.survey_round_versions','DELETE'),'service DELETE revoked');
select ok(not has_any_column_privilege('service_role','public.project_baseline_snapshots','UPDATE'),'round writer needs no UPDATE on baseline');
select ok(not has_any_column_privilege('service_role','public.verification_plan_versions','UPDATE'),'round writer needs no UPDATE on plan');
select ok(not has_function_privilege('authenticated','public.persist_survey_round(uuid,uuid,uuid,uuid,text,uuid,text,text)','EXECUTE'),'authenticated writer RPC revoked');
select ok(not has_function_privilege('anon','public.persist_survey_round(uuid,uuid,uuid,uuid,text,uuid,text,text)','EXECUTE'),'anon writer RPC revoked');
select ok(has_function_privilege('service_role','public.persist_survey_round(uuid,uuid,uuid,uuid,text,uuid,text,text)','EXECUTE'),'server-only writer granted');
select is((select prosecdef from pg_proc where oid='public.persist_survey_round(uuid,uuid,uuid,uuid,text,uuid,text,text)'::regprocedure),false,'writer remains SECURITY INVOKER');

set local role service_role;
select lives_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000001') $q$,'editor saves initial immutable draft');
select is((select count(*) from public.survey_round_versions),1::bigint,'one row for first request');
select is((select manifest_sha256 from public.survey_round_versions),encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture(pg_temp.round_manifest()),'UTF8')),'hex'),'DB hashes exact canonical UTF-8 input');
select is((select round_version_no from public.survey_round_versions),1,'logical round starts at revision 1');
select ok((select id<>round_id and supersedes_id is null from public.survey_round_versions),'logical identity is distinct; no revision transition');
select is((select status from public.survey_round_versions),'draft','round cannot approve itself');
select is((select manifest#>>'{recordingWindow,actualCoverage}' from public.survey_round_versions),'not_verified','date window does not claim actual photo coverage');
select is((select manifest->'acceptance' from public.survey_round_versions),'{"municipalScopeApproved":false,"professionalApproved":false,"reportAccepted":false}'::jsonb,'no scope/professional/report acceptance');
select lives_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000001') $q$,'identical retry succeeds');
select is((select count(*) from public.survey_round_versions),1::bigint,'retry creates no duplicate');
select lives_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000002') $q$,'new logical round can bind different exact saved plan/baseline');
select is((select max(version_no) from public.survey_round_versions),2,'project append cursor is monotonic');
select is((select count(distinct round_id) from public.survey_round_versions),2::bigint,'new request creates new logical round, not silent revision');
select throws_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000002') $q$,'42501',null,'server rejects viewer actor');
select throws_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000003') $q$,'42501',null,'server rejects foreign tenant actor');
select throws_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000009',null) $q$,'22023',null,'verified actor is required');
select throws_ok($q$ select pg_temp.save_round(null) $q$,'22023',null,'request ID is required');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{status}','"approved"')) $q$,'23514',null,'approved status denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{acceptance,reportAccepted}','true')) $q$,'23514',null,'report approval denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{acceptance,municipalScopeApproved}','true')) $q$,'23514',null,'municipal scope approval denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{acceptance,professionalApproved}','true')) $q$,'23514',null,'professional approval denied');
select throws_ok($q$ select pg_temp.save_round_changed(pg_temp.round_manifest()||'{"photos":["invented"]}'::jsonb) $q$,'23514',null,'photo bindings not accepted in this slice');
select throws_ok($q$ select pg_temp.save_round_changed(pg_temp.round_manifest()||'{"supersedesId":"invented"}'::jsonb) $q$,'23514',null,'revision operation cannot be invented');
select throws_ok($q$ select pg_temp.save_round_changed(pg_temp.round_manifest()-'questionIds') $q$,'23514',null,'missing question IDs fail closed');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{questionIds}','[]')) $q$,'23514',null,'empty selection denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{questionIds}','["invented"]')) $q$,'23514',null,'unknown question denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{questionIds}',jsonb_build_array(pg_temp.round_manifest()#>'{questionIds,0}',pg_temp.round_manifest()#>'{questionIds,0}'))) $q$,'23514',null,'duplicate selection denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{recordingWindow,dateFrom}','"2026-02-29"')) $q$,'23514',null,'non-leap calendar date denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{recordingWindow,dateTo}','"2026-10-12"')) $q$,'23514',null,'backwards calendar window denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{recordingWindow,timeZone}','"UTC"')) $q$,'23514',null,'caller cannot relabel local calendar dates as UTC');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{recordingWindow,actualCoverage}','"complete"')) $q$,'23514',null,'observed coverage cannot be invented');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{recordingWindow,recordedAt}','"2026-10-13T12:00:00Z"')) $q$,'23514',null,'actual camera timestamps cannot be invented');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{title}','" "')) $q$,'23514',null,'blank title denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{title}',to_jsonb(repeat('x',121)))) $q$,'23514',null,'oversized title denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{title}',to_jsonb(E'bad\nline'::text))) $q$,'23514',null,'title control characters denied');
select throws_ok($q$ select pg_temp.save_round_changed(jsonb_set(pg_temp.round_manifest(),'{title}','"Changed title"'),'e7000000-0000-4000-8000-000000000001') $q$,'23514',null,'changed retry content conflicts');
select throws_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000002') $q$,'23514',null,'changed retry plan/baseline conflicts');
select throws_ok($q$ select public.persist_survey_round(project_id,'e1000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000009',baseline_id,baseline_sha256,id,manifest_sha256,repeat('x',65537)) from public.verification_plan_versions where request_id='e6000000-0000-4000-8000-000000000001' $q$,'23514',null,'budget enforced before JSON parsing');
select throws_ok($q$ select public.persist_survey_round(project_id,'e1000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000009',baseline_id,repeat('f',64),id,manifest_sha256,pg_temp.canonical_fixture(pg_temp.round_manifest())) from public.verification_plan_versions where request_id='e6000000-0000-4000-8000-000000000001' $q$,'23514',null,'wrong baseline checksum denied');
select throws_ok($q$ select public.persist_survey_round(project_id,'e1000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000009',baseline_id,baseline_sha256,id,repeat('f',64),pg_temp.canonical_fixture(pg_temp.round_manifest())) from public.verification_plan_versions where request_id='e6000000-0000-4000-8000-000000000001' $q$,'23514',null,'wrong plan checksum denied');
select throws_ok($q$ select public.persist_survey_round('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000009','e3000000-0000-4000-8000-000000000001',repeat('b',64),id,manifest_sha256,pg_temp.canonical_fixture(pg_temp.round_manifest('e6000000-0000-4000-8000-000000000002'))) from public.verification_plan_versions where request_id='e6000000-0000-4000-8000-000000000002' $q$,'23514',null,'plan for another baseline denied even in same project');
select throws_ok($q$ update public.survey_round_versions set title='Mutated' $q$,'42501',null,'service direct UPDATE remains revoked');
select throws_ok($q$ delete from public.survey_round_versions $q$,'42501',null,'service direct DELETE remains revoked');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.survey_round_versions),2::bigint,'viewer can read same-project actual rows');
select throws_ok($q$ insert into public.survey_round_versions(project_id) values('e2000000-0000-4000-8000-000000000001') $q$,'42501',null,'browser direct INSERT denied');
select throws_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000009') $q$,'42501',null,'browser privileged RPC denied');
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.survey_round_versions),0::bigint,'foreign tenant sees no rows');
reset role;
set local role anon;
select throws_ok($q$ select * from public.survey_round_versions $q$,'42501',null,'anonymous direct read denied');
reset role;
select throws_ok($q$ update public.survey_round_versions set title='Changed' $q$,'23514',null,'owner cannot mutate a saved round');
select throws_ok($q$ delete from public.survey_round_versions $q$,'23514',null,'owner cannot erase saved round history');
select throws_ok($q$ insert into public.survey_round_versions(project_id,version_no,baseline_id,baseline_sha256,plan_id,plan_sha256,builder_version,status,kind,title,recording_date_from,recording_date_to,manifest_sha256,manifest,created_by,request_id)
 select round.project_id,3,round.baseline_id,round.baseline_sha256,plan.id,plan.manifest_sha256,round.builder_version,round.status,round.kind,round.title,round.recording_date_from,round.recording_date_to,round.manifest_sha256,
 jsonb_set(jsonb_set(round.manifest,'{planId}',to_jsonb(plan.id)),'{planSha256}',to_jsonb(plan.manifest_sha256)),round.created_by,'e7000000-0000-4000-8000-000000000009'::uuid
 from public.survey_round_versions round cross join public.verification_plan_versions plan where round.version_no=1 and plan.request_id='e6000000-0000-4000-8000-000000000002' $q$,'23503',null,'composite FK prevents a plan belonging to a different baseline');
update public.projects set geometry_polygon='{"type":"Polygon","coordinates":[[[11,56],[11.1,56],[11.1,56.1],[11,56.1],[11,56]]]}' where id='e2000000-0000-4000-8000-000000000001';
set local role service_role;
select lives_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000003') $q$,'current project geometry edit cannot rewrite exact saved input binding');
reset role;
delete from public.project_members where project_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select pg_temp.save_round('e7000000-0000-4000-8000-000000000001') $q$,'42501',null,'revoked editor cannot replay old writer request');
reset role;
delete from public.organization_memberships where organization_id='e0000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.survey_round_versions),0::bigint,'same JWT loses SELECT immediately after org revoke');
reset role;
select is((select count(*) from public.survey_round_versions),3::bigint,'failed writes preserve exactly three initial drafts');
select is(jsonb_build_object(
 'baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),
 'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),
 'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),
 'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),
 'promotionRequests',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row)
),(select value from round_before_graph),'whole baseline/plan/canonical graph remains unchanged');
select * from finish();
rollback;
