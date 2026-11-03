-- Project only the booking facts needed by a currently assigned performer.
create function private.list_field_work_order_equipment(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_after_starts_on date, p_after_id uuid
) returns table(id uuid, name text, kind text, starts_on date, ends_on date)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.can_execute_work_order(p_action_id) or not exists (
    select 1 from public.work_orders w
    where w.action_id=p_action_id and w.organization_id=p_organization_id and w.project_id=p_project_id
  ) then raise exception 'Task equipment is unavailable' using errcode='42501'; end if;
  if (p_after_starts_on is null) <> (p_after_id is null)
    then raise exception 'Invalid equipment cursor' using errcode='22023'; end if;
  return query
  select b.id,e.name,e.kind,b.starts_on,b.ends_on
  from public.work_order_equipment_bookings b
  join public.organization_work_equipment e on e.id=b.equipment_id and e.organization_id=b.organization_id
  where b.action_id=p_action_id and b.organization_id=p_organization_id and b.project_id=p_project_id
    and b.cancelled_at is null
    and (p_after_id is null or (b.starts_on,b.id)>(p_after_starts_on,p_after_id))
  order by b.starts_on,b.id limit 21;
end $$;
revoke all on function private.list_field_work_order_equipment(uuid,uuid,uuid,date,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.list_field_work_order_equipment(uuid,uuid,uuid,date,uuid) to authenticated;

create function public.list_field_work_order_equipment(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_after_starts_on date default null, p_after_id uuid default null
) returns table(id uuid, name text, kind text, starts_on date, ends_on date)
language sql stable security invoker set search_path='' as $$
  select * from private.list_field_work_order_equipment(
    p_organization_id,p_project_id,p_action_id,p_after_starts_on,p_after_id
  );
$$;
revoke all on function public.list_field_work_order_equipment(uuid,uuid,uuid,date,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_field_work_order_equipment(uuid,uuid,uuid,date,uuid) to authenticated;
