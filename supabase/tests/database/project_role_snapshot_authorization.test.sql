-- Disposable physical LOCAL database only, metadata fixtures in BEGIN/ROLLBACK.
-- Invalid resource/manifest controls distinguish authorization 42501 from the
-- original subsequent input/resource gate 23514. This is authorization proof,
-- not positive baseline/original/Storage/dedup/hash/JSON-result acceptance.
-- The unchanged full existing suites must be replayed too; concurrency is separate.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','f9100000-0000-4000-8000-000000000001','authenticated','authenticated','role-snapshot-editor@example.test','',now(),'{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','f9100000-0000-4000-8000-000000000002','authenticated','authenticated','role-snapshot-foreign@example.test','',now(),'{"provider":"email"}','{}',now(),now());
insert into public.organizations(id,name,type,country) values
 ('f9000000-0000-4000-8000-000000000001','Role snapshot fixture A','test','Denmark'),
 ('f9000000-0000-4000-8000-000000000002','Role snapshot fixture B','test','Denmark');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('f9000000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','viewer'),
 ('f9000000-0000-4000-8000-000000000002','f9100000-0000-4000-8000-000000000002','owner');
insert into public.projects(id,organization_id,name) values ('f9200000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','Role snapshot fixture A');
insert into public.project_members(project_id,user_id,role) values ('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','editor');
create temporary table role_before_graph as select jsonb_build_object(
 'baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),
 'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),
 'uploads',(select jsonb_agg(to_jsonb(row) order by id) from public.uploads row),
 'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),
 'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),
 'promotions',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row),
 'storage',(select jsonb_agg(to_jsonb(row) order by id) from storage.objects row)
) as value;
select ok(not has_function_privilege('authenticated','public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)','EXECUTE'),'public.persist_project_baseline: browser RPC remains revoked');
select ok(not has_function_privilege('anon','public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)','EXECUTE'),'public.persist_project_baseline: anon RPC remains revoked');
select ok(has_function_privilege('service_role','public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)','EXECUTE'),'public.persist_project_baseline: exact service RPC remains granted');
select is((select prosecdef from pg_proc where oid='public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)'::regprocedure),false,'public.persist_project_baseline: SECURITY INVOKER preserved');
select ok(not has_function_privilege('authenticated','public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'public.persist_verification_plan: browser RPC remains revoked');
select ok(not has_function_privilege('anon','public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'public.persist_verification_plan: anon RPC remains revoked');
select ok(has_function_privilege('service_role','public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)','EXECUTE'),'public.persist_verification_plan: exact service RPC remains granted');
select is((select prosecdef from pg_proc where oid='public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)'::regprocedure),false,'public.persist_verification_plan: SECURITY INVOKER preserved');
select ok(not has_function_privilege('authenticated','private.lock_drone_original_upload(uuid,uuid,uuid)','EXECUTE'),'private.lock_drone_original_upload: browser RPC remains revoked');
select ok(not has_function_privilege('anon','private.lock_drone_original_upload(uuid,uuid,uuid)','EXECUTE'),'private.lock_drone_original_upload: anon RPC remains revoked');
select ok(has_function_privilege('service_role','private.lock_drone_original_upload(uuid,uuid,uuid)','EXECUTE'),'private.lock_drone_original_upload: exact service RPC remains granted');
select is((select prosecdef from pg_proc where oid='private.lock_drone_original_upload(uuid,uuid,uuid)'::regprocedure),false,'private.lock_drone_original_upload: SECURITY INVOKER preserved');
select ok(not has_function_privilege('authenticated','public.prepare_project_media_original_read(uuid,uuid,uuid)','EXECUTE'),'public.prepare_project_media_original_read: browser RPC remains revoked');
select ok(not has_function_privilege('anon','public.prepare_project_media_original_read(uuid,uuid,uuid)','EXECUTE'),'public.prepare_project_media_original_read: anon RPC remains revoked');
select ok(has_function_privilege('service_role','public.prepare_project_media_original_read(uuid,uuid,uuid)','EXECUTE'),'public.prepare_project_media_original_read: exact service RPC remains granted');
select is((select prosecdef from pg_proc where oid='public.prepare_project_media_original_read(uuid,uuid,uuid)'::regprocedure),false,'public.prepare_project_media_original_read: SECURITY INVOKER preserved');
update public.project_members set role='admin' where project_id='f9200000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'23514',null,'public.persist_project_baseline: admin retains precise original authorization group');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'23514',null,'public.persist_verification_plan: admin retains precise original authorization group');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'private.lock_drone_original_upload: admin retains precise original authorization group');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'public.prepare_project_media_original_read: admin retains precise original authorization group');
reset role;
update public.project_members set role='project_manager' where project_id='f9200000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'23514',null,'public.persist_project_baseline: project_manager retains precise original authorization group');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'23514',null,'public.persist_verification_plan: project_manager retains precise original authorization group');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'private.lock_drone_original_upload: project_manager retains precise original authorization group');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'public.prepare_project_media_original_read: project_manager retains precise original authorization group');
reset role;
update public.project_members set role='editor' where project_id='f9200000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'23514',null,'public.persist_project_baseline: editor retains precise original authorization group');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'23514',null,'public.persist_verification_plan: editor retains precise original authorization group');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'private.lock_drone_original_upload: editor retains precise original authorization group');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'public.prepare_project_media_original_read: editor retains precise original authorization group');
reset role;
update public.project_members set role='field' where project_id='f9200000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: field retains precise original authorization group');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: field retains precise original authorization group');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'private.lock_drone_original_upload: field retains precise original authorization group');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'public.prepare_project_media_original_read: field retains precise original authorization group');
reset role;
update public.project_members set role='viewer' where project_id='f9200000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: viewer retains precise original authorization group');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: viewer retains precise original authorization group');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'private.lock_drone_original_upload: viewer retains precise original authorization group');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'public.prepare_project_media_original_read: viewer retains precise original authorization group');
reset role;
update public.project_members set role='external' where project_id='f9200000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: external retains precise original authorization group');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: external retains precise original authorization group');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'private.lock_drone_original_upload: external retains precise original authorization group');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'public.prepare_project_media_original_read: external retains precise original authorization group');
reset role;
delete from public.project_members where project_id='f9200000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
update public.organization_memberships set role='owner' where organization_id='f9000000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'23514',null,'public.persist_project_baseline: organization owner without project membership');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'23514',null,'public.persist_verification_plan: organization owner without project membership');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'private.lock_drone_original_upload: organization owner without project membership');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'public.prepare_project_media_original_read: organization owner without project membership');
reset role;
update public.organization_memberships set role='admin' where organization_id='f9000000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'23514',null,'public.persist_project_baseline: organization admin without project membership');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'23514',null,'public.persist_verification_plan: organization admin without project membership');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'private.lock_drone_original_upload: organization admin without project membership');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'23514',null,'public.prepare_project_media_original_read: organization admin without project membership');
reset role;
update public.organization_memberships set role='editor' where organization_id='f9000000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: organization editor without project membership');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: organization editor without project membership');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'private.lock_drone_original_upload: organization editor without project membership');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'public.prepare_project_media_original_read: organization editor without project membership');
reset role;
update public.organization_memberships set role='viewer' where organization_id='f9000000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: organization viewer without project membership');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: organization viewer without project membership');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'private.lock_drone_original_upload: organization viewer without project membership');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'public.prepare_project_media_original_read: organization viewer without project membership');
reset role;
update public.organization_memberships set role='viewer' where organization_id='f9000000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
insert into public.project_members(project_id,user_id,role) values ('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','editor');
delete from public.organization_memberships where organization_id='f9000000-0000-4000-8000-000000000001' and user_id='f9100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: missing organization role fails closed despite editor row');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: missing organization role fails closed despite editor row');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'private.lock_drone_original_upload: missing organization role fails closed despite editor row');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'public.prepare_project_media_original_read: missing organization role fails closed despite editor row');
reset role;
insert into public.organization_memberships(organization_id,user_id,role) values('f9000000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','viewer');
set local role service_role;
select throws_ok($q$ select public.persist_project_baseline('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: foreign organization owner denied');
select throws_ok($q$ select public.persist_project_baseline('f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',null,repeat('a',64)) $q$,'42501',null,'public.persist_project_baseline: unavailable project denied');
select throws_ok($q$ select public.persist_verification_plan('f9200000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: foreign organization owner denied');
select throws_ok($q$ select public.persist_verification_plan('f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001',repeat('a',64),'{}') $q$,'42501',null,'public.persist_verification_plan: unavailable project denied');
select throws_ok($q$ select private.lock_drone_original_upload('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002') $q$,'42501',null,'private.lock_drone_original_upload: foreign organization owner denied');
select throws_ok($q$ select private.lock_drone_original_upload('f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'private.lock_drone_original_upload: unavailable project denied');
select throws_ok($q$ select public.prepare_project_media_original_read('f9200000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002') $q$,'42501',null,'public.prepare_project_media_original_read: foreign organization owner denied');
select throws_ok($q$ select public.prepare_project_media_original_read('f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001') $q$,'42501',null,'public.prepare_project_media_original_read: unavailable project denied');
reset role;
select ok(not has_any_column_privilege('service_role','public.project_baseline_snapshots','UPDATE'),'fix adds no baseline UPDATE privilege');
select ok(not has_any_column_privilege('service_role','public.verification_plan_versions','UPDATE'),'fix adds no plan UPDATE privilege');
select is(jsonb_build_object(
 'baselines',(select jsonb_agg(to_jsonb(row) order by id) from public.project_baseline_snapshots row),
 'plans',(select jsonb_agg(to_jsonb(row) order by id) from public.verification_plan_versions row),
 'uploads',(select jsonb_agg(to_jsonb(row) order by id) from public.uploads row),
 'media',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media row),
 'origins',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_upload_origins row),
 'promotions',(select jsonb_agg(to_jsonb(row) order by id) from public.project_media_promotion_requests row),
 'storage',(select jsonb_agg(to_jsonb(row) order by id) from storage.objects row)
),(select value from role_before_graph),'all immutable data/original/Storage/canonical bytes unchanged');
select * from finish();
rollback;
