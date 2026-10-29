-- Disposable LOCAL/CI fixtures. Never apply this file to hosted customer data.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES
 ('00000000-0000-0000-0000-000000000000','fc290000-0000-4000-8000-000000000001','authenticated','authenticated','field-job-editor@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','fc290000-0000-4000-8000-000000000002','authenticated','authenticated','field-job-field@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','fc290000-0000-4000-8000-000000000003','authenticated','authenticated','field-job-viewer@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','fc290000-0000-4000-8000-000000000004','authenticated','authenticated','field-job-other-org@example.test','',now(),'{"provider":"email"}','{}',now(),now());
INSERT INTO public.organizations(id,name,type,country) VALUES
 ('fc291000-0000-4000-8000-000000000001','Synthetic job organization A','test','Denmark'),
 ('fc291000-0000-4000-8000-000000000002','Synthetic job organization B','test','Denmark');
INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES
 ('fc291000-0000-4000-8000-000000000001','fc290000-0000-4000-8000-000000000001','viewer'),
 ('fc291000-0000-4000-8000-000000000001','fc290000-0000-4000-8000-000000000002','viewer'),
 ('fc291000-0000-4000-8000-000000000001','fc290000-0000-4000-8000-000000000003','viewer'),
 ('fc291000-0000-4000-8000-000000000002','fc290000-0000-4000-8000-000000000004','owner');
INSERT INTO public.projects(id,organization_id,name) VALUES
 ('fc292000-0000-4000-8000-000000000001','fc291000-0000-4000-8000-000000000001','Synthetic field job A'),
 ('fc292000-0000-4000-8000-000000000002','fc291000-0000-4000-8000-000000000001','Synthetic field job second project'),
 ('fc292000-0000-4000-8000-000000000003','fc291000-0000-4000-8000-000000000002','Synthetic field job other organization');
INSERT INTO public.project_members(project_id,user_id,role) VALUES
 ('fc292000-0000-4000-8000-000000000001','fc290000-0000-4000-8000-000000000001','editor'),
 ('fc292000-0000-4000-8000-000000000001','fc290000-0000-4000-8000-000000000002','field'),
 ('fc292000-0000-4000-8000-000000000001','fc290000-0000-4000-8000-000000000003','viewer'),
 ('fc292000-0000-4000-8000-000000000002','fc290000-0000-4000-8000-000000000001','editor');
INSERT INTO public.actions(id,project_id,title) VALUES
 ('fc293000-0000-4000-8000-000000000001','fc292000-0000-4000-8000-000000000001','Synthetic existing action'),
 ('fc293000-0000-4000-8000-000000000002','fc292000-0000-4000-8000-000000000001','Synthetic unbound action'),
 ('fc293000-0000-4000-8000-000000000003','fc292000-0000-4000-8000-000000000002','Synthetic other project action');

CREATE FUNCTION pg_temp.job_definition() RETURNS jsonb LANGUAGE sql AS $f$
 SELECT '{"schema":"freyra.field-job-template/v1","title":"Synthetic field checklist","domain":"nature","fields":[
 {"key":"label","label":"Location note","type":"text","required":true},
 {"key":"memo","label":"Description","type":"textarea","required":false,"helpText":"Synthetic instructions"},
 {"key":"quantity","label":"Count","type":"number","required":true,"unit":"items"},
 {"key":"observed","label":"Date","type":"date","required":true},
 {"key":"checked","label":"Checked","type":"boolean","required":true},
 {"key":"state","label":"State","type":"select","required":true,"options":["open","complete"]}
 ]}'::jsonb
$f$;
CREATE FUNCTION pg_temp.save_job_template(
 p_definition jsonb DEFAULT pg_temp.job_definition(), p_expected integer DEFAULT 0,
 p_request uuid DEFAULT 'fc295000-0000-4000-8000-000000000001',
 p_template uuid DEFAULT 'fc294000-0000-4000-8000-000000000001',
 p_project uuid DEFAULT 'fc292000-0000-4000-8000-000000000001',
 p_org uuid DEFAULT 'fc291000-0000-4000-8000-000000000001'
) RETURNS uuid LANGUAGE sql AS $f$
 SELECT id FROM public.save_field_job_template_version(p_org,p_project,p_template,p_expected,p_definition,p_request)
$f$;
CREATE FUNCTION pg_temp.first_job_template() RETURNS uuid LANGUAGE sql AS $f$
 SELECT id FROM public.field_job_template_versions WHERE template_id='fc294000-0000-4000-8000-000000000001' AND version=1
$f$;
CREATE FUNCTION pg_temp.save_job(
 p_values jsonb DEFAULT '{}', p_expected integer DEFAULT 0, p_reason text DEFAULT '',
 p_request uuid DEFAULT 'fc296000-0000-4000-8000-000000000001', p_template_version uuid DEFAULT NULL,
 p_action uuid DEFAULT 'fc293000-0000-4000-8000-000000000001',
 p_project uuid DEFAULT 'fc292000-0000-4000-8000-000000000001',
 p_org uuid DEFAULT 'fc291000-0000-4000-8000-000000000001', p_status text DEFAULT 'recorded'
) RETURNS uuid LANGUAGE sql AS $f$
 SELECT id FROM public.save_field_job_version(p_org,p_project,p_action,coalesce(p_template_version,pg_temp.first_job_template()),p_expected,p_values,p_status,p_reason,p_request)
$f$;

SELECT ok(NOT has_table_privilege('anon','public.field_job_versions','SELECT'),'anonymous job read privilege is absent');
SELECT ok(NOT has_table_privilege('authenticated','public.field_job_versions','UPDATE'),'API users cannot update registrations');
SELECT ok(NOT has_table_privilege('authenticated','public.field_job_template_versions','DELETE'),'API users cannot delete template history');
SELECT ok(NOT has_function_privilege('anon','public.save_field_job_version(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid)','EXECUTE'),'anonymous RPC execution is absent');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc290000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$SELECT pg_temp.save_job_template()$$,'project editor creates first template');
SELECT is((SELECT count(*)::integer FROM public.field_job_template_versions),1,'one template version was created');
SELECT is(pg_temp.save_job_template(),pg_temp.first_job_template(),'identical template retry returns the same row');
SELECT throws_ok($$SELECT pg_temp.save_job_template(jsonb_set(pg_temp.job_definition(),'{title}','"Changed"'))$$,'22023',NULL,'request key cannot be reused with changed definition');
SELECT throws_ok($$SELECT pg_temp.save_job_template(pg_temp.job_definition(),0,gen_random_uuid())$$,'40001',NULL,'stale template writer cannot append');

SELECT throws_ok($$SELECT private.validate_field_job_definition(pg_temp.job_definition() || '{"undeclared":true}')$$,'22023',NULL,'undeclared definition keys are rejected');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{title}',to_jsonb(repeat('x',161))))$$,'22023',NULL,'title limit is enforced');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields}','[]'))$$,'22023',NULL,'a template needs at least one field');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields}',(SELECT jsonb_agg((pg_temp.job_definition()#>'{fields,0}') || jsonb_build_object('key','f_'||n)) FROM generate_series(1,41) n)))$$,'22023',NULL,'templates cannot exceed forty fields');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,0,key}','"bad-key"'))$$,'22023',NULL,'field keys must use the declared grammar');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,1,key}','"label"'))$$,'22023',NULL,'duplicate field keys are rejected');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,0,required}','"true"'))$$,'22023',NULL,'required must be a boolean');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,0,unknown}','true'))$$,'22023',NULL,'undeclared field properties are rejected');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,0,label}',to_jsonb(repeat('x',121))))$$,'22023',NULL,'label limit is enforced');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,0,helpText}',to_jsonb(repeat('x',501))))$$,'22023',NULL,'help text limit is enforced');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,0,unit}',to_jsonb(repeat('x',41))))$$,'22023',NULL,'unit limit is enforced');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,5,options}','["same","same"]'))$$,'22023',NULL,'duplicate select options are rejected');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,5,options}','[""]'))$$,'22023',NULL,'empty select options are rejected');
SELECT throws_ok($$SELECT private.validate_field_job_definition(jsonb_set(pg_temp.job_definition(),'{fields,0,options}','["x"]'))$$,'22023',NULL,'non-select fields cannot declare options');
SELECT lives_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"quantity":0,"checked":false,"observed":"2024-02-29","state":"complete"}')$$,'zero, false, valid leap day and absent required text remain valid registrations');
SELECT lives_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"label":"","observed":null,"state":null}')$$,'blank text and explicit null preserve unanswered fields');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"unknown":"x"}')$$,'22023',NULL,'unknown answer keys are rejected');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"quantity":"3"}')$$,'22023',NULL,'numeric strings are not coerced');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"quantity":1e400}')$$,'22023',NULL,'numbers outside finite JavaScript range are rejected');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"checked":"false"}')$$,'22023',NULL,'boolean strings are not coerced');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"state":"other"}')$$,'22023',NULL,'undeclared select choice is rejected');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"observed":"2026-02-30"}')$$,'22023',NULL,'calendar validation rejects normalized invalid dates');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),'{"observed":""}')$$,'22023',NULL,'blank non-text values must arrive as null');
SELECT throws_ok($$SELECT private.validate_field_job_values(pg_temp.job_definition(),jsonb_build_object('label',repeat('x',4001)))$$,'22023',NULL,'text length limit is enforced');

SELECT lives_ok($$SELECT pg_temp.save_job()$$,'editor binds existing action and preserves incomplete field registration');
SELECT is(pg_temp.save_job(),(SELECT id FROM public.field_job_versions WHERE version=1),'lost response retry returns original job revision');
SELECT is((SELECT status FROM public.field_job_versions WHERE version=1),'recorded','registration status carries no professional approval state');
SELECT is((SELECT count(*)::integer FROM public.actions WHERE id='fc293000-0000-4000-8000-000000000001'),1,'job uses the existing action identity');
SELECT throws_ok($$SELECT pg_temp.save_job('{"label":"Changed"}')$$,'22023',NULL,'job request reuse with changed answers is rejected');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',0,'',gen_random_uuid())$$,'40001',NULL,'stale expected job version is rejected');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',1,'',gen_random_uuid())$$,'22023',NULL,'a correction reason is mandatory for every later revision');
SELECT lives_ok($$SELECT pg_temp.save_job_template(jsonb_set(pg_temp.job_definition(),'{title}','"Synthetic revised checklist"'),1,'fc295000-0000-4000-8000-000000000002')$$,'editor appends template version two');
SELECT is((SELECT template_version_id FROM public.field_job_versions WHERE version=1),pg_temp.first_job_template(),'existing job remains bound to its original template version');

SELECT set_config('request.jwt.claim.sub','fc290000-0000-4000-8000-000000000002',true);
SELECT throws_ok($$SELECT pg_temp.save_job_template(pg_temp.job_definition(),2,gen_random_uuid())$$,'42501',NULL,'field contributor cannot configure templates');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',0,'',gen_random_uuid(),NULL,'fc293000-0000-4000-8000-000000000002')$$,'42501',NULL,'field contributor cannot create a first template binding');
SELECT lives_ok($$SELECT pg_temp.save_job('{"quantity":0,"checked":false}',1,'Field correction','fc296000-0000-4000-8000-000000000002')$$,'field contributor can append answers on the frozen template');
SELECT is((SELECT count(*)::integer FROM public.field_job_versions),2,'field contribution retains prior revision');
SELECT is(pg_temp.save_job('{"quantity":0,"checked":false}',1,'Field correction','fc296000-0000-4000-8000-000000000002'),(SELECT id FROM public.field_job_versions WHERE version=2),'field retry is idempotent');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',2,'Switch template',gen_random_uuid(),(SELECT id FROM public.field_job_template_versions WHERE version=2))$$,'42501',NULL,'field contributor cannot silently upgrade a template');
SELECT throws_ok($$INSERT INTO public.field_job_versions(action_id,organization_id,project_id,version,template_version_id,"values",status,correction_reason,request_id) SELECT 'fc293000-0000-4000-8000-000000000002','fc291000-0000-4000-8000-000000000001','fc292000-0000-4000-8000-000000000001',1,pg_temp.first_job_template(),'{}','draft','',gen_random_uuid()$$,'42501',NULL,'direct insert cannot bypass first-binding role check');
SELECT throws_ok($$INSERT INTO public.field_job_versions(action_id,organization_id,project_id,version,template_version_id,"values",status,correction_reason,request_id,created_by) SELECT 'fc293000-0000-4000-8000-000000000001','fc291000-0000-4000-8000-000000000001','fc292000-0000-4000-8000-000000000001',3,pg_temp.first_job_template(),'{}','draft','Fake actor',gen_random_uuid(),'fc290000-0000-4000-8000-000000000001'$$,'42501',NULL,'direct insert cannot forge actor');
SELECT throws_ok($$INSERT INTO public.field_job_versions(action_id,organization_id,project_id,version,template_version_id,"values",status,correction_reason,request_id) SELECT 'fc293000-0000-4000-8000-000000000001','fc291000-0000-4000-8000-000000000001','fc292000-0000-4000-8000-000000000001',3,pg_temp.first_job_template(),'{"quantity":"bad"}','draft','Invalid value',gen_random_uuid()$$,'22023',NULL,'direct insert cannot bypass answer validation');
SELECT throws_ok($$INSERT INTO public.field_job_versions(action_id,organization_id,project_id,version,template_version_id,"values",status,correction_reason,request_id) SELECT 'fc293000-0000-4000-8000-000000000001','fc291000-0000-4000-8000-000000000001','fc292000-0000-4000-8000-000000000001',4,pg_temp.first_job_template(),'{}','draft','Skip version',gen_random_uuid()$$,'40001',NULL,'direct insert cannot skip the locked version sequence');

SELECT set_config('request.jwt.claim.sub','fc290000-0000-4000-8000-000000000001',true);
SELECT lives_ok($$SELECT pg_temp.save_job('{}',2,'Explicit editor template migration','fc296000-0000-4000-8000-000000000003',(SELECT id FROM public.field_job_template_versions WHERE version=2))$$,'editor explicitly rebinds with retained history and reason');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',3,'Wrong action project',gen_random_uuid(),NULL,'fc293000-0000-4000-8000-000000000003')$$,'40001',NULL,'wrong action cannot inherit another action version');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',0,'Wrong action project',gen_random_uuid(),NULL,'fc293000-0000-4000-8000-000000000003')$$,'42501',NULL,'cross-project action binding is rejected at insertion boundary');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',3,'Wrong organization',gen_random_uuid(),NULL,'fc293000-0000-4000-8000-000000000001','fc292000-0000-4000-8000-000000000001','fc291000-0000-4000-8000-000000000002')$$,'42501',NULL,'client cannot spoof organization scope');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',0,'Wrong template project',gen_random_uuid(),NULL,'fc293000-0000-4000-8000-000000000003','fc292000-0000-4000-8000-000000000002')$$,'42501',NULL,'a readable template cannot be bound into another project');
SELECT throws_ok($$UPDATE public.field_job_versions SET status='draft' WHERE version=1$$,'42501',NULL,'API user cannot overwrite history');
SELECT throws_ok($$DELETE FROM public.field_job_template_versions WHERE version=1$$,'42501',NULL,'API user cannot delete template history');

SELECT set_config('request.jwt.claim.sub','fc290000-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*)::integer FROM public.field_job_versions),3,'viewer can read project revision history');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',3,'Viewer attempt',gen_random_uuid())$$,'42501',NULL,'viewer cannot save job answers');
SELECT throws_ok($$SELECT pg_temp.save_job_template(pg_temp.job_definition(),2,gen_random_uuid())$$,'42501',NULL,'viewer cannot configure templates');
SELECT set_config('request.jwt.claim.sub','fc290000-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(*)::integer FROM public.field_job_versions),0,'another organization cannot read job history');
SELECT is((SELECT count(*)::integer FROM public.field_job_template_versions),0,'another organization cannot read templates');
SELECT throws_ok($$SELECT pg_temp.save_job('{}',3,'Other organization',gen_random_uuid())$$,'42501',NULL,'another organization cannot use write RPC');

RESET ROLE;
SELECT throws_ok($$UPDATE public.field_job_versions SET status='draft' WHERE version=1$$,'23514',NULL,'immutable trigger also rejects owner-level updates');
SELECT throws_ok($$DELETE FROM public.field_job_template_versions WHERE version=1$$,'23514',NULL,'immutable trigger also rejects owner-level deletes');
DELETE FROM public.organization_memberships WHERE organization_id='fc291000-0000-4000-8000-000000000001' AND user_id='fc290000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc290000-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*)::integer FROM public.field_job_versions),0,'revoked organization membership hides prior field contributions');
SELECT throws_ok($$SELECT pg_temp.save_job('{"quantity":0,"checked":false}',1,'Field correction','fc296000-0000-4000-8000-000000000002')$$,'42501',NULL,'idempotent retry still requires current membership');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.field_job_versions WHERE project_id='fc292000-0000-4000-8000-000000000001'),3,'all rejected writes leave the three legitimate revisions intact');
SELECT * FROM finish();
ROLLBACK;
