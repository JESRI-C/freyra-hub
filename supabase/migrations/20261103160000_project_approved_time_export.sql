-- A bounded, consistent export of the current approved daily time versions.
create function public.get_project_approved_time_export(
  p_organization_id uuid, p_project_id uuid, p_from date, p_through date
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_manage_project(p_project_id) or not exists (
    select 1 from public.projects p where p.id=p_project_id and p.organization_id=p_organization_id
  ) then raise exception 'Project time is unavailable' using errcode = '42501'; end if;
  if p_from is null or p_through is null or p_through<p_from or p_through-p_from>=31
    then raise exception 'Select up to 31 days' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.work_date,r.action_id,r.actor_id),'[]'::jsonb)
    into result from (
      select t.id as time_id,t.action_id,task.title,t.actor_id,t.work_date,
        t.version,t.minutes,a.approved_by,a.approved_at
      from public.work_order_time_versions t
      join public.work_order_time_approvals a on a.time_id=t.id
      join public.actions task on task.id=t.action_id and task.project_id=t.project_id
      where t.organization_id=p_organization_id and t.project_id=p_project_id
        and t.work_date between p_from and p_through and t.minutes>0
        and not exists (
          select 1 from public.work_order_time_versions newer
          where newer.action_id=t.action_id and newer.actor_id=t.actor_id
            and newer.work_date=t.work_date and newer.version>t.version
        )
      order by t.work_date,t.action_id,t.actor_id
      limit 5001
    ) r;
  if jsonb_array_length(result)>5000
    then raise exception 'Select a shorter period' using errcode = '54000'; end if;
  return result;
end $$;
revoke all on function public.get_project_approved_time_export(uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_project_approved_time_export(uuid,uuid,date,date) to authenticated;
