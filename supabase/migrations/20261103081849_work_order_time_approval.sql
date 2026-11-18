-- Approval binds an immutable daily time version and requires a different actor.
create table public.work_order_time_approvals (
  time_id uuid primary key references public.work_order_time_versions(id) on delete restrict,
  approved_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now()
);
alter table public.work_order_time_approvals enable row level security;
revoke all on public.work_order_time_approvals from public, anon, authenticated, service_role;
grant select, insert on public.work_order_time_approvals to authenticated;
create policy work_order_time_approvals_read on public.work_order_time_approvals
  for select to authenticated using (exists (
    select 1 from public.work_order_time_versions t where t.id=time_id
  ));
create policy work_order_time_approvals_insert on public.work_order_time_approvals
  for insert to authenticated with check (
    approved_by=(select auth.uid()) and exists (
      select 1 from public.work_order_time_versions t where t.id=time_id
        and t.actor_id<>(select auth.uid()) and private.can_manage_project(t.project_id)
    )
  );

create function private.validate_work_order_time_approval() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare target public.work_order_time_versions;
begin
  select * into target from public.work_order_time_versions v where v.id=new.time_id;
  if auth.uid() is null or new.approved_by is distinct from auth.uid()
    or target.id is null or target.actor_id=auth.uid()
    or not private.can_manage_project(target.project_id)
  then raise exception 'Time approval is unavailable' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'work-order-time:' || target.action_id || ':' || target.actor_id || ':' || target.work_date, 0));
  if exists (
    select 1 from public.work_order_time_versions v
    where v.action_id=target.action_id and v.actor_id=target.actor_id
      and v.work_date=target.work_date and v.version>target.version
  ) then raise exception 'Time registration changed' using errcode = '40001'; end if;
  new.approved_at := now();
  return new;
end $$;
revoke all on function private.validate_work_order_time_approval() from public, anon, authenticated, service_role;
create trigger validate_work_order_time_approval before insert on public.work_order_time_approvals
  for each row execute function private.validate_work_order_time_approval();

create function public.list_work_order_time_for_review(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_work_date date,
  p_after_actor_id uuid default null
) returns table(time_id uuid, actor_id uuid, version integer, minutes integer, approved boolean)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.can_manage_project(p_project_id) or not exists (
    select 1 from public.work_orders w where w.action_id=p_action_id
      and w.organization_id=p_organization_id and w.project_id=p_project_id
      and private.can_read_work_order(w.action_id)
  ) then raise exception 'Time review is unavailable' using errcode = '42501'; end if;

  return query
  select v.id,v.actor_id,v.version,v.minutes,a.time_id is not null
  from (
    select distinct on (t.actor_id) t.id,t.actor_id,t.version,t.minutes
    from public.work_order_time_versions t
    where t.action_id=p_action_id and t.organization_id=p_organization_id
      and t.project_id=p_project_id and t.work_date=p_work_date
      and (p_after_actor_id is null or t.actor_id>p_after_actor_id)
    order by t.actor_id,t.version desc limit 100
  ) v
  left join public.work_order_time_approvals a on a.time_id=v.id
  order by v.actor_id;
end $$;
revoke all on function public.list_work_order_time_for_review(uuid,uuid,uuid,date,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_work_order_time_for_review(uuid,uuid,uuid,date,uuid) to authenticated;
