-- Daily time worked on one action by the authenticated performer.
create table public.work_order_time_versions (
  id uuid primary key,
  action_id uuid not null,
  organization_id uuid not null,
  project_id uuid not null,
  work_date date not null check (work_date between date '0001-01-01' and date '9999-12-31'),
  minutes integer not null check (minutes between 0 and 1440),
  version integer not null check (version > 0),
  reason text not null default '' check (
    reason = btrim(reason) and length(reason) <= 1000
    and (version = 1 and minutes > 0 or version > 1 and reason <> '')
  ),
  actor_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (action_id, actor_id, work_date, version),
  foreign key (action_id, organization_id, project_id)
    references public.work_orders(action_id, organization_id, project_id) on delete restrict
);
alter table public.work_order_time_versions enable row level security;
revoke all on public.work_order_time_versions from public, anon, authenticated, service_role;
grant select, insert on public.work_order_time_versions to authenticated;
create policy work_order_time_read on public.work_order_time_versions for select to authenticated
  using (private.can_read_work_order(action_id)
    and (actor_id = (select auth.uid()) or private.can_manage_project(project_id)));
create policy work_order_time_insert on public.work_order_time_versions for insert to authenticated
  with check (actor_id = (select auth.uid()) and private.can_execute_work_order(action_id));

create function private.validate_work_order_time_insert() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare latest integer;
begin
  if auth.uid() is null or new.actor_id is distinct from auth.uid()
    or not private.can_execute_work_order(new.action_id)
  then raise exception 'Time registration is unavailable' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'work-order-time:' || new.action_id || ':' || new.actor_id || ':' || new.work_date, 0));
  select coalesce(max(v.version),0) into latest from public.work_order_time_versions v
    where v.action_id=new.action_id and v.actor_id=new.actor_id and v.work_date=new.work_date;
  if new.version <> latest + 1
    then raise exception 'Time registration changed' using errcode = '40001'; end if;
  new.created_at := now();
  return new;
end $$;
revoke all on function private.validate_work_order_time_insert() from public, anon, authenticated, service_role;
create trigger validate_work_order_time before insert on public.work_order_time_versions
  for each row execute function private.validate_work_order_time_insert();
