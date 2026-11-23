-- Check availability across projects without returning any reservation data.
create function private.is_work_order_equipment_available(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_equipment_id uuid, p_starts_on date, p_ends_on date
) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.can_manage_project(p_project_id) or not exists (
    select 1 from public.work_orders w
    where w.action_id=p_action_id and w.organization_id=p_organization_id and w.project_id=p_project_id
  ) or not exists (
    select 1 from public.organization_work_equipment e
    where e.id=p_equipment_id and e.organization_id=p_organization_id
  ) then raise exception 'Equipment availability is unavailable' using errcode='42501'; end if;
  if p_starts_on is null or p_ends_on is null or
     p_starts_on not between date '0001-01-01' and date '9999-12-31' or
     p_ends_on not between p_starts_on and least(p_starts_on+365,date '9999-12-31')
  then raise exception 'Invalid booking period' using errcode='22023'; end if;

  return not exists (
    select 1 from public.work_order_equipment_bookings b
    where b.equipment_id=p_equipment_id and b.organization_id=p_organization_id
      and b.cancelled_at is null
      and daterange(b.starts_on,b.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')
  );
end $$;
revoke all on function private.is_work_order_equipment_available(uuid,uuid,uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function private.is_work_order_equipment_available(uuid,uuid,uuid,uuid,date,date)
  to authenticated;

create function public.is_work_order_equipment_available(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_equipment_id uuid, p_starts_on date, p_ends_on date
) returns boolean
language sql stable security invoker set search_path='' as $$
  select private.is_work_order_equipment_available(
    p_organization_id,p_project_id,p_action_id,p_equipment_id,p_starts_on,p_ends_on
  );
$$;
revoke all on function public.is_work_order_equipment_available(uuid,uuid,uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function public.is_work_order_equipment_available(uuid,uuid,uuid,uuid,date,date)
  to authenticated;
