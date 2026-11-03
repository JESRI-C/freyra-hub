-- Immutable visit outcomes tied to a stop in a specific work-order plan revision.
create table public.work_order_visit_results (
  id uuid primary key,
  plan_version_id uuid not null references public.work_order_plan_versions(id) on delete restrict,
  site_id uuid not null,
  action_id uuid not null,
  organization_id uuid not null,
  project_id uuid not null,
  version integer not null check (version > 0),
  outcome text not null check (outcome in ('visited','skipped')),
  note text not null check (
    note=btrim(note) and length(note)<=2000 and
    ((outcome='visited' and version=1) or note<>'')
  ),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (plan_version_id, site_id, version),
  foreign key (action_id, organization_id, project_id)
    references public.work_orders(action_id, organization_id, project_id) on delete restrict
);
alter table public.work_order_visit_results enable row level security;
revoke all on public.work_order_visit_results from public, anon, authenticated, service_role;
grant select on public.work_order_visit_results to authenticated;
grant insert (id,plan_version_id,site_id,action_id,organization_id,project_id,version,outcome,note)
  on public.work_order_visit_results to authenticated;
create policy work_order_visit_results_read on public.work_order_visit_results
  for select to authenticated using (private.can_read_work_order(action_id));
create policy work_order_visit_results_insert on public.work_order_visit_results
  for insert to authenticated with check (
    created_by=(select auth.uid()) and private.can_execute_work_order(action_id)
  );

create function private.validate_work_order_visit_result() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_plan public.work_order_plan_versions; latest integer;
begin
  if auth.uid() is null or new.created_by is distinct from auth.uid()
    or not private.can_execute_work_order(new.action_id)
  then raise exception 'Visit registration is unavailable' using errcode='42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('work-order-plan:'||new.action_id::text,0));
  select p.* into current_plan from public.work_order_plan_versions p
    where p.action_id=new.action_id and p.organization_id=new.organization_id and p.project_id=new.project_id
    order by p.version desc limit 1;
  if current_plan.id is distinct from new.plan_version_id
  then raise exception 'The visit plan changed' using errcode='40001'; end if;
  if current_plan.site_id is distinct from new.site_id and not exists (
    select 1 from jsonb_array_elements(coalesce(current_plan.plan->'visitStops','[]'::jsonb)) stop(value)
      where (stop.value->>'siteId')::uuid=new.site_id
  ) then raise exception 'Site is not on the visit plan' using errcode='22023'; end if;

  select max(v.version) into latest from public.work_order_visit_results v
    where v.plan_version_id=new.plan_version_id and v.site_id=new.site_id;
  if new.version is distinct from coalesce(latest,0)+1
  then raise exception 'Visit registration changed' using errcode='40001'; end if;
  return new;
end $$;
revoke all on function private.validate_work_order_visit_result() from public, anon, authenticated, service_role;
create trigger validate_work_order_visit_result before insert on public.work_order_visit_results
  for each row execute function private.validate_work_order_visit_result();

create function public.list_work_order_visit_results(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_plan_version_id uuid
) returns setof public.work_order_visit_results
language sql stable security invoker set search_path='' as $$
  select distinct on (v.site_id) v.*
  from public.work_order_visit_results v
  where v.organization_id=p_organization_id and v.project_id=p_project_id
    and v.action_id=p_action_id and v.plan_version_id=p_plan_version_id
  order by v.site_id,v.version desc;
$$;
revoke all on function public.list_work_order_visit_results(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_work_order_visit_results(uuid,uuid,uuid,uuid) to authenticated;
