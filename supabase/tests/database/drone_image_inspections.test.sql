-- Rollback-only LOCAL synthetic metadata. No photo bytes, network or hosted data.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','bb100000-0000-4000-8000-000000000001','authenticated','authenticated','vision-editor@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','bb100000-0000-4000-8000-000000000002','authenticated','authenticated','vision-viewer@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','bb100000-0000-4000-8000-000000000003','authenticated','authenticated','vision-foreign@example.test','',now(),'{"provider":"email"}','{}',now(),now());
insert into public.organizations(id,name,type,country) values
 ('bb000000-0000-4000-8000-000000000001','Vision fixture A','test','Denmark'),
 ('bb000000-0000-4000-8000-000000000002','Vision fixture B','test','Denmark');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('bb000000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000001','viewer'),
 ('bb000000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000002','viewer'),
 ('bb000000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000003','owner');
insert into public.projects(id,organization_id,name) values
 ('bb200000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','Vision fixture A');
insert into public.project_members(project_id,user_id,role) values
 ('bb200000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000001','editor'),
 ('bb200000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000002','viewer');
insert into public.uploads(id,project_id,organization_id,uploaded_by,file_name,original_file_name,file_size,mime_type,upload_type,storage_path,intent_request_id,intent_expires_at,received_at,status)
 values('bb300000-0000-4000-8000-000000000001','bb200000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','bb100000-0000-4000-8000-000000000001',
 'vision-original.jpg','vision-original.jpg',10,'image/jpeg','drone_photo','bb100000-0000-4000-8000-000000000001/intents/bb300000-0000-4000-8000-000000000001/vision-original.jpg',
 'bb400000-0000-4000-8000-000000000001',now()+interval '1 day',now(),'awaiting_validation');
insert into storage.objects(id,bucket_id,name,owner_id,metadata) values('bb500000-0000-4000-8000-000000000001','monitoring-uploads',
 'bb100000-0000-4000-8000-000000000001/intents/bb300000-0000-4000-8000-000000000001/vision-original.jpg','bb100000-0000-4000-8000-000000000001','{"size":10,"mimetype":"image/jpeg"}');
create temporary table vision_original_fixture as select upload.id as upload_id,object.id as object_id,to_jsonb(object)->>'version' as object_version,object.updated_at,
 jsonb_build_object('schema','gofreyra.drone-original-validation/v1','validatorVersion','jpeg-structure-exifr/v1','projectId',upload.project_id,'uploadId',upload.id,
 'validatedAt',now(),'validatedBy',upload.uploaded_by,'status','review_required',
 'original',jsonb_build_object('sha256',repeat('a',64),'sizeBytes',10,'mimeType','image/jpeg','storagePath',upload.storage_path,'receivedAt',upload.received_at,
 'object',jsonb_build_object('id',object.id,'version',to_jsonb(object)->>'version','updated_at',object.updated_at,'owner_id',object.owner_id,'size',10,'mimetype','image/jpeg')),
 'jpegStructure',jsonb_build_object('widthPx',1,'heightPx',1,'components',1,'encoding','baseline','scans',1),'metadata',null,
 'cameraPositionEligible',false,'pixelDecoded',false,'georeferenced',false,'reportEligible',false,'errors','[]'::jsonb,'warnings','[]'::jsonb) as validation
 from public.uploads upload join storage.objects object on object.id='bb500000-0000-4000-8000-000000000001' where upload.id='bb300000-0000-4000-8000-000000000001';
grant select on vision_original_fixture to service_role;
set local role service_role;
do $$declare fixture record; begin select * into strict fixture from pg_temp.vision_original_fixture;
 perform public.persist_drone_original_validation('bb200000-0000-4000-8000-000000000001',fixture.upload_id,'bb100000-0000-4000-8000-000000000001',
  fixture.object_id,fixture.object_version,fixture.updated_at,fixture.validation,repeat('b',64));
 perform public.persist_drone_original_promotion('bb200000-0000-4000-8000-000000000001',fixture.upload_id,'bb100000-0000-4000-8000-000000000001',
  'bb600000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),fixture.object_id,fixture.object_version,fixture.updated_at);
end $$;
reset role;
-- A same-project baseline without an exact saved photo assignment is not image
-- context. This trusted rollback fixture exercises that boundary in isolation.
insert into public.project_baseline_snapshots(id,project_id,version_no,schema_version,created_by,request_id,geometry_sha256,manifest_sha256,manifest)
 values('bb910000-0000-4000-8000-000000000001','bb200000-0000-4000-8000-000000000001',1,1,
 'bb100000-0000-4000-8000-000000000001','bb920000-0000-4000-8000-000000000001',repeat('e',64),repeat('f',64),
 jsonb_build_object('schema','gofreyra.public-baseline/v1','project',jsonb_build_object('id','bb200000-0000-4000-8000-000000000001',
 'crs','EPSG:4326','polygonSha256',repeat('e',64),'polygon','{"type":"Polygon","coordinates":[[[9,55],[9.1,55],[9.1,55.1],[9,55.1],[9,55]]]}'::jsonb),
 'period','{}'::jsonb,'reference','{}'::jsonb,'sources','[]'::jsonb));
create temporary table vision_before_graph as select jsonb_build_object(
 'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),
 'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),
 'storage',(select jsonb_agg(to_jsonb(r) order by id) from storage.objects r),
 'baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),
 'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r)) value;

create function pg_temp.vision_claim(p_request uuid default 'bb700000-0000-4000-8000-000000000001',p_actor uuid default 'bb100000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.claim_drone_image_inspection('bb200000-0000-4000-8000-000000000001',id,p_actor,p_request,
  'cloudflare-workers-ai','@cf/qwen/qwen3.8-27b','danish-stream-visual-draft/v1','visual-photo-followups/v1')
 from public.project_media where source_upload_id='bb300000-0000-4000-8000-000000000001'
$$;
create temporary table vision_claims(value jsonb);
grant select,insert,update on vision_claims to service_role;
create function pg_temp.vision_draft() returns jsonb language sql as $$
 select jsonb_build_object('schema','gofreyra.drone-image-inspection/v1','methodVersion','visual-photo-followups/v1','status','draft_unreviewed',
  'provenance',jsonb_build_object('projectId',project_id,'mediaId',media_id,'requestId',request_id,'originalSha256',original_sha256,
   'originalValidationSha256',original_validation_sha256,'derivative',jsonb_build_object('sha256',repeat('c',64),'mimeType','image/jpeg','widthPx',1280,'heightPx',720,'transformVersion','synthetic-fixture/v1'),
   'provider',provider,'model',model_id,'promptVersion',prompt_version,'generatedAt',now()),
  'sourceContext',null,'visual',jsonb_build_object('quality',jsonb_build_object('assessment','limited','issues','["shadow"]'::jsonb,'limitation','Synthetic pixels absent'),
   'watercourseVisibility','uncertain','features','[]'::jsonb,'overallUncertainty','Synthetic metadata only'),
  'confidenceKind','model_self_assessment_uncalibrated','followupQuestions',jsonb_build_array(
   jsonb_build_object('id','photo-followup:v1:geographic_link','kind','geographic_link','question','Synthetic location question','rationale','No georeference','featureIndexes','[]'::jsonb,'requiredAction','supply_location','status','unanswered')),
  'reportSummary',jsonb_build_object('headline','Synthetic unreviewed draft','visibleThemes','[]'::jsonb,'limitations','["Not reviewed"]'::jsonb,'nextSteps','["Review"]'::jsonb),
  'objectGeometry',null,'footprint',null,'reportEligible',false,'professionallyReviewed',false)
 from public.drone_image_inspections where project_id='bb200000-0000-4000-8000-000000000001'
$$;
create function pg_temp.vision_finish(p_draft jsonb default null,p_token uuid default null,p_failure text default null) returns jsonb language sql as $$
 select public.finish_drone_image_inspection('bb200000-0000-4000-8000-000000000001',(value#>>'{inspection,id}')::uuid,
  'bb100000-0000-4000-8000-000000000001',coalesce(p_token,(value->>'claimToken')::uuid),p_draft::text,p_failure)
 from pg_temp.vision_claims limit 1
$$;
create function pg_temp.vision_answers(p_answers jsonb default '[{"questionId":"photo-followup:v1:geographic_link","assessment":"uncertain","note":"Stedet er endnu ikke afklaret.","followup":"Afklar delstrækningen."}]'::jsonb,
 p_request uuid default 'bb800000-0000-4000-8000-000000000001',p_hash text default null,p_actor uuid default 'bb100000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.save_drone_image_inspection_answers(project_id,id,p_actor,p_request,coalesce(p_hash,result_sha256),p_answers::text)
 from public.drone_image_inspections where project_id='bb200000-0000-4000-8000-000000000001'
$$;

select ok((select relrowsecurity from pg_class where oid='public.drone_image_inspections'::regclass),'inspection RLS enabled');
select ok(not has_table_privilege('authenticated','public.drone_image_inspections','INSERT'),'browser cannot insert inspections');
select ok(not has_table_privilege('authenticated','public.drone_image_inspections','UPDATE'),'browser cannot update inspections');
select ok(not has_table_privilege('authenticated','public.drone_image_inspections','DELETE'),'browser cannot delete inspections');
select ok(not has_column_privilege('authenticated','public.drone_image_inspections','lease_token','SELECT'),'lease ownership not readable by members');
select ok(not has_column_privilege('authenticated','public.drone_image_inspections','lease_actor_id','SELECT'),'lease actor not readable by members');
select ok(has_column_privilege('authenticated','public.drone_image_inspections','result','SELECT'),'draft result readable through RLS');
select ok(not has_column_privilege('anon','public.drone_image_inspections','result','SELECT'),'anonymous has no result read');
select ok(not has_function_privilege('authenticated','public.claim_drone_image_inspection(uuid,uuid,uuid,uuid,text,text,text,text,uuid,text)','EXECUTE'),'browser cannot claim even with forged actor');
select ok(not has_function_privilege('authenticated','public.finish_drone_image_inspection(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'browser cannot finish');
select ok(not has_function_privilege('anon','public.claim_drone_image_inspection(uuid,uuid,uuid,uuid,text,text,text,text,uuid,text)','EXECUTE'),'anonymous cannot claim');
select ok(not has_function_privilege('authenticated','public.save_drone_image_inspection_answers(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'browser cannot bypass answer server checks');
select ok((select relrowsecurity from pg_class where oid='public.drone_image_inspection_answer_versions'::regclass),'answer RLS enabled');
select ok(not has_table_privilege('authenticated','public.drone_image_inspection_answer_versions','INSERT'),'browser cannot insert answer provenance');
select ok(not has_table_privilege('service_role','public.drone_image_inspection_answer_versions','UPDATE'),'service has no answer UPDATE grant');

set local role service_role;
select throws_ok($q$select pg_temp.vision_claim('bb700000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000002')$q$,'42501',null,'viewer cannot trigger model work');
select throws_ok($q$select pg_temp.vision_claim('bb700000-0000-4000-8000-000000000003','bb100000-0000-4000-8000-000000000003')$q$,'42501',null,'foreign organization cannot trigger work');
select throws_ok($q$select public.claim_drone_image_inspection('bb200000-0000-4000-8000-000000000001',id,
 'bb100000-0000-4000-8000-000000000001','bb700000-0000-4000-8000-000000000009','cloudflare-workers-ai','@cf/qwen/qwen3.8-27b',
 'danish-stream-visual-draft/v1','visual-photo-followups/v1','bb910000-0000-4000-8000-000000000001',repeat('f',64))
 from public.project_media where source_upload_id='bb300000-0000-4000-8000-000000000001'$q$,'23514',
 'Source context requires the exact saved photo assignment','same-project baseline cannot become photo context without an exact saved assignment');
select lives_ok($q$insert into pg_temp.vision_claims select pg_temp.vision_claim()$q$,'editor claims canonical private original');
select is((select value->>'state' from pg_temp.vision_claims),'claimed','first request acquires bounded lease');
select is((pg_temp.vision_claim())->>'state','busy','same request cannot double charge while pending');
select is((pg_temp.vision_claim('bb700000-0000-4000-8000-000000000004'))->>'state','busy','new request cannot evade same-image in-flight lock');
select is((select count(*)::integer from private.drone_image_inspection_requests),2,'duplicate input still pins each caller request receipt');
select throws_ok($q$select public.claim_drone_image_inspection('bb200000-0000-4000-8000-000000000001',id,
 'bb100000-0000-4000-8000-000000000001','bb700000-0000-4000-8000-000000000004','cloudflare-workers-ai','@cf/qwen/qwen3.8-27b',
 'danish-stream-visual-draft/v1','visual-photo-followups/v1','bb900000-0000-4000-8000-000000000001',repeat('e',64))
 from public.project_media where source_upload_id='bb300000-0000-4000-8000-000000000001'$q$,'23514',null,'replayed request cannot change context');
select is((select sum(attempt_count)::integer from public.drone_image_inspections),1,'duplicate claims do not count extra provider work');
select throws_ok($q$select pg_temp.vision_finish(pg_temp.vision_draft(),'bb900000-0000-4000-8000-000000000099')$q$,'23514',null,'wrong token cannot complete another claim');
select throws_ok($q$select pg_temp.vision_finish(jsonb_set(pg_temp.vision_draft(),'{reportEligible}','true'))$q$,'23514',null,'AI draft cannot claim report eligibility');
select throws_ok($q$select pg_temp.vision_finish(jsonb_set(pg_temp.vision_draft(),'{professionallyReviewed}','true'))$q$,'23514',null,'AI draft cannot approve itself');
select throws_ok($q$select pg_temp.vision_finish(jsonb_set(pg_temp.vision_draft(),'{provenance,originalSha256}',to_jsonb(repeat('d',64))))$q$,'23514',null,'wrong original pin cannot complete');
select throws_ok($q$select pg_temp.vision_finish(pg_temp.vision_draft()||'{"arbitrarySource":"https://example.test"}')$q$,'23514',null,'unknown provenance field is not accepted');
select throws_ok($q$select pg_temp.vision_finish(null,null,'arbitrary_upstream_secret')$q$,'23514',null,'arbitrary provider error text cannot be persisted');
select lives_ok($q$select pg_temp.vision_finish(null,null,'timeout')$q$,'safe provider failure is retained without a result');
select is((select status from public.drone_image_inspections),'failed','failed inference is not a completed draft');
select lives_ok($q$update pg_temp.vision_claims set value=pg_temp.vision_claim()$q$,'explicit retry can reacquire a failed draft');
select is((select attempt_count from public.drone_image_inspections),2,'failed retry counts another bounded attempt');
update public.drone_image_inspections set lease_expires_at=clock_timestamp()-interval '1 second';
select throws_ok($q$select pg_temp.vision_finish(pg_temp.vision_draft())$q$,'23514',null,'expired claim cannot complete');
select lives_ok($q$update pg_temp.vision_claims set value=pg_temp.vision_claim()$q$,'expired lease permits final explicit retry');
select is((select attempt_count from public.drone_image_inspections),3,'third attempt is final permitted provider work');
update public.drone_image_inspections set lease_expires_at=clock_timestamp()-interval '1 second';
select throws_ok($q$select pg_temp.vision_claim()$q$,'54000',null,'expired third attempt cannot create unlimited model retries');
-- Fixture-only restore of the exact last claim, no fourth provider work.
update public.drone_image_inspections set lease_expires_at=clock_timestamp()+interval '1 minute';
select lives_ok($q$select pg_temp.vision_finish(pg_temp.vision_draft())$q$,'exact claim saves unreviewed visual draft');
select is((pg_temp.vision_claim())->>'state','completed','exact retry reuses completed result without a model call');
select is((select attempt_count from public.drone_image_inspections),3,'completed reuse has no new attempt');
select ok((select result_sha256=encode(pg_catalog.sha256(convert_to(result_text,'UTF8')),'hex') from public.drone_image_inspections),'result SHA pins exact returned text');
select throws_ok($q$select pg_temp.vision_finish(pg_temp.vision_draft())$q$,'23514',null,'consumed claim cannot finish twice');
select throws_ok($q$select pg_temp.vision_answers(p_hash=>repeat('e',64))$q$,'23514',null,'answers cannot target another inspection result');
select throws_ok($q$select pg_temp.vision_answers('[{"questionId":"invented","assessment":"confirmed","note":"x","followup":""}]')$q$,'23514',null,'invented question is rejected');
select throws_ok($q$select pg_temp.vision_answers('[{"questionId":"photo-followup:v1:geographic_link","assessment":"approved","note":"x","followup":""}]')$q$,'23514',null,'assessment cannot confer approval');
select throws_ok($q$select pg_temp.vision_answers('[{"questionId":"photo-followup:v1:geographic_link","assessment":"uncertain","note":" ","followup":""}]')$q$,'23514',null,'answer requires meaningful note');
select throws_ok($q$select pg_temp.vision_answers(p_actor=>'bb100000-0000-4000-8000-000000000002')$q$,'42501',null,'viewer cannot save answers');
select lives_ok($q$select pg_temp.vision_answers()$q$,'editor saves partial durable draft answers');
select lives_ok($q$select pg_temp.vision_answers()$q$,'exact answer request is idempotent');
select is((select count(*)::integer from public.drone_image_inspection_answer_versions),1,'answer retry creates one version');
select ok((select not professionally_reviewed and not report_eligible and status='draft_unreviewed' from public.drone_image_inspection_answer_versions),'human answer remains unapproved draft');
select throws_ok($q$select pg_temp.vision_answers('[{"questionId":"photo-followup:v1:geographic_link","assessment":"confirmed","note":"Changed","followup":""}]')$q$,'23514',null,'changed answer cannot reuse previous request');
select lives_ok($q$select pg_temp.vision_answers('[{"questionId":"photo-followup:v1:geographic_link","assessment":"not_confirmed","note":"Senere afklaring.","followup":""}]','bb800000-0000-4000-8000-000000000002')$q$,'correction creates separate immutable version');
reset role;
select throws_ok($q$update public.drone_image_inspections set result=result where project_id='bb200000-0000-4000-8000-000000000001'$q$,'23514',null,'completed result immutable even to table owner');
select throws_ok($q$update public.drone_image_inspection_answer_versions set answers=answers where project_id='bb200000-0000-4000-8000-000000000001'$q$,'23514',null,'answer history immutable even to table owner');
-- Deliberate mutation is rolled back by each failed assertion's subtransaction.
create function pg_temp.vision_changed_object(p_answers boolean default false) returns void language plpgsql as $$
begin
 update storage.objects set name=name||'.changed' where id='bb500000-0000-4000-8000-000000000001';
 if p_answers then perform pg_temp.vision_answers(); else perform pg_temp.vision_claim(); end if;
end $$;
select throws_ok($q$select pg_temp.vision_changed_object()$q$,'23514',null,'completed inference replay rejects changed original object');
select throws_ok($q$select pg_temp.vision_changed_object(true)$q$,'23514',null,'exact answer retry rejects changed original object');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(result)::integer from public.drone_image_inspections),1,'project viewer may read unreviewed drafts');
select is((select count(*)::integer from public.drone_image_inspection_answer_versions),2,'project viewer may read durable answer history');
select throws_ok($q$select lease_token from public.drone_image_inspections$q$,'42501',null,'viewer cannot read provider claim token');
select set_config('request.jwt.claims','{"sub":"bb100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(result)::integer from public.drone_image_inspections),0,'foreign member sees no image drafts');
select is((select count(*)::integer from public.drone_image_inspection_answer_versions),0,'foreign member sees no answer history');
reset role;
-- A new model gets its own exact-input version; old Qwen drafts are neither
-- relabeled nor overwritten. All existing role/pin/budget checks still apply.
create function pg_temp.vision_model_claim(p_model text,p_request uuid default 'bb730000-0000-4000-8000-000000000001',p_actor uuid default 'bb100000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.claim_drone_image_inspection('bb200000-0000-4000-8000-000000000001',id,p_actor,p_request,
  'cloudflare-workers-ai',p_model,'danish-stream-visual-draft/v1','visual-photo-followups/v1')
 from public.project_media where source_upload_id='bb300000-0000-4000-8000-000000000001'
$$;
create temporary table vision_prior_qwen as select id,result_sha256,result_text,attempt_count from public.drone_image_inspections where model_id='@cf/qwen/qwen3.8-27b';
grant select on vision_prior_qwen to service_role;
set local role service_role;
select throws_ok($q$select pg_temp.vision_model_claim('@cf/unapproved/model')$q$,'22023',null,'unsupported model cannot acquire a provider reservation');
select throws_ok($q$select pg_temp.vision_model_claim(null)$q$,'22023',null,'missing model cannot acquire a provider reservation');
select throws_ok($q$select pg_temp.vision_model_claim('@cf/google/gemma-4-26b-a4b-it','bb730000-0000-4000-8000-000000000002','bb100000-0000-4000-8000-000000000002')$q$,'42501',null,'Gemma retains the viewer denial gate');
select throws_ok($q$select pg_temp.vision_model_claim('@cf/google/gemma-4-26b-a4b-it','bb700000-0000-4000-8000-000000000001')$q$,'23514',null,'changing model cannot reuse the historical Qwen request');
select lives_ok($q$do $$declare claimed jsonb; draft jsonb; begin
 claimed:=pg_temp.vision_model_claim('@cf/google/gemma-4-26b-a4b-it');
 if claimed->>'state'<>'claimed' then raise exception 'Expected new Gemma reservation'; end if;
 select result into strict draft from public.drone_image_inspections where model_id='@cf/qwen/qwen3.8-27b';
 draft:=jsonb_set(draft,'{provenance,model}',to_jsonb('@cf/google/gemma-4-26b-a4b-it'::text));
 draft:=jsonb_set(draft,'{provenance,requestId}',claimed#>'{inspection,request_id}');
 perform public.finish_drone_image_inspection('bb200000-0000-4000-8000-000000000001',(claimed#>>'{inspection,id}')::uuid,
  'bb100000-0000-4000-8000-000000000001',(claimed->>'claimToken')::uuid,draft::text,null);
end $$;$q$,'Gemma can claim and save a separate bounded unreviewed draft');
select ok((select status='completed' and attempt_count=1 and result#>>'{provenance,model}'='@cf/google/gemma-4-26b-a4b-it'
 from public.drone_image_inspections where model_id='@cf/google/gemma-4-26b-a4b-it'),'new Gemma draft retains exact model provenance');
select ok((select row.result_sha256=old.result_sha256 and row.result_text=old.result_text and row.attempt_count=old.attempt_count
 from public.drone_image_inspections row join pg_temp.vision_prior_qwen old using(id)),'historical Qwen bytes, checksum and attempts remain unchanged');
reset role;
delete from public.project_members where project_id='bb200000-0000-4000-8000-000000000001' and user_id='bb100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$select pg_temp.vision_claim()$q$,'42501',null,'completed replay rechecks current contribution membership');
select throws_ok($q$select pg_temp.vision_answers()$q$,'42501',null,'exact answer retry rechecks current membership');
reset role;
select is((select jsonb_build_object(
 'media',(select jsonb_agg(to_jsonb(r) order by id) from public.project_media r),
 'uploads',(select jsonb_agg(to_jsonb(r) order by id) from public.uploads r),
 'storage',(select jsonb_agg(to_jsonb(r) order by id) from storage.objects r),
 'baselines',(select jsonb_agg(to_jsonb(r) order by id) from public.project_baseline_snapshots r),
 'rounds',(select jsonb_agg(to_jsonb(r) order by id) from public.survey_round_versions r))),
 (select value from vision_before_graph),'image AI and answers do not mutate original input graph');
select * from finish();
rollback;
