-- Read the project's task totals in stable pages under the existing manager and task policies.
create function public.list_project_work_order_time_review(
  p_organization_id uuid, p_project_id uuid, p_after_action_id uuid default null
) returns table(action_id uuid, title text, minutes bigint, entries bigint, estimated_hours numeric,
  pending_entries bigint, pending_date date)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.can_manage_project(p_project_id) or not exists (
    select 1 from public.projects p where p.id=p_project_id and p.organization_id=p_organization_id
  ) then raise exception 'Project time is unavailable' using errcode = '42501'; end if;

  return query
  with page as (
    select a.id,a.title from public.actions a
    where a.project_id=p_project_id and a.action_type is distinct from 'workflow_followup'
      and (p_after_action_id is null or a.id>p_after_action_id)
    order by a.id limit 100
  )
  select a.id,a.title,coalesce(t.minutes,0),t.entries,p.hours,t.pending_entries,t.pending_date
    from page a
    left join lateral (
      select sum(v.minutes) as minutes,count(*) as entries,
        count(*) filter (where approval.time_id is null) as pending_entries,
        coalesce(
          min(v.work_date) filter (where approval.time_id is null and v.actor_id<>auth.uid()),
          min(v.work_date) filter (where approval.time_id is null)
        ) as pending_date
      from (
        select distinct on (r.actor_id,r.work_date) r.id,r.actor_id,r.work_date,r.minutes
        from public.work_order_time_versions r
        where r.action_id=a.id and r.organization_id=p_organization_id and r.project_id=p_project_id
        order by r.actor_id,r.work_date,r.version desc
      ) v
      left join public.work_order_time_approvals approval on approval.time_id=v.id
    ) t on true
    left join lateral (
      select (v.plan->>'estimatedHours')::numeric as hours
      from public.work_order_plan_versions v
      where v.action_id=a.id and v.organization_id=p_organization_id and v.project_id=p_project_id
      order by v.version desc limit 1
    ) p on true
    order by a.id;
end $$;
revoke all on function public.list_project_work_order_time_review(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_project_work_order_time_review(uuid,uuid,uuid) to authenticated;

-- Preserve the existing API result for clients that only need task totals.
create or replace function public.list_project_work_order_time(
  p_organization_id uuid, p_project_id uuid, p_after_action_id uuid default null
) returns table(action_id uuid, title text, minutes bigint, entries bigint, estimated_hours numeric)
language sql stable security invoker set search_path = '' as $$
  select t.action_id,t.title,t.minutes,t.entries,t.estimated_hours
    from public.list_project_work_order_time_review(p_organization_id,p_project_id,p_after_action_id) t
    order by t.action_id;
$$;