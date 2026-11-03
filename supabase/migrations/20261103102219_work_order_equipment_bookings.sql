-- An equipment identity is shared across projects in one organization.
create extension if not exists btree_gist with schema extensions;

create table public.organization_work_equipment (
  id uuid primary key,
  organization_id uuid not null,
  source_project_id uuid not null,
  name text not null check (name=btrim(name) and length(name) between 1 and 120),
  kind text not null check (kind in ('vehicle','machine','tool')),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  unique (id, organization_id),
  foreign key (source_project_id, organization_id)
    references public.projects(id, organization_id) on delete restrict
);
create unique index organization_work_equipment_name
  on public.organization_work_equipment (organization_id, lower(name));

alter table public.organization_work_equipment enable row level security;
revoke all on public.organization_work_equipment from public, anon, authenticated, service_role;
grant select on public.organization_work_equipment to authenticated;
grant insert (id,organization_id,source_project_id,name,kind) on public.organization_work_equipment to authenticated;
create policy organization_work_equipment_read on public.organization_work_equipment
  for select to authenticated using (
    private.can_manage_organization(organization_id) or exists (
      select 1 from public.projects p
      where p.organization_id=organization_work_equipment.organization_id
        and private.can_manage_project(p.id)
    )
  );
create policy organization_work_equipment_insert on public.organization_work_equipment
  for insert to authenticated with check (
    created_by=(select auth.uid()) and private.can_manage_project(source_project_id)
  );

create table public.work_order_equipment_bookings (
  id uuid primary key,
  organization_id uuid not null,
  project_id uuid not null,
  action_id uuid not null,
  equipment_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  check (starts_on between date '0001-01-01' and date '9999-12-31'),
  check (ends_on between starts_on and least(starts_on+365,date '9999-12-31')),
  check ((cancelled_at is null)=(cancelled_by is null)),
  foreign key (action_id,organization_id,project_id)
    references public.work_orders(action_id,organization_id,project_id) on delete restrict,
  foreign key (equipment_id,organization_id)
    references public.organization_work_equipment(id,organization_id) on delete restrict,
  exclude using gist (equipment_id extensions.gist_uuid_ops with =, daterange(starts_on,ends_on,'[]') with &&)
    where (cancelled_at is null)
);
create index work_order_equipment_bookings_action
  on public.work_order_equipment_bookings (action_id,starts_on,id);
alter table public.work_order_equipment_bookings enable row level security;
revoke all on public.work_order_equipment_bookings from public, anon, authenticated, service_role;
grant select on public.work_order_equipment_bookings to authenticated;
grant update (cancelled_at) on public.work_order_equipment_bookings to authenticated;
create policy work_order_equipment_bookings_read on public.work_order_equipment_bookings
  for select to authenticated using (private.can_manage_project(project_id));
create policy work_order_equipment_bookings_cancel on public.work_order_equipment_bookings
  for update to authenticated using (private.can_manage_project(project_id))
  with check (private.can_manage_project(project_id));

create function private.cancel_work_order_equipment_booking() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or old.cancelled_at is not null or new.cancelled_at is null
  then raise exception 'Booking cannot be cancelled' using errcode='22023'; end if;
  new.cancelled_at:=clock_timestamp();
  new.cancelled_by:=auth.uid();
  return new;
end $$;
revoke all on function private.cancel_work_order_equipment_booking() from public, anon, authenticated, service_role;
create trigger cancel_work_order_equipment_booking before update of cancelled_at
  on public.work_order_equipment_bookings for each row
  execute function private.cancel_work_order_equipment_booking();

-- Surface availability conflicts without exposing another project's reservation dates.
create function private.reserve_work_order_equipment(
  p_id uuid, p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_equipment_id uuid, p_starts_on date, p_ends_on date
) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.can_manage_project(p_project_id)
  then raise exception 'Equipment booking is unavailable' using errcode='42501'; end if;
  insert into public.work_order_equipment_bookings
    (id,organization_id,project_id,action_id,equipment_id,starts_on,ends_on,created_by)
  values(p_id,p_organization_id,p_project_id,p_action_id,p_equipment_id,p_starts_on,p_ends_on,auth.uid());
  return p_id;
exception
  when exclusion_violation then
    raise exception 'Equipment is already reserved in this period' using errcode='23P01';
  when foreign_key_violation then
    raise exception 'Equipment or work order is unavailable' using errcode='22023';
end $$;
revoke all on function private.reserve_work_order_equipment(uuid,uuid,uuid,uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function private.reserve_work_order_equipment(uuid,uuid,uuid,uuid,uuid,date,date)
  to authenticated;

create function public.reserve_work_order_equipment(
  p_id uuid, p_organization_id uuid, p_project_id uuid, p_action_id uuid,
  p_equipment_id uuid, p_starts_on date, p_ends_on date
) returns uuid
language sql security invoker set search_path='' as $$
  select private.reserve_work_order_equipment(
    p_id,p_organization_id,p_project_id,p_action_id,p_equipment_id,p_starts_on,p_ends_on
  );
$$;
revoke all on function public.reserve_work_order_equipment(uuid,uuid,uuid,uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_work_order_equipment(uuid,uuid,uuid,uuid,uuid,date,date)
  to authenticated;
