create index equipment_service_due_history
  on public.work_order_equipment_service_reports (equipment_id, recorded_at desc, id desc)
  include (next_service_on) where next_service_on is not null;

create index work_order_equipment_active_project_asset
  on public.work_order_equipment_bookings (project_id, organization_id, equipment_id, ends_on desc, id)
  include (action_id) where cancelled_at is null;

create function private.list_project_equipment_service_reminders(
  p_organization_id uuid, p_project_id uuid,
  p_after_due date, p_after_equipment_id uuid
) returns table(
  equipment_id uuid, equipment_name text, action_id uuid, next_service_on date, days_until_service integer
) language plpgsql stable security definer set search_path='' as $$
declare today date := (statement_timestamp() at time zone 'Europe/Copenhagen')::date;
begin
  if auth.uid() is null or private.can_manage_project(p_project_id) is not true
    or not exists (select 1 from public.projects p
      where p.id=p_project_id and p.organization_id=p_organization_id)
  then raise exception 'Equipment service reminders are unavailable' using errcode='42501'; end if;
  if (p_after_due is null) <> (p_after_equipment_id is null) then
    raise exception 'Invalid equipment service cursor' using errcode='22023';
  end if;

  return query
  select latest_booking.equipment_id, e.name, latest_booking.action_id, due.next_service_on,
    due.next_service_on-today
  from (
    select distinct on (b.equipment_id) b.equipment_id, b.action_id
    from public.work_order_equipment_bookings b
    where b.project_id=p_project_id and b.organization_id=p_organization_id and b.cancelled_at is null
    order by b.equipment_id, b.ends_on desc, b.id
  ) latest_booking
  join public.organization_work_equipment e on e.id=latest_booking.equipment_id and e.organization_id=p_organization_id
  join lateral (
    select r.next_service_on from public.work_order_equipment_service_reports r
    where r.equipment_id=e.id and r.next_service_on is not null
    order by r.recorded_at desc,r.id desc limit 1
  ) due on true
  where due.next_service_on<=today+7
    and (p_after_due is null or (due.next_service_on, e.id)>(p_after_due,p_after_equipment_id))
  order by due.next_service_on,e.id
  limit 21;
end $$;

create function public.list_project_equipment_service_reminders(
  p_organization_id uuid, p_project_id uuid,
  p_after_due date default null, p_after_equipment_id uuid default null
) returns table(
  equipment_id uuid, equipment_name text, action_id uuid, next_service_on date, days_until_service integer
) language sql stable security invoker set search_path='' as $$
  select * from private.list_project_equipment_service_reminders(
    p_organization_id,p_project_id,p_after_due,p_after_equipment_id);
$$;
revoke all on function private.list_project_equipment_service_reminders(uuid,uuid,date,uuid),
  public.list_project_equipment_service_reminders(uuid,uuid,date,uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.list_project_equipment_service_reminders(uuid,uuid,date,uuid),
  public.list_project_equipment_service_reminders(uuid,uuid,date,uuid)
  to authenticated;
