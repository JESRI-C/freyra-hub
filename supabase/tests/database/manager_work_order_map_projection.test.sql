-- Synthetic fixtures; transaction always rolls back. No Auth API, messages,
-- provider calls or customer file bytes. Uses the existing mutation contracts.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.k(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('ee610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated',
  'synthetic-manager-map-'||n||'@example.test','',now(),'{"provider":"email"}',
  '{"role":"admin","can_review":true}',now(),now() FROM generate_series(1,8)n;
INSERT INTO public.organizations(id,name,type,country) VALUES
  (pg_temp.k(11),'Synthetic manager organization A','test','Denmark'),
  (pg_temp.k(12),'Synthetic manager organization B','test','Denmark');
INSERT INTO public.organization_memberships(organization_id,user_id,role)
SELECT pg_temp.k(11),pg_temp.k(n),CASE WHEN n=6 THEN 'owner' ELSE 'viewer' END
FROM generate_series(1,8)n WHERE n<>5;
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES(pg_temp.k(12),pg_temp.k(5),'owner');
INSERT INTO public.projects(id,organization_id,name) VALUES
  (pg_temp.k(21),pg_temp.k(11),'Synthetic Bykær'),
  (pg_temp.k(22),pg_temp.k(11),'Synthetic second managed project'),
  (pg_temp.k(23),pg_temp.k(11),'Synthetic unauthorized project'),
  (pg_temp.k(24),pg_temp.k(12),'Synthetic other municipality'),
  (pg_temp.k(25),pg_temp.k(11),'Synthetic empty managed project');
INSERT INTO public.project_members(project_id,user_id,role) VALUES
  (pg_temp.k(21),pg_temp.k(1),'project_manager'),(pg_temp.k(22),pg_temp.k(1),'admin'),
  (pg_temp.k(25),pg_temp.k(1),'project_manager'),
  (pg_temp.k(21),pg_temp.k(2),'field'),(pg_temp.k(21),pg_temp.k(3),'viewer'),
  (pg_temp.k(21),pg_temp.k(4),'editor'),(pg_temp.k(21),pg_temp.k(7),'external'),
  (pg_temp.k(23),pg_temp.k(8),'project_manager');
INSERT INTO public.actions(id,project_id,title,status,due_date) VALUES
  (pg_temp.k(31),pg_temp.k(21),'Synthetic uninitialized action','Åben','2026-11-10'),
  (pg_temp.k(32),pg_temp.k(21),'Synthetic person source title','Åben','2026-11-11'),
  (pg_temp.k(33),pg_temp.k(21),'Synthetic pool source title','Åben','2026-11-12'),
  (pg_temp.k(34),pg_temp.k(22),'Synthetic initialized without plan','Åben',NULL),
  (pg_temp.k(35),pg_temp.k(23),'Synthetic hidden same tenant','Åben','2026-11-10'),
  (pg_temp.k(36),pg_temp.k(24),'Synthetic hidden other tenant','Åben','2026-11-10'),
  (pg_temp.k(37),pg_temp.k(21),'Synthetic stale assignment source','Åben','2026-11-13'),
  (pg_temp.k(38),pg_temp.k(21),'Synthetic blocked source','Åben','2026-11-14'),
  (pg_temp.k(39),pg_temp.k(21),'Synthetic prerequisite source','Åben',NULL),
  (pg_temp.k(40),pg_temp.k(21),'Synthetic 50%_literal','Åben',NULL),
  (pg_temp.k(41),pg_temp.k(22),'Synthetic canonical status','Lukket',NULL);
INSERT INTO public.actions(id,project_id,title) VALUES
  ('fe600000-0000-0000-0000-000000000049',pg_temp.k(21),'Synthetic legacy recurrence identity');
INSERT INTO public.sites(id,project_id,name,geometry_geojson,centroid_lat,centroid_lng,status,archived_at) VALUES
  (pg_temp.k(51),pg_temp.k(21),'Synthetic northern bank','{"type":"Point","coordinates":[9.5,55.3]}',55.4,9.6,'active',NULL),
  (pg_temp.k(52),pg_temp.k(21),'Synthetic archived visit','{"type":"Point","coordinates":[9.51,55.31]}',NULL,NULL,'archived',now()),
  (pg_temp.k(53),pg_temp.k(21),'Synthetic unknown visit',NULL,NULL,NULL,'active',NULL),
  (pg_temp.k(54),pg_temp.k(21),'Synthetic malformed visit','{"type":"Point","coordinates":[999,55]}',NULL,NULL,'active',NULL),
  (pg_temp.k(55),pg_temp.k(23),'Synthetic foreign project site','{"type":"Point","coordinates":[9.9,56]}',NULL,NULL,'active',NULL);
UPDATE public.actions SET site_id=pg_temp.k(51) WHERE id IN (pg_temp.k(37),pg_temp.k(40));
INSERT INTO public.watercourse_versions(id,organization_id,project_id,version,geometry,crs,direction,source,length_m,method,created_by) VALUES
  (pg_temp.k(71),pg_temp.k(11),pg_temp.k(21),1,'{"type":"LineString","coordinates":[[9.7,55.3],[9.71,55.3]]}','EPSG:4326','unknown','Synthetic pinned centerline',1,'fixture',pg_temp.k(1)),
  (pg_temp.k(72),pg_temp.k(11),pg_temp.k(21),2,'{"type":"LineString","coordinates":[[9.8,55.3],[9.81,55.3]]}','EPSG:4326','unknown','Synthetic later centerline',1,'fixture',pg_temp.k(1));

CREATE FUNCTION pg_temp.page(
  status_filter text DEFAULT 'all',assignment_filter text DEFAULT 'all',assignee integer DEFAULT NULL,
  search_term text DEFAULT '',project_filter integer DEFAULT NULL,due_from date DEFAULT NULL,
  due_through date DEFAULT NULL,after_id uuid DEFAULT NULL,size integer DEFAULT 50,org integer DEFAULT 11,
  expected_token text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM public.list_manager_work_orders(pg_temp.k(org),pg_temp.k(project_filter),
    status_filter,assignment_filter,pg_temp.k(assignee),search_term,due_from,due_through,after_id,size,
    coalesce(expected_token,CASE WHEN after_id IS NULL THEN NULL ELSE(
      SELECT first_page->>'selectionToken' FROM public.list_manager_work_orders(pg_temp.k(org),pg_temp.k(project_filter),
        status_filter,assignment_filter,pg_temp.k(assignee),search_term,due_from,due_through,NULL,size,NULL) initial(first_page)
    )END)) result(value)
$$;
CREATE FUNCTION pg_temp.item(a integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT value FROM jsonb_array_elements(pg_temp.page()->'items') item(value)
  WHERE value->>'action_id'=pg_temp.k(a)::text
$$;
CREATE TEMP TABLE map_selection_token(token text NOT NULL);
GRANT SELECT,INSERT ON map_selection_token TO authenticated;
CREATE FUNCTION pg_temp.plan(title text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('schema','freyra.work-order-plan/v1','title',title,
    'description','','instructions','Synthetic field instruction','profile',CASE WHEN title='Synthetic planned task 33' THEN 'watercourse' ELSE 'general' END,
    'responsibleId',pg_temp.k(1),'siteId',CASE WHEN title='Synthetic revised plan' THEN NULL ELSE pg_temp.k(51) END,
    'watercourseVersionId',CASE WHEN title='Synthetic planned task 33' THEN pg_temp.k(71) ELSE NULL END,
    'visitStops',CASE WHEN title='Synthetic planned task 32' THEN jsonb_build_array(
      jsonb_build_object('siteId',pg_temp.k(52),'name','Synthetic archived visit'),
      jsonb_build_object('siteId',pg_temp.k(53),'name','Synthetic unknown visit'),
      jsonb_build_object('siteId',pg_temp.k(54),'name','Synthetic malformed visit')) ELSE '[]'::jsonb END,
    'locationNote','Synthetic north bank access','plannedStart','2026-11-20',
    'plannedEnd','2026-11-21','priority',NULL,'plannedMethod',NULL,'watercourse',CASE WHEN title='Synthetic planned task 33' THEN
    '{"name":null,"externalId":null,"regulationReference":null,"regulationVersion":null,"stationFromM":null,"stationToM":null,"stationDirection":"unknown","lengthM":null,"bottomWidthM":null,"measurementSource":null,"term":null}'::jsonb ELSE NULL END)
$$;
CREATE FUNCTION pg_temp.state(a integer,ver integer,req integer,op text DEFAULT 'transition',target text DEFAULT 'draft',extra jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.mutate_work_order_lifecycle(pg_temp.k(a),pg_temp.k(11),
    (SELECT project_id FROM public.actions WHERE id=pg_temp.k(a)),ver,
    jsonb_build_object('operation',op,'targetStatus',target,
      'planVersionId',(SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(a) ORDER BY version DESC LIMIT 1),
      'assignmentVersionId',(SELECT id FROM public.work_order_assignment_versions WHERE action_id=pg_temp.k(a) ORDER BY version DESC LIMIT 1),
      'executionRevisionId',NULL)||extra,pg_temp.k(req))
$$;

SELECT ok(NOT has_function_privilege('anon','public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer)','EXECUTE'),'anonymous manager endpoint is denied');
SELECT ok(NOT has_function_privilege('service_role','public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer)','EXECUTE'),'background service is not a manager actor');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer)'::regprocedure),'manager projection uses caller RLS');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT lives_ok($q$INSERT INTO public.project_workspace_entries(id,entry_id,organization_id,project_id,kind,version,title,payload)
  VALUES(pg_temp.k(81),pg_temp.k(82),pg_temp.k(11),pg_temp.k(21),'decision_note',1,'Synthetic source note',
  '{"basis":"Synthetic source","source":"synthetic-reference","decision":"Synthetic QA note","alternatives":"","uncertainty":"","owner":""}')$q$,
  'workflow metadata source uses the existing workspace contract');
SELECT lives_ok($q$SELECT public.save_workflow_followup_revision(pg_temp.k(42),pg_temp.k(11),pg_temp.k(21),0,'Synthetic workflow metadata',
  jsonb_build_object('basis','Synthetic source','source','workflow-followup:'||pg_temp.k(42)::text,'decision',jsonb_build_object(
  'schema','freyra.workflow-followup/v1','eventKey','synthetic-manager-overview-source','title','Synthetic workflow metadata',
  'reason','Synthetic QA issue','sourceIds',jsonb_build_array(pg_temp.k(81)::text),'status','proposed','assignee',NULL,
  'dueDate',NULL,'notes','','resolutionReason','')::text,'alternatives','','uncertainty','','owner',''))$q$,
  'workflow metadata fixture is created atomically through its own existing RPC');
SELECT lives_ok($$SELECT public.save_work_order_plan(pg_temp.k(n),pg_temp.k(11),pg_temp.k(21),0,
  pg_temp.plan('Synthetic planned task '||n),'',pg_temp.k(n+100)) FROM unnest(ARRAY[32,33,37,38,39])n$$,'ordinary plans use existing work-order identities');
SELECT lives_ok($$SELECT * FROM public.initialize_work_order(pg_temp.k(34),pg_temp.k(11),pg_temp.k(22),0,pg_temp.k(134))$$,'an initialized work order may still have no plan');
SELECT lives_ok($$SELECT * FROM public.initialize_work_order(pg_temp.k(41),pg_temp.k(11),pg_temp.k(22),0,pg_temp.k(141))$$,'canonical lifecycle fixture uses the normal identity endpoint');
SELECT lives_ok($$SELECT * FROM public.configure_work_order_assignment(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),0,
  (SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(32)),
  'person',ARRAY[pg_temp.k(2)],NULL,'Synthetic distinct field performer',pg_temp.k(232))$$,'actual person assignment differs from plan responsibility');
SELECT lives_ok($$SELECT * FROM public.configure_work_order_assignment(pg_temp.k(33),pg_temp.k(11),pg_temp.k(21),0,
  (SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(33)),
  'pool',ARRAY[pg_temp.k(2),pg_temp.k(4)],NULL,'Synthetic candidate pool',pg_temp.k(233))$$,'unclaimed pool has two actual candidates');
SELECT lives_ok($$SELECT * FROM public.configure_work_order_assignment(pg_temp.k(37),pg_temp.k(11),pg_temp.k(21),0,
  (SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(37)),
  'person',ARRAY[pg_temp.k(2)],NULL,'Synthetic later stale assignment',pg_temp.k(237))$$,'stale assignment starts as an ordinary current assignment');
SELECT lives_ok($$SELECT * FROM public.save_work_order_plan(pg_temp.k(37),pg_temp.k(11),pg_temp.k(21),1,
  pg_temp.plan('Synthetic revised plan'), 'Synthetic instruction changed',pg_temp.k(337))$$,'new plan preserves the preceding assignment history');
SELECT lives_ok($$SELECT pg_temp.state(38,0,438)$$,'first canonical state is explicit draft');
SELECT lives_ok($$SELECT pg_temp.state(38,1,538,'block',NULL,jsonb_build_object('blockReason','Synthetic gate closed',
  'blockOwnerId',pg_temp.k(1),'blockNextAction','Synthetic arrange access','blockDueDate','2026-11-15'))$$,'waiting includes explicit blocking');
SELECT lives_ok($$SELECT public.save_work_order_prerequisites(pg_temp.k(39),pg_temp.k(11),pg_temp.k(21),0,ARRAY[pg_temp.k(32)],pg_temp.k(439))$$,'waiting also includes existing prerequisites');
SELECT lives_ok($$SELECT pg_temp.state(41,0,441)$$,'canonical status is independent from legacy action status');
SELECT lives_ok($$SELECT pg_temp.state(41,1,541,'transition','cancelled','{"reason":"Synthetic cancellation"}')$$,'latest canonical lifecycle version is used');
SELECT lives_ok($$SELECT * FROM public.save_work_order_access(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),pg_temp.k(7),0,true,false,true,'Synthetic scoped professional review',pg_temp.k(632))$$,'review capability remains task-scoped');

SELECT is(jsonb_array_length(pg_temp.page()->'items'),10,'manager sees ordinary actions in both managed projects including no-plan legacy actions');
SELECT is(jsonb_array_length(pg_temp.page()->'projects'),3,'catalog includes the empty managed project and excludes unauthorized projects');
SELECT is(jsonb_array_length(pg_temp.page()->'assignees'),2,'assignee catalog includes candidates independently of page filters');
SELECT is(pg_temp.item(31)->'initialized','false'::jsonb,'uninitialized action remains visible');
SELECT is(pg_temp.item(31)->'task_status','null'::jsonb,'legacy action does not invent a canonical status');
SELECT is(pg_temp.item(34)->'plan_version_id','null'::jsonb,'initialized work order without a plan remains visible');
SELECT is(pg_temp.item(32)->>'title','Synthetic planned task 32','latest plan title is displayed');
SELECT is(pg_temp.item(32)->>'site_name','Synthetic northern bank','place comes from the same current plan');
SELECT is(pg_temp.item(32)->>'planned_start','2026-11-20','plan start stays distinct from the action deadline');
SELECT is(pg_temp.item(32)->>'due_date','2026-11-11','deadline remains the existing action deadline');
SELECT is(pg_temp.item(32)->>'plan_responsible_id',pg_temp.k(1)::text,'plan responsibility remains explicit');
SELECT is(pg_temp.item(32)->'candidate_user_ids',jsonb_build_array(pg_temp.k(2)),'actual field assignment remains distinct');
SELECT is(pg_temp.item(37)->'assignment_is_current','false'::jsonb,'latest assignment on an old plan is marked stale');
SELECT is(pg_temp.item(37)->>'title','Synthetic revised plan','latest plan is used even when old assignment remains');
SELECT is(pg_temp.item(41)->>'legacy_status','Lukket','legacy state is preserved as source data');
SELECT is(pg_temp.item(41)->>'task_status','cancelled','latest canonical lifecycle overrides no raw source field');
SELECT is(pg_temp.item(38)->'blocked','true'::jsonb,'explicit canonical blocking is visible');
SELECT is(pg_temp.item(39)->'waiting_for_prerequisites','true'::jsonb,'unready prerequisites project a boolean without prerequisite identities');
SELECT is(pg_temp.item(35),NULL::jsonb,'same-tenant project outside manager authority is absent');
SELECT is(pg_temp.item(36),NULL::jsonb,'other tenant is absent');
SELECT is(pg_temp.item(42),NULL::jsonb,'workflow followup metadata is not a normal task');
SELECT ok(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.page()->'items')item WHERE item->>'action_id'='fe600000-0000-0000-0000-000000000049'),'historical hash UUID identity is not lost');

SELECT is(jsonb_array_length(pg_temp.page('waiting')->'items'),2,'waiting filter includes explicit block and prerequisite wait');
SELECT is(jsonb_array_length(pg_temp.page('cancelled')->'items'),1,'canonical status filter runs before pagination');
SELECT is(jsonb_array_length(pg_temp.page('all','person')->'items'),2,'assignment filter includes stale assignments visibly');
SELECT is(jsonb_array_length(pg_temp.page('all','unassigned')->'items'),7,'no assignment and no plan both appear as unassigned');
SELECT is(jsonb_array_length(pg_temp.page('all','all',1)->'items'),0,'responsible manager is not silently treated as the actual assignee');
SELECT is(jsonb_array_length(pg_temp.page('all','all',2)->'items'),3,'assignee filter includes person and pool candidate assignments');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'50%_')->'items'),1,'wildcard search characters are literal');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'  SYNTHETIC REVISED  ')->'items'),1,'search uses current title and normalized case');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'Synthetic northern bank')->'items'),5,'site name search uses current plan or legacy action site without reviving a cleared site');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'',22)->'items'),2,'project filter applies to the complete server result');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'',NULL,'2026-11-11','2026-11-12')->'items'),2,'inclusive date filter uses action deadline and excludes unknown dates');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,NULL,1)->'items'),2,'bounded page includes exactly one lookahead row');
SELECT is((pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,pg_temp.k(31),1)->'items'->0->>'action_id'),pg_temp.k(32)::text,'next cursor resumes strictly after the displayed action');
SELECT is(jsonb_array_length(pg_temp.page('all','person',NULL,'',NULL,NULL,NULL,pg_temp.k(32),1)->'items'),1,'filtering after cursor scans beyond intervening nonmatching actions');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'nothing-matches',NULL,NULL,NULL,pg_temp.k(40),1)->'projects'),3,'project catalog is independent of filters and cursor');
SELECT is(jsonb_array_length(pg_temp.page('all','all',NULL,'nothing-matches')->'assignees'),2,'assignee catalog is independent of search');
SELECT is((SELECT count(*)::integer FROM public.work_orders),7,'manager reads do not initialize additional work orders');
SELECT is((SELECT count(*)::integer FROM public.work_order_plan_versions),6,'manager reads preserve all plans without appending versions');
SELECT throws_ok($$SELECT pg_temp.page('unknown')$$,'22023',NULL,'unknown status is rejected');
SELECT throws_ok($$SELECT pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,NULL,51)$$,'22023',NULL,'page size is explicitly bounded');
SELECT throws_ok($$SELECT pg_temp.page('all','all',NULL,'',NULL,'2026-11-20','2026-11-10')$$,'22023',NULL,'inverted date range is rejected');
SELECT throws_ok($$SELECT pg_temp.page('all','all',NULL,'',23)$$,'42501',NULL,'explicit unauthorized project does not bypass authority');
SELECT throws_ok($$SELECT pg_temp.page('all','all',NULL,'',24,NULL,NULL,NULL,50,12)$$,'42501',NULL,'explicit foreign organization does not bypass authority');

-- P7 summaries use the entire filter result, not the current page/sentinel.
SELECT ok(NOT has_function_privilege('anon','public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer,text)','EXECUTE'),'new map projection is also unavailable anonymously');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer,text)'::regprocedure),'map projection preserves caller RLS');
SELECT is(pg_temp.page()->'totals','{"matchingJobs":10,"mappedJobs":5,"unmappedJobs":5,"positions":7}'::jsonb,'unique mapped jobs differ from seven map features');
SELECT is(pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,NULL,1)->'totals',pg_temp.page()->'totals','global counts do not become first-page counts');
SELECT is(pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,pg_temp.k(39),1)->'totals',pg_temp.page()->'totals','global counts are independent of cursor');
SELECT is(pg_temp.page('all','all',NULL,'',22)->'totals','{"matchingJobs":2,"mappedJobs":0,"unmappedJobs":2,"positions":0}'::jsonb,'one complete filtered project can have no map positions');
SELECT is(pg_temp.page('all','all',NULL,'no-matches')->'totals','{"matchingJobs":0,"mappedJobs":0,"unmappedJobs":0,"positions":0}'::jsonb,'empty result has explicit complete zero counts');
SELECT is((pg_temp.page()->'laneTotals'->>'waiting')::integer,2,'waiting lane contains blocking and unmet prerequisites once each');
SELECT is((pg_temp.page()->'laneTotals'->>'untracked')::integer,7,'untracked waiting jobs are not counted twice across lanes');
SELECT is((SELECT sum(value::integer)::integer FROM jsonb_each_text(pg_temp.page()->'laneTotals')),10,'lane totals partition the whole filtered selection');
SELECT is((SELECT sum((value->>'count')::integer)::integer FROM jsonb_array_elements(pg_temp.page()->'statusTotals')),10,'canonical status totals partition the same full selection');
SELECT is(jsonb_array_length(pg_temp.item(32)->'map_locations'),2,'one job with four site references has exactly two usable stored positions');
SELECT is((pg_temp.item(32)->>'map_unavailable_locations')::integer,2,'missing and malformed visit positions remain explicitly unavailable');
SELECT is(pg_temp.item(32)->'map_locations'->0->'geometry'->'coordinates','[9.6,55.4]'::jsonb,'current edited stored site centroid wins over older imported GeoJSON point, matching SitesPanel and visit map');
SELECT is(pg_temp.item(32)->'map_locations'->0->>'coordinate_source','site_stored_centroid','stored site centroid is labelled and never calculated');
SELECT is(pg_temp.item(32)->'map_locations'->1->>'coordinate_source','site_point','stored GeoJSON Point is used when no valid stored centroid exists');
SELECT is(pg_temp.item(32)->'map_locations'->1->'archived','true'::jsonb,'archived referenced site remains explicit instead of disappearing');
SELECT is(pg_temp.item(32)->'map_locations'->1->>'sequence','1','visit order comes from this exact plan');
SELECT is(pg_temp.item(37)->'site_id','null'::jsonb,'saved null plan site does not resurrect an old action site');
SELECT is(pg_temp.item(37)->'site_name','null'::jsonb,'cleared site name also stays cleared');
SELECT is(pg_temp.item(37)->'map_locations','[]'::jsonb,'cleared plan site has no guessed fallback marker');
SELECT is(pg_temp.item(37)->>'map_unavailable_reason','no_location','intentionally absent location is distinguished from invalid coordinates');
SELECT is(pg_temp.item(40)->'map_locations'->0->>'source','action_site','legacy action site is used only where no saved plan exists');
SELECT is(pg_temp.item(31)->'map_locations','[]'::jsonb,'project location/centroid is never substituted for an unlocated action');
SELECT is(pg_temp.item(33)->'map_locations'->1->>'source_version_id',pg_temp.k(71)::text,'line version is the exact plan pin, not latest project centerline');
SELECT is(pg_temp.item(33)->'map_locations'->1->'geometry'->'coordinates'->0,'[9.7,55.3]'::jsonb,'pinned geometry is not the later version with shifted coordinates');
SELECT is(private.manager_work_order_geometry('{"type":"Point","coordinates":[1e999,55]}','Point'),NULL::jsonb,'huge JSON number is rejected before any floating-point cast');
SELECT is(private.manager_work_order_geometry('{"type":"Point","coordinates":[]}','Point'),NULL::jsonb,'empty point becomes unavailable');
SELECT is(private.manager_work_order_geometry('{"type":"Point","coordinates":["9.5",55]}','Point'),NULL::jsonb,'numeric strings do not silently become measured coordinates');
SELECT is(private.manager_work_order_geometry(jsonb_build_object('type','Point','coordinates',jsonb_build_array('NaN'::numeric,55)),'Point'),NULL::jsonb,'nonfinite stored centroid is unavailable');
SELECT is(private.manager_work_order_geometry('{"type":"LineString","coordinates":[[9.5,55],[9.5,55]]}','LineString'),NULL::jsonb,'degenerate centerline is unavailable');
SELECT is(private.manager_work_order_geometry('{"type":"LineString","coordinates":[[9.5,55],null]}','LineString'),NULL::jsonb,'malformed line point does not fail the whole legitimate job query');
SELECT throws_ok($$SELECT * FROM public.list_manager_work_orders(pg_temp.k(11),NULL,'all','all',NULL,'',NULL,NULL,pg_temp.k(31),1,NULL)$$,'22023',NULL,'continuation explicitly requires a selection token');
SELECT throws_ok($$SELECT * FROM public.list_manager_work_orders(pg_temp.k(11),NULL,'all','all',NULL,'',NULL,NULL,NULL,1,'invalid')$$,'22023',NULL,'malformed selection token is rejected');
INSERT INTO map_selection_token SELECT pg_temp.page()->>'selectionToken';
SELECT ok((SELECT token ~ '^[0-9a-f]{64}$' FROM map_selection_token),'selection fingerprint is SHA256 hex');
SELECT is(pg_temp.page()->>'selectionToken',pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,pg_temp.k(39),1)->>'selectionToken','token is stable across page sizes and cursors');
SELECT lives_ok($$SELECT pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,pg_temp.k(31),1,11,(SELECT token FROM map_selection_token))$$,'unchanged selection continues with the same token');
UPDATE public.sites SET centroid_lng=9.65,centroid_lat=55.45 WHERE id=pg_temp.k(51);
SELECT throws_ok($$SELECT pg_temp.page('all','all',NULL,'',NULL,NULL,NULL,pg_temp.k(31),1,11,(SELECT token FROM map_selection_token))$$,'PT409',NULL,'site coordinate edit prevents appending a mixed geometry page');
SELECT throws_ok($$SELECT pg_temp.page('all','all',NULL,'',22,NULL,NULL,NULL,1,11,(SELECT token FROM map_selection_token))$$,'PT409',NULL,'changed filters cannot reuse the old selection token');
RESET ROLE;
SELECT throws_ok($$UPDATE public.sites SET project_id=pg_temp.k(23) WHERE id=pg_temp.k(52)$$,
  '23514',NULL,'existing site project identity guard blocks moving a referenced visit outside project');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT * FROM public.save_work_order_plan(pg_temp.k(32),pg_temp.k(11),pg_temp.k(21),1,
  pg_temp.plan('Synthetic planned task 32')||jsonb_build_object('visitStops',jsonb_build_array(
    jsonb_build_object('siteId',pg_temp.k(55),'name','Synthetic foreign project site'))),
  'Synthetic foreign visit attempt',pg_temp.k(932))$$,'22023',NULL,'ordinary plan save rejects a foreign project visit without bypassing source guards');
SELECT is(jsonb_array_length(pg_temp.item(32)->'map_locations'),2,'rejected project move and foreign visit preserve the two correct stored locations');
SELECT is((pg_temp.item(32)->>'map_unavailable_locations')::integer,2,'rejected writes preserve the original two missing positions and same legitimate job');

SELECT set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
SELECT lives_ok($$SELECT * FROM public.claim_work_order_pool(pg_temp.k(33),pg_temp.k(11),pg_temp.k(21),1,
  (SELECT id FROM public.work_order_plan_versions WHERE action_id=pg_temp.k(33)),pg_temp.k(733))$$,'ordinary field worker claims the pool through existing endpoint');
SELECT throws_ok($$SELECT pg_temp.page()$$,'42501',NULL,'field account cannot open manager queue');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
SELECT throws_ok($$SELECT pg_temp.page()$$,'42501',NULL,'viewer cannot use forged user metadata to open manager queue');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
SELECT throws_ok($$SELECT pg_temp.page()$$,'42501',NULL,'project editor write capability is not project management');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(7)::text,true);
SELECT ok(private.can_review_work_order(pg_temp.k(32)),'external professional really holds the separate task review capability');
SELECT throws_ok($$SELECT pg_temp.page()$$,'42501',NULL,'task reviewer cannot enumerate whole projects');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT is(pg_temp.item(33)->>'claimed_by',pg_temp.k(2)::text,'manager sees the actual pool claimant');
SELECT is(jsonb_array_length(pg_temp.page('all','all',4)->'items'),0,'a claimed pool no longer counts the losing candidate as actual assignee');
SELECT set_config('request.jwt.claim.sub',pg_temp.k(6)::text,true);
SELECT is(jsonb_array_length(pg_temp.page()->'projects'),4,'organization owner can manage all projects in their organization');
SELECT is(pg_temp.item(36),NULL::jsonb,'organization ownership never crosses tenant boundary');
RESET ROLE;
UPDATE public.project_members SET role='field' WHERE project_id=pg_temp.k(21) AND user_id=pg_temp.k(1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
SELECT throws_ok($$SELECT pg_temp.page('all','all',NULL,'',21)$$,'42501',NULL,'fresh request enforces current manager demotion');
SELECT is(jsonb_array_length(pg_temp.page()->'projects'),2,'demoted project disappears from refreshed catalog');
SELECT is(pg_temp.item(32),NULL::jsonb,'demoted project tasks disappear without affecting the other managed projects');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
