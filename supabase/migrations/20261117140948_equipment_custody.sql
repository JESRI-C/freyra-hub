-- A reservation allocates equipment. Custody records when it actually leaves
-- and returns, without replacing the booking record or its cancellation history.
create table public.work_order_equipment_custody (
  booking_id uuid primary key references public.work_order_equipment_bookings(id) on delete restrict,
  equipment_id uuid not null references public.organization_work_equipment(id) on delete restrict,
  checked_out_at timestamptz not null default clock_timestamp(),
  checked_out_by uuid not null references auth.users(id) on delete restrict,
  checkout_request_id uuid not null,
  returned_at timestamptz,
  returned_by uuid references auth.users(id) on delete restrict,
  return_request_id uuid,
  check (
    (returned_at is null and returned_by is null and return_request_id is null) or
    (returned_at is not null and returned_by is not null and return_request_id is not null)
  )
);
create unique index equipment_one_open_custody
  on public.work_order_equipment_custody(equipment_id) where returned_at is null;
alter table public.work_order_equipment_custody enable row level security;
revoke all on public.work_order_equipment_custody from public, anon, authenticated, service_role;

-- A transfer invitation is single-use. Accepted rows preserve the chain of custody.
create table public.work_order_equipment_transfers (
  id uuid primary key,
  booking_id uuid not null references public.work_order_equipment_custody(booking_id),
  offered_by uuid not null references auth.users(id),
  offered_at timestamptz not null default clock_timestamp(),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  check ((accepted_at is null) = (accepted_by is null)),
  check (accepted_by is distinct from offered_by),
  constraint equipment_transfer_position_valid check (
    (latitude is null and longitude is null and accuracy_m is null)
    or (accepted_at is not null and latitude is not null and longitude is not null and accuracy_m is not null
      and latitude between -90 and 90 and longitude between -180 and 180
      and accuracy_m >= 0 and accuracy_m < 'Infinity'::double precision)
  )
);
create unique index equipment_one_pending_transfer
  on public.work_order_equipment_transfers(booking_id) where accepted_at is null;
alter table public.work_order_equipment_transfers enable row level security;
revoke all on public.work_order_equipment_transfers from public, anon, authenticated, service_role;
alter table public.work_order_equipment_custody add column holder_id uuid references auth.users(id);
update public.work_order_equipment_custody set holder_id=checked_out_by;
alter table public.work_order_equipment_custody alter column holder_id set not null;

create function private.work_order_equipment_custody_receipt(p_booking_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce((
    select jsonb_build_object('status',case when returned_at is null then 'checked_out' else 'returned' end,
      'checked_out_at',c.checked_out_at,'returned_at',c.returned_at,
      'can_offer_transfer',c.returned_at is null and c.holder_id=auth.uid(),
      'can_accept_transfer',c.returned_at is null and c.holder_id<>auth.uid() and private.can_execute_work_order(b.action_id) is true,
      'holder_id',c.holder_id,'holder_name',nullif(holder.full_name,''),

      'transfers',coalesce((select jsonb_agg(jsonb_build_object(
        'from_name',nullif(sender.full_name,''),'to_name',nullif(recipient.full_name,''),'accepted_at',t.accepted_at,
        'position',case when t.latitude is not null then jsonb_build_object(
          'latitude',t.latitude,'longitude',t.longitude,'accuracy_m',t.accuracy_m
        ) end
      ) order by t.accepted_at,t.id) from public.work_order_equipment_transfers t
        left join public.profiles sender on sender.id=t.offered_by
        left join public.profiles recipient on recipient.id=t.accepted_by
        where t.booking_id=c.booking_id and t.accepted_at is not null),'[]'::jsonb),
      'can_return',c.returned_at is null and (c.holder_id=auth.uid() or private.can_manage_project(b.project_id) is true))
    from public.work_order_equipment_custody c join public.work_order_equipment_bookings b on b.id=c.booking_id
    left join public.profiles holder on holder.id=c.holder_id
    where c.booking_id=p_booking_id
  ),jsonb_build_object('status','reserved','checked_out_at',null,'returned_at',null,'can_return',false));
$$;
revoke all on function private.work_order_equipment_custody_receipt(uuid)
  from public, anon, authenticated, service_role;

create function private.read_work_order_equipment_custody(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_booking_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  result jsonb;
begin
  if auth.uid() is null or (private.can_execute_work_order(p_action_id) or private.can_manage_project(p_project_id)) is not true
    or not exists (
      select 1 from public.work_order_equipment_bookings b
      where b.id=p_booking_id and b.organization_id=p_organization_id
        and b.project_id=p_project_id and b.action_id=p_action_id
    )
  then raise exception 'Equipment custody is unavailable' using errcode='42501'; end if;
  select jsonb_build_object('name', e.name, 'starts_on', b.starts_on, 'ends_on', b.ends_on,
    'cancelled', b.cancelled_at is not null,
    'can_checkout', b.cancelled_at is null and
      (clock_timestamp() at time zone 'Europe/Copenhagen')::date between b.starts_on and b.ends_on)
  into result from public.work_order_equipment_bookings b
  join public.organization_work_equipment e on e.id=b.equipment_id and e.organization_id=b.organization_id
  where b.id=p_booking_id and b.organization_id=p_organization_id
    and b.project_id=p_project_id and b.action_id=p_action_id;
  if result is null then raise exception 'Equipment custody is unavailable' using errcode='42501'; end if;
  return private.work_order_equipment_custody_receipt(p_booking_id) || jsonb_build_object('reservation', result);
end $$;

create function private.change_work_order_equipment_custody(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_booking_id uuid, p_operation text, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  booking public.work_order_equipment_bookings;
  custody public.work_order_equipment_custody;
  work_date date := (clock_timestamp() at time zone 'Europe/Copenhagen')::date;
  manager boolean;
begin
  if actor is null then raise exception 'Equipment custody is unavailable' using errcode='42501'; end if;
  manager := private.can_manage_project(p_project_id) is true;
  if (private.can_execute_work_order(p_action_id) or manager) is not true
  then raise exception 'Equipment custody is unavailable' using errcode='42501'; end if;
  if p_operation is null or p_operation not in ('checkout','return') or p_request_id is null
  then raise exception 'Invalid custody operation' using errcode='22023'; end if;

  select * into booking from public.work_order_equipment_bookings b
    where b.id=p_booking_id and b.organization_id=p_organization_id
      and b.project_id=p_project_id and b.action_id=p_action_id
    for update;
  if not found then raise exception 'Equipment custody is unavailable' using errcode='42501'; end if;
  -- Serialize changes for this physical asset, including across reservations.
  perform 1 from public.organization_work_equipment e where e.id=booking.equipment_id for update;
  select * into custody from public.work_order_equipment_custody where booking_id=p_booking_id;

  if p_operation='checkout' then
    if custody.checkout_request_id=p_request_id and custody.checked_out_by=actor then
      return private.work_order_equipment_custody_receipt(p_booking_id);
    end if;
    if booking.cancelled_at is not null or work_date not between booking.starts_on and booking.ends_on
      or custody.booking_id is not null
    then raise exception 'Equipment cannot be checked out' using errcode='22023'; end if;
    insert into public.work_order_equipment_custody(booking_id,equipment_id,checked_out_by,holder_id,checkout_request_id)
      values (p_booking_id,booking.equipment_id,actor,actor,p_request_id);
  else
    if custody.booking_id is null or (custody.holder_id<>actor and not manager)
    then raise exception 'Equipment cannot be returned' using errcode='42501'; end if;
    if custody.return_request_id=p_request_id and custody.returned_by=actor then
      return private.work_order_equipment_custody_receipt(p_booking_id);
    end if;
    if custody.returned_at is not null
    then raise exception 'Equipment is already returned' using errcode='22023'; end if;
    update public.work_order_equipment_custody
      set returned_at=clock_timestamp(),returned_by=actor,return_request_id=p_request_id
      where booking_id=p_booking_id;
  end if;
  return private.work_order_equipment_custody_receipt(p_booking_id);
exception when unique_violation then
  raise exception 'Equipment is already checked out' using errcode='23505';
end $$;

create function public.read_work_order_equipment_custody(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_booking_id uuid
) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.read_work_order_equipment_custody(p_organization_id,p_project_id,p_action_id,p_booking_id);
$$;
create function public.change_work_order_equipment_custody(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_booking_id uuid, p_operation text, p_request_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select private.change_work_order_equipment_custody(
    p_organization_id,p_project_id,p_action_id,p_booking_id,p_operation,p_request_id);
$$;
revoke all on function private.read_work_order_equipment_custody(uuid,uuid,uuid,uuid),
  private.change_work_order_equipment_custody(uuid,uuid,uuid,uuid,text,uuid),
  public.read_work_order_equipment_custody(uuid,uuid,uuid,uuid),
  public.change_work_order_equipment_custody(uuid,uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.read_work_order_equipment_custody(uuid,uuid,uuid,uuid),
  private.change_work_order_equipment_custody(uuid,uuid,uuid,uuid,text,uuid),
  public.read_work_order_equipment_custody(uuid,uuid,uuid,uuid),
  public.change_work_order_equipment_custody(uuid,uuid,uuid,uuid,text,uuid)
  to authenticated;


-- A durable asset label reveals only the current performer's own reservations.
create index work_order_equipment_bookings_asset_date
  on public.work_order_equipment_bookings(equipment_id,starts_on,id);

create function private.list_field_equipment_label(p_equipment_id uuid)
returns table(booking_id uuid, action_id uuid, equipment_name text, job_title text,
  starts_on date, ends_on date, checked_out boolean)
language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  work_date date := (statement_timestamp() at time zone 'Europe/Copenhagen')::date;
begin
  if actor is null then raise exception 'Equipment is unavailable' using errcode='42501'; end if;
  return query
  select b.id, b.action_id, e.name,
    coalesce(nullif(plan.title,''),'Arbejdsopgave'),
    b.starts_on,b.ends_on,(c.booking_id is not null and c.returned_at is null)
  from public.work_order_equipment_bookings b
  join public.organization_work_equipment e
    on e.id=b.equipment_id and e.organization_id=b.organization_id
  left join public.work_order_equipment_custody c on c.booking_id=b.id
  left join lateral (
    select v.plan->>'title' as title from public.work_order_plan_versions v
    where v.action_id=b.action_id and v.organization_id=b.organization_id and v.project_id=b.project_id
    order by v.version desc limit 1
  ) plan on true
  where b.equipment_id=p_equipment_id
    and private.can_execute_work_order(b.action_id) is true
    and (
      (b.cancelled_at is null and work_date between b.starts_on and b.ends_on and c.booking_id is null)
      or (c.holder_id=actor and c.returned_at is null)
    )
  order by (c.booking_id is not null and c.returned_at is null) desc,b.starts_on,b.id
  limit 21;
end $$;

create function public.list_field_equipment_label(p_equipment_id uuid)
returns table(booking_id uuid, action_id uuid, equipment_name text, job_title text,
  starts_on date, ends_on date, checked_out boolean)
language sql stable security invoker set search_path='' as $$
  select * from private.list_field_equipment_label(p_equipment_id);
$$;
revoke all on function private.list_field_equipment_label(uuid), public.list_field_equipment_label(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.list_field_equipment_label(uuid), public.list_field_equipment_label(uuid)
  to authenticated;

-- Only the current holder can issue a code. Only another eligible worker may
-- accept it, using the same scoped job card. All mutations serialize with return.
create function private.change_work_order_equipment_transfer(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_booking_id uuid, p_operation text, p_code uuid,
  p_latitude double precision, p_longitude double precision, p_accuracy_m double precision
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  asset uuid;
  custody public.work_order_equipment_custody;
  invitation public.work_order_equipment_transfers;
begin
  if actor is null or private.can_execute_work_order(p_action_id) is not true then
    raise exception 'Equipment transfer is unavailable' using errcode='42501';
  end if;
  select b.equipment_id into asset from public.work_order_equipment_bookings b
    where b.id=p_booking_id and b.organization_id=p_organization_id
      and b.project_id=p_project_id and b.action_id=p_action_id for update;
  if not found then raise exception 'Equipment transfer is unavailable' using errcode='42501'; end if;
  perform 1 from public.organization_work_equipment e where e.id=asset for update;
  select * into custody from public.work_order_equipment_custody c where c.booking_id=p_booking_id;
  if custody.booking_id is null then
    raise exception 'Equipment transfer is unavailable' using errcode='42501';
  end if;

  if p_operation='offer' then
    if custody.returned_at is not null or custody.holder_id<>actor then
      raise exception 'Equipment transfer is unavailable' using errcode='42501';
    end if;
    delete from public.work_order_equipment_transfers t where t.booking_id=p_booking_id
      and t.accepted_at is null and t.offered_at <= clock_timestamp()-interval '15 minutes';
    insert into public.work_order_equipment_transfers(id,booking_id,offered_by)
      values (gen_random_uuid(),p_booking_id,actor)
      on conflict (booking_id) where accepted_at is null do nothing;
    select * into invitation from public.work_order_equipment_transfers t
      where t.booking_id=p_booking_id and t.accepted_at is null;
    return jsonb_build_object('code',invitation.id,'expires_at',invitation.offered_at+interval '15 minutes');
  elsif p_operation='accept' and p_code is not null then
    select * into invitation from public.work_order_equipment_transfers t
      where t.booking_id=p_booking_id and t.id=p_code;
    if invitation.accepted_by=actor then
      return private.work_order_equipment_custody_receipt(p_booking_id);
    end if;
    if invitation.id is null or invitation.accepted_at is not null
      or invitation.offered_by<>custody.holder_id or custody.holder_id=actor
      or custody.returned_at is not null or invitation.offered_at <= clock_timestamp()-interval '15 minutes' then
      raise exception 'Equipment transfer code is unavailable' using errcode='42501';
    end if;
    update public.work_order_equipment_transfers set accepted_by=actor,accepted_at=clock_timestamp(),
      latitude=p_latitude,longitude=p_longitude,accuracy_m=p_accuracy_m
      where id=p_code;
    update public.work_order_equipment_custody set holder_id=actor where booking_id=p_booking_id;
    return private.work_order_equipment_custody_receipt(p_booking_id);
  end if;
  raise exception 'Invalid equipment transfer operation' using errcode='22023';
end $$;

create function public.change_work_order_equipment_transfer(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_booking_id uuid, p_operation text, p_code uuid default null,
  p_latitude double precision default null, p_longitude double precision default null,
  p_accuracy_m double precision default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.change_work_order_equipment_transfer(
    p_organization_id,p_project_id,p_action_id,p_booking_id,p_operation,p_code,
    p_latitude,p_longitude,p_accuracy_m);
$$;
revoke all on function private.change_work_order_equipment_transfer(uuid,uuid,uuid,uuid,text,uuid,double precision,double precision,double precision),
  public.change_work_order_equipment_transfer(uuid,uuid,uuid,uuid,text,uuid,double precision,double precision,double precision)
  from public, anon, authenticated, service_role;
grant execute on function private.change_work_order_equipment_transfer(uuid,uuid,uuid,uuid,text,uuid,double precision,double precision,double precision),
  public.change_work_order_equipment_transfer(uuid,uuid,uuid,uuid,text,uuid,double precision,double precision,double precision)
  to authenticated;
