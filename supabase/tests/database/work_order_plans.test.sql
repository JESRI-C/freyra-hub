-- Synthetic fixtures in the disposable CI database only. No messages or file bytes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.k(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('dd020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 SELECT '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated','synthetic-order-plan-'||n||'@example.test','',now(),'{"provider":"email"}','{}',now(),now() FROM generate_series(1,6) n;
INSERT INTO public.organizations(id,name,type,country) VALUES(pg_temp.k(11),'Synthetic plan organization A','test','Denmark'),(pg_temp.k(12),'Synthetic plan organization B','test','Denmark');
INSERT INTO public.organization_memberships(organization_id,user_id,role) SELECT pg_temp.k(11),pg_temp.k(n),'viewer' FROM generate_series(1,5) n;
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(pg_temp.k(12),pg_temp.k(6),'owner');
INSERT INTO public.projects(id,organization_id,name) VALUES(pg_temp.k(21),pg_temp.k(11),'Synthetic plan project'),(pg_temp.k(22),pg_temp.k(11),'Synthetic other plan project'),(pg_temp.k(23),pg_temp.k(12),'Synthetic foreign plan project');
INSERT INTO public.project_members(project_id,user_id,role) VALUES(pg_temp.k(21),pg_temp.k(1),'project_manager'),(pg_temp.k(21),pg_temp.k(2),'field'),(pg_temp.k(21),pg_temp.k(3),'viewer'),(pg_temp.k(21),pg_temp.k(4),'external');
INSERT INTO public.actions(id,project_id,title) SELECT pg_temp.k(n),pg_temp.k(21),'Synthetic plan action '||n FROM generate_series(31,35) n;
INSERT INTO public.actions(id,project_id,title) VALUES(pg_temp.k(36),pg_temp.k(22),'Synthetic inaccessible action');
INSERT INTO public.sites(id,project_id,name) VALUES(pg_temp.k(51),pg_temp.k(21),'Synthetic same project site'),(pg_temp.k(52),pg_temp.k(22),'Synthetic other project site');
INSERT INTO public.watercourse_versions(id,organization_id,project_id,version,geometry,crs,direction,source,length_m,method,created_by)
 VALUES(pg_temp.k(53),pg_temp.k(11),pg_temp.k(21),1,'{"type":"LineString","coordinates":[[9.4,55.2],[9.401,55.2]]}','EPSG:4326','unknown','Synthetic same project centerline',1,'fixture',pg_temp.k(1)),
 (pg_temp.k(54),pg_temp.k(11),pg_temp.k(22),1,'{"type":"LineString","coordinates":[[9.4,55.2],[9.401,55.2]]}','EPSG:4326','unknown','Synthetic other project centerline',1,'fixture',pg_temp.k(1));

CREATE FUNCTION pg_temp.plan() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT '{"schema":"freyra.work-order-plan/v1","title":"Synthetic watercourse plan","description":"","instructions":"","profile":"watercourse","responsibleId":null,"siteId":null,"watercourseVersionId":null,"locationNote":"","plannedStart":null,"plannedEnd":null,"priority":null,"plannedMethod":null,"watercourse":{"name":null,"externalId":null,"regulationReference":null,"regulationVersion":null,"stationFromM":null,"stationToM":null,"stationDirection":"unknown","lengthM":null,"bottomWidthM":0,"measurementSource":"Synthetic measured zero","term":null}}'::jsonb $$;
CREATE FUNCTION pg_temp.save(ver integer DEFAULT 0,req integer DEFAULT 61,body jsonb DEFAULT pg_temp.plan(),a integer DEFAULT 31,org integer DEFAULT 11,proj integer DEFAULT 21,reason text DEFAULT '') RETURNS uuid LANGUAGE sql AS $$
 SELECT id FROM public.save_work_order_plan(pg_temp.k(a),pg_temp.k(org),pg_temp.k(proj),ver,body,reason,pg_temp.k(req))
$$;
CREATE FUNCTION pg_temp.history(a integer DEFAULT 31,before_ver integer DEFAULT NULL,size integer DEFAULT 20,org integer DEFAULT 11,proj integer DEFAULT 21) RETURNS SETOF public.work_order_plan_versions LANGUAGE sql AS $$
 SELECT * FROM public.get_work_order_plan_history(pg_temp.k(a),pg_temp.k(org),pg_temp.k(proj),before_ver,size)
$$;

SELECT ok(NOT has_table_privilege('anon','public.work_order_plan_versions','SELECT'),'T01 anonymous plan read is denied');
SELECT ok(NOT has_table_privilege('authenticated','public.work_order_plan_versions','UPDATE'),'plan history cannot be overwritten through Data API');
SELECT ok(NOT has_table_privilege('authenticated','public.work_order_plan_versions','DELETE'),'plan history cannot be deleted through Data API');
SELECT ok(NOT has_function_privilege('service_role','public.save_work_order_plan(uuid,uuid,uuid,integer,jsonb,text,uuid)','EXECUTE'),'service actor cannot mutate plans');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.save_work_order_plan(uuid,uuid,uuid,integer,jsonb,text,uuid)'::regprocedure),'plan RPC preserves caller RLS');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT is((SELECT count(*)::integer FROM pg_temp.history()),0,'authorized existing action has real empty history before first save');
SELECT throws_ok($$SELECT * FROM pg_temp.history(36)$$,'42501',NULL,'same organization does not expose another project history');
SELECT throws_ok($$SELECT * FROM pg_temp.history(31,NULL,0)$$,'22023',NULL,'zero page size is rejected');
SELECT throws_ok($$SELECT * FROM pg_temp.history(31,0)$$,'22023',NULL,'invalid history cursor is rejected');
SELECT throws_ok($$SELECT pg_temp.save(0,60,pg_temp.plan()||'{"plannedStart":"2026-02-30"}')$$,'22023',NULL,'impossible date is not coerced into another date');
SELECT throws_ok($$SELECT pg_temp.save(0,60,pg_temp.plan()||'{"plannedEnd":"2026-11-02"}')$$,'22023',NULL,'end date cannot invent an unknown start');
SELECT throws_ok($$SELECT pg_temp.save(0,60,jsonb_set(pg_temp.plan(),'{watercourse,measurementSource}','null'))$$,'22023',NULL,'measured zero requires a source');
SELECT throws_ok($$SELECT pg_temp.save(0,60,jsonb_set(jsonb_set(pg_temp.plan(),'{watercourse,stationFromM}','100'),'{watercourse,stationToM}','20'))$$,'22023',NULL,'reversed stationing requires explicit direction');
SELECT throws_ok($$SELECT pg_temp.save(0,60,pg_temp.plan()||'{"actualDate":"2026-10-29"}')$$,'22023',NULL,'actual execution cannot be hidden in the plan contract');
SELECT throws_ok($$SELECT pg_temp.save(0,60,pg_temp.plan()||jsonb_build_object('responsibleId',pg_temp.k(5)))$$,'22023',NULL,'organization-only user cannot become project responsible');
SELECT is((SELECT count(*)::integer FROM public.work_orders),0,'invalid plans do not leave a partial root');
SELECT lives_ok($$SELECT pg_temp.save()$$,'first plan initializes the existing action identity atomically');
SELECT is(pg_temp.save(),(SELECT id FROM public.work_order_plan_versions WHERE request_id=pg_temp.k(61)),'T09 lost response retry returns identical plan ID');
SELECT is((SELECT count(*)::integer FROM public.work_orders),1,'one existing action root remains');
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions),1,'retry produces one revision');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE event_type='work_order.plan_saved' AND entity_id=pg_temp.k(31)),1,'retry produces one atomic plan event');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE event_type='work_order.created' AND entity_id=pg_temp.k(31)),1,'root and plan each produce one internal event');
SELECT is((SELECT planned_start FROM public.work_order_plan_versions),NULL::date,'unknown planned date remains null');
SELECT is((SELECT bottom_width_m FROM public.work_order_plan_versions),0::numeric,'T07 measured zero survives the database projection');
SELECT is((SELECT length_m FROM public.work_order_plan_versions),NULL::numeric,'unknown length does not become zero');
SELECT throws_ok($$SELECT pg_temp.save(0,61,pg_temp.plan()||'{"title":"Changed request content"}')$$,'22023',NULL,'same request key rejects different content');
SELECT throws_ok($$SELECT pg_temp.save(0,62)$$,'PT409',NULL,'stale plan cannot overwrite current version');
SELECT throws_ok($$SELECT pg_temp.save(1,62)$$,'22023',NULL,'later version requires a correction reason');
SELECT lives_ok($$SELECT pg_temp.save(1,62,pg_temp.plan()||jsonb_build_object('siteId',pg_temp.k(51),'watercourseVersionId',pg_temp.k(53),'responsibleId',pg_temp.k(2),'plannedStart','2026-11-02'),'31',11,21,'Synthetic explicit plan correction')$$,'plan correction binds existing project relations without changing actual execution');
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions WHERE version=1 AND plan=pg_temp.plan()),1,'T10 original plan stays unchanged after correction');
SELECT is((SELECT responsible_id FROM public.work_order_plan_versions WHERE version=2),pg_temp.k(2),'named responsible is projected without granting access');
SELECT is((SELECT count(*)::integer FROM public.work_order_access_versions WHERE user_id=pg_temp.k(2)),0,'responsible selection grants no task capability');
SELECT lives_ok($$SELECT pg_temp.save(2,63,pg_temp.plan(),31,11,21,'Synthetic third version')$$,'third version is appended');
SELECT is((SELECT array_agg(version) FROM pg_temp.history(31,NULL,1)),ARRAY[3,2],'history uses descending cursor with one lookahead row');
SELECT is((SELECT array_agg(version) FROM pg_temp.history(31,2,1)),ARRAY[1],'older cursor has no duplicates or skipped old revision');
SELECT throws_ok($$SELECT pg_temp.save(0,64,pg_temp.plan(),32,12,21)$$,'23503',NULL,'T02 organization/project mismatch is rejected in database');
SELECT throws_ok($$SELECT pg_temp.save(0,64,pg_temp.plan(),36,11,21)$$,'23503',NULL,'T02 action/project mismatch is rejected in database');
SELECT throws_ok($$SELECT pg_temp.save(0,64,pg_temp.plan()||jsonb_build_object('siteId',pg_temp.k(52)),32)$$,'23503',NULL,'foreign site cannot be attached even by raw API');
SELECT throws_ok($$SELECT pg_temp.save(0,64,pg_temp.plan()||jsonb_build_object('watercourseVersionId',pg_temp.k(54)),32)$$,'23503',NULL,'foreign centerline cannot be attached');
SELECT is((SELECT count(*)::integer FROM public.work_orders WHERE action_id=pg_temp.k(32)),0,'foreign relation rolls back initialization too');
SELECT throws_ok($$INSERT INTO public.work_order_plan_versions(action_id,organization_id,project_id,version,plan,request_id,created_by) VALUES(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),4,pg_temp.plan(),pg_temp.k(65),pg_temp.k(2))$$,'42501',NULL,'Data API cannot spoof plan actor');
SELECT throws_ok($$INSERT INTO public.work_order_plan_versions(action_id,organization_id,project_id,version,plan,request_id,correction_reason) VALUES(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),99,pg_temp.plan(),pg_temp.k(65),'Synthetic raw insert')$$,'PT409',NULL,'Data API cannot skip plan versions');
SELECT lives_ok($$SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(4),0,true,true,false,'Synthetic assigned executor',pg_temp.k(70))$$,'concrete external executor is assigned without project access');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT is((SELECT count(*)::integer FROM pg_temp.history()),3,'assigned external executor can read its task plan history');
SELECT ok(NOT private.can_read_project(pg_temp.k(21)),'reading the assigned plan does not grant project access');
SELECT throws_ok($$SELECT * FROM pg_temp.history(32)$$,'42501',NULL,'unassigned plan is unavailable');
SELECT throws_ok($$SELECT pg_temp.save(3,66,pg_temp.plan(),31,11,21,'Synthetic unauthorized edit')$$,'42501',NULL,'execution permission cannot change the work plan');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT is((SELECT count(*)::integer FROM pg_temp.history()),3,'viewer can inspect existing plan history');
SELECT throws_ok($$SELECT pg_temp.save(3,66,pg_temp.plan(),31,11,21,'Synthetic viewer edit')$$,'42501',NULL,'viewer cannot save a plan');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT throws_ok($$SELECT pg_temp.save(3,66,pg_temp.plan(),31,11,21,'Synthetic field edit')$$,'42501',NULL,'field role cannot impersonate the planner');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(6)::text,true);
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions),0,'other tenant cannot enumerate plan rows');
SELECT throws_ok($$SELECT * FROM pg_temp.history()$$,'42501',NULL,'other tenant cannot fetch by guessed task ID');
-- T09 domain + root + event transaction must fail closed on audit failure.
RESET ROLE;
CREATE FUNCTION pg_temp.fail_plan_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic plan audit failure' USING ERRCODE='P0001'; END $$;
CREATE TRIGGER synthetic_plan_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW WHEN(NEW.event_type='work_order.plan_saved') EXECUTE FUNCTION pg_temp.fail_plan_audit();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT pg_temp.save(0,67,pg_temp.plan(),33)$$,'P0001',NULL,'audit failure rejects the entire plan command');
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(33)),0,'failed audit leaves no partial plan');
SELECT is((SELECT count(*)::integer FROM public.work_orders WHERE action_id=pg_temp.k(33)),0,'failed plan audit leaves no orphan root');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(33)),0,'failed plan audit also rolls back root event');
RESET ROLE;
DROP TRIGGER synthetic_plan_audit_failure ON public.audit_events;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.save(0,67,pg_temp.plan(),33)$$,'same mutation can be retried after complete rollback');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(33)),2,'retry commits exactly root and plan events');
SELECT lives_ok($$SELECT * FROM public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(4),1,false,false,false,'Synthetic revocation',pg_temp.k(71))$$,'assignment revocation is a separate immutable command');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions),0,'revocation immediately removes external plan read');
SELECT throws_ok($$SELECT * FROM pg_temp.history()$$,'42501',NULL,'revoked executor cannot mint a new history response');
-- D02c stores actual execution in the existing workspace, with an atomic plan binding.
CREATE FUNCTION pg_temp.execution() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('schema','freyra.action-execution/v1','actionId',pg_temp.k(31),'surveyRoundId',NULL,'dataBasis','synthetic','workType','weed_cutting','stage','performed','actualDate','2026-10-08','actualEndDate',NULL,'method','Synthetic actual method','reach','Synthetic actual reach','performedBy','Synthetic colleague','sourceReference','Synthetic work log','evidenceIds','[]'::jsonb,'deviation','','correctionReason','','coverage','limited','coverageDescription','Synthetic partial execution') $$;
CREATE FUNCTION pg_temp.execution_save(ver integer DEFAULT 0,req integer DEFAULT 81,body jsonb DEFAULT pg_temp.execution(),performer integer DEFAULT 2,reason text DEFAULT '',a integer DEFAULT 31,plan_ver integer DEFAULT 4)
RETURNS uuid LANGUAGE sql AS $$ SELECT workspace_entry_id FROM public.save_work_order_execution(pg_temp.k(a),pg_temp.k(11),pg_temp.k(21),(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(a) AND version=plan_ver),plan_ver,ver,body||jsonb_build_object('actionId',pg_temp.k(a)),pg_temp.k(performer),reason,pg_temp.k(req)) $$;
CREATE FUNCTION pg_temp.raw_execution(revoke_reader boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.project_workspace_entries(entry_id,organization_id,project_id,kind,version,title,payload)
 VALUES(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),'decision_note',3,'Synthetic raw execution',jsonb_build_object('basis','Synthetic work log','source','action-execution:'||pg_temp.k(31)::text,'decision',(pg_temp.execution()||'{"correctionReason":"Synthetic raw correction"}')::text,'alternatives','','uncertainty','','owner',''));
 IF revoke_reader THEN DELETE FROM public.project_members WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(1);END IF;
 SET CONSTRAINTS work_order_execution_required IMMEDIATE;
END $$;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.save(3,80,pg_temp.plan()||'{"plannedStart":"2026-09-21","plannedEnd":"2026-09-27","plannedMethod":"Synthetic planned method"}',31,11,21,'Synthetic plan before execution')$$,'plan week 39 is frozen independently of actual week 41');
SELECT lives_ok($$SELECT pg_temp.execution_save()$$,'actual execution writes the existing workspace note and binding');
SET CONSTRAINTS work_order_execution_required IMMEDIATE;
SET CONSTRAINTS work_order_execution_required DEFERRED;
SELECT is(pg_temp.execution_save(),(SELECT workspace_entry_id FROM public.work_order_execution_bindings WHERE request_id=pg_temp.k(81)),'lost actual-execution response reuses the same revision');
SELECT is((SELECT count(*)::integer FROM public.project_workspace_entries WHERE entry_id=pg_temp.k(31)),1,'execution retry creates no second workspace note');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(31) AND event_type='work_order.execution_saved'),1,'execution retry creates one internal event');
SELECT is((SELECT actual_start FROM public.work_order_execution_bindings),DATE '2026-10-08','actual date stays in week 41');
SELECT is((SELECT p.planned_start FROM public.work_order_plan_versions p JOIN public.work_order_execution_bindings b ON b.plan_version_id=p.id),DATE '2026-09-21','frozen plan stays in week 39');
SELECT is((SELECT actual_method FROM public.work_order_execution_bindings),'Synthetic actual method','actual method is not overwritten by planned method');
SELECT is((SELECT membership_snapshot->>'projectRole' FROM public.work_order_execution_bindings),'field','actual performer gets a historical membership assessment');
SELECT is((SELECT created_by FROM public.work_order_execution_bindings),pg_temp.k(1),'recording actor is distinct from actual performer');
SELECT is((SELECT performed_by_id FROM public.work_order_execution_bindings),pg_temp.k(2),'performer identity is distinct from plan responsibility and recorder');
SELECT throws_ok($$SELECT pg_temp.execution_save(0,81,pg_temp.execution()||'{"method":"Changed retry"}')$$,'22023',NULL,'actual retry key rejects changed payload');
SELECT throws_ok($$SELECT pg_temp.execution_save(0,82)$$,'PT409',NULL,'stale actual revision cannot overwrite');
SELECT throws_ok($$SELECT pg_temp.execution_save(1,82,pg_temp.execution()||'{"correctionReason":"Synthetic change","deviation":"Synthetic different reach"}')$$,'22023',NULL,'deviation requires explicit reason');
SELECT throws_ok($$SELECT pg_temp.execution_save(1,82,pg_temp.execution()||'{"correctionReason":"Synthetic change"}',3)$$,'22023',NULL,'reader cannot become a new actual performer');
SELECT lives_ok($$SELECT pg_temp.execution_save(1,82,pg_temp.execution()||'{"correctionReason":"Synthetic correction","deviation":"Synthetic different reach"}',2,'Synthetic access restriction')$$,'actual deviation can be recorded with visible missing-attachment gap');
SELECT ok((SELECT 'deviation_attachment_missing'=ANY(documentation_gaps) FROM public.work_order_execution_bindings WHERE version=2),'missing deviation attachment is explicit, never approval');
SELECT throws_ok($$SELECT pg_temp.raw_execution()$$,'23514',NULL,'direct Data API cannot save a work-order execution without its plan binding');
SELECT throws_ok($$SELECT pg_temp.raw_execution(true)$$,'23514',NULL,'membership removal before deferred validation cannot hide the required binding');
SELECT is((SELECT count(*)::integer FROM public.project_members WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(1)),1,'failed deferred validation rolls back membership removal too');
SELECT is((SELECT count(*)::integer FROM public.project_workspace_entries WHERE entry_id=pg_temp.k(31)),2,'failed raw execution leaves no unbound workspace revision');
SELECT lives_ok($$SELECT pg_temp.save(4,83,pg_temp.plan(),31,11,21,'Synthetic later plan')$$,'later plan is appended after actual execution');
SELECT is((SELECT count(*)::integer FROM public.work_order_execution_bindings WHERE plan_version=4),2,'later plan does not relink historical execution');
SELECT throws_ok($$SELECT pg_temp.execution_save(2,84,pg_temp.execution()||'{"correctionReason":"Synthetic stale plan"}')$$,'PT409',NULL,'open old plan cannot silently acquire later plan content');
SELECT throws_ok($$INSERT INTO public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id,version,plan_version_id,plan_version,performed_by_id,deviation_reason,documentation_gaps,coverage,request_id)
 SELECT workspace_entry_id,action_id,organization_id,project_id,version,plan_version_id,plan_version,performed_by_id,'',ARRAY[]::text[],coverage,pg_temp.k(87) FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31) AND version=1$$,'PT409','Plan changed; reopen before saving execution','raw binding cannot bypass the current plan check');
SELECT is(pg_temp.execution_save(),(SELECT workspace_entry_id FROM public.work_order_execution_bindings WHERE request_id=pg_temp.k(81)),'committed retry stays idempotent even after a newer plan');
-- Removing a member must not erase or rewrite who did the recorded work.
RESET ROLE;
DELETE FROM public.project_members WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.execution_save(2,84,pg_temp.execution()||'{"correctionReason":"Synthetic historical correction"}',2,'',31,5)$$,'correction may preserve the prior historical performer after removal');
SELECT is((SELECT membership_snapshot->>'basis' FROM public.work_order_execution_bindings WHERE version=3),'historical','retained membership is explicitly historical, not current access');
SELECT is((SELECT membership_snapshot->>'basis' FROM public.work_order_execution_bindings WHERE version=1),'current','first membership assessment is immutable');
SELECT throws_ok($$SELECT pg_temp.execution_save(0,85,pg_temp.execution(),2,'',33,1)$$,'22023',NULL,'removed performer cannot be newly assigned to a different execution');
SELECT is((SELECT count(*)::integer FROM public.project_workspace_entries WHERE entry_id=pg_temp.k(33)),0,'invalid performer rolls back the workspace write');
-- Binding audit failure must roll back the otherwise valid execution note too.
RESET ROLE;
CREATE FUNCTION pg_temp.fail_execution_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic execution audit failure' USING ERRCODE='P0001';END $$;
CREATE TRIGGER synthetic_execution_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW WHEN(NEW.event_type='work_order.execution_saved') EXECUTE FUNCTION pg_temp.fail_execution_audit();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT pg_temp.execution_save(0,85,pg_temp.execution(),1,'',33,1)$$,'P0001',NULL,'audit error rejects execution note and binding atomically');
SELECT is((SELECT count(*)::integer FROM public.project_workspace_entries WHERE entry_id=pg_temp.k(33)),0,'audit error leaves no partial workspace execution');
SELECT is((SELECT count(*)::integer FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(33)),0,'audit error leaves no partial plan binding');
RESET ROLE;
DROP TRIGGER synthetic_execution_audit_failure ON public.audit_events;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.execution_save(0,85,pg_temp.execution(),1,'',33,1)$$,'execution retry succeeds after rollback with the original request');
SET CONSTRAINTS work_order_execution_required IMMEDIATE;
SET CONSTRAINTS work_order_execution_required DEFERRED;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT is((SELECT count(*)::integer FROM public.get_work_order_plan_history(pg_temp.k(35),pg_temp.k(11),pg_temp.k(21),NULL,1)),0,'legacy project reader retains real empty-plan read on an existing action');
SELECT throws_ok($$SELECT pg_temp.execution_save(3,86,pg_temp.execution(),1,'',31,5)$$,'42501',NULL,'viewer cannot save work-order execution');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(6)::text,true);
SELECT is((SELECT count(*)::integer FROM public.work_order_execution_bindings),0,'another tenant cannot enumerate execution bindings');
SELECT throws_ok($$SELECT * FROM public.get_work_order_execution_binding(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),pg_temp.k(81))$$,'42501',NULL,'another tenant cannot fetch by guessed execution reference');
SELECT * FROM finish();
ROLLBACK;
