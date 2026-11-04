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
CREATE FUNCTION pg_temp.plan() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('schema','freyra.work-order-plan/v1','title','Synthetic submission plan','description','','instructions','Synthetic instruction','profile','nature','responsibleId',pg_temp.k(1),'siteId',NULL,'watercourseVersionId',NULL,'locationNote','Synthetic location','plannedStart',NULL,'plannedEnd',NULL,'priority',NULL,'plannedMethod',NULL,'watercourse',NULL,'requiredJobCards',(SELECT jsonb_build_array(jsonb_build_object('templateVersionId',t.id,'templateId',t.template_id,'version',t.version,'definition',t.definition)) FROM public.field_job_template_versions t WHERE template_id=pg_temp.k(47) ORDER BY version LIMIT 1)) $$;
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
SELECT * FROM public.save_field_job_template_version(pg_temp.k(11),pg_temp.k(21),pg_temp.k(47),0,'{"schema":"freyra.field-job-template/v1","title":"Synthetic form","domain":"nature","fields":[{"key":"count","label":"Count","type":"number","required":true},{"key":"checked","label":"Checked","type":"boolean","required":true}]}',pg_temp.k(48));
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



-- Independent task for two offline cards and an explicit source plan.
SELECT * FROM public.save_field_job_template_version(pg_temp.k(11),pg_temp.k(21),pg_temp.k(670),0,'{"schema":"freyra.field-job-template/v1","title":"Synthetic second required form","domain":"nature","fields":[{"key":"count","label":"Count","type":"number","required":true},{"key":"checked","label":"Checked","type":"boolean","required":true}]}',pg_temp.k(671));
CREATE FUNCTION pg_temp.offline_plan() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_set(pg_temp.plan(),'{requiredJobCards}',(SELECT jsonb_agg(jsonb_build_object('templateVersionId',id,'templateId',template_id,'version',version,'definition',definition) ORDER BY template_id) FROM public.field_job_template_versions WHERE template_id IN(pg_temp.k(47),pg_temp.k(670))))
$$;
SELECT * FROM public.save_work_order_plan(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),0,pg_temp.offline_plan(),'',pg_temp.k(672));
SELECT * FROM public.configure_work_order_assignment(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),0,(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(32)),'person',ARRAY[pg_temp.k(2)],NULL,'Synthetic offline assignee',pg_temp.k(673));
INSERT INTO pg_temp.saved SELECT 'offline-plan1',id::text FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(32);
CREATE FUNCTION pg_temp.offline_save(v integer, t integer, r integer, p uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql AS $$
 SELECT id FROM public.save_field_job_version_for_plan(pg_temp.k(11),pg_temp.k(21),pg_temp.k(32),
   (SELECT id FROM public.field_job_template_versions WHERE template_id=pg_temp.k(t)),v,
   '{"count":0,"checked":false}','recorded','Synthetic offline visit',pg_temp.k(r),coalesce(p,(SELECT value::uuid FROM pg_temp.saved WHERE name='offline-plan1')))
$$;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT throws_ok($$SELECT pg_temp.offline_save(0,47,674)$$,'42501',NULL,'viewer cannot upload a required offline card');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT lives_ok($$SELECT pg_temp.offline_save(0,47,674)$$,'assigned worker can create the first required card from a plan');
SELECT lives_ok($$SELECT pg_temp.offline_save(1,670,675)$$,'next card advances the same task version');
SELECT is((SELECT count(*)::integer FROM public.field_job_versions WHERE action_id=pg_temp.k(32)),2,'two required cards share one task history');
SELECT ok((SELECT bool_and(required_plan_version_id=(SELECT value::uuid FROM pg_temp.saved WHERE name='offline-plan1') AND "values"->'count'='0' AND "values"->'checked'='false') FROM public.field_job_versions WHERE action_id=pg_temp.k(32)),'plan reference, zero and false are preserved');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT * FROM public.save_work_order_plan(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),1,pg_temp.offline_plan()||'{"instructions":"Synthetic revised visit instructions"}','Synthetic plan update',pg_temp.k(676));
INSERT INTO pg_temp.saved SELECT 'offline-plan2',id::text FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(32) AND version=2;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT throws_ok($$SELECT pg_temp.offline_save(2,47,677)$$,'PT409',NULL,'a stale plan is rejected even when the task version is current');
SELECT is(pg_temp.offline_save(0,47,674),(SELECT id FROM public.field_job_versions WHERE action_id=pg_temp.k(32) AND version=1),'lost successful reply recovers its original plan reference after a plan change');
SELECT throws_ok($$SELECT pg_temp.offline_save(0,47,674,(SELECT value::uuid FROM pg_temp.saved WHERE name='offline-plan2'))$$,'22023',NULL,'request id cannot be rebound to another plan');
SELECT lives_ok($$SELECT pg_temp.offline_save(2,47,677,(SELECT value::uuid FROM pg_temp.saved WHERE name='offline-plan2'))$$,'explicitly rebased draft can be saved on the new plan');
SELECT throws_ok($$INSERT INTO public.field_job_versions(action_id,organization_id,project_id,template_version_id,version,"values",status,correction_reason,request_id,required_plan_version_id)
 VALUES(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),(SELECT id FROM public.field_job_template_versions WHERE template_id=pg_temp.k(47)),4,'{}','draft','Synthetic bypass',pg_temp.k(678),(SELECT value::uuid FROM pg_temp.saved WHERE name='offline-plan1'))$$,'PT409',NULL,'direct Data API writes cannot bypass the source plan');
SELECT throws_ok($$UPDATE public.field_job_versions SET required_plan_version_id=(SELECT value::uuid FROM pg_temp.saved WHERE name='offline-plan2') WHERE action_id=pg_temp.k(32) AND version=1$$,'23514',NULL,'old source plan reference is immutable');
SELECT lives_ok($$SELECT * FROM public.save_field_job_version(pg_temp.k(11),pg_temp.k(21),pg_temp.k(32),(SELECT id FROM public.field_job_template_versions WHERE template_id=pg_temp.k(47)),3,'{}','draft','Synthetic legacy client',pg_temp.k(679))$$,'legacy endpoint remains available for existing clients');
SELECT is((SELECT required_plan_version_id FROM public.field_job_versions WHERE action_id=pg_temp.k(32) AND version=4),NULL::uuid,'legacy writes never invent a source plan');
RESET ROLE;
UPDATE public.project_members SET role='viewer' WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT throws_ok($$SELECT pg_temp.offline_save(0,47,674)$$,'42501',NULL,'revoked execution access also blocks old successful-request recovery');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon','public.save_field_job_version_for_plan(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid,uuid)','EXECUTE'),'anonymous cannot call plan-bound saving');
SELECT ok(NOT has_function_privilege('service_role','public.save_field_job_version_for_plan(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid,uuid)','EXECUTE'),'service role cannot impersonate the field worker');
SELECT * FROM finish();
ROLLBACK;
