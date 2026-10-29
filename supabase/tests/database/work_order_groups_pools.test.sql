-- Synthetic fixtures only. No Auth API, invitation, email, SMS or file bytes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.k(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('dd040000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 SELECT '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated','synthetic-groups-pools-'||n||'@example.test','',now(),'{"provider":"email"}','{"role":"admin"}',now(),now() FROM generate_series(1,8)n;
INSERT INTO public.organizations(id,name,type,country) VALUES(pg_temp.k(11),'Synthetic crew organization A','test','Denmark'),(pg_temp.k(12),'Synthetic crew organization B','test','Denmark');
INSERT INTO public.organization_memberships(organization_id,user_id,role) SELECT pg_temp.k(11),pg_temp.k(n),'viewer' FROM generate_series(1,8)n WHERE n<>6;
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(pg_temp.k(12),pg_temp.k(6),'owner');
INSERT INTO public.projects(id,organization_id,name) VALUES(pg_temp.k(21),pg_temp.k(11),'Synthetic crew project'),(pg_temp.k(22),pg_temp.k(11),'Synthetic other crew project'),(pg_temp.k(23),pg_temp.k(12),'Synthetic foreign crew project');
INSERT INTO public.project_members(project_id,user_id,role) VALUES(pg_temp.k(21),pg_temp.k(1),'project_manager'),(pg_temp.k(21),pg_temp.k(2),'field'),(pg_temp.k(21),pg_temp.k(3),'external'),(pg_temp.k(21),pg_temp.k(4),'external'),(pg_temp.k(21),pg_temp.k(5),'viewer'),(pg_temp.k(22),pg_temp.k(7),'project_manager');
INSERT INTO public.actions(id,project_id,title) SELECT pg_temp.k(n),pg_temp.k(21),'Synthetic crew action '||n FROM generate_series(31,36)n;
CREATE TEMP TABLE plan_refs(action_id uuid PRIMARY KEY,plan_id uuid NOT NULL);
GRANT SELECT,INSERT ON plan_refs TO authenticated;
CREATE FUNCTION pg_temp.plan() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT '{"schema":"freyra.work-order-plan/v1","title":"Synthetic crew plan","description":"","instructions":"Synthetic safe work instruction","profile":"general","responsibleId":null,"siteId":null,"watercourseVersionId":null,"locationNote":"Synthetic place","plannedStart":null,"plannedEnd":null,"priority":null,"plannedMethod":null,"watercourse":null}'::jsonb $$;
CREATE FUNCTION pg_temp.group_save(ver integer DEFAULT 0,req integer DEFAULT 61,members integer[] DEFAULT ARRAY[2,3],g integer DEFAULT 51,active boolean DEFAULT true,reason text DEFAULT '',proj integer DEFAULT 21,org integer DEFAULT 11)
RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.save_work_order_group(pg_temp.k(g),pg_temp.k(org),pg_temp.k(proj),ver,'Synthetic crew',active,ARRAY(SELECT pg_temp.k(m) FROM unnest(members)m),reason,pg_temp.k(req)) $$;
CREATE FUNCTION pg_temp.assign(ver integer DEFAULT 0,req integer DEFAULT 71,a integer DEFAULT 31,mode text DEFAULT 'group',members integer[] DEFAULT ARRAY[2,3],g integer DEFAULT 51,group_ver integer DEFAULT 1)
RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.configure_work_order_assignment(pg_temp.k(a),pg_temp.k(11),pg_temp.k(21),ver,(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(a) ORDER BY version DESC LIMIT 1),mode,ARRAY(SELECT pg_temp.k(m) FROM unnest(members)m),(SELECT id FROM public.work_order_group_versions WHERE group_id=pg_temp.k(g) AND version=group_ver),'Synthetic operational assignment',pg_temp.k(req)) $$;
CREATE FUNCTION pg_temp.claim(ver integer DEFAULT 1,req integer DEFAULT 81,a integer DEFAULT 32)
RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.claim_work_order_pool(pg_temp.k(a),pg_temp.k(11),pg_temp.k(21),ver,(SELECT plan_id FROM pg_temp.plan_refs WHERE action_id=pg_temp.k(a)),pg_temp.k(req)) $$;
CREATE FUNCTION pg_temp.execution(a integer DEFAULT 31,expected integer DEFAULT 0,assignment_ver integer DEFAULT 1,req integer DEFAULT 91)
RETURNS uuid LANGUAGE sql AS $$ SELECT workspace_entry_id FROM public.save_work_order_execution(pg_temp.k(a),pg_temp.k(11),pg_temp.k(21),(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(a) ORDER BY version DESC LIMIT 1),1,expected,
 jsonb_build_object('schema','freyra.action-execution/v1','actionId',pg_temp.k(a),'surveyRoundId',NULL,'dataBasis','synthetic','workType','other','stage','performed','actualDate','2026-10-08','actualEndDate',NULL,'method','Synthetic actual method','reach','Synthetic reach','performedBy','Synthetic external worker','sourceReference','Synthetic work log','evidenceIds','[]'::jsonb,'deviation','','correctionReason',CASE WHEN expected>0 THEN 'Synthetic factual correction' ELSE '' END,'coverage','limited','coverageDescription','Synthetic limited coverage'),pg_temp.k(3),'',pg_temp.k(req),
 (SELECT id FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(a) AND version=assignment_ver),assignment_ver) $$;

SELECT ok(NOT has_table_privilege('anon','public.work_order_group_versions','SELECT'),'anonymous group read is absent');
SELECT ok(NOT has_table_privilege('authenticated','public.work_order_assignment_versions','UPDATE'),'assignments cannot be overwritten');
SELECT ok(NOT has_table_privilege('authenticated','public.work_order_group_versions','DELETE'),'group history cannot be deleted');
SELECT ok(NOT has_function_privilege('service_role','public.claim_work_order_pool(uuid,uuid,uuid,integer,uuid,uuid)','EXECUTE'),'background service cannot claim a pool task');
SELECT ok(NOT has_function_privilege('anon','public.list_my_work_orders(uuid,integer)','EXECUTE'),'anonymous task listing is absent');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT public.save_work_order_plan(pg_temp.k(n),pg_temp.k(11),pg_temp.k(21),0,pg_temp.plan(),'',pg_temp.k(n+100)) FROM generate_series(31,36)n$$,'all plans reuse the existing action/project identity');
INSERT INTO pg_temp.plan_refs SELECT action_id,id FROM public.work_order_plan_versions WHERE project_id=pg_temp.k(21);
SELECT lives_ok($$SELECT pg_temp.group_save()$$,'manager saves a group with current membership assessments');
SELECT is(pg_temp.group_save(),(SELECT id FROM public.work_order_group_versions WHERE request_id=pg_temp.k(61)),'group retry returns the same revision');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(51) AND event_type='work_order.group_saved'),1,'group retry produces one internal event');
SELECT is((SELECT member_assessments->0->>'projectRole' FROM public.work_order_group_versions WHERE group_id=pg_temp.k(51)),'field','group stores the observed role without creating membership');
SELECT throws_ok($$SELECT pg_temp.group_save(0,62)$$,'PT409',NULL,'stale group version is a domain conflict');
SELECT throws_ok($$SELECT pg_temp.group_save(0,61,ARRAY[2,4])$$,'22023',NULL,'group idempotency key rejects changed roster');
SELECT throws_ok($$SELECT pg_temp.group_save(0,62,ARRAY[2,2],54)$$,'22023',NULL,'duplicate members are rejected');
SELECT throws_ok($$SELECT pg_temp.group_save(0,62,ARRAY[5],54)$$,'22023',NULL,'viewer is not a hidden executor');
SELECT throws_ok($$SELECT pg_temp.group_save(0,62,ARRAY[6],54)$$,'22023',NULL,'other tenant cannot enter the group');
SELECT throws_ok($$SELECT pg_temp.group_save(0,62,ARRAY[8],54)$$,'22023',NULL,'organization membership alone is insufficient');
SELECT throws_ok($$INSERT INTO public.work_order_group_versions(group_id,organization_id,project_id,version,name,active,member_ids,request_id) VALUES(pg_temp.k(54),pg_temp.k(12),pg_temp.k(21),1,'Synthetic foreign scope',true,ARRAY[pg_temp.k(2)],pg_temp.k(62))$$,'23503',NULL,'raw group write cannot bypass project/organization FK');
SELECT lives_ok($$SELECT pg_temp.group_save(0,62,ARRAY[]::integer[],54,false)$$,'archived empty group is represented explicitly');
SELECT is((SELECT array_agg(group_id) FROM public.list_work_order_groups(pg_temp.k(11),pg_temp.k(21),NULL,1)),ARRAY[pg_temp.k(51),pg_temp.k(54)],'group cursor includes one stable lookahead row');
SELECT is((SELECT count(*)::integer FROM public.list_work_order_people(pg_temp.k(11),pg_temp.k(21),NULL,50)),5,'people come from current project membership only');
SELECT is((SELECT can_execute FROM public.list_work_order_people(pg_temp.k(11),pg_temp.k(21),NULL,50) WHERE user_id=pg_temp.k(5)),false,'people selector reports viewer execution as false');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(7)::text,true);
SELECT lives_ok($$SELECT pg_temp.group_save(0,63,ARRAY[7],52,true,'',22)$$,'second project manager creates their own separate group');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(6)::text,true);
SELECT lives_ok($$SELECT pg_temp.group_save(0,64,ARRAY[6],53,true,'',23,12)$$,'other organization owner creates a separate group');
SELECT is((SELECT can_execute FROM public.list_work_order_people(pg_temp.k(12),pg_temp.k(23),NULL,50) WHERE user_id=pg_temp.k(6)),true,'implicit organization owner is selectable without a fabricated project role');
SELECT is((SELECT project_role FROM public.list_work_order_people(pg_temp.k(12),pg_temp.k(23),NULL,50) WHERE user_id=pg_temp.k(6)),NULL::text,'owner selector preserves the absence of explicit project membership');
SELECT is((SELECT count(*)::integer FROM public.work_order_group_versions),1,'other tenant sees only its group');
SELECT throws_ok($$SELECT * FROM public.list_work_order_groups(pg_temp.k(11),pg_temp.k(21),NULL,1)$$,'42501',NULL,'other tenant cannot enumerate project groups');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT pg_temp.assign(0,71,31,'group',ARRAY[2],52)$$,'22023',NULL,'same-organization foreign project group cannot be attached');
SELECT lives_ok($$SELECT pg_temp.assign()$$,'manager assigns the exact existing group version to the task');
SELECT is(pg_temp.assign(),(SELECT id FROM public.work_order_assignment_versions WHERE request_id=pg_temp.k(71)),'assignment retry returns identical membership assessment');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE event_type='work_order.assignment_configured' AND entity_id=pg_temp.k(31)),1,'assignment retry has one internal event');
SELECT throws_ok($$SELECT pg_temp.assign(0,72)$$,'PT409',NULL,'concurrent old assignment version is refused');
SELECT lives_ok($$SELECT pg_temp.assign(0,72,32,'pool',ARRAY[3,4],NULL)$$,'pool has a frozen explicit candidate roster');
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(32)),'unclaimed pool requires takeover even for the manager');
SELECT throws_ok($$SELECT pg_temp.execution(32)$$,'42501',NULL,'unclaimed pool cannot acquire a performed-work record');
SELECT lives_ok($$SELECT pg_temp.assign(0,73,33,'person',ARRAY[2],NULL)$$,'person assignment remains separate from plan responsibility');
SELECT lives_ok($$SELECT * FROM public.save_work_order_access(pg_temp.k(33),pg_temp.k(11),pg_temp.k(21),pg_temp.k(2),0,true,true,false,'Synthetic manual delegation',pg_temp.k(74))$$,'direct task capability remains independent and explicit');
SELECT throws_ok($$SELECT pg_temp.execution(31,0,0)$$,'PT409',NULL,'legacy missing assignment context cannot bind silently to current assignment');
SELECT lives_ok($$SELECT pg_temp.execution()$$,'actual execution freezes the exact group assignment');
SET CONSTRAINTS work_order_execution_required IMMEDIATE;
SET CONSTRAINTS work_order_execution_required DEFERRED;
SELECT is((SELECT assignment_version_id FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31)),(SELECT id FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(31) AND version=1),'execution binding has a scoped immutable assignment FK');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT ok(private.can_execute_work_order(pg_temp.k(31)),'assigned external member gets execution capability for its group task');
SELECT ok(private.can_read_work_order(pg_temp.k(32)),'pool candidate can read necessary plan before claiming');
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(32)),'pool candidacy alone is not execution');
SELECT is((SELECT count(*)::integer FROM public.list_my_work_orders(NULL,20)),2,'My tasks lists only group task and candidate pool');
SELECT is((SELECT count(*)::integer FROM public.projects),0,'task assignment does not open whole projects');
SELECT throws_ok($$SELECT pg_temp.group_save(1,65,ARRAY[2,3],51,true,'Synthetic self promotion')$$,'42501',NULL,'external executor cannot edit groups');
SELECT throws_ok($$SELECT pg_temp.assign(1,75)$$,'42501',NULL,'external executor cannot assign other people');
SELECT ok(NOT private.is_work_order_executor_member(pg_temp.k(22),pg_temp.k(7)),'executor cannot probe a foreign project member');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.group_save(1,65,ARRAY[2],51,true,'Synthetic member removed')$$,'group change is appended with a reason');
SELECT is((SELECT member_ids FROM public.work_order_group_versions WHERE group_id=pg_temp.k(51) AND version=1),ARRAY[pg_temp.k(2),pg_temp.k(3)],'group change preserves old roster');
SELECT is((SELECT performed_by_id FROM public.work_order_execution_bindings WHERE action_id=pg_temp.k(31)),pg_temp.k(3),'group change cannot rewrite the historical actual performer');
SELECT is((SELECT candidate_user_ids FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(31)),ARRAY[pg_temp.k(2),pg_temp.k(3)],'assignment membership assessment stays frozen');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(31)),'group removal revokes group-derived execution on the next request');
SELECT ok(NOT private.can_read_work_order(pg_temp.k(31)),'removed external group member cannot issue fresh plan reads');
SELECT is((SELECT count(*)::integer FROM public.list_my_work_orders(NULL,20)),1,'removed group task disappears from refreshed My tasks');
SELECT is((SELECT can_claim FROM public.list_my_work_orders(NULL,20)),true,'remaining pool still has an explicit claim action');
SELECT lives_ok($$SELECT pg_temp.claim()$$,'eligible candidate atomically claims the pool for themselves');
SELECT is(pg_temp.claim(),(SELECT id FROM public.work_order_assignment_versions WHERE request_id=pg_temp.k(81)),'claim retry returns the one committed claim');
SELECT ok(private.can_execute_work_order(pg_temp.k(32)),'claim grants concrete task execution through existing authority helper');
SELECT is((SELECT claimed_by FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(32) ORDER BY version DESC LIMIT 1),pg_temp.k(3),'pool owner is the authenticated claimant');
SELECT is((SELECT count(*)::integer FROM public.work_order_access_versions WHERE action_id=pg_temp.k(32)),0,'pool claim creates no duplicate capability store or implicit reviewer');
SELECT ok(NOT private.can_review_work_order(pg_temp.k(32)),'claim does not assign professional review');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT throws_ok($$SELECT * FROM public.claim_work_order_pool(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),1,(SELECT plan_id FROM pg_temp.plan_refs WHERE action_id=pg_temp.k(32)),pg_temp.k(82))$$,'PT409',NULL,'second candidate gets conflict instead of another owner');
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(32)),'losing candidate has no execution capability');
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(32)),0,'losing candidate cannot freshly download the claimed plan');
SELECT is((SELECT count(*)::integer FROM public.get_work_order_assignment_history(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),NULL,20)),2,'candidate can see claim bookkeeping without wider project access');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE event_type='work_order.pool_claimed' AND entity_id=pg_temp.k(32)),1,'claim retry and losing claim add no duplicate internal event');
SELECT lives_ok($$SELECT pg_temp.assign(2,76,32,'pool',ARRAY[4],NULL)$$,'manager can reopen a pool as a new explicit assignment');
SELECT is((SELECT claimed_by FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(32) AND version=2),pg_temp.k(3),'reopening preserves the historical pool owner');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT throws_ok($$SELECT pg_temp.claim()$$,'42501',NULL,'removed pool candidate cannot retrieve a fresh claim receipt');
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(32)),'reassignment revokes old pool-derived execution');

-- A viewer demotion invalidates even a still-active direct execution grant.
RESET ROLE;
UPDATE public.project_members SET role='viewer' WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(2);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT ok(NOT private.can_execute_work_order(pg_temp.k(33)),'current role demotion invalidates an old execution grant');
SELECT ok(NOT (SELECT can_execute FROM public.get_work_order_access(pg_temp.k(33),pg_temp.k(21))),'authority RPC returns the demoted current role');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(5)::text,true);
SELECT throws_ok($$SELECT pg_temp.claim(3,83)$$,'42501',NULL,'viewer cannot claim the pool using user metadata admin');
SELECT throws_ok($$SELECT * FROM public.list_my_work_orders(NULL,21)$$,'22023',NULL,'task list is explicitly bounded');

-- Atomic audit failure leaves no partial roster or assignment.
RESET ROLE;
CREATE FUNCTION pg_temp.fail_roster_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic roster audit failure' USING ERRCODE='P0001';END $$;
CREATE TRIGGER synthetic_roster_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW WHEN(NEW.event_type='work_order.assignment_configured') EXECUTE FUNCTION pg_temp.fail_roster_audit();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT pg_temp.assign(0,77,36,'person',ARRAY[4],NULL)$$,'P0001',NULL,'audit failure rejects the entire assignment');
SELECT is((SELECT count(*)::integer FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(36)),0,'audit failure leaves no partial assignment');
RESET ROLE;
DROP TRIGGER synthetic_roster_audit_failure ON public.audit_events;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($$SELECT pg_temp.assign(0,77,36,'person',ARRAY[4],NULL)$$,'assignment retry succeeds with its original request after rollback');
SELECT is((SELECT count(*)::integer FROM public.audit_events WHERE entity_id=pg_temp.k(36) AND event_type='work_order.assignment_configured'),1,'exactly one assignment event is committed');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(6)::text,true);
SELECT is((SELECT count(*)::integer FROM public.work_order_assignment_versions),0,'other tenant cannot enumerate assignments');
SELECT throws_ok($$SELECT * FROM public.get_work_order_assignment_history(pg_temp.k(31),pg_temp.k(11),pg_temp.k(21),NULL,1)$$,'42501',NULL,'other tenant guessed assignment history is denied');
SELECT * FROM finish();
ROLLBACK;
