-- Current catalogue rates and their immutable revisions. These are not charges
-- and must not be used to reprice a historical loan or invoice automatically.
create table public.work_equipment_rental_rate_versions (
  equipment_id uuid not null,
  organization_id uuid not null,
  version integer not null check (version > 0),
  request_id uuid not null,
  daily_price_minor bigint check (daily_price_minor between 0 and 999999999),
  currency text not null default 'DKK' check (currency = 'DKK'),
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid not null references auth.users(id),
  primary key (equipment_id, version),
  unique (equipment_id, request_id),
  foreign key (equipment_id, organization_id)
    references public.organization_work_equipment(id, organization_id) on delete restrict
);
alter table public.work_equipment_rental_rate_versions enable row level security;
revoke all on public.work_equipment_rental_rate_versions from public, anon, authenticated, service_role;

create function private.read_work_equipment_rental_rate(p_organization_id uuid, p_equipment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  rate public.work_equipment_rental_rate_versions;
  history jsonb;
  can_edit boolean;
begin
  if auth.uid() is null then
    raise exception 'Equipment rate unavailable' using errcode = '42501';
  end if;
  can_edit := private.can_manage_organization(p_organization_id);
  if not coalesce(can_edit, false) and not exists (
    select 1 from public.projects p where p.organization_id = p_organization_id
      and private.can_manage_project(p.id)
  ) then
    raise exception 'Equipment rate unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organization_work_equipment e
    where e.id = p_equipment_id and e.organization_id = p_organization_id) then
    raise exception 'Equipment rate unavailable' using errcode = '42501';
  end if;
  select * into rate from public.work_equipment_rental_rate_versions r
    where r.equipment_id = p_equipment_id order by r.version desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'version', r.version, 'daily_price_minor', r.daily_price_minor,
    'changed_at', r.changed_at, 'changed_by', r.changed_by
  ) order by r.version desc), '[]'::jsonb) into history from (
    select * from public.work_equipment_rental_rate_versions r
      where r.equipment_id = p_equipment_id order by r.version desc limit 20
  ) r;
  return jsonb_build_object(
    'equipment_id', p_equipment_id, 'organization_id', p_organization_id,
    'version', coalesce(rate.version, 0), 'daily_price_minor', rate.daily_price_minor,
    'currency', 'DKK', 'can_edit', coalesce(can_edit, false),
    'changed_at', rate.changed_at, 'changed_by', rate.changed_by, 'history', history
  );
end $$;

create function private.set_work_equipment_rental_rate(
  p_organization_id uuid, p_equipment_id uuid, p_expected_version integer,
  p_daily_price_minor numeric, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous public.work_equipment_rental_rate_versions;
  receipt public.work_equipment_rental_rate_versions;
  current_version integer;
begin
  if auth.uid() is null or not coalesce(private.can_manage_organization(p_organization_id), false) then
    raise exception 'Equipment rate unavailable' using errcode = '42501';
  end if;
  perform 1 from public.organization_work_equipment e
    where e.id = p_equipment_id and e.organization_id = p_organization_id for update;
  if not found then raise exception 'Equipment rate unavailable' using errcode = '42501'; end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 0
    or (p_daily_price_minor is not null and (
      p_daily_price_minor < 0 or p_daily_price_minor > 999999999
      or p_daily_price_minor <> trunc(p_daily_price_minor)
    )) then raise exception 'Invalid daily rate' using errcode = '22023'; end if;

  select * into receipt from public.work_equipment_rental_rate_versions r
    where r.equipment_id = p_equipment_id and r.request_id = p_request_id;
  if found then
    if receipt.changed_by <> auth.uid() or receipt.version - 1 <> p_expected_version
      or receipt.daily_price_minor is distinct from p_daily_price_minor then
      raise exception 'Request does not match recorded change' using errcode = '22023';
    end if;
    return private.read_work_equipment_rental_rate(p_organization_id, p_equipment_id)
      || jsonb_build_object('recorded_version', receipt.version);
  end if;
  select * into previous from public.work_equipment_rental_rate_versions r
    where r.equipment_id = p_equipment_id order by r.version desc limit 1;
  current_version := coalesce(previous.version, 0);
  if current_version <> p_expected_version then
    raise exception 'Equipment rate has changed; reload before editing' using errcode = '40001';
  end if;
  insert into public.work_equipment_rental_rate_versions
    (equipment_id, organization_id, version, request_id, daily_price_minor, changed_by)
  values (p_equipment_id, p_organization_id, current_version + 1, p_request_id, p_daily_price_minor::bigint, auth.uid());
  return private.read_work_equipment_rental_rate(p_organization_id, p_equipment_id)
    || jsonb_build_object('recorded_version', current_version + 1);
end $$;

create function public.read_work_equipment_rental_rate(p_organization_id uuid, p_equipment_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.read_work_equipment_rental_rate(p_organization_id, p_equipment_id);
$$;
create function public.set_work_equipment_rental_rate(
  p_organization_id uuid, p_equipment_id uuid, p_expected_version integer,
  p_daily_price_minor numeric, p_request_id uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_work_equipment_rental_rate(p_organization_id, p_equipment_id, p_expected_version, p_daily_price_minor, p_request_id);
$$;
revoke all on function
  private.read_work_equipment_rental_rate(uuid,uuid),
  public.read_work_equipment_rental_rate(uuid,uuid),
  private.set_work_equipment_rental_rate(uuid,uuid,integer,numeric,uuid),
  public.set_work_equipment_rental_rate(uuid,uuid,integer,numeric,uuid)
from public, anon, authenticated, service_role;
grant execute on function
  private.read_work_equipment_rental_rate(uuid,uuid),
  public.read_work_equipment_rental_rate(uuid,uuid),
  private.set_work_equipment_rental_rate(uuid,uuid,integer,numeric,uuid),
  public.set_work_equipment_rental_rate(uuid,uuid,integer,numeric,uuid)
to authenticated;
