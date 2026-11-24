-- Large fictional collections on the disposable local/CI database only.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.k(n integer) returns uuid language sql immutable as $$ select ('fc570000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select '00000000-0000-0000-0000-000000000000',pg_temp.k(n),'authenticated','authenticated','customer-page-'||n||'@example.test','',now(),'{"provider":"email"}','{"role":"admin"}',now(),now()
 from (select generate_series(1,5) n union all select generate_series(101,651)) users;
update public.profiles set full_name='Member '||lpad((right(id::text,12)::integer-100)::text,4,'0') where id between pg_temp.k(101) and pg_temp.k(651);
insert into public.organizations(id,name) values(pg_temp.k(11),'Fictional customer pages A'),(pg_temp.k(12),'Fictional customer pages B');
insert into public.organization_memberships(organization_id,user_id,role) values(pg_temp.k(11),pg_temp.k(1),'owner');
insert into public.organization_memberships(organization_id,user_id,role)
 select pg_temp.k(11),pg_temp.k(n),'viewer' from (select generate_series(2,3) n union all select 5 union all select generate_series(101,651)) members;
insert into public.organization_memberships(organization_id,user_id,role) values(pg_temp.k(12),pg_temp.k(4),'owner');
create temp table saved(key text primary key,data jsonb);
create temp table seen_contacts(id uuid primary key);
grant all on saved,seen_contacts to authenticated;
create function pg_temp.result(k text) returns jsonb language sql as $$ select data from pg_temp.saved where key=k $$;
create function pg_temp.cid() returns uuid language sql as $$ select (pg_temp.result('customer')->>'id')::uuid $$;
create function pg_temp.fields(n text default 'Large fictional customer') returns jsonb language sql as $$
 select jsonb_build_object('name',n,'registrationNumber','','address','Original fictional address','postalCode','0000','city','Fictional city','country','Danmark','archived',false) $$;
create function pg_temp.cmd(op text,p jsonb) returns jsonb language sql as $$ select public.command_work_customers(pg_temp.k(11),auth.uid(),gen_random_uuid(),op,p) $$;
create function pg_temp.q(op text,p jsonb) returns jsonb language sql as $$ select public.query_work_customers(pg_temp.k(11),auth.uid(),op,p) $$;
create function pg_temp.contacts(o integer default 0,s text default '',a boolean default false) returns jsonb language sql as $$
 select pg_temp.q('contacts',jsonb_build_object('customerId',pg_temp.cid(),'offset',o,'search',s,'includeArchived',a)) $$;
create function pg_temp.members(o integer default 0,s text default 'Member ',e boolean default false,f boolean default false) returns jsonb language sql as $$
 select pg_temp.q('members',jsonb_build_object('customerId',pg_temp.cid(),'offset',o,'search',s,'onlyEnabled',e,'includeFormer',f)) $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
insert into saved values('customer',pg_temp.cmd('save_customer',jsonb_build_object('customerId',null,'expectedVersion',0,'data',pg_temp.fields())));
do $fixture$ declare i integer;r jsonb;begin
 for i in 1..551 loop
  r:=pg_temp.cmd('save_contact',jsonb_build_object('customerId',pg_temp.cid(),'contactId',null,'expectedVersion',0,
    'data',jsonb_build_object('name','Contact '||lpad(i::text,4,'0')||case when i=1 then ' %_' else '' end,'title','','email','contact-'||i||'@example.test','phone','FAKE-'||i,'archived',false)));
  if i=551 then insert into pg_temp.saved values('last_contact',r); end if;
 end loop;
end $fixture$;
select ok(not(pg_temp.q('summary',jsonb_build_object('customerId',pg_temp.cid())) ? 'contacts'),'summary does not load the entire contact collection');
select ok(not(pg_temp.q('summary',jsonb_build_object('customerId',pg_temp.cid())) ? 'availableUsers'),'summary does not load the entire organization');
select is(pg_temp.q('summary',jsonb_build_object('customerId',pg_temp.cid()))->'customer'->>'name','Large fictional customer','customer opens with more than 500 contacts and members');
select is(jsonb_array_length(pg_temp.contacts()->'rows'),50,'contact page is bounded to 50');
select is((pg_temp.contacts()->>'hasMore')::boolean,true,'first page explicitly exposes the next page');
select is(jsonb_array_length(pg_temp.contacts(500)->'rows'),50,'contacts beyond the old 500 cap remain reachable');
select is(jsonb_array_length(pg_temp.contacts(550)->'rows'),1,'last page exposes the final contact');
select is((pg_temp.contacts(550)->>'hasMore')::boolean,false,'last contact page ends explicitly');
do $pages$ declare o integer;begin
 for o in 0..11 loop
  insert into pg_temp.seen_contacts select (value->>'id')::uuid from jsonb_array_elements(pg_temp.contacts(o*50)->'rows');
 end loop;
end $pages$;
select is((select count(*)::integer from seen_contacts),551,'paging reaches every contact exactly once');
select is(jsonb_array_length(pg_temp.contacts(0,'%_')->'rows'),1,'search treats wildcard characters literally');
select is(pg_temp.q('contact',jsonb_build_object('customerId',pg_temp.cid(),'contactId',pg_temp.result('last_contact')->>'id'))->'contact'->'data'->>'phone','FAKE-551','selected contact can be checked independently of the visible page');
select lives_ok($$select pg_temp.cmd('save_contact',jsonb_build_object('customerId',pg_temp.cid(),'contactId',pg_temp.result('last_contact')->>'id','expectedVersion',1,
 'data',jsonb_build_object('name','Contact 0551','title','','email','contact-551@example.test','phone','FAKE-551','archived',true)))$$,'last contact can be archived');
select is(jsonb_array_length(pg_temp.contacts(0,'0551')->'rows'),0,'active contact pages omit archived records');
select is(jsonb_array_length(pg_temp.contacts(0,'0551',true)->'rows'),1,'administrator can include archived contacts');
select is((pg_temp.q('contact',jsonb_build_object('customerId',pg_temp.cid(),'contactId',pg_temp.result('last_contact')->>'id'))->'contact'->'data'->>'archived')::boolean,true,'the selected contact lookup reports its current archived state');
select is(jsonb_array_length(pg_temp.members()->'rows'),50,'member page is bounded to 50');
select is((pg_temp.members()->>'hasMore')::boolean,true,'large member collection remains paged');
select is(jsonb_array_length(pg_temp.members(550)->'rows'),1,'members beyond 500 remain available');
select is((pg_temp.members(0,'0551')->'rows'->0->>'version')::integer,0,'an untargeted organization member has no grant revision');
select lives_ok($$select pg_temp.cmd('grant_planner',jsonb_build_object('customerId',pg_temp.cid(),'userId',pg_temp.k(651),'expectedVersion',0,'enabled',true))$$,'administrator can grant a member beyond the first 500');
select is(jsonb_array_length(pg_temp.members(0,'0551',true)->'rows'),1,'enabled filter returns the exact late member');
select is((pg_temp.members(0,'0551',true)->'rows'->0->>'version')::integer,1,'member response carries the grant revision for safe editing');
do $history$ declare i integer;begin
 for i in 1..30 loop perform pg_temp.cmd('save_customer',jsonb_build_object('customerId',pg_temp.cid(),'expectedVersion',i,
  'data',pg_temp.fields('History revision '||(i+1)))); end loop;
end $history$;
insert into saved values('history_first',pg_temp.q('history',jsonb_build_object('customerId',pg_temp.cid(),'beforeVersion',null)));
insert into saved values('history_old',pg_temp.q('history',jsonb_build_object('customerId',pg_temp.cid(),'beforeVersion',12)));
select is(jsonb_array_length(pg_temp.result('history_first')->'rows'),20,'history pages have at most 20 versions');
select is((pg_temp.result('history_first')->'rows'->0->>'version')::integer,31,'history starts with the current version');
select is((pg_temp.result('history_first')->'rows'->19->>'version')::integer,12,'first history cursor comes from its last row');
select is((pg_temp.result('history_first')->>'hasMore')::boolean,true,'older history is explicitly available');
select is(jsonb_array_length(pg_temp.result('history_old')->'rows'),11,'older history beyond the previous 20-version cap is reachable');
select is(pg_temp.result('history_old')->'rows'->10->'data'->>'name','Large fictional customer','the original customer name is retained');
select is(pg_temp.result('history_old')->'rows'->10->'data'->>'address','Original fictional address','older full customer fields are retained');
select is((pg_temp.result('history_old')->>'hasMore')::boolean,false,'last history page ends explicitly');
select throws_ok($$select pg_temp.q('history',jsonb_build_object('customerId',pg_temp.cid(),'beforeVersion',0))$$,'22023',null,'invalid history cursor is rejected');
select throws_ok($$select pg_temp.contacts(-1)$$,'22023',null,'negative offsets are rejected');
select throws_ok($$select pg_temp.q('summary',jsonb_build_object('customerId',pg_temp.cid(),'includeAll',true))$$,'22023',null,'unknown fields cannot broaden summary access');
select lives_ok($$select pg_temp.cmd('grant_planner',jsonb_build_object('customerId',pg_temp.cid(),'userId',pg_temp.k(2),'expectedVersion',0,'enabled',true))$$,'planner is granted only one customer');
insert into saved values('other_customer',pg_temp.cmd('save_customer',jsonb_build_object('customerId',null,'expectedVersion',0,'data',pg_temp.fields('Other hidden customer'))));
insert into saved values('other_contact',pg_temp.cmd('save_contact',jsonb_build_object('customerId',pg_temp.result('other_customer')->>'id','contactId',null,'expectedVersion',0,
 'data',jsonb_build_object('name','Hidden other contact','title','','email','hidden@example.test','phone','HIDDEN','archived',false))));
select throws_ok($$select pg_temp.q('contact',jsonb_build_object('customerId',pg_temp.cid(),'contactId',pg_temp.result('other_contact')->>'id'))$$,'42501',null,'contact IDs cannot cross customer scope even for an administrator');
select set_config('request.jwt.claim.sub',pg_temp.k(2)::text,true);
select is(jsonb_array_length(pg_temp.contacts()->'rows'),50,'explicit planner may read the granted customer contacts');
select lives_ok($$select pg_temp.q('history',jsonb_build_object('customerId',pg_temp.cid(),'beforeVersion',12))$$,'planner may read older customer history');
select throws_ok($$select pg_temp.members()$$,'42501',null,'planner cannot enumerate organization members');
select throws_ok($$select pg_temp.q('contacts',jsonb_build_object('customerId',pg_temp.result('other_customer')->>'id','offset',0,'search','','includeArchived',false))$$,'42501',null,'contact paging does not disclose another customer');
select set_config('request.jwt.claim.sub',pg_temp.k(3)::text,true);
select throws_ok($$select pg_temp.q('summary',jsonb_build_object('customerId',pg_temp.cid()))$$,'42501',null,'organization membership and editable metadata do not grant registry access');
select throws_ok($$select pg_temp.contacts(500)$$,'42501',null,'late contact pages have the same access gate');
select throws_ok($$select pg_temp.q('history',jsonb_build_object('customerId',pg_temp.cid(),'beforeVersion',12))$$,'42501',null,'older history does not broaden employee access');
select set_config('request.jwt.claim.sub',pg_temp.k(4)::text,true);
select throws_ok($$select pg_temp.contacts()$$,'42501',null,'foreign organization is denied before collection access');
select set_config('request.jwt.claim.sub',pg_temp.k(1)::text,true);
select pg_temp.cmd('grant_planner',jsonb_build_object('customerId',pg_temp.cid(),'userId',pg_temp.k(5),'expectedVersion',0,'enabled',true));
reset role;
delete from public.organization_memberships where organization_id=pg_temp.k(11) and user_id=pg_temp.k(5);
insert into public.organization_memberships(organization_id,user_id,role) values(pg_temp.k(12),pg_temp.k(5),'viewer');
update public.profiles set full_name='Foreign private profile' where id=pg_temp.k(5);
set local role authenticated;
select is(pg_temp.members(0,'Fratrådt',true,true)->'rows'->0->>'name','Fratrådt bruger','departed grants are labeled without reading a foreign profile');
select is((pg_temp.members(0,'Fratrådt',true,true)->'rows'->0->>'activeMember')::boolean,false,'departed grant is not presented as active membership');
select is(jsonb_array_length(pg_temp.members(0,'Foreign private',true,true)->'rows'),0,'member search does not expose the departed users current profile');
select is(jsonb_array_length(pg_temp.members(0,'Fratrådt',false,false)->'rows'),0,'grant picker can omit former members');
set constraints all immediate;
select * from finish();
rollback;
