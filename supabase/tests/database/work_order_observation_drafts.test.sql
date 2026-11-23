-- OBS-09 synthetic transaction. No Auth API, provider calls or file bytes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.k(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('ee900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated',
  'synthetic-observation-draft-'||n||'@example.test','',now(),'{"provider":"email"}',
  '{"role":"admin","can_review":true}',now(),now() FROM generate_series(1,9)n;
INSERT INTO public.organizations(id,name,type,country) VALUES
  (pg_temp.k(11),'Synthetic observation organization A','test','Denmark'),
  (pg_temp.k(12),'Synthetic observation organization B','test','Denmark');
INSERT INTO public.organization_memberships(organization_id,user_id,role)
SELECT pg_temp.k(11),pg_temp.k(n),CASE WHEN n=9 THEN 'owner' ELSE 'viewer' END FROM generate_series(1,9)n WHERE n<>6;
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(pg_temp.k(12),pg_temp.k(6),'owner');
INSERT INTO public.projects(id,organization_id,name) VALUES
  (pg_temp.k(21),pg_temp.k(11),'Synthetic observation project'),
  (pg_temp.k(22),pg_temp.k(11),'Synthetic other project'),
  (pg_temp.k(23),pg_temp.k(12),'Synthetic other tenant');
INSERT INTO public.project_members(project_id,user_id,role) VALUES
  (pg_temp.k(21),pg_temp.k(1),'project_manager'),(pg_temp.k(21),pg_temp.k(2),'field'),
  (pg_temp.k(21),pg_temp.k(3),'viewer'),(pg_temp.k(21),pg_temp.k(4),'editor'),
  (pg_temp.k(21),pg_temp.k(5),'external'),(pg_temp.k(21),pg_temp.k(7),'admin'),
  (pg_temp.k(22),pg_temp.k(8),'project_manager');
INSERT INTO public.field_observations(id,project_id,observation_type,observed_at,observer_id,species_name,species_confidence,count_value,latitude,longitude,accuracy_m,notes,visibility,status,metadata)
VALUES
  (pg_temp.k(31),pg_temp.k(21),'species','2026-11-01T10:12:13.123456Z',pg_temp.k(2),'Synthetic species',84.50,0,55.3,9.5,4,'Synthetic 50%_literal source','masked','confirmed','{"ai_suggestion":true,"source":"synthetic"}'),
  (pg_temp.k(32),pg_temp.k(21),'manual','2026-11-02T09:10:11Z',pg_temp.k(2),NULL,NULL,NULL,NULL,NULL,NULL,'Synthetic uncertain source','hidden','draft','{"time_precision":"unknown"}'),
  (pg_temp.k(33),pg_temp.k(21),'field','2026-11-03T09:10:11Z',pg_temp.k(2),NULL,NULL,1,'NaN'::float8,9.5,NULL,'Synthetic invalid position preserved','precise','draft','{}'),
  (pg_temp.k(36),pg_temp.k(22),'manual','2026-11-01T10:00:00Z',pg_temp.k(8),NULL,NULL,NULL,55.4,9.6,NULL,'Synthetic inaccessible project source','precise','draft','{}'),
  (pg_temp.k(37),pg_temp.k(23),'manual','2026-11-01T10:00:00Z',pg_temp.k(6),NULL,NULL,NULL,55.4,9.6,NULL,'Synthetic foreign tenant source','precise','draft','{}');
INSERT INTO public.observation_media(id,observation_id,media_type,storage_path,mime_type,file_size_bytes,width,height,exif_data,ai_suggestions,uploaded_by,created_at) VALUES
  (pg_temp.k(51),pg_temp.k(31),'photo','legacy/synthetic-one.jpg','image/jpeg',3,100,80,'{"DateTimeOriginal":"unknown"}','[{"species":"synthetic suggestion"}]',pg_temp.k(2),'2026-11-01T11:00:00Z'),
  (pg_temp.k(52),pg_temp.k(32),'photo','legacy/synthetic-two.jpg',NULL,NULL,NULL,NULL,'{}','[]',pg_temp.k(2),'2026-11-02T11:00:00Z');
INSERT INTO public.actions(id,project_id,title,description) VALUES
  (pg_temp.k(79),pg_temp.k(21),'Synthetic ordinary job','Existing ordinary action'),
  (pg_temp.k(80),pg_temp.k(21),'Synthetic uninitialized ordinary job','Existing ordinary action'),
  (pg_temp.k(81),pg_temp.k(22),'Synthetic inaccessible ordinary job','Existing other project'),
  (pg_temp.k(82),pg_temp.k(23),'Synthetic foreign ordinary job','Existing other municipality');
CREATE TEMP TABLE receipts(name text PRIMARY KEY,value jsonb NOT NULL);
GRANT SELECT,INSERT ON receipts TO authenticated;
CREATE TEMP TABLE original_object_count AS SELECT count(*) AS objects FROM storage.objects;
CREATE FUNCTION pg_temp.page(after_id uuid DEFAULT NULL,size integer DEFAULT 50,search_term text DEFAULT '',org integer DEFAULT 11,proj integer DEFAULT 21)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM public.list_work_order_observation_sources(pg_temp.k(org),pg_temp.k(proj),after_id,size,search_term)result(value)
$$;
CREATE FUNCTION pg_temp.source(n integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM jsonb_array_elements(pg_temp.page()->'items')item(value) WHERE value->>'observation_id'=pg_temp.k(n)::text
$$;
CREATE FUNCTION pg_temp.selection(numbers integer[] DEFAULT ARRAY[31,32]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('observationId',pg_temp.k(n),'sourceHash',pg_temp.source(n)->>'source_hash') ORDER BY position)
  FROM unnest(numbers) WITH ORDINALITY selected(n,position)
$$;
CREATE FUNCTION pg_temp.create_job(req integer DEFAULT 61,action integer DEFAULT 71,selected jsonb DEFAULT NULL,title text DEFAULT '  Synthetic work order  ',description text DEFAULT '  Explicit draft instruction  ')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM public.create_work_order_observation_draft(pg_temp.k(action),pg_temp.k(11),pg_temp.k(21),title,description,coalesce(selected,pg_temp.selection()),pg_temp.k(req))result(value)
$$;
CREATE FUNCTION pg_temp.origin(action integer DEFAULT 71,org integer DEFAULT 11,proj integer DEFAULT 21)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM public.get_work_order_observation_draft(pg_temp.k(action),pg_temp.k(org),pg_temp.k(proj))result(value)
$$;

SELECT ok(NOT has_function_privilege('anon','public.list_work_order_observation_sources(uuid,uuid,uuid,integer,text)','EXECUTE'),'anonymous source listing is unavailable');
SELECT ok(NOT has_function_privilege('anon','public.get_work_order_observation_draft(uuid,uuid,uuid)','EXECUTE'),'anonymous source history is unavailable');
SELECT ok(NOT has_function_privilege('service_role','public.create_work_order_observation_draft(uuid,uuid,uuid,text,text,jsonb,uuid)','EXECUTE'),'background service cannot impersonate draft creation');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.create_work_order_observation_draft(uuid,uuid,uuid,text,text,jsonb,uuid)'::regprocedure),'creation preserves caller RLS');
SELECT ok(NOT has_table_privilege('authenticated','private.work_order_observation_drafts','UPDATE'),'origin is not overwritable by the authenticated role');
SELECT ok(NOT has_table_privilege('authenticated','private.work_order_observation_drafts','DELETE'),'origin cannot be deleted by the authenticated role');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.work_order_observation_drafts'::regclass
  AND confrelid IN ('public.field_observations'::regclass,'public.observation_media'::regclass)),'source deletion has no FK cascade into immutable creation history');
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.observation_media'::regclass
  AND confrelid='public.field_observations'::regclass AND contype='f' AND NOT condeferrable),
  'immediate parent FK provides KEY SHARE for the source FOR UPDATE locking protocol');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT is(pg_temp.page()->>'organization_id',pg_temp.k(11)::text,'list envelope pins organization');
SELECT is(pg_temp.page()->>'project_id',pg_temp.k(21)::text,'list envelope pins project');
SELECT is(pg_temp.page()->>'user_id',pg_temp.k(1)::text,'list envelope pins current actor');
SELECT is(jsonb_array_length(pg_temp.page()->'items'),3,'source page excludes other projects and tenant');
SELECT is(jsonb_array_length(pg_temp.page(NULL,1)->'items'),2,'source page has one lookahead row');
SELECT is(pg_temp.page(pg_temp.k(31),1)->'items'->0->>'observation_id',pg_temp.k(32)::text,'keyset resumes after exact source identity');
SELECT is(jsonb_array_length(pg_temp.page(NULL,1,' UNCERTAIN ')->'items'),1,'literal search filters before pagination and normalizes case/space');
SELECT is(jsonb_array_length(pg_temp.page(NULL,50,'50%_')->'items'),1,'wildcards are searched as literal characters');
SELECT is(jsonb_array_length(pg_temp.page(NULL,50,'absent')->'items'),0,'successful empty selection is explicit');
SELECT is(pg_temp.source(31)->'snapshot'->'count_value','0'::jsonb,'explicit zero is not unknown');
SELECT is(pg_temp.source(32)->'snapshot'->'latitude','null'::jsonb,'unknown position stays null');
SELECT is(pg_temp.source(33)->'snapshot'->'latitude','"NaN"'::jsonb,'invalid raw numeric position is preserved without creating a map location');
SELECT is(pg_temp.source(31)->'snapshot'->'metadata'->'ai_suggestion','true'::jsonb,'AI source classification is not promoted to factual approval');
SELECT is(pg_temp.source(31)->'media_refs'->0->>'storage_path','legacy/synthetic-one.jpg','stored media reference is preserved without inventing a bucket');
SELECT ok(NOT (pg_temp.source(31)->'media_refs'->0 ? 'bucket') AND NOT (pg_temp.source(31)->'media_refs'->0 ? 'sha256'),'legacy reference is not given fabricated file verification fields');
SET LOCAL TIME ZONE 'UTC';
INSERT INTO receipts VALUES('utc_source',pg_temp.source(31));
SET LOCAL TIME ZONE 'Europe/Copenhagen';
SELECT is(pg_temp.source(31),(SELECT value FROM receipts WHERE name='utc_source'),'unchanged source snapshot and hash are identical across caller TimeZone');
SELECT is(current_setting('TimeZone'),'Europe/Copenhagen','source helper restores the caller session TimeZone');
SET LOCAL TIME ZONE 'UTC';
SELECT throws_ok($$SELECT pg_temp.page(NULL,51)$$,'22023',NULL,'source page is bounded');
SELECT throws_ok($$SELECT pg_temp.page(NULL,50,repeat('x',201))$$,'22023',NULL,'source search is bounded');
SELECT throws_ok($$SELECT pg_temp.page(NULL,50,'',11,22)$$,'42501',NULL,'same tenant does not grant another project');
SELECT throws_ok($$SELECT pg_temp.page(NULL,50,'',12,23)$$,'42501',NULL,'foreign tenant is rejected');
SELECT is(pg_temp.origin(80)->'origin','null'::jsonb,'authorized ordinary uninitialized action has one null-origin envelope');
SELECT is(pg_temp.origin(80)->>'action_id',pg_temp.k(80)::text,'null-origin response still pins exact action');
SELECT throws_ok($$SELECT pg_temp.origin(99)$$,'42501',NULL,'missing action is not a successful null origin');
SELECT throws_ok($$SELECT pg_temp.origin(81,11,22)$$,'42501',NULL,'cross-project origin is rejected');

INSERT INTO receipts VALUES('preview',pg_temp.selection());
INSERT INTO receipts VALUES('created',pg_temp.create_job(61,71,pg_temp.selection(ARRAY[32,31])));
SELECT is((SELECT value->>'status' FROM receipts WHERE name='created'),'draft','receipt describes the newly created canonical draft');
SELECT is((SELECT value->>'title' FROM receipts WHERE name='created'),'Synthetic work order','creation title is normalized');
SELECT is((SELECT value->>'description' FROM receipts WHERE name='created'),'Explicit draft instruction','creation description is normalized');
SELECT is((SELECT value->>'created_by' FROM receipts WHERE name='created'),pg_temp.k(1)::text,'creator is authenticated actor');
SELECT is((SELECT value->'sources'->0->>'observation_id' FROM receipts WHERE name='created'),pg_temp.k(31)::text,'source ordering is canonical UUID order independent of UI selection order');
SELECT is((SELECT jsonb_array_length(value->'sources') FROM receipts WHERE name='created'),2,'one job retains exactly two source snapshots');
SELECT is((SELECT title FROM public.actions WHERE id=pg_temp.k(71)),'Synthetic work order','ordinary action is created with explicit user title');
SELECT is((SELECT action_type FROM public.actions WHERE id=pg_temp.k(71)),NULL::text,'draft is a normal job rather than workflow_followup metadata');
SELECT is((SELECT site_id FROM public.actions WHERE id=pg_temp.k(71)),NULL::uuid,'source zone or coordinates do not become an invented site');
SELECT is((SELECT count(*)::integer FROM public.work_orders WHERE action_id=pg_temp.k(71)),1,'one work-order identity is created atomically');
SELECT is((SELECT status FROM public.work_order_lifecycle_versions WHERE action_id=pg_temp.k(71)),'draft','ordinary lifecycle helper creates one draft state');
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(71)),0,'no dates, place or responsibility are invented through a plan');
SELECT is((SELECT count(*)::integer FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(71)),0,'source selection does not assign a performer');
SELECT is((SELECT count(*)::integer FROM public.work_order_evidence_versions WHERE action_id=pg_temp.k(71)),0,'source history is not automatically execution evidence');
SELECT is((SELECT count(*)::integer FROM public.work_order_submission_versions WHERE action_id=pg_temp.k(71)),0,'no delivery is created implicitly');
SELECT is((SELECT count(*)::integer FROM public.observation_media WHERE observation_id IN(pg_temp.k(31),pg_temp.k(32))),2,'creating a draft copies no original/reference rows');
SELECT is(pg_temp.create_job(61,71,(SELECT value FROM receipts WHERE name='preview')),(SELECT value FROM receipts WHERE name='created'),'lost response retry returns byte-identical creation receipt');
SET LOCAL TIME ZONE 'Europe/Copenhagen';
SELECT is(pg_temp.origin()->'origin',(SELECT value FROM receipts WHERE name='created'),'origin receipt remains canonical UTC under another caller TimeZone');
SET LOCAL TIME ZONE 'UTC';
SELECT throws_ok($$SELECT pg_temp.create_job(61,71,(SELECT value FROM receipts WHERE name='preview'),'Changed title')$$,'PT409',NULL,'same request cannot change title');
SELECT throws_ok($$SELECT pg_temp.create_job(61,72,(SELECT value FROM receipts WHERE name='preview'))$$,'PT409',NULL,'same request cannot create a second action');
SELECT throws_ok($$SELECT pg_temp.create_job(62,79,(SELECT value FROM receipts WHERE name='preview'))$$,'PT409',NULL,'an existing ordinary action cannot be overwritten');
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,'[]')$$,'22023',NULL,'empty source selection is invalid');
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,pg_temp.selection(ARRAY[31,31]))$$,'22023',NULL,'duplicate source identities are invalid');
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,jsonb_build_array(jsonb_build_object('observationId',pg_temp.k(36),'sourceHash',repeat('a',64))))$$,'42501',NULL,'foreign project source cannot be selected by identity');
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,jsonb_build_array(jsonb_build_object('observationId',pg_temp.k(37),'sourceHash',repeat('a',64))))$$,'42501',NULL,'foreign tenant source cannot be selected by identity');
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,jsonb_build_array(jsonb_build_object('observationId',pg_temp.k(31),'sourceHash','invalid')))$$,'22023',NULL,'malformed hash is rejected');
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,(SELECT value FROM receipts WHERE name='preview'),repeat('x',201))$$,'22023',NULL,'title length is bounded');
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,(SELECT value FROM receipts WHERE name='preview'),'Title',repeat('x',10001))$$,'22023',NULL,'description length is bounded');
UPDATE public.field_observations SET notes='Synthetic source edited after preview' WHERE id=pg_temp.k(31);
SELECT throws_ok($$SELECT pg_temp.create_job(62,72,(SELECT value FROM receipts WHERE name='preview'))$$,'PT409',NULL,'changed source after preview is an explicit conflict');
SELECT is((SELECT count(*)::integer FROM public.actions WHERE id=pg_temp.k(72)),0,'source conflict leaves no partial action');
SELECT is((SELECT count(*)::integer FROM public.work_orders WHERE action_id=pg_temp.k(72)),0,'source conflict leaves no work-order identity');
SELECT is((SELECT count(*)::integer FROM public.work_order_lifecycle_versions WHERE action_id=pg_temp.k(72)),0,'source conflict leaves no lifecycle/audit basis');
SELECT is(pg_temp.create_job(61,71,(SELECT value FROM receipts WHERE name='preview')),(SELECT value FROM receipts WHERE name='created'),'committed retry succeeds before rereading later mutable source edits');
INSERT INTO receipts VALUES('media_preview',pg_temp.selection(ARRAY[32]));
UPDATE public.observation_media SET exif_data='{"corrected":"synthetic"}' WHERE id=pg_temp.k(52);
SELECT throws_ok($$SELECT pg_temp.create_job(63,73,(SELECT value FROM receipts WHERE name='media_preview'))$$,'PT409',NULL,'changed media metadata invalidates source hash');
INSERT INTO receipts VALUES('new_media_preview',pg_temp.selection(ARRAY[32]));
INSERT INTO public.observation_media(id,observation_id,media_type,storage_path) VALUES(pg_temp.k(53),pg_temp.k(32),'photo','legacy/synthetic-new-reference.jpg');
SELECT throws_ok($$SELECT pg_temp.create_job(64,74,(SELECT value FROM receipts WHERE name='new_media_preview'))$$,'PT409',NULL,'new attachment after preview invalidates the media membership hash');
SELECT is((SELECT count(*)::integer FROM public.actions WHERE id IN(pg_temp.k(73),pg_temp.k(74))),0,'attachment conflicts leave no partial jobs');
DELETE FROM public.field_observations WHERE id=pg_temp.k(31);
SELECT is(pg_temp.origin()->'origin',(SELECT value FROM receipts WHERE name='created'),'source deletion and its media cascade preserve exact immutable creation history');
SELECT is(pg_temp.create_job(61,71,(SELECT value FROM receipts WHERE name='preview')),(SELECT value FROM receipts WHERE name='created'),'same request survives deletion of the original mutable source');
SELECT is((SELECT count(*)::integer FROM private.work_order_observation_drafts WHERE action_id=pg_temp.k(71)),1,'all retries preserve one origin row');
SELECT is((SELECT count(*)::integer FROM public.work_order_lifecycle_versions WHERE action_id=pg_temp.k(71)),1,'all retries preserve one canonical draft transition');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(71) AND event_type='work_order.created'),1,'all retries preserve one normal creation audit event');
SELECT throws_ok($$UPDATE private.work_order_observation_drafts SET title='Overwrite' WHERE action_id=pg_temp.k(71)$$,'42501',NULL,'manager cannot overwrite immutable origin');
SELECT throws_ok($$DELETE FROM private.work_order_observation_drafts WHERE action_id=pg_temp.k(71)$$,'42501',NULL,'manager cannot delete immutable origin');

SELECT lives_ok($$SELECT * FROM public.initialize_work_order(pg_temp.k(79),pg_temp.k(11),pg_temp.k(21),0,pg_temp.k(179))$$,'separate ordinary action receives its normal identity');
SELECT lives_ok($$SELECT * FROM public.save_work_order_access(pg_temp.k(79),pg_temp.k(11),pg_temp.k(21),pg_temp.k(5),0,true,false,true,'Synthetic task review only',pg_temp.k(279))$$,'external reviewer gets only existing task review capability');
SELECT is(pg_temp.origin(79)->'origin','null'::jsonb,'ordinary initialized job also has a null-origin envelope');
INSERT INTO receipts VALUES('current_selection',pg_temp.selection(ARRAY[32]));
SELECT lives_ok($$SELECT * FROM public.mutate_work_order_lifecycle(pg_temp.k(79),pg_temp.k(11),pg_temp.k(21),0,
  '{"operation":"transition","targetStatus":"draft","planVersionId":null,"assignmentVersionId":null,"executionRevisionId":null}',pg_temp.k(179))$$,
  'ordinary existing job has a valid first draft lifecycle for the direct-insert regression');
SELECT lives_ok($$SELECT * FROM public.save_work_order_plan(pg_temp.k(79),pg_temp.k(11),pg_temp.k(21),0,
  '{"schema":"freyra.work-order-plan/v1","title":"Synthetic ordinary job","description":"","instructions":"","profile":null,"responsibleId":null,"siteId":null,"watercourseVersionId":null,"locationNote":"","plannedStart":null,"plannedEnd":null,"priority":null,"plannedMethod":null,"watercourse":null}',
  '',pg_temp.k(379))$$,'existing ordinary job progresses to a saved plan');
SELECT throws_ok($$INSERT INTO private.work_order_observation_drafts(action_id,organization_id,project_id,request_id,title,description,request_sources,sources)
  VALUES(pg_temp.k(79),pg_temp.k(11),pg_temp.k(21),pg_temp.k(179),'Synthetic ordinary job','Existing ordinary action',
    (SELECT value FROM receipts WHERE name='current_selection'),jsonb_build_array(pg_temp.source(32)))$$,
  '42501',NULL,'direct private insert cannot retroactively stamp creation origin after planning');
SELECT lives_ok($$SELECT * FROM public.initialize_work_order(pg_temp.k(80),pg_temp.k(11),pg_temp.k(21),0,pg_temp.k(180))$$,
  'another ordinary action is initialized for later-lifecycle regression');
SELECT lives_ok($$SELECT * FROM public.mutate_work_order_lifecycle(pg_temp.k(80),pg_temp.k(11),pg_temp.k(21),0,
  '{"operation":"transition","targetStatus":"draft","planVersionId":null,"assignmentVersionId":null,"executionRevisionId":null}',pg_temp.k(180))$$,
  'another ordinary action has the matching first draft state');
SELECT lives_ok($$SELECT * FROM public.mutate_work_order_lifecycle(pg_temp.k(80),pg_temp.k(11),pg_temp.k(21),1,
  jsonb_build_object('operation','block','targetStatus',NULL,'planVersionId',NULL,'assignmentVersionId',NULL,'executionRevisionId',NULL,
    'blockReason','Synthetic access issue','blockOwnerId',pg_temp.k(1),'blockNextAction','Synthetic follow up'),pg_temp.k(280))$$,
  'ordinary action gains a later lifecycle version without a plan');
SELECT throws_ok($$INSERT INTO private.work_order_observation_drafts(action_id,organization_id,project_id,request_id,title,description,request_sources,sources)
  VALUES(pg_temp.k(80),pg_temp.k(11),pg_temp.k(21),pg_temp.k(180),'Synthetic uninitialized ordinary job','Existing ordinary action',
    (SELECT value FROM receipts WHERE name='current_selection'),jsonb_build_array(pg_temp.source(32)))$$,
  '42501',NULL,'direct private insert cannot stamp origin after later lifecycle state even if version one was draft');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(7)::text,true);
SELECT is(pg_temp.origin()->'origin'->>'user_id',pg_temp.k(7)::text,'different authorized manager is pinned as reader');
SELECT is(pg_temp.origin()->'origin'->>'created_by',pg_temp.k(1)::text,'different reader does not become original creator');
SELECT throws_ok($$SELECT pg_temp.create_job(61,71,(SELECT value FROM receipts WHERE name='preview'))$$,'PT409',NULL,'another manager cannot replay the creators request identity');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT throws_ok($$SELECT pg_temp.page()$$,'42501',NULL,'field role cannot list manager source snapshots');
SELECT throws_ok($$SELECT pg_temp.origin()$$,'42501',NULL,'field role cannot read private origin through a job');
SELECT throws_ok($$SELECT pg_temp.create_job(65,75,(SELECT value FROM receipts WHERE name='current_selection'))$$,'42501',NULL,'field contribution authority does not create manager drafts');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT throws_ok($$SELECT pg_temp.page()$$,'42501',NULL,'viewer cannot enumerate source snapshots through manager API');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT throws_ok($$SELECT pg_temp.create_job(66,76,(SELECT value FROM receipts WHERE name='current_selection'))$$,'42501',NULL,'editor write permission is not manager authority');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(5)::text,true);
SELECT ok(private.can_review_work_order(pg_temp.k(79)),'external really has separate scoped review permission');
SELECT throws_ok($$SELECT pg_temp.origin()$$,'42501',NULL,'task review permission does not expose source snapshots');
SELECT throws_ok($$SELECT private.read_work_order_observation_source(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21))$$,'42501',NULL,'private helper also enforces management authority');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(6)::text,true);
SELECT throws_ok($$SELECT pg_temp.page()$$,'42501',NULL,'other organization owner cannot read this source scope');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(9)::text,true);
SELECT lives_ok($$SELECT pg_temp.origin()$$,'organization owner retains ordinary project management read');
RESET ROLE;
UPDATE public.project_members SET role='field' WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT pg_temp.create_job(61,71,(SELECT value FROM receipts WHERE name='preview'))$$,'42501',NULL,'current demotion is checked even before replaying a committed receipt');
SELECT is((SELECT count(*)::integer FROM private.work_order_observation_drafts),0,'RLS hides existing origin after management revocation');
RESET ROLE;
SELECT is((SELECT count(*) FROM storage.objects),(SELECT objects FROM original_object_count),'draft source workflow changes no Storage object');
SELECT * FROM finish();
ROLLBACK;
