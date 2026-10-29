-- Synthetic fixtures only, disposable local/CI database. No Auth API, email or file bytes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.k(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('dd010000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 SELECT '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated','synthetic-work-order-'||n||'@example.test','',now(),'{"provider":"email"}','{"role":"admin","can_review":true}',now(),now() FROM generate_series(1,7) n;
INSERT INTO public.organizations(id,name,type,country) VALUES(pg_temp.k(11),'Synthetic work-order organization A','test','Denmark'),(pg_temp.k(12),'Synthetic work-order organization B','test','Denmark');
INSERT INTO public.organization_memberships(organization_id,user_id,role) SELECT pg_temp.k(11),pg_temp.k(n),'viewer' FROM generate_series(1,5) n;
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(pg_temp.k(11),pg_temp.k(7),'viewer'),(pg_temp.k(12),pg_temp.k(6),'owner');
INSERT INTO public.projects(id,organization_id,name) VALUES(pg_temp.k(21),pg_temp.k(11),'Synthetic assigned project'),(pg_temp.k(22),pg_temp.k(11),'Synthetic other project A'),(pg_temp.k(23),pg_temp.k(12),'Synthetic other organization project');
INSERT INTO public.project_members(project_id,user_id,role) VALUES(pg_temp.k(21),pg_temp.k(1),'project_manager'),(pg_temp.k(21),pg_temp.k(2),'field'),(pg_temp.k(21),pg_temp.k(3),'viewer'),(pg_temp.k(21),pg_temp.k(4),'external'),(pg_temp.k(21),pg_temp.k(5),'editor');
INSERT INTO public.actions(id,project_id,title,action_type) VALUES(pg_temp.k(31),pg_temp.k(21),'Synthetic assigned action',null),(pg_temp.k(32),pg_temp.k(21),'Synthetic unassigned action',null),(pg_temp.k(33),pg_temp.k(22),'Synthetic other project action',null),(pg_temp.k(34),pg_temp.k(23),'Synthetic other tenant action',null),(pg_temp.k(35),pg_temp.k(21),'Synthetic uninitialized action',null),(pg_temp.k(36),pg_temp.k(21),'Synthetic follow-up suggestion','workflow_followup');
INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES(pg_temp.k(91),'project-media',pg_temp.k(21)::text||'/synthetic-work-order.png','{"mimetype":"image/png","size":3}');

CREATE FUNCTION pg_temp.init(a integer DEFAULT 31,req integer DEFAULT 41,org integer DEFAULT 11,proj integer DEFAULT 21) RETURNS uuid LANGUAGE sql AS $$
 SELECT action_id FROM public.initialize_work_order(pg_temp.k(a),pg_temp.k(org),pg_temp.k(proj),0,pg_temp.k(req))
$$;
CREATE FUNCTION pg_temp.access_write(u integer DEFAULT 4,ver integer DEFAULT 0,req integer DEFAULT 61,p_active boolean DEFAULT true,p_execute boolean DEFAULT true,p_review boolean DEFAULT false,p_reason text DEFAULT 'Synthetic assignment',a integer DEFAULT 31,org integer DEFAULT 11,proj integer DEFAULT 21) RETURNS uuid LANGUAGE sql AS $$
 SELECT id FROM public.save_work_order_access(pg_temp.k(a),pg_temp.k(org),pg_temp.k(proj),pg_temp.k(u),ver,p_active,p_execute,p_review,p_reason,pg_temp.k(req))
$$;

SELECT ok(NOT has_table_privilege('anon','public.work_orders','SELECT'),'T01 anonymous task read is absent');
SELECT ok(NOT has_table_privilege('authenticated','public.work_orders','UPDATE'),'identity cannot be overwritten through Data API');
SELECT ok(NOT has_table_privilege('authenticated','public.work_order_access_versions','DELETE'),'capability history cannot be deleted through Data API');
SELECT ok(NOT has_function_privilege('anon','public.get_work_order_access(uuid,uuid)','EXECUTE'),'anonymous authority RPC is absent');
SELECT ok(NOT has_function_privilege('service_role','public.save_work_order_access(uuid,uuid,uuid,uuid,integer,boolean,boolean,boolean,text,uuid)','EXECUTE'),'background service cannot assign task authority');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.save_work_order_access(uuid,uuid,uuid,uuid,integer,boolean,boolean,boolean,text,uuid)'::regprocedure),'mutation RPC remains security invoker');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.init()$$,'manager initializes an existing action without creating another project');
SELECT is(pg_temp.init(),pg_temp.k(31),'identical creation retry returns the same identity');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(31) AND event_type='work_order.created'),1,'T09 creation retry writes one internal audit event');
SELECT throws_ok($$SELECT pg_temp.init(32,41)$$,'22023',NULL,'request key cannot create a different action');
SELECT throws_ok($$SELECT pg_temp.init(31,42)$$,'40001',NULL,'another initialization key cannot replace identity');
SELECT throws_ok($$SELECT pg_temp.init(35,43,12,21)$$,'23503',NULL,'organization and project binding is a database foreign key');
SELECT throws_ok($$SELECT pg_temp.init(33,43,11,21)$$,'23503',NULL,'action and project binding is a database foreign key');
SELECT throws_ok($$SELECT pg_temp.init(33,43,11,22)$$,'42501',NULL,'same organization does not grant another project');
SELECT throws_ok($$SELECT pg_temp.init(36,44)$$,'22023',NULL,'follow-up suggestion is not silently converted into performed work');
SELECT throws_ok($$INSERT INTO public.work_orders(action_id,organization_id,project_id,request_id,created_by) VALUES(pg_temp.k(35),pg_temp.k(11),pg_temp.k(21),pg_temp.k(45),pg_temp.k(2))$$,'42501',NULL,'raw Data API cannot spoof the creation actor');
SELECT lives_ok($$SELECT pg_temp.init(32,46)$$,'second task is independently initialized');
SELECT ok(NOT (SELECT can_review FROM public.get_work_order_access(pg_temp.k(31),pg_temp.k(21))),'manager is not implicitly a professional reviewer');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(6)::text,true);
SELECT lives_ok($$SELECT pg_temp.init(34,47,12,23)$$,'other tenant owner initializes own task');
SELECT is((SELECT count(*)::integer FROM public.work_orders),1,'other tenant sees only own task');
SELECT throws_ok($$SELECT * FROM public.get_work_order_access(pg_temp.k(31),pg_temp.k(21))$$,'42501',NULL,'other tenant authority query is denied');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT is((SELECT count(*)::integer FROM public.work_orders),0,'external role gets no tasks before assignment');
SELECT ok(NOT private.can_read_project(pg_temp.k(21)),'user metadata admin flag cannot grant project access');
SELECT throws_ok($$SELECT * FROM public.get_work_order_access(pg_temp.k(31),pg_temp.k(21))$$,'42501',NULL,'unassigned task authority is unavailable');
SELECT throws_ok($$SELECT pg_temp.init(35,48)$$,'42501',NULL,'external user cannot create task identity');
SELECT ok(NOT private.is_work_order_member(pg_temp.k(22),pg_temp.k(1)),'membership helper cannot probe another user in an inaccessible project');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.access_write()$$,'manager assigns execution on a concrete task');
SELECT is(pg_temp.access_write(),(SELECT id FROM public.work_order_access_versions WHERE request_id=pg_temp.k(61)),'identical assignment retry reuses one capability revision');
SELECT is((SELECT count(*)::integer FROM public.work_order_access_versions),1,'one assignment revision remains');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(31) AND event_type='work_order.access_changed'),1,'T11 assignment produces one internal event and no send action');
SELECT is((SELECT after_data->>'requestId' FROM public.audit_events WHERE entity_id=pg_temp.k(31) AND event_type='work_order.access_changed'),pg_temp.k(61)::text,'audit carries the mutation correlation without credentials');
SELECT is((SELECT actor FROM public.audit_events WHERE entity_id=pg_temp.k(31) AND event_type='work_order.access_changed'),pg_temp.k(1)::text,'audit actor is the authenticated manager');
SELECT throws_ok($$SELECT pg_temp.access_write(4,0,62)$$,'40001',NULL,'stale assignment is rejected');
SELECT throws_ok($$SELECT pg_temp.access_write(4,0,61,true,true,true)$$,'22023',NULL,'same key with changed authority is rejected');
SELECT throws_ok($$SELECT pg_temp.access_write(6,0,63)$$,'22023',NULL,'cannot assign someone from another tenant');
SELECT throws_ok($$SELECT pg_temp.access_write(7,0,63)$$,'22023',NULL,'organization membership alone is not task membership');
SELECT throws_ok($$SELECT pg_temp.access_write(3,0,64)$$,'22023',NULL,'viewer cannot silently become an executor');
SELECT lives_ok($$SELECT pg_temp.access_write(3,0,64,true,false,true)$$,'explicit reviewer capability is distinct from execution');
SELECT throws_ok($$SELECT pg_temp.access_write(4,1,65,true,true,false,'Synthetic cross-scope',31,12,21)$$,'42501',NULL,'RPC rejects a mismatched tenant even within a readable project');
SELECT throws_ok($$INSERT INTO public.work_order_access_versions(action_id,organization_id,project_id,user_id,version,active,can_execute,can_review,reason,request_id) VALUES(pg_temp.k(31),pg_temp.k(12),pg_temp.k(21),pg_temp.k(4),2,true,true,false,'Synthetic wrong tenant',pg_temp.k(65))$$,'23503',NULL,'raw Data API cannot bypass the composite scope FK');
SELECT throws_ok($$UPDATE public.work_order_access_versions SET can_review=true WHERE request_id=pg_temp.k(61)$$,'42501',NULL,'raw update cannot replace a capability');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(5)::text,true);
SELECT throws_ok($$SELECT pg_temp.access_write(5,0,66,true,false,true)$$,'42501',NULL,'content editor cannot grant themselves review authority');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(31)),'unassigned field role cannot execute an operational task');
SELECT throws_ok($$SELECT pg_temp.access_write(2,0,66)$$,'42501',NULL,'field user cannot self-assign by direct RPC');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT is((SELECT count(*)::integer FROM public.work_orders),1,'external assignment reveals exactly one task identity');
SELECT ok(private.can_execute_work_order(pg_temp.k(31)),'assigned external executor has task-specific capability');
SELECT ok(NOT private.can_read_work_order(pg_temp.k(32)),'same-project unassigned task remains hidden');
SELECT ok(NOT private.can_review_work_order(pg_temp.k(31)),'execution assignment does not grant review');
SELECT ok(NOT private.can_read_project(pg_temp.k(21)),'task assignment does not grant project-wide access');
SELECT is((SELECT count(*)::integer FROM public.actions),0,'legacy action table is not opened by task assignment');
SELECT is((SELECT count(*)::integer FROM storage.objects WHERE id=pg_temp.k(91)),0,'private Storage metadata remains unavailable without file-scoped authorization');
SELECT is((SELECT user_id FROM public.get_work_order_access(pg_temp.k(31),pg_temp.k(21))),pg_temp.k(4),'returned authority belongs to the actual caller');
SELECT ok(NOT (SELECT can_plan OR can_manage_access FROM public.get_work_order_access(pg_temp.k(31),pg_temp.k(21))),'executor cannot plan or administer task permissions');
SELECT throws_ok($$SELECT * FROM public.get_work_order_access(pg_temp.k(32),pg_temp.k(21))$$,'42501',NULL,'guessed unassigned ID remains unavailable');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT ok(private.can_review_work_order(pg_temp.k(31)),'explicit reviewer capability is recognized');
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(31)),'review does not confer execution');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.access_write(4,1,67,false,false,false,'Assignment revoked')$$,'manager records revocation as a new version');
SELECT is((SELECT count(*)::integer FROM public.work_order_access_versions WHERE user_id=pg_temp.k(4)),2,'revocation preserves assignment history');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(31)),'revocation is effective on the next request');
SELECT is((SELECT count(*)::integer FROM public.work_orders),0,'revoked external user loses task identity access');
SELECT throws_ok($$SELECT * FROM public.get_work_order_access(pg_temp.k(31),pg_temp.k(21))$$,'42501',NULL,'revoked user cannot mint fresh authority');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.access_write(2,0,68)$$,'manager assigns field worker');
DELETE FROM public.project_members WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(2);
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(31)),'removing project membership invalidates a still-active capability');
SELECT throws_ok($$SELECT * FROM public.get_work_order_access(pg_temp.k(31),pg_temp.k(21))$$,'42501',NULL,'removed field member cannot read task via authority RPC');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.access_write(2,1,69,false,false,false,'Member removed')$$,'manager can revoke history after member removal');

-- T09: failure in the audit part must roll back the capability too.
RESET ROLE;
CREATE FUNCTION pg_temp.fail_task_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure' USING ERRCODE='P0001'; END $$;
CREATE TRIGGER synthetic_work_order_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW WHEN(NEW.event_type='work_order.access_changed') EXECUTE FUNCTION pg_temp.fail_task_audit();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT pg_temp.access_write(4,0,70,true,true,false,'Synthetic rollback',32)$$,'P0001',NULL,'audit failure rejects the complete domain mutation');
SELECT is((SELECT count(*)::integer FROM public.work_order_access_versions WHERE action_id=pg_temp.k(32)),0,'no partial access revision remains after audit failure');
RESET ROLE;
DROP TRIGGER synthetic_work_order_audit_failure ON public.audit_events;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.access_write(4,0,70,true,true,false,'Synthetic rollback',32)$$,'retry succeeds after rollback using the original request key');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(32) AND event_type='work_order.access_changed'),1,'one atomic event exists after retry');
SELECT * FROM finish();
ROLLBACK;
