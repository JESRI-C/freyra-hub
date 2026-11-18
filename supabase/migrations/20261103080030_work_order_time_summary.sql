-- Manager-only total for one work order. Corrections replace the prior daily value.
create function public.get_work_order_time_summary(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_manage_project(p_project_id)
    or not private.can_read_work_order(p_action_id)
    or not exists (
      select 1 from public.work_orders w where w.action_id=p_action_id
        and w.organization_id=p_organization_id and w.project_id=p_project_id
    )
  then raise exception 'Work order time is unavailable' using errcode = '42501'; end if;

  with latest as (
    select distinct on (v.actor_id,v.work_date) v.actor_id,v.work_date,v.minutes
      from public.work_order_time_versions v
      where v.action_id=p_action_id and v.organization_id=p_organization_id and v.project_id=p_project_id
      order by v.actor_id,v.work_date,v.version desc
  )
  select jsonb_build_object(
    'minutes', coalesce(sum(l.minutes),0),
    'entries', count(*),
    'estimatedHours', (
      select p.plan->'estimatedHours' from public.work_order_plan_versions p
      where p.action_id=p_action_id and p.organization_id=p_organization_id and p.project_id=p_project_id
      order by p.version desc limit 1
    )
  ) into result from latest l;
  return result;
end $$;
revoke all on function public.get_work_order_time_summary(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_work_order_time_summary(uuid,uuid,uuid) to authenticated;
