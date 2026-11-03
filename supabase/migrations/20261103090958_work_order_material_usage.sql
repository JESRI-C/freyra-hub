-- Materials consumed on the same scoped work order as time and execution.
create table public.work_order_material_versions (
  id uuid primary key,
  entry_id uuid not null,
  action_id uuid not null,
  organization_id uuid not null,
  project_id uuid not null,
  actor_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  material text not null check (material = btrim(material) and length(material) between 1 and 120),
  unit text not null check (unit in ('stk','kg','l','m','m2','m3')),
  quantity_milli integer not null check (quantity_milli between 0 and 999999999),
  version integer not null check (version > 0),
  reason text not null default '' check (
    reason = btrim(reason) and length(reason) <= 1000
    and (version = 1 and id = entry_id and quantity_milli > 0
         or version > 1 and id <> entry_id and reason <> '')
  ),
  unique (entry_id, version),
  foreign key (action_id, organization_id, project_id)
    references public.work_orders(action_id, organization_id, project_id) on delete restrict
);
create index work_order_material_scope
  on public.work_order_material_versions (action_id, entry_id, version desc);
alter table public.work_order_material_versions enable row level security;
revoke all on public.work_order_material_versions from public, anon, authenticated, service_role;
grant select on public.work_order_material_versions to authenticated;
grant insert (id,entry_id,action_id,organization_id,project_id,material,unit,quantity_milli,version,reason)
  on public.work_order_material_versions to authenticated;
create policy work_order_material_read on public.work_order_material_versions for select to authenticated
  using (private.can_read_work_order(action_id)
    and (actor_id = (select auth.uid()) or private.can_manage_project(project_id)));
create policy work_order_material_insert on public.work_order_material_versions for insert to authenticated
  with check (actor_id = (select auth.uid()) and private.can_execute_work_order(action_id));

create function private.validate_work_order_material_insert() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare previous public.work_order_material_versions;
begin
  if auth.uid() is null or new.actor_id is distinct from auth.uid()
    or not private.can_execute_work_order(new.action_id)
  then raise exception 'Material registration is unavailable' using errcode = '42501'; end if;
  if new.version > 1 then
    select v.* into previous from public.work_order_material_versions v
      where v.entry_id=new.entry_id and v.actor_id=new.actor_id and v.action_id=new.action_id
        and v.organization_id=new.organization_id and v.project_id=new.project_id
      order by v.version desc limit 1;
    if previous.version is null or new.version <> previous.version + 1
    then raise exception 'Material registration changed' using errcode = '40001'; end if;
    if new.material is distinct from previous.material or new.unit is distinct from previous.unit
    then raise exception 'Material and unit are fixed for a registration' using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_work_order_material_insert() from public, anon, authenticated, service_role;
create trigger validate_work_order_material before insert on public.work_order_material_versions
  for each row execute function private.validate_work_order_material_insert();

create function public.list_work_order_material_usage(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_after_entry_id uuid default null
) returns setof public.work_order_material_versions
language sql stable security invoker set search_path = '' as $$
  select distinct on (v.entry_id) v.*
    from public.work_order_material_versions v
    where v.organization_id=p_organization_id and v.project_id=p_project_id and v.action_id=p_action_id
      and (p_after_entry_id is null or v.entry_id>p_after_entry_id)
    order by v.entry_id,v.version desc limit 50;
$$;
revoke all on function public.list_work_order_material_usage(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_work_order_material_usage(uuid,uuid,uuid,uuid) to authenticated;
