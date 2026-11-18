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
-- M1-specific tests below. The trusted LOCAL metadata fixture above is copied
-- from the accepted media pgTAP fixture; it creates no physical image bytes.
set local role service_role;
do $$begin perform pg_temp.save_media('ef700000-0000-4000-8000-000000000001'); end $$;
reset role;
create temporary table note_before_graph as select jsonb_build_object(
 'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r),
 'baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),
 'plans',(select jsonb_agg(to_jsonb(r) order by id) from public.verification_plan_versions r),
 'bindings',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r),
 'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),
 'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),
 'storage',(select jsonb_agg(to_jsonb(r) order by id) from storage.objects r),
 'origins',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_upload_origins r),
 'requests',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_promotion_requests r)) as value;
create function pg_temp.note_manifest(p_logical uuid default 'ec100000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select jsonb_build_object('schema','gofreyra.survey-round-note/v1','methodVersion','manual-photo-question-note/v1','status','draft_unreviewed',
 'projectId',project_id,'logicalNoteId',p_logical,'noteVersion',1,'supersedesId',null,
 'mediaBindingId',id,'mediaBindingSha256',manifest_sha256,'roundVersionId',round_version_id,'roundSha256',round_sha256,
 'baselineId',baseline_id,'baselineSha256',baseline_sha256,'planId',plan_id,'planSha256',plan_sha256,
 'mediaId',media_id,'originalSha256',original_sha256,'originalValidationSha256',original_validation_sha256,
 'questionId',manifest#>>'{questionIds,0}','questionKind','official-reference-location/v1','sourceMetadata',manifest->'sourceMetadata',
 'manual',jsonb_build_object('qualitativeAnswer','inconclusive','manualStatement','Syntetisk manuel note uden sikker stedreference.',
 'uncertainty','Den geografiske sammenhæng er uafklaret.','proposedFollowup','Foreslå en besigtigelse.','proposedPriority','not_assessed'))
 from public.survey_round_media_versions where request_id='ef700000-0000-4000-8000-000000000001'
$$;
create function pg_temp.save_note(p_request uuid default 'ec200000-0000-4000-8000-000000000001',p_logical uuid default 'ec100000-0000-4000-8000-000000000001',p_actor uuid default 'e1000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.persist_survey_round_note(project_id,p_actor,p_request,p_logical,id,manifest_sha256,pg_temp.canonical_fixture(pg_temp.note_manifest(p_logical)))
 from public.survey_round_media_versions where request_id='ef700000-0000-4000-8000-000000000001'
$$;
create function pg_temp.save_note_changed(p_manifest jsonb,p_request uuid default 'ec200000-0000-4000-8000-000000000099') returns jsonb language sql as $$
 select public.persist_survey_round_note(project_id,'e1000000-0000-4000-8000-000000000001',p_request,'ec100000-0000-4000-8000-000000000001',id,manifest_sha256,pg_temp.canonical_fixture(p_manifest))
 from public.survey_round_media_versions where request_id='ef700000-0000-4000-8000-000000000001'
$$;
select ok((select relrowsecurity from pg_class where oid='public.survey_round_note_versions'::regclass),'M1 RLS enabled');
select ok(has_table_privilege('authenticated','public.survey_round_note_versions','SELECT'),'M1 authenticated read');
select ok(not has_table_privilege('authenticated','public.survey_round_note_versions','INSERT'),'M1 authenticated no INSERT');
select ok(not has_table_privilege('authenticated','public.survey_round_note_versions','UPDATE'),'M1 authenticated no UPDATE');
select ok(not has_table_privilege('authenticated','public.survey_round_note_versions','DELETE'),'M1 authenticated no DELETE');
select ok(not has_table_privilege('anon','public.survey_round_note_versions','SELECT'),'M1 anon no read');
select ok(has_table_privilege('service_role','public.survey_round_note_versions','INSERT'),'M1 service insert');
select ok(not has_table_privilege('service_role','public.survey_round_note_versions','UPDATE'),'M1 service no UPDATE');
select ok(not has_table_privilege('service_role','public.survey_round_note_versions','DELETE'),'M1 service no DELETE');
select ok(not has_function_privilege('authenticated','public.persist_survey_round_note(uuid,uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'M1 authenticated cannot call writer');
select ok(not has_function_privilege('anon','public.persist_survey_round_note(uuid,uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'M1 anon cannot call writer');
select is((select prosecdef from pg_proc where oid='public.persist_survey_round_note(uuid,uuid,uuid,uuid,uuid,text,text)'::regprocedure),false,'M1 writer security invoker');
select ok(not has_any_column_privilege('service_role','public.survey_round_media_versions','UPDATE'),'M1 no binding UPDATE grant');
select ok(not has_any_column_privilege('service_role','public.survey_round_versions','UPDATE'),'M1 no round UPDATE grant');
select ok(not has_any_column_privilege('service_role','public.project_baseline_snapshots','UPDATE'),'M1 no baseline UPDATE grant');
select ok(not has_any_column_privilege('service_role','public.verification_plan_versions','UPDATE'),'M1 no plan UPDATE grant');
set local role service_role;
select lives_ok($q$select pg_temp.save_note()$q$,'M1 editor creates manual note');
select lives_ok($q$select pg_temp.save_note()$q$,'M1 exact retry returns same note');
select is((select count(*) from public.survey_round_note_versions),1::bigint,'M1 retry creates no row');
select is((select manifest_sha256 from public.survey_round_note_versions),encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture(pg_temp.note_manifest()),'UTF8')),'hex'),'M1 exact canonical bytes checksum');
select lives_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000002')$q$,'M1 independent second note for same question');
select lives_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000003','ec100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004')$q$,'M1 field creates manual note');
select is((select count(*) from public.survey_round_note_versions),3::bigint,'M1 independent notes coexist');
select is((select array_agg(version_no order by version_no) from public.survey_round_note_versions),array[1,2,3],'M1 projectwide cursor');
select throws_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000004')$q$,'23514',null,'M1 new request cannot replace logical note');
select throws_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000004')$q$,'23514',null,'M1 same actor request rejects different logical note');
select throws_ok($q$select pg_temp.save_note(null)$q$,'22023',null,'M1 null request denied');
select throws_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000004',null)$q$,'22023',null,'M1 null logical identity denied');
select throws_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000004','ec100000-0000-4000-8000-000000000004',null)$q$,'22023',null,'M1 null actor denied');
select throws_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000004','ec100000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000002')$q$,'42501',null,'M1 viewer cannot write');
select throws_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000004','ec100000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000003')$q$,'42501',null,'M1 foreign actor cannot write');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{manual,manualStatement}',to_jsonb('Changed same request'::text)),'ec200000-0000-4000-8000-000000000001')$q$,'23514',null,'M1 same request rejects changed statement');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{manual,manualStatement}',to_jsonb(''::text)))$q$,'23514',null,'M1 blank statement denied');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{manual,uncertainty}',to_jsonb('   '::text)))$q$,'23514',null,'M1 blank uncertainty denied');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{manual,proposedFollowup}',to_jsonb(repeat('x',1001))))$q$,'23514',null,'M1 oversized followup denied');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{manual,manualStatement}',to_jsonb(E'line\nline'::text)))$q$,'23514',null,'M1 control text denied');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{manual,qualitativeAnswer}',to_jsonb('species_present'::text)))$q$,'23514',null,'M1 unsupported qualitative outcome denied');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{manual,proposedPriority}',to_jsonb('certain'::text)))$q$,'23514',null,'M1 unknown priority denied');
select throws_ok($q$select pg_temp.save_note_changed(pg_temp.note_manifest() || '{"professionalApproved":true}'::jsonb)$q$,'23514',null,'M1 no approval field');
select throws_ok($q$select pg_temp.save_note_changed(pg_temp.note_manifest() || '{"photoViewed":true}'::jsonb)$q$,'23514',null,'M1 no viewed pixels claim');
select throws_ok($q$select pg_temp.save_note_changed(pg_temp.note_manifest() || '{"reportReady":true}'::jsonb)$q$,'23514',null,'M1 no report readiness field');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{status}',to_jsonb('approved'::text)))$q$,'23514',null,'M1 no approved status');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{noteVersion}','2'::jsonb))$q$,'23514',null,'M1 no revisions');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{questionId}',to_jsonb('unknown'::text)))$q$,'23514',null,'M1 unknown question denied');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{roundSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'M1 exact round hash required');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{baselineSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'M1 exact baseline hash required');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{planSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'M1 exact plan hash required');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{mediaBindingSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'M1 exact assignment hash required');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{originalSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'M1 exact original hash required');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{sourceMetadata,capture,capturedAtUtc}',to_jsonb('2026-10-14T00:00:00Z'::text)))$q$,'23514',null,'M1 cannot invent recording date');
select throws_ok($q$select pg_temp.save_note_changed(jsonb_set(pg_temp.note_manifest(),'{sourceMetadata,cameraPosition}','{"latitude":55,"longitude":9}'::jsonb))$q$,'23514',null,'M1 cannot invent camera GPS');
select throws_ok($q$update public.survey_round_note_versions set status='draft_unreviewed'$q$,'42501',null,'M1 service cannot update');
select throws_ok($q$delete from public.survey_round_note_versions$q$,'42501',null,'M1 service cannot delete');
reset role;
select throws_ok($q$update public.survey_round_note_versions set status='draft_unreviewed'$q$,'23514',null,'M1 privileged UPDATE immutable');
select throws_ok($q$delete from public.survey_round_note_versions$q$,'23514',null,'M1 privileged DELETE immutable');
select ok((select bool_and(manifest#>'{sourceMetadata,cameraPosition}'='null'::jsonb and manifest#>'{sourceMetadata,capture,capturedAtUtc}'='null'::jsonb) from public.survey_round_note_versions),'M1 unknown GPS/capture preserved');
select ok((select bool_and(status='draft_unreviewed' and not(manifest ?| array['professionalApproved','reportReady','photoViewed','observedAt','objectGeometry'])) from public.survey_round_note_versions),'M1 no extra observation or approval claims');
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.survey_round_note_versions),3::bigint,'M1 current viewer reads saved notes');
select throws_ok($q$insert into public.survey_round_note_versions(project_id) values('e2000000-0000-4000-8000-000000000001')$q$,'42501',null,'M1 browser insert denied');
reset role;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.survey_round_note_versions),0::bigint,'M1 foreign tenant sees no note');
reset role;
update public.project_members set role='viewer' where project_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004';
set local role service_role;
select throws_ok($q$select pg_temp.save_note('ec200000-0000-4000-8000-000000000003','ec100000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004')$q$,'42501',null,'M1 downgrade denies exact previous retry');
reset role;
update public.project_members set role='field' where project_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000004';
-- Storage mutation is isolated to a subtransaction and rolled back on purpose.
create function pg_temp.retry_changed_object() returns void language plpgsql as $$
begin
 update storage.objects set name=name||'.changed' where id='ef500000-0000-4000-8000-000000000001';
 perform pg_temp.save_note();
end $$;
select throws_ok($q$select pg_temp.retry_changed_object()$q$,'23514',null,'M1 exact retry rechecks current original object');
select is((select count(*) from public.survey_round_note_versions),3::bigint,'M1 all negative writes leave same three notes');
select is(jsonb_build_object(
 'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r),
 'baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),
 'plans',(select jsonb_agg(to_jsonb(r) order by id) from public.verification_plan_versions r),
 'bindings',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r),
 'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),
 'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),
 'storage',(select jsonb_agg(to_jsonb(r) order by id) from storage.objects r),
 'origins',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_upload_origins r),
 'requests',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media_promotion_requests r)),
 (select value from note_before_graph),'M1 existing immutable inputs and original/dedup graph unchanged');
select * from finish();
rollback;
