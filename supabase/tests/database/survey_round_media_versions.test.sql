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


-- Additional LOCAL synthetic metadata only. No file bytes, live data or emails.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000004','authenticated','authenticated','round-media-field@example.test','',now(),'{"provider":"email"}','{}',now(),now());
insert into public.organization_memberships(organization_id,user_id,role) values('e0000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','viewer');
insert into public.project_members(project_id,user_id,role) values('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','field');
set local role service_role;
do $$begin perform pg_temp.save_round('e7000000-0000-4000-8000-000000000001'); perform pg_temp.save_round('e7000000-0000-4000-8000-000000000002'); end $$;
reset role;
insert into public.uploads(id,project_id,organization_id,uploaded_by,file_name,original_file_name,file_size,mime_type,upload_type,storage_path,intent_request_id,intent_expires_at,received_at,status)
 values('ef300000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
 'round-original.jpg','round-original.jpg',10,'image/jpeg','drone_photo','e1000000-0000-4000-8000-000000000001/intents/ef300000-0000-4000-8000-000000000001/round-original.jpg',
 'ef400000-0000-4000-8000-000000000001',now()+interval '1 day',now(),'awaiting_validation');
insert into storage.objects(id,bucket_id,name,owner_id,metadata) values('ef500000-0000-4000-8000-000000000001','monitoring-uploads',
 'e1000000-0000-4000-8000-000000000001/intents/ef300000-0000-4000-8000-000000000001/round-original.jpg','e1000000-0000-4000-8000-000000000001','{"size":10,"mimetype":"image/jpeg"}');
create temporary table round_media_source as select upload.id as upload_id,object.id as object_id,to_jsonb(object)->>'version' as object_version,object.updated_at,
 jsonb_build_object('schema','gofreyra.drone-original-validation/v1','validatorVersion','jpeg-structure-exifr/v1','projectId',upload.project_id,'uploadId',upload.id,
 'validatedAt',now(),'validatedBy',upload.uploaded_by,'status','review_required',
 'original',jsonb_build_object('sha256',repeat('a',64),'sizeBytes',10,'mimeType','image/jpeg','storagePath',upload.storage_path,'receivedAt',upload.received_at,
 'object',jsonb_build_object('id',object.id,'version',to_jsonb(object)->>'version','updated_at',object.updated_at,'owner_id',object.owner_id,'size',10,'mimetype','image/jpeg')),
 'jpegStructure',jsonb_build_object('widthPx',1,'heightPx',1,'components',1,'encoding','baseline','scans',1),'metadata',null,
 'cameraPositionEligible',false,'pixelDecoded',false,'georeferenced',false,'reportEligible',false,'errors','[]'::jsonb,'warnings','[]'::jsonb) as validation
 from public.uploads upload join storage.objects object on object.id='ef500000-0000-4000-8000-000000000001' where upload.id='ef300000-0000-4000-8000-000000000001';
grant select on round_media_source to service_role;
set local role service_role;
do $$declare fixture record; begin select * into strict fixture from pg_temp.round_media_source;
 perform public.persist_drone_original_validation('e2000000-0000-4000-8000-000000000001',fixture.upload_id,'e1000000-0000-4000-8000-000000000001',
 fixture.object_id,fixture.object_version,fixture.updated_at,fixture.validation,repeat('b',64));
 perform public.persist_drone_original_promotion('e2000000-0000-4000-8000-000000000001',fixture.upload_id,'e1000000-0000-4000-8000-000000000001',
 'ef600000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),fixture.object_id,fixture.object_version,fixture.updated_at);
end $$;
reset role;
create temporary table round_media_before_graph as select jsonb_build_object(
 'rounds',(select jsonb_agg(to_jsonb(row) order by id) from public.survey_round_versions row),
 'baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),
 'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),
 'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),
 'uploads',(select jsonb_agg(to_jsonb(row) order by id) from public.uploads row),
 'storage',(select jsonb_agg(to_jsonb(row) order by id) from storage.objects row),
 'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),
 'promotionRequests',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row)) as value;
create function pg_temp.media_manifest(p_round_request uuid default 'e7000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select jsonb_build_object('schema','gofreyra.survey-round-media/v1','builderVersion','gofreyra.survey-round-media-draft/v1','status','draft_assignment',
 'projectId',round.project_id,'roundVersionId',round.id,'roundSha256',round.manifest_sha256,'baselineId',round.baseline_id,'baselineSha256',round.baseline_sha256,
 'planId',round.plan_id,'planSha256',round.plan_sha256,'mediaId',media.id,'originalRole','drone_original','originalSha256',media.original_sha256,
 'originalValidationSha256',media.original_validation_sha256,'originalValidationStatus',media.original_validation_status,'sourceUploadId',media.source_upload_id,
 'storage',jsonb_build_object('bucket','monitoring-uploads','objectId',media.storage_object_id,'objectVersion',media.storage_object_version,'objectUpdatedAt',media.storage_object_updated_at),
 'questionIds',round.manifest->'questionIds','sourceMetadata',jsonb_build_object('source','saved_original_validation',
 'capture',jsonb_build_object('capturedAtUtc',null,'localTimestamp',null,'offset',null,'timezoneKnown',false,'source',null,'relationToPlannedWindow','not_verified'),
 'cameraPosition',null,'jpegStructure',jsonb_build_object('widthPx',1,'heightPx',1)),
 'acceptance',jsonb_build_object('municipalScopeApproved',false,'professionalApproved',false,'pixelDecoded',false,'georeferenced',false,'reportEligible',false,'reportAccepted',false))
 from public.survey_round_versions round cross join public.project_media media where round.request_id=p_round_request and media.source_upload_id='ef300000-0000-4000-8000-000000000001'
$$;
create function pg_temp.save_media(p_request uuid,p_actor uuid default 'e1000000-0000-4000-8000-000000000001',p_round_request uuid default 'e7000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.persist_survey_round_media(round.project_id,p_actor,p_request,round.id,round.manifest_sha256,media.id,pg_temp.canonical_fixture(pg_temp.media_manifest(p_round_request)))
 from public.survey_round_versions round cross join public.project_media media where round.request_id=p_round_request and media.source_upload_id='ef300000-0000-4000-8000-000000000001'
$$;
create function pg_temp.save_media_changed(p_manifest jsonb,p_request uuid default 'ef700000-0000-4000-8000-000000000099') returns jsonb language sql as $$
 select public.persist_survey_round_media(round.project_id,'e1000000-0000-4000-8000-000000000001',p_request,round.id,round.manifest_sha256,media.id,pg_temp.canonical_fixture(p_manifest))
 from public.survey_round_versions round cross join public.project_media media where round.request_id='e7000000-0000-4000-8000-000000000001' and media.source_upload_id='ef300000-0000-4000-8000-000000000001'
$$;
select ok((select relrowsecurity from pg_class where oid='public.survey_round_media_versions'::regclass),'round media RLS enabled');
select ok(has_table_privilege('authenticated','public.survey_round_media_versions','SELECT'),'authenticated SELECT allowed');
select ok(not has_table_privilege('authenticated','public.survey_round_media_versions','INSERT'),'authenticated INSERT denied');
select ok(not has_table_privilege('authenticated','public.survey_round_media_versions','UPDATE'),'authenticated UPDATE denied');
select ok(not has_table_privilege('authenticated','public.survey_round_media_versions','DELETE'),'authenticated DELETE denied');
select ok(not has_table_privilege('anon','public.survey_round_media_versions','SELECT'),'anon SELECT denied');
select ok(has_table_privilege('service_role','public.survey_round_media_versions','SELECT'),'service_role SELECT allowed');
select ok(has_table_privilege('service_role','public.survey_round_media_versions','INSERT'),'service_role INSERT allowed');
select ok(not has_table_privilege('service_role','public.survey_round_media_versions','UPDATE'),'service_role UPDATE denied');
select ok(not has_table_privilege('service_role','public.survey_round_media_versions','DELETE'),'service_role DELETE denied');
select ok(not has_function_privilege('authenticated','public.persist_survey_round_media(uuid,uuid,uuid,uuid,text,uuid,text)','EXECUTE'),'authenticated cannot invoke privileged writer');
select ok(not has_function_privilege('anon','public.persist_survey_round_media(uuid,uuid,uuid,uuid,text,uuid,text)','EXECUTE'),'anon cannot invoke privileged writer');
select is((select prosecdef from pg_proc where oid='public.persist_survey_round_media(uuid,uuid,uuid,uuid,text,uuid,text)'::regprocedure),false,'writer remains SECURITY INVOKER');
select ok(not has_any_column_privilege('service_role','public.survey_round_versions','UPDATE'),'no UPDATE grants on immutable survey_round_versions');
select ok(not has_any_column_privilege('service_role','public.project_baseline_snapshots','UPDATE'),'no UPDATE grants on immutable project_baseline_snapshots');
select ok(not has_any_column_privilege('service_role','public.verification_plan_versions','UPDATE'),'no UPDATE grants on immutable verification_plan_versions');
set local role service_role;
select lives_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000001')$q$,'editor creates draft assignment');
select is((select count(*) from public.survey_round_media_versions),1::bigint,'one immutable binding');
select lives_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000001')$q$,'exact request retry succeeds');
select is((select count(*) from public.survey_round_media_versions),1::bigint,'retry creates no duplicate');
select is((select manifest_sha256 from public.survey_round_media_versions),encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture(pg_temp.media_manifest()),'UTF8')),'hex'),'exact canonical UTF8 bytes hashed');
select throws_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000002')$q$,'23514',null,'second request cannot silently revise existing round-media binding');
select throws_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002')$q$,'42501',null,'viewer cannot assign');
select throws_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000003')$q$,'42501',null,'foreign user cannot assign');
select throws_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000005',null)$q$,'22023',null,'null actor denied');
select throws_ok($q$select pg_temp.save_media(null)$q$,'22023',null,'null request denied');
select lives_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000004','e7000000-0000-4000-8000-000000000002')$q$,'field may assign same original to a separate saved round');
select is((select count(*) from public.survey_round_media_versions),2::bigint,'two round bindings share one original');
select is((select count(distinct media_id) from public.survey_round_media_versions),1::bigint,'no new canonical bytes or media');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{acceptance,municipalScopeApproved}','true'))$q$,'23514',null,'cannot elevate municipalScopeApproved');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{acceptance,professionalApproved}','true'))$q$,'23514',null,'cannot elevate professionalApproved');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{acceptance,pixelDecoded}','true'))$q$,'23514',null,'cannot elevate pixelDecoded');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{acceptance,georeferenced}','true'))$q$,'23514',null,'cannot elevate georeferenced');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{acceptance,reportEligible}','true'))$q$,'23514',null,'cannot elevate reportEligible');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{acceptance,reportAccepted}','true'))$q$,'23514',null,'cannot elevate reportAccepted');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{questionIds}','["unknown-round-question"]'::jsonb))$q$,'23514',null,'unknown question rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{questionIds}','[]'::jsonb))$q$,'23514',null,'no questions rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{questionIds}','[null]'::jsonb))$q$,'23514',null,'null question rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{roundSha256}','"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'::jsonb))$q$,'23514',null,'wrong round hash rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{baselineSha256}','"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'::jsonb))$q$,'23514',null,'wrong baseline hash rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{planSha256}','"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'::jsonb))$q$,'23514',null,'wrong plan hash rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{storage,objectVersion}','"changed"'::jsonb))$q$,'23514',null,'changed storage version rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{storage,objectId}','"ffffffff-0000-4000-8000-000000000001"'::jsonb))$q$,'23514',null,'wrong object ID rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{sourceMetadata,capture,capturedAtUtc}','"2026-10-13T12:00:00Z"'::jsonb))$q$,'23514',null,'invented UTC rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{sourceMetadata,capture,timezoneKnown}','true'::jsonb))$q$,'23514',null,'invented timezone rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{sourceMetadata,cameraPosition}','{"latitude":55,"longitude":9}'::jsonb))$q$,'23514',null,'invented location rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{sourceMetadata,jpegStructure,widthPx}','123'::jsonb))$q$,'23514',null,'invented dimensions rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{status}','"approved"'::jsonb))$q$,'23514',null,'approval status rejected');
select throws_ok($q$select pg_temp.save_media_changed(jsonb_set(pg_temp.media_manifest(),'{sourceUploadId}','"ffffffff-0000-4000-8000-000000000001"'::jsonb))$q$,'23514',null,'wrong source upload rejected');
select throws_ok($q$select pg_temp.save_media_changed(pg_temp.media_manifest() || '{"rawExif":"private"}'::jsonb)$q$,'23514',null,'raw metadata extra keys rejected');
select throws_ok($q$update public.survey_round_media_versions set status='draft_assignment'$q$,'42501',null,'service role cannot update');
select throws_ok($q$delete from public.survey_round_media_versions$q$,'42501',null,'service role cannot delete');
reset role;
select throws_ok($q$update public.survey_round_media_versions set status='draft_assignment'$q$,'23514',null,'immutability trigger protects privileged UPDATE');
select throws_ok($q$delete from public.survey_round_media_versions$q$,'23514',null,'immutability trigger protects privileged DELETE');
select ok((select bool_and(manifest#>'{sourceMetadata,cameraPosition}'='null'::jsonb and manifest#>'{sourceMetadata,capture,capturedAtUtc}'='null'::jsonb) from public.survey_round_media_versions),'unknown capture/GPS remain null');
select ok((select bool_and(status='draft_assignment' and manifest->'acceptance'='{"municipalScopeApproved":false,"professionalApproved":false,"pixelDecoded":false,"georeferenced":false,"reportEligible":false,"reportAccepted":false}'::jsonb) from public.survey_round_media_versions),'all assignments remain unapproved');
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.survey_round_media_versions),2::bigint,'current project viewer reads saved provenance');
select throws_ok($q$insert into public.survey_round_media_versions(project_id) values('e2000000-0000-4000-8000-000000000001')$q$,'42501',null,'browser cannot insert direct assignment');
reset role;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.survey_round_media_versions),0::bigint,'foreign tenant reads no assignment');
reset role;
delete from public.project_members where project_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004';
set local role service_role;
select throws_ok($q$select pg_temp.save_media('ef700000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000004','e7000000-0000-4000-8000-000000000002')$q$,'42501',null,'current role revocation denies exact prior retry');
reset role;
select is(jsonb_build_object(
 'rounds',(select jsonb_agg(to_jsonb(row) order by id) from public.survey_round_versions row),
 'baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),
 'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),
 'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),
 'uploads',(select jsonb_agg(to_jsonb(row) order by id) from public.uploads row),
 'storage',(select jsonb_agg(to_jsonb(row) order by id) from storage.objects row),
 'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),
 'promotionRequests',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row)),
 (select value from round_media_before_graph),'all immutable inputs, original/Storage rows and dedup graph preserved');
select * from finish();
rollback;
