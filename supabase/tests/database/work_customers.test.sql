-- Fictional local/CI records only. No external Auth API or notifications.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.k(n integer) returns uuid language sql immutable as $$ select ('fc560000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated','customer-fixture-'||n||'@example.test','',now(),'{"provider":"email"}','{"role":"admin"}',now(),now() from generate_series(1,7)n;
insert into public.organizations(id,name) values(pg_temp.k(11),'Fictional customer organization A'),(pg_temp.k(12),'Fictional customer organization B');
insert into public.organization_memberships(organization_id,user_id,role) values
 (pg_temp.k(11),pg_temp.k(1),'owner'),(pg_temp.k(11),pg_temp.k(2),'viewer'),
 (pg_temp.k(11),pg_temp.k(3),'viewer'),(pg_temp.k(11),pg_temp.k(4),'viewer'),
 (pg_temp.k(12),pg_temp.k(5),'owner'),(pg_temp.k(11),pg_temp.k(6),'admin'),(pg_temp.k(11),pg_temp.k(7),'viewer');
create temp table customer_results(key text primary key,data jsonb);
grant all on customer_results to authenticated;
create function pg_temp.saved(k text) returns jsonb language sql as $$ select data from pg_temp.customer_results where key=k $$;
create function pg_temp.customer_id() returns uuid language sql as $$ select (pg_temp.saved('customer')->>'id')::uuid $$;
create function pg_temp.fields(n text default 'Fictional forest customer',archived boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('name',n,'registrationNumber','FAKE-CVR','address','Fictional billing address','postalCode','0000','city','Fictional city','country','Danmark','archived',archived)
$$;
create function pg_temp.cmd(op text,p jsonb,req integer default null) returns jsonb language sql as $$
 select public.command_work_customers(pg_temp.k(11),auth.uid(),coalesce(pg_temp.k(req),gen_random_uuid()),op,p)
$$;
create function pg_temp.q(op text,p jsonb) returns jsonb language sql as $$ select public.query_work_customers(pg_temp.k(11),auth.uid(),op,p) $$;
create function pg_temp.create_payload(n text default 'Fictional field case') returns jsonb language sql as $$
 select jsonb_build_object('customerId',pg_temp.customer_id(),'contactId',(pg_temp.saved('contact')->>'id')::uuid,'title',n,'description','Three fictional jobs','location','Fictional location','customerReference','CUSTOMER-REF-1')
$$;

select ok(not has_function_privilege('anon','public.command_work_customers(uuid,uuid,uuid,text,jsonb)','EXECUTE'),'anonymous command is unavailable');
select ok(not has_function_privilege('anon','public.query_work_customers(uuid,uuid,text,jsonb)','EXECUTE'),'anonymous query is unavailable');
select ok(not has_table_privilege('authenticated','private.work_customer_versions','SELECT'),'raw customer history is not exposed');
select ok(not has_table_privilege('authenticated','private.work_case_customer_versions','INSERT'),'raw case bindings cannot be forged');
select ok(not (select prosecdef from pg_proc where oid='public.command_work_customers(uuid,uuid,uuid,text,jsonb)'::regprocedure),'public command stays invoker');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
insert into customer_results values('customer',pg_temp.cmd('save_customer',jsonb_build_object('customerId',null,'expectedVersion',0,'data',pg_temp.fields()),41));
select is(pg_temp.saved('customer')->>'number','K-000001','first customer gets an organization-scoped number');
select is(pg_temp.cmd('save_customer',jsonb_build_object('customerId',null,'expectedVersion',0,'data',pg_temp.fields()),41),pg_temp.saved('customer'),'identical retry returns its original receipt');
select throws_ok($$select pg_temp.cmd('save_customer',jsonb_build_object('customerId',null,'expectedVersion',0,'data',pg_temp.fields('Changed request')),41)$$,'PT409',null,'request identifiers cannot be reused for different data');
select is(jsonb_array_length(pg_temp.q('list','{"search":"","includeArchived":false,"offset":0}')->'rows'),1,'retry did not create a duplicate customer');
select throws_ok($$select pg_temp.cmd('save_customer',jsonb_build_object('customerId',pg_temp.customer_id(),'expectedVersion',0,'data',pg_temp.fields('Stale edit')))$$,'PT409',null,'stale customer edit is rejected');
select throws_ok($$select pg_temp.cmd('save_customer',jsonb_build_object('customerId',pg_temp.customer_id(),'expectedVersion',1,'data',pg_temp.fields(),'isAdmin',true))$$,'22023',null,'unknown fields cannot alter authority');
insert into customer_results values('contact',pg_temp.cmd('save_contact',jsonb_build_object('customerId',pg_temp.customer_id(),'contactId',null,'expectedVersion',0,
 'data',jsonb_build_object('name','Fictional site contact','title','Site manager','email','contact@example.test','phone','FAKE-PHONE','archived',false))));
select is(jsonb_array_length(pg_temp.q('customer',jsonb_build_object('customerId',pg_temp.customer_id()))->'contacts'),1,'administrator can read the saved contact');
insert into customer_results values('second_customer',pg_temp.cmd('save_customer',jsonb_build_object('customerId',null,'expectedVersion',0,'data',pg_temp.fields('Second fictional customer'))));
select is(pg_temp.saved('second_customer')->>'number','K-000002','second customer gets a distinct number');
select lives_ok($$select pg_temp.cmd('grant_planner',jsonb_build_object('customerId',pg_temp.customer_id(),'userId',pg_temp.k(2),'expectedVersion',0,'enabled',true),42)$$,'administrator grants planning for one customer');

select set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
select throws_ok($$select pg_temp.cmd('save_customer',jsonb_build_object('customerId',null,'expectedVersion',0,'data',pg_temp.fields()))$$,'42501',null,'user metadata admin does not permit registry administration');
select is(jsonb_array_length(pg_temp.q('list','{"search":"","includeArchived":false,"offset":0}')->'rows'),1,'planner sees only the explicitly granted customer');
select throws_ok($$select pg_temp.q('customer',jsonb_build_object('customerId',(pg_temp.saved('second_customer')->>'id')::uuid))$$,'42501',null,'planner cannot inspect another customer in the same organization');
insert into customer_results values('case_a',pg_temp.cmd('create_case',pg_temp.create_payload(),43));
insert into customer_results values('case_b',pg_temp.cmd('create_case',pg_temp.create_payload('Second fictional field case'),44));
select is(pg_temp.saved('case_a')->>'number','S-000001','first case gets a stable case number');
select is(pg_temp.saved('case_b')->>'number','S-000002','different create requests allocate different case numbers');
select is(pg_temp.cmd('create_case',pg_temp.create_payload(),43),pg_temp.saved('case_a'),'case create retry does not create another project');
select ok(private.can_write_project((pg_temp.saved('case_a')->>'id')::uuid),'new case grants its planner project-manager access');
insert into public.actions(id,project_id,title,action_type) select pg_temp.k(30+n),(pg_temp.saved('case_a')->>'id')::uuid,'Fictional job '||n,null from generate_series(1,3)n;
select is((select count(*)::integer from public.actions where project_id=(pg_temp.saved('case_a')->>'id')::uuid),3,'the case uses the existing project/job relationship');
select lives_ok($$select * from public.initialize_work_order(pg_temp.k(31),pg_temp.k(11),(pg_temp.saved('case_a')->>'id')::uuid,0,pg_temp.k(71))$$,'first job uses the existing work-order identity');
select lives_ok($$select * from public.initialize_work_order(pg_temp.k(32),pg_temp.k(11),(pg_temp.saved('case_a')->>'id')::uuid,0,pg_temp.k(72))$$,'second job uses an independent work-order identity');
select is(pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding'->>'customerReference','CUSTOMER-REF-1','case preserves the customer reference');
select throws_ok($$select pg_temp.cmd('bind_case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid,'customerId',(pg_temp.saved('second_customer')->>'id')::uuid,'contactId',null,'expectedVersion',1,'customerReference',''))$$,'42501',null,'case access alone cannot select a different customer');

reset role;
insert into public.project_members(project_id,user_id,role) values((pg_temp.saved('case_a')->>'id')::uuid,pg_temp.k(3),'field'),((pg_temp.saved('case_a')->>'id')::uuid,pg_temp.k(7),'external');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
select lives_ok($$select public.save_work_order_access(pg_temp.k(31),pg_temp.k(11),(pg_temp.saved('case_a')->>'id')::uuid,pg_temp.k(7),0,true,true,false,'Fictional job-scoped assignment',pg_temp.k(81))$$,'one external worker receives one concrete job');
select set_config('request.jwt.claim.sub',pg_temp.k(7)::text,true);
select throws_ok($$select pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))$$,'42501',null,'job-scoped external access does not expose the whole case');
select is(pg_temp.q('job',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid,'actionId',pg_temp.k(31)))->'binding'->>'customerName','Fictional forest customer','assigned external worker gets the necessary customer context for that job');
select throws_ok($$select pg_temp.q('job',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid,'actionId',pg_temp.k(32)))$$,'42501',null,'external worker cannot reuse another job id for customer context');
select ok(not (pg_temp.q('job',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid,'actionId',pg_temp.k(31)))->>'canEdit')::boolean,'job context cannot grant case editing');
select set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
select is(jsonb_array_length(pg_temp.q('list','{"search":"","includeArchived":false,"offset":0}')->'rows'),0,'employee does not gain registry access through organization membership');
select is(pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding'->>'customerName','Fictional forest customer','employee gets the context of their assigned case');
select is(pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding'->'contact'->>'phone','FAKE-PHONE','selected site contact is available on the case');
select ok(not (pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding' ? 'address'),'employee context excludes billing address');
select ok(not (pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding' ? 'registrationNumber'),'employee context excludes company registration');
select throws_ok($$select pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_b')->>'id')::uuid))$$,'42501',null,'another case of the same customer is not implicitly shared');
select throws_ok($$select pg_temp.cmd('save_reference',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid,'expectedVersion',1,'customerReference','forged'))$$,'42501',null,'employee cannot rewrite the case reference');
select throws_ok($$select public.query_work_customers(pg_temp.k(11),pg_temp.k(1),'list','{"search":"","includeArchived":false,"offset":0}')$$,'42501',null,'expected actor cannot impersonate an administrator');

select set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
select throws_ok($$select pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))$$,'42501',null,'unassigned colleague cannot open the case');
select set_config('request.jwt.claim.sub',pg_temp.k(5)::text,true);
select throws_ok($$select pg_temp.q('list','{"search":"","includeArchived":true,"offset":0}')$$,'42501',null,'other organization cannot enumerate customers');
select throws_ok($$select pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))$$,'42501',null,'other organization cannot open the case');

select set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
select lives_ok($$select pg_temp.cmd('save_customer',jsonb_build_object('customerId',pg_temp.customer_id(),'expectedVersion',1,'data',pg_temp.fields('Corrected fictional customer')),45)$$,'customer correction appends another version');
select is(jsonb_array_length(pg_temp.q('customer',jsonb_build_object('customerId',pg_temp.customer_id()))->'history'),2,'both customer versions remain available');
select is(pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding'->>'customerName','Fictional forest customer','customer correction does not rewrite the saved case context');
select lives_ok($$select pg_temp.cmd('grant_planner',jsonb_build_object('customerId',pg_temp.customer_id(),'userId',pg_temp.k(2),'expectedVersion',1,'enabled',false),46)$$,'customer planning access can be revoked');
select set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
select throws_ok($$select pg_temp.cmd('create_case',pg_temp.create_payload(),43)$$,'42501',null,'revocation also denies a previously successful request replay');
select is(jsonb_array_length(pg_temp.q('list','{"search":"","includeArchived":false,"offset":0}')->'rows'),0,'revoked planner loses registry access');
select lives_ok($$select pg_temp.cmd('save_reference',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid,'expectedVersion',1,'customerReference','CUSTOMER-REF-2'),47)$$,'project manager can maintain their case reference without registry access');
select is(pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding'->>'customerName','Fictional forest customer','reference edit preserves the previously selected customer version');
select throws_ok($$select pg_temp.cmd('save_reference',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid,'expectedVersion',1,'customerReference','stale'))$$,'PT409',null,'stale case reference is rejected');
select set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
select lives_ok($$select pg_temp.cmd('save_customer',jsonb_build_object('customerId',pg_temp.customer_id(),'expectedVersion',2,'data',pg_temp.fields('Corrected fictional customer',true)),48)$$,'administrator archives the customer');
select throws_ok($$select pg_temp.cmd('create_case',pg_temp.create_payload())$$,'22023',null,'archived customer cannot be used for a new case');
select is(pg_temp.q('case',jsonb_build_object('projectId',(pg_temp.saved('case_a')->>'id')::uuid))->'binding'->>'customerReference','CUSTOMER-REF-2','archiving preserves an existing case');
select is(jsonb_array_length(pg_temp.q('list','{"search":"","includeArchived":false,"offset":0}')->'rows'),1,'active registry hides the archived customer');
select is(jsonb_array_length(pg_temp.q('list','{"search":"","includeArchived":true,"offset":0}')->'rows'),2,'administrator can include archived customers');

reset role;
select is((select count(*)::integer from public.projects where organization_id=pg_temp.k(11)),2,'failed and repeated creates left exactly two cases');
select is((select role from public.organization_memberships where organization_id=pg_temp.k(11) and user_id=pg_temp.k(2)),'viewer','case creation did not widen organization authority');
select is((select count(*)::integer from private.work_case_customer_versions where project_id=(pg_temp.saved('case_a')->>'id')::uuid),2,'both case-context versions remain in history');
select throws_ok($$update private.work_customer_versions set data='{}'$$,'55000',null,'even privileged updates cannot silently rewrite customer history');
select throws_ok($$delete from private.work_case_customer_versions$$,'55000',null,'saved case history cannot be deleted');
set constraints all immediate;
select * from finish();
rollback;
