-- Customer registry and versioned case context. The backing records are not API tables.
create table private.work_customer_sequences (
  organization_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('customer','case')),
  next_number bigint not null check (next_number > 0),
  primary key (organization_id,kind)
);
create table private.work_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  number text not null,
  version integer not null check (version > 0),
  unique(id,organization_id), unique(organization_id,number)
);
create table private.work_customer_versions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  organization_id uuid not null,
  version integer not null check (version > 0),
  data jsonb not null check (jsonb_typeof(data)='object'),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(customer_id,organization_id) references private.work_customers(id,organization_id),
  unique(customer_id,version), unique(id,customer_id,organization_id)
);
alter table private.work_customers add constraint work_customer_current_version_fk
  foreign key(id,version) references private.work_customer_versions(customer_id,version)
  deferrable initially deferred;
create table private.work_customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  organization_id uuid not null,
  version integer not null check(version > 0),
  foreign key(customer_id,organization_id) references private.work_customers(id,organization_id),
  unique(id,customer_id,organization_id)
);
create table private.work_customer_contact_versions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  customer_id uuid not null,
  organization_id uuid not null,
  version integer not null check(version > 0),
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(contact_id,customer_id,organization_id) references private.work_customer_contacts(id,customer_id,organization_id),
  unique(contact_id,version), unique(id,contact_id,customer_id,organization_id)
);
alter table private.work_customer_contacts add constraint work_customer_contact_current_version_fk
  foreign key(id,version) references private.work_customer_contact_versions(contact_id,version)
  deferrable initially deferred;
create table private.work_customer_planner_versions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  version integer not null check(version > 0),
  enabled boolean not null,
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(customer_id,organization_id) references private.work_customers(id,organization_id),
  unique(customer_id,user_id,version)
);
create index work_customer_planner_latest on private.work_customer_planner_versions(customer_id,user_id,version desc);
create table private.work_customer_cases (
  project_id uuid primary key,
  organization_id uuid not null,
  number text not null,
  version integer not null check(version > 0),
  foreign key(project_id,organization_id) references public.projects(id,organization_id) on delete restrict,
  unique(project_id,organization_id), unique(organization_id,number)
);
create table private.work_case_customer_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  version integer not null check(version > 0),
  customer_id uuid not null,
  customer_revision_id uuid not null,
  contact_id uuid,
  contact_revision_id uuid,
  customer_reference text not null check(char_length(customer_reference)<=240),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(project_id,organization_id) references private.work_customer_cases(project_id,organization_id),
  foreign key(customer_revision_id,customer_id,organization_id) references private.work_customer_versions(id,customer_id,organization_id),
  foreign key(contact_revision_id,contact_id,customer_id,organization_id) references private.work_customer_contact_versions(id,contact_id,customer_id,organization_id),
  check ((contact_id is null)=(contact_revision_id is null)),
  unique(project_id,version)
);
alter table private.work_customer_cases add constraint work_customer_case_current_version_fk
  foreign key(project_id,version) references private.work_case_customer_versions(project_id,version)
  deferrable initially deferred;
create table private.work_customer_requests (
  organization_id uuid not null references public.organizations(id),
  actor_id uuid not null,
  request_id uuid not null,
  fingerprint text not null,
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(organization_id,actor_id,request_id)
);

do $tables$ declare t text; begin
  foreach t in array array['work_customer_sequences','work_customers','work_customer_versions',
    'work_customer_contacts','work_customer_contact_versions','work_customer_planner_versions',
    'work_customer_cases','work_case_customer_versions','work_customer_requests'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on table private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $tables$;

create function private.work_customer_history_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Customer history is immutable' using errcode='55000'; end $$;
do $history$ declare t text; begin
  foreach t in array array['work_customer_versions','work_customer_contact_versions',
    'work_customer_planner_versions','work_case_customer_versions','work_customer_requests'] loop
    execute format('create trigger immutable_customer_history before update or delete on private.%I for each row execute function private.work_customer_history_immutable()',t);
  end loop;
end $history$;

create function private.work_customer_keys(p jsonb,allowed text[]) returns void
language plpgsql immutable security invoker set search_path='' as $$
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>16000 then
    raise exception 'Invalid customer data' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p) k where not(k=any(allowed))) then
    raise exception 'Unknown customer data' using errcode='22023';
  end if;
end $$;
create function private.work_customer_text(p jsonb,k text,max_length integer,required boolean default false) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare v text;
begin
  if p?k and jsonb_typeof(p->k)<>'string' then raise exception 'Invalid customer text' using errcode='22023'; end if;
  v:=btrim(coalesce(p->>k,''));
  if char_length(v)>max_length or (required and v='') then raise exception 'Invalid customer text' using errcode='22023'; end if;
  return v;
end $$;
create function private.work_customer_uuid(p jsonb,k text,optional boolean default false) returns uuid
language plpgsql immutable security invoker set search_path='' as $$
begin
  if optional and (not(p?k) or p->k='null'::jsonb) then return null; end if;
  if jsonb_typeof(p->k) is distinct from 'string' or coalesce(p->>k,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid customer identifier' using errcode='22023';
  end if;
  return (p->>k)::uuid;
end $$;
create function private.work_customer_expected(p jsonb) returns integer
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(p->'expectedVersion') is distinct from 'number' or (p->>'expectedVersion') !~ '^[0-9]{1,10}$' then
    raise exception 'Invalid expected version' using errcode='22023';
  end if;
  if (p->>'expectedVersion')::numeric>2147483646 then raise exception 'Invalid expected version' using errcode='22023'; end if;
  return (p->>'expectedVersion')::integer;
end $$;
create function private.work_customer_number(org uuid,p_kind text) returns text
language plpgsql volatile security invoker set search_path='' as $$
declare n bigint;
begin
  insert into private.work_customer_sequences as seq values(org,p_kind,2)
    on conflict(organization_id,kind) do update set next_number=seq.next_number+1
    returning next_number-1 into n;
  return (case p_kind when 'customer' then 'K-' else 'S-' end)||
    case when n<1000000 then lpad(n::text,6,'0') else n::text end;
end $$;
create function private.can_plan_work_customer(org uuid,cid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.can_read_organization(org) and exists(
   select 1 from private.work_customers c where c.id=cid and c.organization_id=org and (
     private.can_manage_organization(org) or coalesce((select g.enabled
       from private.work_customer_planner_versions g where g.customer_id=cid and g.organization_id=org
       and g.user_id=auth.uid() order by g.version desc limit 1),false)))
$$;

create function private.work_customer_case_json(org uuid,pid uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',v.id,'version',v.version,'number',c.number,
   'customerId',v.customer_id,'customerRevisionId',v.customer_revision_id,
   'customerNumber',customer.number,'customerName',cv.data->>'name',
   'contactId',v.contact_id,'contactRevisionId',v.contact_revision_id,'contact',contact.data,
   'customerReference',v.customer_reference)
 from private.work_customer_cases c join private.work_case_customer_versions v
   on v.project_id=c.project_id and v.version=c.version
 join private.work_customers customer on customer.id=v.customer_id
 join private.work_customer_versions cv on cv.id=v.customer_revision_id
 left join private.work_customer_contact_versions contact on contact.id=v.contact_revision_id
 where c.organization_id=org and c.project_id=pid
$$;

create function private.query_work_customers(org uuid,expected_actor uuid,operation text,payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid; pid uuid; aid uuid; result jsonb; page jsonb; manage boolean; offset_value integer; query_text text;
begin
  if auth.uid() is null or auth.uid() is distinct from expected_actor or not private.can_read_organization(org) then
    raise exception 'Customer access denied' using errcode='42501';
  end if;
  manage:=private.can_manage_organization(org);
  if operation='list' then
    perform private.work_customer_keys(payload,array['search','includeArchived','offset']);
    query_text:=private.work_customer_text(payload,'search',120);
    if jsonb_typeof(payload->'includeArchived') is distinct from 'boolean'
      or jsonb_typeof(payload->'offset') is distinct from 'number'
      or coalesce(payload->>'offset','') !~ '^[0-9]{1,6}$'
      or (payload->>'offset')::numeric>100000 then raise exception 'Invalid customer page' using errcode='22023'; end if;
    offset_value:=(payload->>'offset')::integer;
    select coalesce(jsonb_agg(item order by number,id),'[]'::jsonb) into page from (
      select jsonb_build_object('id',c.id,'number',c.number,'version',c.version,'data',v.data) item,c.number,c.id
      from private.work_customers c join private.work_customer_versions v on v.customer_id=c.id and v.version=c.version
      where c.organization_id=org and private.can_plan_work_customer(org,c.id)
        and ((payload->>'includeArchived')::boolean or not (v.data->>'archived')::boolean)
        and (query_text='' or position(lower(query_text) in lower((v.data->>'name')||' '||c.number))>0)
      order by c.number,c.id offset offset_value limit 51
    ) items;
    return jsonb_build_object('organizationId',org,'canManage',manage,'rows',
      (select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(page) with ordinality a(value,ord) where ord<=50),
      'hasMore',jsonb_array_length(page)>50);
  elsif operation='customer' then
    perform private.work_customer_keys(payload,array['customerId']);
    cid:=private.work_customer_uuid(payload,'customerId');
    if not private.can_plan_work_customer(org,cid) then raise exception 'Customer access denied' using errcode='42501'; end if;
    select jsonb_build_object('id',c.id,'number',c.number,'version',c.version,'data',v.data) into result
      from private.work_customers c join private.work_customer_versions v on v.customer_id=c.id and v.version=c.version where c.id=cid;
    return jsonb_build_object('organizationId',org,'canManage',manage,'customer',result,
      'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'version',c.version,'data',v.data) order by v.data->>'name',c.id),'[]'::jsonb)
        from private.work_customer_contacts c join private.work_customer_contact_versions v on v.contact_id=c.id and v.version=c.version where c.customer_id=cid),
      'history',(select coalesce(jsonb_agg(item order by version desc),'[]'::jsonb) from (
        select jsonb_build_object('version',version,'changedAt',created_at,'data',data) item,version from private.work_customer_versions where customer_id=cid order by version desc limit 20) h),
      'planners',case when manage then (select coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'enabled',enabled,'version',version) order by user_id),'[]'::jsonb) from (
        select distinct on(user_id) user_id,enabled,version from private.work_customer_planner_versions where customer_id=cid order by user_id,version desc) g) else '[]'::jsonb end,
      'availableUsers',case when manage then (select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(nullif(p.full_name,''),nullif(p.email,''),'Navn mangler')) order by m.user_id),'[]'::jsonb)
        from public.organization_memberships m left join public.profiles p on p.id=m.user_id where m.organization_id=org) else '[]'::jsonb end);
  elsif operation in ('case','job') then
    perform private.work_customer_keys(payload,case when operation='job' then array['projectId','actionId'] else array['projectId'] end);
    pid:=private.work_customer_uuid(payload,'projectId');
    if operation='job' then
      aid:=private.work_customer_uuid(payload,'actionId');
      if not private.can_read_work_order(aid) or not exists(select 1 from public.work_orders where action_id=aid and project_id=pid and organization_id=org) then
        raise exception 'Customer access denied' using errcode='42501';
      end if;
    elsif not private.can_read_project(pid) then
      raise exception 'Customer access denied' using errcode='42501';
    end if;
    if not exists(select 1 from public.projects where id=pid and organization_id=org) then
      raise exception 'Customer access denied' using errcode='42501';
    end if;
    return jsonb_build_object('organizationId',org,'projectId',pid,'actionId',aid,'canEdit',operation='case' and private.can_write_project(pid),'binding',private.work_customer_case_json(org,pid));
  end if;
  raise exception 'Unknown customer query' using errcode='22023';
end $$;

create function private.command_work_customers(org uuid,expected_actor uuid,request uuid,operation text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); cid uuid; contact_id_value uuid; pid uuid; target_user uuid;
 customer private.work_customers; contact private.work_customer_contacts; case_row private.work_customer_cases;
 cv private.work_customer_versions; contact_rev private.work_customer_contact_versions; prior_case private.work_case_customer_versions;
 prior_request private.work_customer_requests; expected integer; current_version integer; new_version integer;
 normalized jsonb; fingerprint text; result jsonb; entity_id uuid; entity_number text; selected_contact_revision uuid;
begin
 if actor is null or actor is distinct from expected_actor or request is null then raise exception 'Customer access denied' using errcode='42501'; end if;
 -- Hold the authorization row until commit, including against role changes and removal.
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor for share;
 if not found then raise exception 'Customer access denied' using errcode='42501'; end if;
 perform private.work_customer_keys(payload,array['customerId','contactId','projectId','userId','expectedVersion','data','enabled','title','description','location','customerReference']);
 if operation not in ('save_customer','save_contact','grant_planner','create_case','bind_case','save_reference') then raise exception 'Unknown customer command' using errcode='22023'; end if;
 if operation in ('bind_case','save_reference') then
   pid:=private.work_customer_uuid(payload,'projectId');
   perform 1 from public.projects where id=pid and organization_id=org for update;
   if not found or not private.can_write_project(pid) then raise exception 'Customer access denied' using errcode='42501'; end if;
 end if;
 if operation<>'save_reference' then
   cid:=private.work_customer_uuid(payload,'customerId',operation='save_customer');
   if cid is not null then
     select * into customer from private.work_customers where id=cid and organization_id=org for update;
     if not found then raise exception 'Customer access denied' using errcode='42501'; end if;
   end if;
   if operation in ('save_customer','save_contact','grant_planner') then
     if not private.can_manage_organization(org) then raise exception 'Customer access denied' using errcode='42501'; end if;
   elsif not private.can_plan_work_customer(org,cid) then raise exception 'Customer access denied' using errcode='42501'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||actor::text||':'||request::text,0));
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('operation',operation,'payload',payload)::text,'UTF8')),'hex');
 select * into prior_request from private.work_customer_requests where organization_id=org and actor_id=actor and request_id=request;
 if found then
   if prior_request.fingerprint<>fingerprint then raise exception 'Request was changed' using errcode='PT409'; end if;
   return prior_request.receipt;
 end if;
 if operation='save_customer' then
   perform private.work_customer_keys(payload,array['customerId','expectedVersion','data']);
   expected:=private.work_customer_expected(payload);
   perform private.work_customer_keys(payload->'data',array['name','registrationNumber','address','postalCode','city','country','archived']);
   if jsonb_typeof(payload->'data'->'archived') is distinct from 'boolean' then raise exception 'Invalid archive state' using errcode='22023'; end if;
   normalized:=jsonb_build_object('name',private.work_customer_text(payload->'data','name',240,true),
     'registrationNumber',private.work_customer_text(payload->'data','registrationNumber',40),
     'address',private.work_customer_text(payload->'data','address',500),'postalCode',private.work_customer_text(payload->'data','postalCode',30),
     'city',private.work_customer_text(payload->'data','city',160),'country',private.work_customer_text(payload->'data','country',80,true),'archived',payload->'data'->'archived');
   if expected<>coalesce(customer.version,0) then raise exception 'Customer was changed' using errcode='PT409'; end if;
   new_version:=expected+1;
   if cid is null then
     cid:=gen_random_uuid(); entity_number:=private.work_customer_number(org,'customer');
     insert into private.work_customers values(cid,org,entity_number,new_version);
   else
     entity_number:=customer.number; update private.work_customers set version=new_version where id=cid;
   end if;
   insert into private.work_customer_versions(customer_id,organization_id,version,data,created_by) values(cid,org,new_version,normalized,actor);
   entity_id:=cid;
 elsif operation='save_contact' then
   perform private.work_customer_keys(payload,array['customerId','contactId','expectedVersion','data']);
   expected:=private.work_customer_expected(payload); contact_id_value:=private.work_customer_uuid(payload,'contactId',true);
   perform private.work_customer_keys(payload->'data',array['name','title','email','phone','archived']);
   if jsonb_typeof(payload->'data'->'archived') is distinct from 'boolean' then raise exception 'Invalid archive state' using errcode='22023'; end if;
   normalized:=jsonb_build_object('name',private.work_customer_text(payload->'data','name',240,true),'title',private.work_customer_text(payload->'data','title',160),
     'email',private.work_customer_text(payload->'data','email',254),'phone',private.work_customer_text(payload->'data','phone',80),'archived',payload->'data'->'archived');
   if normalized->>'email'<>'' and (normalized->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid contact email' using errcode='22023'; end if;
   if contact_id_value is not null then
     select * into contact from private.work_customer_contacts where id=contact_id_value and customer_id=cid and organization_id=org for update;
     if not found then raise exception 'Customer access denied' using errcode='42501'; end if;
   end if;
   if expected<>coalesce(contact.version,0) then raise exception 'Contact was changed' using errcode='PT409'; end if;
   new_version:=expected+1;
   if contact_id_value is null then
     if (select (data->>'archived')::boolean from private.work_customer_versions where customer_id=cid and version=customer.version) then raise exception 'Customer is archived' using errcode='22023'; end if;
     contact_id_value:=gen_random_uuid(); insert into private.work_customer_contacts values(contact_id_value,cid,org,new_version);
   else update private.work_customer_contacts set version=new_version where id=contact_id_value; end if;
   insert into private.work_customer_contact_versions(contact_id,customer_id,organization_id,version,data,created_by) values(contact_id_value,cid,org,new_version,normalized,actor);
   entity_id:=contact_id_value;
 elsif operation='grant_planner' then
   perform private.work_customer_keys(payload,array['customerId','userId','expectedVersion','enabled']);
   expected:=private.work_customer_expected(payload); target_user:=private.work_customer_uuid(payload,'userId');
   if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'Invalid planner state' using errcode='22023'; end if;
   perform 1 from public.organization_memberships where organization_id=org and user_id=target_user for share;
   if not found then raise exception 'Customer access denied' using errcode='42501'; end if;
   select version into current_version from private.work_customer_planner_versions where customer_id=cid and user_id=target_user order by version desc limit 1;
   if expected<>coalesce(current_version,0) then raise exception 'Planner access was changed' using errcode='PT409'; end if;
   new_version:=expected+1;
   insert into private.work_customer_planner_versions(customer_id,organization_id,user_id,version,enabled,created_by)
     values(cid,org,target_user,new_version,(payload->>'enabled')::boolean,actor) returning id into entity_id;
 else
   if operation='create_case' then
     perform private.work_customer_keys(payload,array['customerId','contactId','title','description','location','customerReference']);
     pid:=gen_random_uuid();
     insert into public.projects(id,organization_id,name,description,location_name,project_type,status,country)
       values(pid,org,private.work_customer_text(payload,'title',240,true),private.work_customer_text(payload,'description',4000),
       private.work_customer_text(payload,'location',500),'Feltarbejde','planning','Danmark');
     insert into public.project_members(project_id,user_id,role,invited_by) values(pid,actor,'project_manager',actor);
     expected:=0;
   else
     expected:=private.work_customer_expected(payload);
     if operation='bind_case' then perform private.work_customer_keys(payload,array['projectId','customerId','contactId','expectedVersion','customerReference']);
     else perform private.work_customer_keys(payload,array['projectId','expectedVersion','customerReference']); end if;
   end if;
   select * into case_row from private.work_customer_cases where project_id=pid and organization_id=org for update;
   if expected<>coalesce(case_row.version,0) then raise exception 'Case customer was changed' using errcode='PT409'; end if;
   new_version:=expected+1;
   if operation='save_reference' then
     if case_row.project_id is null then raise exception 'Case has no customer' using errcode='22023'; end if;
     select * into prior_case from private.work_case_customer_versions where project_id=pid and version=case_row.version;
     cid:=prior_case.customer_id; selected_contact_revision:=prior_case.contact_revision_id; contact_id_value:=prior_case.contact_id;
     select * into cv from private.work_customer_versions where id=prior_case.customer_revision_id;
   else
     select * into cv from private.work_customer_versions where customer_id=cid and version=customer.version;
     if (cv.data->>'archived')::boolean then raise exception 'Customer is archived' using errcode='22023'; end if;
     contact_id_value:=private.work_customer_uuid(payload,'contactId',true);
     if contact_id_value is not null then
       select v.* into contact_rev from private.work_customer_contacts c join private.work_customer_contact_versions v on v.contact_id=c.id and v.version=c.version
         where c.id=contact_id_value and c.customer_id=cid and c.organization_id=org;
       if not found or (contact_rev.data->>'archived')::boolean then raise exception 'Customer access denied' using errcode='42501'; end if;
       selected_contact_revision:=contact_rev.id;
     end if;
   end if;
   if case_row.project_id is null then
     entity_number:=private.work_customer_number(org,'case'); insert into private.work_customer_cases values(pid,org,entity_number,new_version);
   else entity_number:=case_row.number; update private.work_customer_cases set version=new_version where project_id=pid; end if;
   insert into private.work_case_customer_versions(project_id,organization_id,version,customer_id,customer_revision_id,contact_id,contact_revision_id,customer_reference,created_by)
     values(pid,org,new_version,cid,cv.id,contact_id_value,selected_contact_revision,private.work_customer_text(payload,'customerReference',240),actor);
   entity_id:=pid;
 end if;
 result:=jsonb_build_object('organizationId',org,'requestId',request,'actorId',actor,'operation',operation,'id',entity_id,'version',new_version);
 if entity_number is not null then result:=result||jsonb_build_object('number',entity_number); end if;
 insert into private.work_customer_requests(organization_id,actor_id,request_id,fingerprint,receipt) values(org,actor,request,fingerprint,result);
 return result;
end $$;

-- Public wrappers are invoker functions. Privileged implementations stay unexposed.
create function public.query_work_customers(p_organization_id uuid,p_expected_actor_id uuid,p_operation text,p_payload jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
 select private.query_work_customers(p_organization_id,p_expected_actor_id,p_operation,p_payload)
$$;
create function public.command_work_customers(p_organization_id uuid,p_expected_actor_id uuid,p_request_id uuid,p_operation text,p_payload jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select private.command_work_customers(p_organization_id,p_expected_actor_id,p_request_id,p_operation,p_payload)
$$;
do $functions$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and (p.proname like 'work_customer_%' or p.proname in ('can_plan_work_customer','query_work_customers','command_work_customers')) loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $functions$;
revoke all on function public.query_work_customers(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.command_work_customers(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.query_work_customers(uuid,uuid,text,jsonb),private.command_work_customers(uuid,uuid,uuid,text,jsonb),
 public.query_work_customers(uuid,uuid,text,jsonb),public.command_work_customers(uuid,uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
