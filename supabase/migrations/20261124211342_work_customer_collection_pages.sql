-- Bounded customer queries. Keep the legacy detail operation for existing clients.
-- The current UI uses summary plus independently scoped pages; no tenant list is loaded in full.
create index work_customer_contacts_customer_idx on private.work_customer_contacts(customer_id,organization_id,id);
create index work_customer_planner_latest_idx on private.work_customer_planner_versions(customer_id,user_id,version desc);
create index work_customer_cases_customer_idx on private.work_case_customer_versions(customer_id,organization_id,project_id,version desc);

create or replace function private.query_work_customers(org uuid,expected_actor uuid,operation text,payload jsonb) returns jsonb
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
  elsif operation='cases' then
    perform private.work_customer_keys(payload,array['customerId','offset']);
    cid:=private.work_customer_uuid(payload,'customerId');
    if not private.can_plan_work_customer(org,cid) then raise exception 'Customer access denied' using errcode='42501'; end if;
    if jsonb_typeof(payload->'offset') is distinct from 'number'
      or coalesce(payload->>'offset','') !~ '^[0-9]{1,6}$'
      or (payload->>'offset')::numeric>100000 then raise exception 'Invalid customer page' using errcode='22023'; end if;
    offset_value:=(payload->>'offset')::integer;
    select coalesce(jsonb_agg(item order by number,project_id),'[]'::jsonb) into page from (
      select c.number,c.project_id,jsonb_build_object('projectId',c.project_id,'number',c.number,'title',p.name,
        'customerReference',v.customer_reference,'version',c.version) item
      from private.work_customer_cases c join private.work_case_customer_versions v on v.project_id=c.project_id and v.version=c.version
      join public.projects p on p.id=c.project_id and p.organization_id=c.organization_id
      where c.organization_id=org and v.customer_id=cid and private.can_read_project(c.project_id)
      order by c.number,c.project_id offset offset_value limit 51
    ) items;
    return jsonb_build_object('organizationId',org,'customerId',cid,'rows',
      (select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(page) with ordinality a(value,ord) where ord<=50),
      'hasMore',jsonb_array_length(page)>50);
  elsif operation='summary' then
    perform private.work_customer_keys(payload,array['customerId']);
    cid:=private.work_customer_uuid(payload,'customerId');
    if not private.can_plan_work_customer(org,cid) then raise exception 'Customer access denied' using errcode='42501'; end if;
    select jsonb_build_object('id',c.id,'number',c.number,'version',c.version,'data',v.data) into result
      from private.work_customers c join private.work_customer_versions v on v.customer_id=c.id and v.version=c.version where c.id=cid;
    return jsonb_build_object('organizationId',org,'canManage',manage,'customer',result);
  elsif operation in ('contacts','contact','members','history') then
    perform private.work_customer_keys(payload,case operation
      when 'contacts' then array['customerId','search','includeArchived','offset']
      when 'contact' then array['customerId','contactId']
      when 'members' then array['customerId','search','onlyEnabled','includeFormer','offset']
      else array['customerId','beforeVersion'] end);
    cid:=private.work_customer_uuid(payload,'customerId');
    if not private.can_plan_work_customer(org,cid) or (operation='members' and not manage)
      then raise exception 'Customer access denied' using errcode='42501'; end if;
    if operation='contact' then
      select jsonb_build_object('id',c.id,'version',c.version,'data',v.data) into result
        from private.work_customer_contacts c join private.work_customer_contact_versions v on v.contact_id=c.id and v.version=c.version
        where c.customer_id=cid and c.organization_id=org and c.id=private.work_customer_uuid(payload,'contactId');
      if result is null then raise exception 'Customer access denied' using errcode='42501'; end if;
      return jsonb_build_object('organizationId',org,'customerId',cid,'contact',result);
    elsif operation='history' then
      if payload->'beforeVersion'='null'::jsonb then offset_value:=null;
      elsif jsonb_typeof(payload->'beforeVersion')='number' and payload->>'beforeVersion' ~ '^[0-9]{1,10}$'
        and (payload->>'beforeVersion')::numeric between 1 and 2147483646 then offset_value:=(payload->>'beforeVersion')::integer;
      else raise exception 'Invalid history cursor' using errcode='22023'; end if;
      select coalesce(jsonb_agg(item order by version desc),'[]'::jsonb) into page from (
        select jsonb_build_object('version',version,'changedAt',created_at,'data',data) item,version
          from private.work_customer_versions where customer_id=cid and organization_id=org
          and (offset_value is null or version<offset_value) order by version desc limit 21
      ) history;
      return jsonb_build_object('organizationId',org,'customerId',cid,'rows',
        (select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(page) with ordinality a(value,ord) where ord<=20),
        'hasMore',jsonb_array_length(page)>20);
    end if;
    query_text:=private.work_customer_text(payload,'search',120);
    if jsonb_typeof(payload->'offset') is distinct from 'number' or coalesce(payload->>'offset','') !~ '^[0-9]{1,6}$'
      or (payload->>'offset')::numeric>100000 then raise exception 'Invalid customer page' using errcode='22023'; end if;
    offset_value:=(payload->>'offset')::integer;
    if operation='contacts' then
      if jsonb_typeof(payload->'includeArchived') is distinct from 'boolean' then raise exception 'Invalid contact filter' using errcode='22023'; end if;
      select coalesce(jsonb_agg(item order by sort_name,id),'[]'::jsonb) into page from (
        select c.id,lower(v.data->>'name') sort_name,jsonb_build_object('id',c.id,'version',c.version,'data',v.data) item
        from private.work_customer_contacts c join private.work_customer_contact_versions v on v.contact_id=c.id and v.version=c.version
        where c.customer_id=cid and c.organization_id=org
          and ((payload->>'includeArchived')::boolean or not(v.data->>'archived')::boolean)
          and (query_text='' or position(lower(query_text) in lower(concat_ws(' ',v.data->>'name',v.data->>'title',v.data->>'email',v.data->>'phone')))>0)
        order by lower(v.data->>'name'),c.id offset offset_value limit 51
      ) contacts;
    else
      if jsonb_typeof(payload->'onlyEnabled') is distinct from 'boolean' or jsonb_typeof(payload->'includeFormer') is distinct from 'boolean'
        then raise exception 'Invalid member filter' using errcode='22023'; end if;
      with latest as (
        select distinct on(user_id) user_id,version,enabled from private.work_customer_planner_versions
        where customer_id=cid and organization_id=org order by user_id,version desc
      ), candidates as (
        select m.user_id,left(coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Navn mangler'),500) display_name,
          coalesce(g.version,0) version,coalesce(g.enabled,false) enabled,true active_member,(m.role in ('owner','admin')) administrator,
          concat_ws(' ',p.full_name,p.email) search_name
        from public.organization_memberships m left join public.profiles p on p.id=m.user_id left join latest g on g.user_id=m.user_id
        where m.organization_id=org
        union all
        select g.user_id,'Fratrådt bruger',g.version,g.enabled,false,false,'Fratrådt bruger'
          from latest g where (payload->>'includeFormer')::boolean and not exists(
            select 1 from public.organization_memberships m where m.organization_id=org and m.user_id=g.user_id)
      )
      select coalesce(jsonb_agg(item order by sort_name,user_id),'[]'::jsonb) into page from (
        select user_id,lower(display_name) sort_name,jsonb_build_object('userId',user_id,'name',display_name,'version',version,
          'enabled',enabled,'activeMember',active_member,'administrator',administrator) item
        from candidates where ((payload->>'includeFormer')::boolean or active_member)
          and (not(payload->>'onlyEnabled')::boolean or enabled)
          and (query_text='' or position(lower(query_text) in lower(concat_ws(' ',display_name,search_name)))>0)
        order by lower(display_name),user_id offset offset_value limit 51
      ) members;
    end if;
    return jsonb_build_object('organizationId',org,'customerId',cid,'rows',
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

notify pgrst,'reload schema';
