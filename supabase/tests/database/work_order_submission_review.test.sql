-- Synthetic metadata on the disposable LOCAL/CI database only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.k(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('ed070000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 SELECT '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated','synthetic-review-'||n||'@example.test','',now(),'{"provider":"email"}','{"role":"admin"}',now(),now() FROM generate_series(1,5)n;
INSERT INTO public.organizations(id,name,type,country) VALUES(pg_temp.k(11),'Synthetic submission org','test','Denmark'),(pg_temp.k(12),'Synthetic foreign org','test','Denmark');
INSERT INTO public.organization_memberships(organization_id,user_id,role) SELECT pg_temp.k(11),pg_temp.k(n),'viewer' FROM generate_series(1,4)n;
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(pg_temp.k(12),pg_temp.k(5),'owner');
INSERT INTO public.projects(id,organization_id,name) VALUES(pg_temp.k(21),pg_temp.k(11),'Synthetic submission project'),(pg_temp.k(22),pg_temp.k(12),'Synthetic foreign project');
INSERT INTO public.project_members(project_id,user_id,role) VALUES(pg_temp.k(21),pg_temp.k(1),'project_manager'),(pg_temp.k(21),pg_temp.k(2),'field'),(pg_temp.k(21),pg_temp.k(3),'viewer'),(pg_temp.k(21),pg_temp.k(4),'external');
INSERT INTO public.actions(id,project_id,title) VALUES(pg_temp.k(31),pg_temp.k(21),'Synthetic task'),(pg_temp.k(32),pg_temp.k(21),'Synthetic other task');
INSERT INTO public.indicators(id,project_id,key,label,unit,target_value,target_direction,target_unit)
 VALUES(pg_temp.k(33),pg_temp.k(21),'synthetic_target','Synthetic indicator','stk.',0,'at_most','stk.');
UPDATE public.actions SET linked_indicator_id=pg_temp.k(33) WHERE id=pg_temp.k(31);
CREATE FUNCTION pg_temp.plan() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('schema','freyra.work-order-plan/v1','title','Synthetic submission plan','description','','instructions','Synthetic instruction','profile','nature','responsibleId',pg_temp.k(1),'siteId',NULL,'watercourseVersionId',NULL,'locationNote','Synthetic location','plannedStart',NULL,'plannedEnd',NULL,'priority',NULL,'plannedMethod',NULL,'watercourse',NULL) $$;
CREATE FUNCTION pg_temp.ctx() RETURNS jsonb LANGUAGE sql AS $$ SELECT public.get_work_order_submission_context(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21)) $$;
CREATE FUNCTION pg_temp.hash() RETURNS text LANGUAGE sql AS $$ SELECT pg_temp.ctx()->>'basis_hash' $$;
CREATE FUNCTION pg_temp.save(v integer DEFAULT 0,r integer DEFAULT 81,h text DEFAULT NULL,n text DEFAULT 'Synthetic handover') RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.save_work_order_submission(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),v,coalesce(h,pg_temp.hash()),n,pg_temp.k(r)) $$;
CREATE FUNCTION pg_temp.values_for(target text) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('operation','transition','targetStatus',target,'planVersionId',(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1),'assignmentVersionId',(SELECT id FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1),'executionRevisionId',(SELECT workspace_entry_id FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1)) $$;
CREATE FUNCTION pg_temp.change(v integer,target text,extra jsonb DEFAULT '{}') RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.mutate_work_order_lifecycle(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),v,pg_temp.values_for(target)||extra,gen_random_uuid()) $$;
CREATE FUNCTION pg_temp.attach(v integer,observation_version integer,req integer) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.save_work_order_evidence(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(71),v,(SELECT id FROM public.field_job_versions WHERE action_id=pg_temp.k(31) AND version=observation_version),pg_temp.k(51),(SELECT workspace_entry_id FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1),'attached','Synthetic evidence',pg_temp.k(req)) $$;
CREATE TABLE pg_temp.saved(name text PRIMARY KEY,value text);
GRANT SELECT,INSERT ON pg_temp.saved TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT * FROM public.initialize_work_order(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),0,pg_temp.k(41));
SELECT * FROM public.initialize_work_order(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),0,pg_temp.k(42));
SELECT ok((pg_temp.ctx()->'gaps') ? 'plan_incomplete','preflight reports missing plan');
SELECT throws_ok($$SELECT pg_temp.save()$$,'22023',NULL,'incomplete task cannot create a packet');
SELECT * FROM public.save_work_order_plan(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),0,pg_temp.plan(),'',pg_temp.k(43));
SELECT * FROM public.configure_work_order_assignment(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),0,(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(31)),'person',ARRAY[pg_temp.k(2)],NULL,'Synthetic assignee',pg_temp.k(44));
SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(4),0,true,true,false,'Synthetic external read',pg_temp.k(45));
SELECT pg_temp.change(0,'draft'); SELECT pg_temp.change(1,'planned'); SELECT pg_temp.change(2,'assigned');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT pg_temp.change(3,'started','{"startedAt":"2026-10-08T08:00:00Z","startedSource":"Synthetic work log"}');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT * FROM public.save_work_order_execution(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(31)),1,0,
 jsonb_build_object('schema','freyra.action-execution/v1','actionId',pg_temp.k(31),'surveyRoundId',NULL,'dataBasis','synthetic','workType','other','stage','performed','actualDate','2026-10-08','actualEndDate',NULL,'method','Synthetic method','reach','Synthetic reach','performedBy','Synthetic field worker','sourceReference','Synthetic work log','evidenceIds','[]'::jsonb,'deviation','','correctionReason','','coverage','limited','coverageDescription','Synthetic limited coverage'),pg_temp.k(2),'',pg_temp.k(46),(SELECT id FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(31)),1);
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT pg_temp.change(4,'performed');
SELECT ok((pg_temp.ctx()->'gaps') ? 'evidence_missing','performed alone does not supply photos and observations');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT * FROM public.save_field_job_template_version(pg_temp.k(11),pg_temp.k(21),pg_temp.k(47),0,'{"schema":"freyra.field-job-template/v1","title":"Synthetic form","domain":"nature","fields":[{"key":"count","label":"Count","type":"number","required":true},{"key":"checked","label":"Checked","type":"boolean","required":true}]}',pg_temp.k(48));
SELECT * FROM public.save_field_job_version(pg_temp.k(11),pg_temp.k(21),pg_temp.k(31),(SELECT id FROM public.field_job_template_versions WHERE template_id=pg_temp.k(47)),0,'{"count":0,"checked":null}','recorded','',pg_temp.k(49));
RESET ROLE;
INSERT INTO storage.buckets(id,name,public) VALUES('project-media','project-media',false) ON CONFLICT(id) DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT * FROM public.begin_field_photo_upload(pg_temp.k(21),pg_temp.k(51),jsonb_build_object('title','Synthetic original','description',NULL,'category','field_photo','tags','[]'::jsonb,'originalName','original.jpg','sha256',repeat('a',64),'sizeBytes',8,'mimeType','image/jpeg','capturedAt',NULL,'capture','{"schema":"freyra.field-photo/v1","originalPosition":null,"initialPosition":{"lat":55,"lng":10},"correctionReason":"Synthetic manual position"}'::jsonb));
INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata) VALUES(pg_temp.k(61),'project-media',pg_temp.k(21)::text||'/field-uploads/'||pg_temp.k(51)::text||'/original',pg_temp.k(1)::text,'{"size":8,"mimetype":"image/jpeg"}');
SELECT * FROM public.finalize_field_photo_upload(pg_temp.k(21),pg_temp.k(51));
RESET ROLE; SET LOCAL ROLE service_role;
SELECT public.prepare_field_photo_verification(pg_temp.k(21),pg_temp.k(51),pg_temp.k(1));
SELECT * FROM public.complete_field_photo_verification(pg_temp.k(21),pg_temp.k(51),pg_temp.k(1),(SELECT lease_id FROM public.field_photo_processing_jobs WHERE upload_id=pg_temp.k(51)),repeat('a',64),8);
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT pg_temp.attach(0,1,62);
SELECT ok((pg_temp.ctx()->'gaps') ? 'observation_incomplete','required null is a gap even on a recorded field card');
SELECT throws_ok($$SELECT pg_temp.save()$$,'22023',NULL,'recorded but incomplete form cannot be submitted');
INSERT INTO pg_temp.saved VALUES('old_hash',pg_temp.hash());
SELECT * FROM public.save_field_job_version(pg_temp.k(11),pg_temp.k(21),pg_temp.k(31),(SELECT id FROM public.field_job_template_versions WHERE template_id=pg_temp.k(47)),1,'{"count":0,"checked":false}','recorded','Synthetic complete correction',pg_temp.k(63));
SELECT pg_temp.attach(1,2,64);
SELECT is(pg_temp.ctx()->'gaps','[]'::jsonb,'zero and false satisfy required fields');
SELECT throws_ok($$SELECT pg_temp.save(0,81,(SELECT value FROM pg_temp.saved WHERE name='old_hash'))$$,'PT409',NULL,'changed selected evidence invalidates the preflight hash');
SELECT lives_ok($$SELECT pg_temp.save()$$,'ready packet is saved');

RESET ROLE;
CREATE FUNCTION pg_temp.rc() RETURNS jsonb LANGUAGE sql AS $$ SELECT public.get_work_order_review_context(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21)) $$;
CREATE FUNCTION pg_temp.rev() RETURNS integer LANGUAGE sql AS $$ SELECT (pg_temp.rc()->'state'->>'version')::integer $$;
CREATE FUNCTION pg_temp.review_values(op text,target text,packet integer DEFAULT 1,reason text DEFAULT 'Synthetic scope and findings') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('operation',op,'targetStatus',target,'submissionVersionId',s.id,
 'planVersionId',CASE WHEN op='reopen' THEN (SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1) ELSE s.plan_version_id END,
 'assignmentVersionId',CASE WHEN op='reopen' THEN (SELECT id FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1) ELSE s.assignment_version_id END,
 'executionRevisionId',CASE WHEN op='reopen' THEN (SELECT workspace_entry_id FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1) ELSE s.execution_revision_id END,
 'reviewScope',CASE WHEN op='review' THEN 'execution_and_documentation' END,'reason',reason)
 FROM public.work_order_submission_versions s WHERE s.action_id=pg_temp.k(31) AND s.version=packet
$$;
CREATE FUNCTION pg_temp.review(v integer,op text,target text,packet integer DEFAULT 1,req integer DEFAULT 201) RETURNS uuid LANGUAGE sql AS $$
 SELECT id FROM public.mutate_work_order_lifecycle(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),v,pg_temp.review_values(op,target,packet),pg_temp.k(req))
$$;
SET LOCAL ROLE authenticated;
INSERT INTO pg_temp.saved SELECT 'packet1',snapshot::text FROM public.work_order_submission_versions WHERE version=1;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(1),0,true,true,true,'Synthetic author review grant',pg_temp.k(180));
SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(2),0,true,true,true,'Synthetic performer review grant',pg_temp.k(181));
SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(3),0,true,false,true,'Synthetic independent reviewer',pg_temp.k(182));
SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(4),1,true,false,true,'Synthetic external reviewer only',pg_temp.k(183));
SELECT is((pg_temp.rc()->>'can_submit')::boolean,true,'internal executor may submit the checked frozen version');
SELECT is((pg_temp.rc()->>'can_review')::boolean,false,'execution author cannot review even with an explicit role grant');
SELECT throws_ok($$SELECT public.mutate_work_order_lifecycle(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),5,pg_temp.values_for('approved'),pg_temp.k(190))$$,'22023',NULL,'legacy transition cannot bypass review');
SELECT lives_ok($$SELECT pg_temp.review(5,'submit','submitted',1,201)$$,'latest prepared packet is submitted');
SELECT is(pg_temp.rc()->'state'->>'status','submitted','submission uses the existing lifecycle');
SELECT is(pg_temp.review(5,'submit','submitted',1,201),(pg_temp.rc()->'state'->>'id')::uuid,'same submission retry returns one receipt');
SELECT throws_ok($$SELECT pg_temp.review(6,'submit','submitted',1,202)$$,'PT409',NULL,'a second submit does not replace active review');
SELECT throws_ok($$SELECT pg_temp.review(6,'review','approved',1,203)$$,'42501',NULL,'execution writer cannot approve own material');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT is((pg_temp.rc()->>'self_review')::boolean,true,'packet author and performer are recognized as self-review');
SELECT throws_ok($$SELECT pg_temp.review(6,'review','returned',1,204)$$,'42501',NULL,'performer cannot review own packet');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT is((pg_temp.rc()->>'can_review')::boolean,true,'independent reviewer has exact task capability');
SELECT throws_ok($$SELECT public.mutate_work_order_lifecycle(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),6,pg_temp.review_values('review','approved')||'{"reason":"short"}'::jsonb,pg_temp.k(205))$$,'22023',NULL,'a review requires a concrete scope and findings');
SELECT throws_ok($$SELECT public.mutate_work_order_lifecycle(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),6,pg_temp.review_values('review','approved')||'{"reviewScope":"nature_effect"}'::jsonb,pg_temp.k(206))$$,'22023',NULL,'work review cannot assert nature effect');
SELECT throws_ok($$SELECT public.mutate_work_order_lifecycle(pg_temp.k(31),pg_temp.k(12),pg_temp.k(21),6,pg_temp.review_values('review','approved'),pg_temp.k(207))$$,'42501',NULL,'foreign scope rejected before decision');
SELECT lives_ok($$SELECT pg_temp.review(6,'review','returned',1,208)$$,'reviewer returns with findings');
SELECT is(pg_temp.rc()->'state'->>'status','returned','return recorded in same status history');
SELECT throws_ok($$SELECT pg_temp.review(7,'reopen','reopened',1,209)$$,'42501',NULL,'review-only role cannot perform internal correction');
SELECT is((SELECT snapshot::text FROM public.work_order_submission_versions WHERE version=1),(SELECT value FROM pg_temp.saved WHERE name='packet1'),'return never rewrites the packet');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.review(7,'reopen','reopened',1,210)$$,'internal correction explicitly reopens the work');
SELECT lives_ok($$SELECT pg_temp.change(8,'performed')$$,'existing execution is explicitly confirmed after documentation correction');
SELECT throws_ok($$SELECT pg_temp.review(9,'submit','submitted',1,211)$$,'PT409',NULL,'reopened work requires a new frozen version');
SELECT lives_ok($$SELECT pg_temp.save(1,82)$$,'new packet preserves the preceding review');
SELECT pg_temp.review(9,'submit','submitted',2,212);
SELECT pg_temp.attach(2,2,66);
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT is((pg_temp.rc()->>'packet_current')::boolean,false,'evidence correction makes approval basis stale');
SELECT throws_ok($$SELECT pg_temp.review(10,'review','approved',2,213)$$,'PT409',NULL,'changed evidence cannot be approved against an old packet');
SELECT lives_ok($$SELECT pg_temp.review(10,'review','returned',2,214)$$,'stale submitted material may be returned for correction');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT pg_temp.review(11,'reopen','reopened',2,215);
SELECT pg_temp.change(12,'performed');
SELECT pg_temp.save(2,83);
SELECT pg_temp.review(13,'submit','submitted',3,216);
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT is((pg_temp.rc()->>'can_review')::boolean,true,'external review-only member can review this task');
SELECT is((pg_temp.ctx()->>'can_prepare')::boolean,false,'review grant does not enable packet preparation');
SELECT ok(EXISTS(SELECT 1 FROM public.list_my_work_orders(NULL,20) WHERE action_id=pg_temp.k(31) AND can_review AND NOT can_execute),'review-only task is reachable through My Tasks');
SELECT throws_ok($$SELECT pg_temp.save(3,84)$$,'42501',NULL,'reviewer cannot mutate evidence packet sources');
RESET ROLE;
CREATE FUNCTION pg_temp.fail_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.event_type='work_order.lifecycle_changed' AND NEW.after_data->>'status'='approved' THEN RAISE EXCEPTION 'Synthetic review audit failure';END IF;RETURN NEW;END $$;
CREATE TRIGGER synthetic_review_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_review_audit();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.review(14,'review','approved',3,217)$$,'P0001',NULL,'audit failure rolls back approval');
SELECT is(pg_temp.rev(),14,'failed audit left lifecycle unchanged');
RESET ROLE;
DROP TRIGGER synthetic_review_audit_failure ON public.audit_events;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.review(14,'review','approved',3,217)$$,'independent external reviewer approves exact unchanged packet');
SELECT is(pg_temp.rc()->'state'->>'status','approved','approval recorded on the existing lifecycle');
SELECT is(pg_temp.rc()->'state'->>'review_scope','execution_and_documentation','approval scope is explicit and bounded');
SELECT is(jsonb_array_length(pg_temp.rc()->'recent_reviews'),3,'previous returns and approval remain visible');
SELECT throws_ok($$SELECT pg_temp.review(14,'review','returned',3,218)$$,'PT409',NULL,'second reviewer decision is a controlled version conflict');
SELECT throws_ok($$UPDATE public.work_order_lifecycle_versions SET reason='Overwrite' WHERE operation='review'$$,'42501',NULL,'review history cannot be overwritten');
SELECT throws_ok($$DELETE FROM public.work_order_lifecycle_versions WHERE operation='review'$$,'42501',NULL,'review history cannot be deleted');
SELECT is(pg_temp.review(14,'review','approved',3,217),(pg_temp.rc()->'state'->>'id')::uuid,'lost approval response can recover same exact receipt');
RESET ROLE;
UPDATE public.indicators SET target_value=5 WHERE id=pg_temp.k(33);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
CREATE FUNCTION pg_temp.work_order_report() RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.save_approved_work_order_report(pg_temp.k(11),pg_temp.k(21),pg_temp.k(31),
   (pg_temp.rc()->'packet'->>'id')::uuid,(pg_temp.rc()->'state'->>'id')::uuid)
$$;
-- A newer normal execution revision must not relabel the approved historical packet.
SELECT saved.*
FROM (SELECT * FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1) p
CROSS JOIN (SELECT * FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1) a
CROSS JOIN (SELECT * FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1) b
JOIN public.project_workspace_entries e ON e.id=b.workspace_entry_id
CROSS JOIN LATERAL public.save_work_order_execution(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),p.id,p.version,b.version,
  (e.payload->>'decision')::jsonb || jsonb_build_object('dataBasis','real','correctionReason','TEST · Nyere registrering efter godkendt prøve'),
  b.performed_by_id,'',pg_temp.k(241),a.id,a.version) saved;
INSERT INTO pg_temp.saved VALUES ('work-order-report', pg_temp.work_order_report()::text);
SELECT is(pg_temp.work_order_report(),(SELECT value::jsonb FROM pg_temp.saved WHERE name='work-order-report'),
  'retry returns exactly the same stored report');
SELECT is((SELECT value::jsonb->'content'->'workOrderApproval'->>'submissionVersion'
  FROM pg_temp.saved WHERE name='work-order-report'),'3','report is bound to approved submission version 3');
SELECT is((SELECT value::jsonb->'content'->'workOrderApproval'->>'reviewId'
  FROM pg_temp.saved WHERE name='work-order-report'),pg_temp.rc()->'state'->>'id','report pins exact review');
SELECT is((SELECT value::jsonb->'content'->'workOrderApproval'->>'executionDataBasis'
  FROM pg_temp.saved WHERE name='work-order-report'),'synthetic','report keeps frozen synthetic classification despite a newer real execution');
SELECT is((SELECT value::jsonb->'content'->'workOrderApproval'->>'executionRevisionId'
  FROM pg_temp.saved WHERE name='work-order-report'),
  (SELECT execution_revision_id::text FROM public.work_order_submission_versions WHERE action_id=pg_temp.k(31) AND version=3),
  'report classification pins the approved execution revision');
SELECT isnt((SELECT value::jsonb->'content'->'workOrderApproval'->>'executionRevisionId'
  FROM pg_temp.saved WHERE name='work-order-report'),
  (SELECT workspace_entry_id::text FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31) ORDER BY version DESC LIMIT 1),
  'report classification does not follow the current execution');
SELECT ok((SELECT value::jsonb->'content'->'sections'->0->>'text'
  FROM pg_temp.saved WHERE name='work-order-report') LIKE '%Mål ved aflevering: Synthetic indicator · højst 0 stk.',
  'report shows the approved target even when the current target was changed before report creation');
SELECT is((SELECT value::jsonb->'content'->'sections'->0->>'basis'
  FROM pg_temp.saved WHERE name='work-order-report'),'not_measured','a target is not presented as a measurement');
SELECT throws_ok($$SELECT public.save_approved_work_order_report(pg_temp.k(12),pg_temp.k(21),pg_temp.k(31),
  (pg_temp.rc()->'packet'->>'id')::uuid,(pg_temp.rc()->'state'->>'id')::uuid)$$,
  '42501',NULL,'foreign organization cannot reuse an approval');
SELECT throws_ok($$SELECT public.save_approved_work_order_report(pg_temp.k(11),pg_temp.k(21),pg_temp.k(31),
  (pg_temp.rc()->'packet'->>'id')::uuid,pg_temp.k(199))$$,
  '42501',NULL,'unverified review cannot produce a report');
SELECT throws_ok($$SELECT public.save_report_revision(
  (value::jsonb->>'report_id')::uuid,pg_temp.k(11),pg_temp.k(21),1,'draft',
  (value::jsonb->'content') - 'workOrderApproval' - 'sources' || '{"sources":[]}'::jsonb)
  FROM pg_temp.saved WHERE name='work-order-report'$$,
  'P0001','The approved work order report is immutable','cannot strip provenance from a saved report');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT throws_ok($$SELECT pg_temp.work_order_report()$$,'42501',NULL,'field staff cannot create a project report');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT ok(EXISTS(SELECT 1 FROM jsonb_array_elements((SELECT log->'items' FROM public.get_work_order_log(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),NULL,NULL,NULL,50))) item WHERE item->'detail'->>'reviewScope'='execution_and_documentation'),'existing logbook includes the pinned review scope');
SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(4),2,false,false,false,'Synthetic revoke reviewer',pg_temp.k(219));
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT throws_ok($$SELECT pg_temp.rc()$$,'42501',NULL,'revoked external reviewer cannot load cached review context');
SELECT throws_ok($$SELECT pg_temp.review(14,'review','approved',3,217)$$,'42501',NULL,'current capability is checked before recovering old receipt');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.get_work_order_review_context(uuid,uuid,uuid)','EXECUTE'),'anonymous role cannot read review state');
SELECT ok(NOT has_function_privilege('service_role','public.get_work_order_review_context(uuid,uuid,uuid)','EXECUTE'),'service role cannot masquerade as reviewer');
SELECT ok(NOT has_function_privilege('authenticated','private.bind_work_order_report()','EXECUTE'),'report trigger is not a callable authenticated API');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='private.bind_work_order_report()'::regprocedure),'report classification retains invoker security');
SELECT * FROM finish();
ROLLBACK;
