-- Municipal report DB-boundary fixtures reuse the reviewed LOCAL note chain.
-- They do not represent app compiler, real image bytes or professional acceptance.
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

set local role service_role;
do $$ begin perform pg_temp.save_note(); end $$;
reset role;
-- Trusted completed inspection/answer fixtures exercise pin integrity only.
-- Actual provider execution and full compiler equality have separate app tests.
create temporary table report_inspection_fixture as
select binding.*, jsonb_build_object(
  'schema','gofreyra.drone-image-inspection/v1','methodVersion','visual-photo-followups/v1','status','draft_unreviewed',
  'objectGeometry',null,'footprint',null,'reportEligible',false,'professionallyReviewed',false,
  'syntheticBoundaryFixture',true
) as draft from public.survey_round_media_versions binding
where request_id='ef700000-0000-4000-8000-000000000001';
insert into public.drone_image_inspections(
  id,project_id,media_id,created_by,request_id,provider,model_id,prompt_version,method_version,
  original_sha256,original_validation_sha256,storage_object_id,storage_object_version,storage_object_updated_at,
  source_snapshot_id,source_snapshot_sha256,status,attempt_count,result,result_text,result_sha256,completed_at
)
select 'ed100000-0000-4000-8000-000000000001',project_id,media_id,created_by,
  'ed200000-0000-4000-8000-000000000001','cloudflare-workers-ai','@cf/google/gemma-4-26b-a4b-it',
  'danish-stream-visual-draft/v1','visual-photo-followups/v1',original_sha256,original_validation_sha256,
  storage_object_id,storage_object_version,storage_object_updated_at,baseline_id,baseline_sha256,'completed',1,
  draft,pg_temp.canonical_fixture(draft),
  encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture(draft),'UTF8')),'hex'),now()
from report_inspection_fixture;
-- A real same-project completed row with another source version must not be
-- accepted merely because its image and result hash happen to match.
insert into public.drone_image_inspections(
  id,project_id,media_id,created_by,request_id,provider,model_id,prompt_version,method_version,
  original_sha256,original_validation_sha256,storage_object_id,storage_object_version,storage_object_updated_at,
  source_snapshot_id,source_snapshot_sha256,status,attempt_count,result,result_text,result_sha256,completed_at
)
select 'ed100000-0000-4000-8000-000000000002',project_id,media_id,created_by,
  'ed200000-0000-4000-8000-000000000002',provider,model_id,prompt_version,method_version,
  original_sha256,original_validation_sha256,storage_object_id,storage_object_version,storage_object_updated_at,
  'e3000000-0000-4000-8000-000000000002',repeat('c',64),'completed',1,result,result_text,result_sha256,completed_at
from public.drone_image_inspections where id='ed100000-0000-4000-8000-000000000001';
insert into public.drone_image_inspection_answer_versions(
  id,project_id,inspection_id,inspection_result_sha256,created_by,request_id,answers,answers_text,answers_sha256
)
select 'ed300000-0000-4000-8000-000000000001',project_id,id,result_sha256,created_by,
  'ed400000-0000-4000-8000-000000000001',
  '[{"questionId":"synthetic-question","assessment":"uncertain","note":"SQL pin fixture","followup":"Review required"}]'::jsonb,
  pg_temp.canonical_fixture('[{"questionId":"synthetic-question","assessment":"uncertain","note":"SQL pin fixture","followup":"Review required"}]'::jsonb),
  encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture('[{"questionId":"synthetic-question","assessment":"uncertain","note":"SQL pin fixture","followup":"Review required"}]'::jsonb),'UTF8')),'hex')
from public.drone_image_inspections where id='ed100000-0000-4000-8000-000000000001';
-- Equal timestamps exercise the deterministic UUID tie-break. Historical pins
-- stay valid; only a new-report selection reads the latest-only invoker view.
insert into public.drone_image_inspection_answer_versions(
  id,project_id,inspection_id,inspection_result_sha256,created_by,request_id,answers,answers_text,answers_sha256,created_at
)
select 'ed300000-0000-4000-8000-000000000002',project_id,inspection_id,inspection_result_sha256,created_by,
  'ed400000-0000-4000-8000-000000000002',answers,answers_text,answers_sha256,created_at
from public.drone_image_inspection_answer_versions where id='ed300000-0000-4000-8000-000000000001';
create temporary table report_before_graph as select jsonb_build_object(
  'baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),
  'plans',(select jsonb_agg(to_jsonb(r) order by id) from public.verification_plan_versions r),
  'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r),
  'bindings',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r),
  'notes',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_note_versions r),
  'inspections',(select jsonb_agg(to_jsonb(r) order by id) from public.drone_image_inspections r),
  'answers',(select jsonb_agg(to_jsonb(r) order by id) from public.drone_image_inspection_answer_versions r),
  'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),
  'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),
  'storage',(select jsonb_agg(to_jsonb(r) order by id) from storage.objects r)
) as value;
create function pg_temp.report_manifest() returns jsonb language sql as $$
select jsonb_build_object(
  'schema','gofreyra.municipal-report/v1','generatorVersion','municipal-evidence-report/v1',
  'projectId',binding.project_id,'generatedAt','2026-10-15T09:00:00.000Z','recipient','Haderslev Kommune',
  'status','draft_unreviewed','reportEligible',false,'professionallyReviewed',false,'municipalScopeApproved',false,
  'projectName','Trusted SQL boundary fixture','purpose','Pins, isolation and immutable persistence only',
  'executiveSummary',jsonb_build_array('Not actual image, compiler or municipal acceptance.'),
  'pins',jsonb_build_object(
    'baseline',jsonb_build_object('id',binding.baseline_id,'sha256',binding.baseline_sha256),
    'plan',jsonb_build_object('id',binding.plan_id,'sha256',binding.plan_sha256),
    'round',jsonb_build_object('id',binding.round_version_id,'sha256',binding.round_sha256),
    'mediaBindings',jsonb_build_array(jsonb_build_object('id',binding.id,'sha256',binding.manifest_sha256,
      'mediaId',binding.media_id,'originalSha256',binding.original_sha256,'originalValidationSha256',binding.original_validation_sha256)),
    'notes',(select jsonb_agg(jsonb_build_object('id',id,'sha256',manifest_sha256)) from public.survey_round_note_versions
      where request_id='ec200000-0000-4000-8000-000000000001'),
    'inspections',(select jsonb_agg(jsonb_build_object('id',id,'sha256',result_sha256,'mediaId',media_id))
      from public.drone_image_inspections where id='ed100000-0000-4000-8000-000000000001'),
    'answers',(select jsonb_agg(jsonb_build_object('id',id,'sha256',answers_sha256,'inspectionId',inspection_id))
      from public.drone_image_inspection_answer_versions where id='ed300000-0000-4000-8000-000000000001')
  ),
  'scope',jsonb_build_object('referenceId','synthetic','referenceName','Synthetic reference','referenceNameStatus','unknown',
    'municipalities','[]'::jsonb,'sourceModifiedAt',null,'savedAt','2026-10-13T12:00:00Z','referenceSourceUrl',null,
    'period',jsonb_build_object('from','2026-08-24','to','2026-09-07'),'roundKind','before','roundTitle','Synthetic BEFORE round',
    'recordingWindow',jsonb_build_object('dateFrom','2026-10-13','dateTo','2026-10-14','timeZone','Europe/Copenhagen'),
    'actualCoverage','not_verified','spatialInterpretation','saved_reference_and_aoi_not_approved_municipal_reach'),
  'sources','[]'::jsonb,
  'photos',jsonb_build_array(jsonb_build_object('bindingId',binding.id,'bindingSha256',binding.manifest_sha256,
    'mediaId',binding.media_id,'originalSha256',binding.original_sha256,'originalValidationSha256',binding.original_validation_sha256,
    'capturedAtUtc',null,'localTimestamp',null,'timezoneKnown',false,'cameraPosition',null,
    'captureWithinPlannedWindow','not_verified','manualNotes','[]'::jsonb,'inspections','[]'::jsonb)),
  'prioritizedFollowup','[]'::jsonb,'deliveryGaps','[]'::jsonb,'limitations',jsonb_build_array('Trusted SQL boundaries only.')
)
from public.survey_round_media_versions binding where request_id='ef700000-0000-4000-8000-000000000001'
$$;
create function pg_temp.save_report(
  p_request uuid default 'ed500000-0000-4000-8000-000000000001',
  p_actor uuid default 'e1000000-0000-4000-8000-000000000001',
  p_manifest jsonb default null
) returns jsonb language sql as $$
select public.persist_municipal_report('e2000000-0000-4000-8000-000000000001',p_actor,p_request,
  pg_temp.canonical_fixture(coalesce(p_manifest,pg_temp.report_manifest())))
$$;

select ok((select relrowsecurity from pg_class where oid='public.municipal_report_versions'::regclass),'report RLS enabled');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.municipal_report_latest_answers'::regclass),'latest answers view is security invoker');
select columns_are('public','municipal_report_latest_answers',array[
  'id','project_id','inspection_id','inspection_result_sha256','created_by','request_id','answers','answers_text',
  'answers_sha256','status','professionally_reviewed','report_eligible','created_at'],'latest answer view exposes only existing safe answer columns');
select ok(not has_table_privilege('anon','public.municipal_report_latest_answers','SELECT'),'anonymous cannot read latest answers view');
select ok(has_table_privilege('authenticated','public.municipal_report_latest_answers','SELECT'),'authenticated latest answer view allowed through base RLS');
select ok(not has_table_privilege('authenticated','public.municipal_report_latest_answers','UPDATE'),'latest answer view has no UPDATE grant');
select is((select count(*) from public.drone_image_inspection_answer_versions),2::bigint,'two exact historical answer versions remain');
select is((select count(*) from public.municipal_report_latest_answers),1::bigint,'latest selection occurs before response limits');
select is((select id::text from public.municipal_report_latest_answers),'ed300000-0000-4000-8000-000000000002','latest deterministic UUID tie-break');
select ok(has_table_privilege('authenticated','public.municipal_report_versions','SELECT'),'members may read scoped reports');
select ok(not has_table_privilege('anon','public.municipal_report_versions','SELECT'),'anonymous cannot read reports');
select ok(not has_table_privilege('authenticated','public.municipal_report_versions','INSERT'),'browser INSERT revoked');
select ok(not has_table_privilege('authenticated','public.municipal_report_versions','UPDATE'),'browser UPDATE revoked');
select ok(not has_table_privilege('authenticated','public.municipal_report_versions','DELETE'),'browser DELETE revoked');
select ok(not has_table_privilege('service_role','public.municipal_report_versions','UPDATE'),'server UPDATE revoked');
select ok(not has_table_privilege('service_role','public.municipal_report_versions','DELETE'),'server DELETE revoked');
select ok(not has_function_privilege('authenticated','public.persist_municipal_report(uuid,uuid,uuid,text)','EXECUTE'),'browser cannot spoof server RPC actor or content');
select ok(not has_function_privilege('anon','public.persist_municipal_report(uuid,uuid,uuid,text)','EXECUTE'),'anonymous cannot call writer');
select ok(has_function_privilege('service_role','public.persist_municipal_report(uuid,uuid,uuid,text)','EXECUTE'),'writer service-only');
select is((select prosecdef from pg_proc where oid='public.persist_municipal_report(uuid,uuid,uuid,text)'::regprocedure),false,'writer SECURITY INVOKER');
select ok(not has_any_column_privilege('service_role','public.project_baseline_snapshots','UPDATE'),'no baseline UPDATE grant');
select ok(not has_any_column_privilege('service_role','public.verification_plan_versions','UPDATE'),'no plan UPDATE grant');
select ok(not has_any_column_privilege('service_role','public.survey_round_versions','UPDATE'),'no round UPDATE grant');
select ok(not has_any_column_privilege('service_role','public.survey_round_media_versions','UPDATE'),'no binding UPDATE grant');
select ok(not has_any_column_privilege('service_role','public.survey_round_note_versions','UPDATE'),'no note UPDATE grant');
set local role service_role;
select lives_ok($q$select pg_temp.save_report()$q$,'editor freezes exact selected source versions');
select is((select count(*) from public.municipal_report_versions),1::bigint,'first report saved once');
select lives_ok($q$select pg_temp.save_report()$q$,'same request exact retry succeeds');
select is((select count(*) from public.municipal_report_versions),1::bigint,'retry adds no row');
select is((select manifest_sha256 from public.municipal_report_versions),
  encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture(pg_temp.report_manifest()),'UTF8')),'hex'),'database hashes exact canonical UTF8');
select is((select status from public.municipal_report_versions),'draft_unreviewed','saved report remains unreviewed');
select ok((select not report_eligible and not professionally_reviewed and not municipal_scope_approved from public.municipal_report_versions),'no report/professional/municipal approval');
select is((pg_temp.save_report('ed500000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
  jsonb_set(pg_temp.report_manifest(),'{generatedAt}','"2026-10-15T09:00:02.000Z"')))->>'id',
  (select id::text from public.municipal_report_versions),'concurrent-identical request returns original generation timestamp/version');
select is((select count(*) from public.municipal_report_versions),1::bigint,'different transient generatedAt adds no duplicate');
select lives_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000002')$q$,'new request appends a separate report version');
select is((select array_agg(version_no order by version_no) from public.municipal_report_versions),array[1,2],'project-wide report cursor');
select throws_ok($q$select pg_temp.save_report(null)$q$,'22023',null,'null request denied');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099',null)$q$,'22023',null,'verified actor required');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000002')$q$,'42501',null,'viewer cannot write report');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000003')$q$,'42501',null,'foreign owner cannot write report');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000004')$q$,'42501',null,'field contribution does not imply report write permission');
select throws_ok($q$select public.persist_municipal_report('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','ed500000-0000-4000-8000-000000000099',repeat('x',2097153))$q$,'23514',null,'2MiB budget before JSON parsing');
select throws_ok($q$select public.persist_municipal_report('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','ed500000-0000-4000-8000-000000000099',repeat('ø',1048577))$q$,'23514',null,'report byte budget counts multibyte UTF8');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{purpose}','"Changed report"'))$q$,'23514',null,'same request cannot change report content');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{status}','"approved"'))$q$,'23514',null,'no approved status');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{reportEligible}','true'))$q$,'23514',null,'no report eligibility escalation');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{municipalScopeApproved}','true'))$q$,'23514',null,'no municipal scope approval');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{professionallyReviewed}','true'))$q$,'23514',null,'no professional review');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',pg_temp.report_manifest()||'{"reviewer":"invented"}')$q$,'23514',null,'unknown manifest fields rejected');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{scope,actualCoverage}','"complete"'))$q$,'23514',null,'no invented actual coverage');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,baseline,sha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'baseline hash checked against actual row');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,plan,sha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'plan hash checked against actual row');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,round,sha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'round hash checked against actual row');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',
  jsonb_set(pg_temp.report_manifest(),'{pins,baseline}','{"id":"e3000000-0000-4000-8000-000000000003","sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}'))$q$,'23514',null,'real foreign baseline ID and correct hash still denied');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',
  jsonb_set(pg_temp.report_manifest(),'{pins,plan}',(select jsonb_build_object('id',id,'sha256',manifest_sha256) from public.verification_plan_versions where request_id='e6000000-0000-4000-8000-000000000002')))$q$,'23514',null,'real plan with correct hash cannot bind another baseline');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',
  jsonb_set(pg_temp.report_manifest(),'{pins,round}',(select jsonb_build_object('id',id,'sha256',manifest_sha256) from public.survey_round_versions where request_id='e7000000-0000-4000-8000-000000000002')))$q$,'23514',null,'real other round and correct hash cannot reuse first round photo binding');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,mediaBindings,0,originalSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'exact original hash cannot be forged');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,mediaBindings,0,originalValidationSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'exact original validation hash cannot be forged');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,notes,0,sha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'note hash checked against actual version');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,inspections,0,sha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'inspection result hash checked');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',
  jsonb_set(pg_temp.report_manifest(),'{pins,inspections}',(select jsonb_build_array(jsonb_build_object('id',id,'sha256',result_sha256,'mediaId',media_id))
    from public.drone_image_inspections where id='ed100000-0000-4000-8000-000000000002')))$q$,'23514',null,'actual completed inspection from another baseline cannot be relabeled');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,answers,0,sha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'answer version hash checked');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{photos,0,originalSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'photo content cannot disagree with its pinned original');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,notes}',(pg_temp.report_manifest()#>'{pins,notes}')||(pg_temp.report_manifest()#>'{pins,notes}')))$q$,'23514',null,'duplicate note selection denied');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,answers}',(pg_temp.report_manifest()#>'{pins,answers}')||(pg_temp.report_manifest()#>'{pins,answers}')))$q$,'23514',null,'multiple answer versions per inspection denied');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',
  jsonb_set(pg_temp.report_manifest(),'{pins,answers}',(select jsonb_agg(jsonb_build_object('id',id,'sha256',answers_sha256,'inspectionId',inspection_id) order by id) from public.drone_image_inspection_answer_versions)))$q$,'23514',null,'two different actual answer versions cannot be mixed for one inspection');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,mediaBindings}','[]'))$q$,'23514',null,'notes cannot survive outside selected binding set');
select throws_ok($q$select pg_temp.save_report('ed500000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest(),'{pins,inspections}','[]'))$q$,'23514',null,'answers cannot survive outside selected inspection set');
select throws_ok($q$update public.municipal_report_versions set status='draft_unreviewed'$q$,'42501',null,'service cannot update report');
select throws_ok($q$delete from public.municipal_report_versions$q$,'42501',null,'service cannot delete report');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.municipal_report_versions),2::bigint,'viewer reads exact same-project report versions');
select is((select count(*) from public.municipal_report_latest_answers),1::bigint,'viewer reads only same-project latest answer');
select throws_ok($q$select pg_temp.save_report()$q$,'42501',null,'ordinary browser cannot invoke writer');
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.municipal_report_versions),0::bigint,'foreign tenant sees no report');
select is((select count(*) from public.municipal_report_latest_answers),0::bigint,'foreign tenant sees no latest answer');
reset role;
revoke select on public.drone_image_inspection_answer_versions from authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select throws_ok($q$select * from public.municipal_report_latest_answers$q$,'42501',null,'invoker view does not bypass underlying SELECT permissions');
reset role;
grant select on public.drone_image_inspection_answer_versions to authenticated;
set local role anon;
select throws_ok($q$select * from public.municipal_report_versions$q$,'42501',null,'anonymous read denied');
reset role;
select throws_ok($q$update public.municipal_report_versions set status='draft_unreviewed'$q$,'23514',null,'even owner cannot mutate saved history');
select throws_ok($q$delete from public.municipal_report_versions$q$,'23514',null,'even owner cannot delete saved history');
-- Additive v2 boundaries use synthetic local data in the same rollback-only test transaction.
create temporary table report_v1_before_v2 as
  select jsonb_agg(to_jsonb(r) order by id) as value from public.municipal_report_versions r;
create function pg_temp.report_manifest_v2() returns jsonb language sql as $$
  select pg_temp.report_manifest() || jsonb_build_object(
    'generatorVersion','municipal-evidence-report/v2',
    'planting',jsonb_build_object(
      'schema','freyra.planting-suitability/v1','notice','Skitse – kræver faglig validering',
      'projectId','e2000000-0000-4000-8000-000000000001',
      'baselineId',pg_temp.report_manifest()#>>'{pins,baseline,id}',
      'baselineSha256',pg_temp.report_manifest()#>>'{pins,baseline,sha256}',
      'localEffectsCalculated',false,'status','unavailable','warnings','[]'::jsonb,
      'reaches',(select jsonb_agg(jsonb_build_object('reach',reach,'bufferM',width,'status','unknown',
        'suitableHa',null,'conditionalHa',null,'unsuitableHa',null,'reason','Synthetic missing geometry'))
        from unnest(array['A','B','C','D','E']) reach cross join unnest(array[10,20]) width),
      'sources',(select jsonb_agg(jsonb_build_object('id',id,'label','Synthetic source fixture',
        'coverage','unavailable','fetchedAt',null,'sourceUrl',null,'warnings','[]'::jsonb))
        from unnest(array['watercourse','section3','woodland','lowland','fields']) id),
      'literature',(select jsonb_agg(jsonb_build_object('effect','Synthetic effect fixture '||i,'interval',null,
        'context','No real literature result in SQL test','citation','Synthetic test fixture',
        'sourceUrl','https://example.test/fixture','checkedAt','2026-10-15')) from generate_series(1,4) i)),
    'photoPointReviews','[]'::jsonb)
$$;
set local role service_role;
select lives_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',pg_temp.report_manifest_v2())$q$,'v2 permits a source-bound sketch and explicit empty review list');
select is((select generator_version from public.municipal_report_versions where request_id='ed900000-0000-4000-8000-000000000001'),'municipal-evidence-report/v2','v2 generator is stored without relabeling v1');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',pg_temp.report_manifest_v2()-'planting')$q$,'23514',null,'v2 cannot omit planting evidence');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2(),'{generatorVersion}','"municipal-evidence-report/v1"'))$q$,'23514',null,'v2 sections cannot be laundered into historical v1');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2(),'{planting,baselineSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'planting must pin exact baseline checksum');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2(),'{planting,localEffectsCalculated}','true'))$q$,'23514',null,'no calculated local effect allowed in v2 sketch');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2(),'{planting,sources,0}','null'))$q$,'23514',null,'null source elements cannot create an unreadable report');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2(),'{planting,literature,0}','null'))$q$,'23514',null,'null citations cannot create an unreadable report');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2(),'{planting,reaches,0,suitableHa}','0'))$q$,'23514',null,'unknown hectares cannot be represented as zero');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2(),'{planting,reaches,0}',pg_temp.report_manifest_v2()#>'{planting,reaches,1}'))$q$,'23514',null,'repeated A-E and buffer combinations are rejected');
reset role;
-- Immutable decision fixture with an exact original/source binding, independent of AI.
with review_fixture as (
  select binding.id as binding_id, jsonb_build_object('schema','freyra.photo-point-review/v1',
    'projectId',binding.project_id,'bindingId',binding.id,'bindingSha256',binding.manifest_sha256,
    'mediaId',binding.media_id,'originalSha256',binding.original_sha256,
    'baselineId',binding.baseline_id,'baselineSha256',binding.baseline_sha256,
    'decision','confirmed','note','Synthetic local professional decision','reviewerName','Synthetic reviewer',
    'inspectionId',null,'inspectionSha256',null) as review
  from public.survey_round_media_versions binding where request_id='ef700000-0000-4000-8000-000000000001'
)
insert into public.photo_point_review_versions(id,project_id,binding_id,reviewed_by,request_id,review,review_text,review_sha256,created_at)
select 'ed910000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',binding_id,
  'e1000000-0000-4000-8000-000000000001','ed910000-0000-4000-8000-000000000002',review,
  pg_temp.canonical_fixture(review),encode(pg_catalog.sha256(convert_to(pg_temp.canonical_fixture(review),'UTF8')),'hex'),'2026-10-15T08:00:00Z'
from review_fixture;
create function pg_temp.report_manifest_v2_review() returns jsonb language sql as $$
  select jsonb_set(pg_temp.report_manifest_v2(),'{photoPointReviews}',jsonb_build_array(jsonb_build_object(
    'id',id,'projectId',project_id,'bindingId',binding_id,'reviewedBy',reviewed_by,'requestId',request_id,
    'review',review,'reviewSha256',review_sha256,'createdAt',created_at)))
  from public.photo_point_review_versions where id='ed910000-0000-4000-8000-000000000001'
$$;
set local role service_role;
select lives_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001',pg_temp.report_manifest_v2_review())$q$,'v2 stores an exact immutable human decision');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2_review(),'{photoPointReviews,0,review,note}','"Forged note"'))$q$,'23514',null,'decision prose must equal authoritative immutable row');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2_review(),'{photoPointReviews,0,reviewedBy}','"e1000000-0000-4000-8000-000000000003"'))$q$,'23514',null,'decision reviewer identity cannot be forged');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2_review(),'{photoPointReviews,0,reviewSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'decision hash cannot be forged');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2_review(),'{generatedAt}','"2026-10-15T07:59:00Z"'))$q$,'23514',null,'decision cannot postdate frozen report generation');
select throws_ok($q$select pg_temp.save_report('ed900000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v2_review(),'{photoPointReviews}',(pg_temp.report_manifest_v2_review()->'photoPointReviews')||(pg_temp.report_manifest_v2_review()->'photoPointReviews')))$q$,'23514',null,'decision cannot be duplicated within report');
reset role;
select is((select jsonb_agg(to_jsonb(r) order by id) from public.municipal_report_versions r where generator_version='municipal-evidence-report/v1'),(select value from report_v1_before_v2),'adding v2 never rewrites historical v1 rows or hashes');

-- V3 changes derived Danish prose only; its evidence and authority guards stay the same.
create temporary table historical_reports_before_v3 as
  select jsonb_agg(to_jsonb(r) order by id) as value from public.municipal_report_versions r;
create function pg_temp.report_manifest_v3() returns jsonb language sql as $$
  select jsonb_set(pg_temp.report_manifest_v2_review(),'{generatorVersion}','"municipal-evidence-report/v3"')
$$;
set local role service_role;
select lives_ok($q$select pg_temp.save_report('ed920000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',pg_temp.report_manifest_v3())$q$,'v3 accepts the same frozen planting and exact review evidence');
select is((select generator_version from public.municipal_report_versions where request_id='ed920000-0000-4000-8000-000000000001'),'municipal-evidence-report/v3','v3 generator is stored explicitly');
select lives_ok($q$select pg_temp.save_report('ed920000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',pg_temp.report_manifest_v3())$q$,'v3 identical request replay returns the same immutable version');
select throws_ok($q$select pg_temp.save_report('ed920000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',pg_temp.report_manifest_v3()-'planting')$q$,'23514',null,'v3 still requires planting evidence');
select throws_ok($q$select pg_temp.save_report('ed920000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v3(),'{planting,baselineSha256}',to_jsonb(repeat('f',64))))$q$,'23514',null,'v3 still rejects a foreign planting baseline hash');
select throws_ok($q$select pg_temp.save_report('ed920000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v3(),'{photoPointReviews,0,review,note}','"Forged note"'))$q$,'23514',null,'v3 still rejects modified professional review evidence');
select throws_ok($q$select pg_temp.save_report('ed920000-0000-4000-8000-000000000099','e1000000-0000-4000-8000-000000000001',jsonb_set(pg_temp.report_manifest_v3(),'{generatorVersion}','"municipal-evidence-report/v4"'))$q$,'23514',null,'unknown generator versions remain rejected');
reset role;
select is((select jsonb_agg(to_jsonb(r) order by id) from public.municipal_report_versions r where generator_version in ('municipal-evidence-report/v1','municipal-evidence-report/v2')),(select value from historical_reports_before_v3),'adding v3 never rewrites historical v1/v2 rows or hashes');

delete from public.project_members where project_id='e2000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$select pg_temp.save_report()$q$,'42501',null,'revoked writer cannot retry prior request');
reset role;
delete from public.organization_memberships where organization_id='e0000000-0000-4000-8000-000000000001' and user_id='e1000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.municipal_report_versions),0::bigint,'unchanged JWT loses report read after revoke');
select is((select count(*) from public.municipal_report_latest_answers),0::bigint,'unchanged JWT loses latest answer view after revoke');
reset role;
select is((select count(*) from public.municipal_report_versions),5::bigint,'failed attempts leave two v1, two v2 and one v3 immutable versions');
select is(jsonb_build_object(
  'baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),
  'plans',(select jsonb_agg(to_jsonb(r) order by id) from public.verification_plan_versions r),
  'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r),
  'bindings',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_media_versions r),
  'notes',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_note_versions r),
  'inspections',(select jsonb_agg(to_jsonb(r) order by id) from public.drone_image_inspections r),
  'answers',(select jsonb_agg(to_jsonb(r) order by id) from public.drone_image_inspection_answer_versions r),
  'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),
  'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),
  'storage',(select jsonb_agg(to_jsonb(r) order by id) from storage.objects r)
),(select value from report_before_graph),'report persistence never changes original/canonical/source/evidence graph');
select * from finish();
rollback;
