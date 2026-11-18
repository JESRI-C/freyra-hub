create table public.work_order_equipment_service_reports (
  id uuid primary key,
  equipment_id uuid not null references public.organization_work_equipment(id),
  booking_id uuid not null references public.work_order_equipment_bookings(id),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('inspection','service')),
  condition text not null check (condition in ('ready','needs_service','out_of_service')),
  note text not null check (length(note) between 1 and 2000),
  next_service_on date check (next_service_on between date '0001-01-01' and date '9999-12-31')
);
create index equipment_service_history on public.work_order_equipment_service_reports
  (equipment_id,recorded_at desc,id desc);
alter table public.work_order_equipment_service_reports enable row level security;
revoke all on public.work_order_equipment_service_reports from public, anon, authenticated, service_role;

create function private.equipment_service_journal(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_booking_id uuid,
  p_report_id uuid, p_kind text, p_condition text, p_note text, p_next_service_on date,
  p_limit integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  today date := (statement_timestamp() at time zone 'Europe/Copenhagen')::date;
  manager boolean;
  booking public.work_order_equipment_bookings;
  existing public.work_order_equipment_service_reports;
  latest_due date;
  rows jsonb;
  can_record boolean;
begin
  if actor is null then raise exception 'Equipment service is unavailable' using errcode='42501'; end if;
  manager := private.can_manage_project(p_project_id) is true;
  select * into booking from public.work_order_equipment_bookings b
    where b.id=p_booking_id and b.organization_id=p_organization_id
      and b.project_id=p_project_id and b.action_id=p_action_id for share;
  if booking.id is null or (not manager and (
    booking.cancelled_at is not null or private.can_execute_work_order(p_action_id) is not true
  )) then raise exception 'Equipment service is unavailable' using errcode='42501'; end if;
  can_record := manager or today between booking.starts_on and booking.ends_on;

  if p_report_id is not null then
    if not can_record or (not manager and p_next_service_on is not null) then
      raise exception 'Equipment service cannot be recorded' using errcode='42501';
    end if;
    -- Keep retried requests and chronological writes consistent across reservations.
    perform 1 from public.organization_work_equipment e where e.id=booking.equipment_id for update;
    select * into existing from public.work_order_equipment_service_reports r where r.id=p_report_id;
    if existing.id is null then
      insert into public.work_order_equipment_service_reports
        (id,equipment_id,booking_id,recorded_by,kind,condition,note,next_service_on)
        values (p_report_id,booking.equipment_id,booking.id,actor,p_kind,p_condition,btrim(p_note),p_next_service_on);
    elsif existing.booking_id is distinct from booking.id or existing.recorded_by is distinct from actor
      or existing.kind is distinct from p_kind or existing.condition is distinct from p_condition
      or existing.note is distinct from btrim(p_note) or existing.next_service_on is distinct from p_next_service_on then
      raise exception 'Equipment service request conflicts' using errcode='22023';
    end if;
  end if;

  select r.next_service_on into latest_due from public.work_order_equipment_service_reports r
    where r.equipment_id=booking.equipment_id and r.next_service_on is not null
    order by r.recorded_at desc,r.id desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'kind',r.kind,'condition',r.condition,'recorded_at',r.recorded_at,
    'note',r.note,'next_service_on',r.next_service_on
  ) order by r.recorded_at desc,r.id desc),'[]'::jsonb)
  into rows from (
    select * from public.work_order_equipment_service_reports h
    where h.equipment_id=booking.equipment_id
    order by h.recorded_at desc,h.id desc limit greatest(1,least(200,coalesce(p_limit,20)))
  ) r;
  return jsonb_build_object('reports',rows,'can_record',can_record,'can_schedule',manager,
    'next_service_on',latest_due,'days_until_service',latest_due-today);
end $$;

create function public.equipment_service_journal(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_booking_id uuid,
  p_report_id uuid default null, p_kind text default null, p_condition text default null,
  p_note text default null, p_next_service_on date default null, p_limit integer default 20
) returns jsonb language sql security invoker set search_path='' as $$
  select private.equipment_service_journal(p_organization_id,p_project_id,p_action_id,p_booking_id,
    p_report_id,p_kind,p_condition,p_note,p_next_service_on,p_limit);
$$;
revoke all on function private.equipment_service_journal(uuid,uuid,uuid,uuid,uuid,text,text,text,date,integer),
  public.equipment_service_journal(uuid,uuid,uuid,uuid,uuid,text,text,text,date,integer)
  from public,anon,authenticated,service_role;
grant execute on function private.equipment_service_journal(uuid,uuid,uuid,uuid,uuid,text,text,text,date,integer),
  public.equipment_service_journal(uuid,uuid,uuid,uuid,uuid,text,text,text,date,integer)
  to authenticated;
