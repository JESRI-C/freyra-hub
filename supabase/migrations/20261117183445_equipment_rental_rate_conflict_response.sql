-- A stale catalogue version is an HTTP conflict, not a retryable serialization failure.
-- See Supabase KB: SQLSTATE 40001 in an RPC function causes infinite retries.
create or replace function private.set_work_equipment_rental_rate(
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
    raise exception 'Equipment rate has changed; reload before editing' using errcode = 'PT409';
  end if;
  insert into public.work_equipment_rental_rate_versions
    (equipment_id, organization_id, version, request_id, daily_price_minor, changed_by)
  values (p_equipment_id, p_organization_id, current_version + 1, p_request_id, p_daily_price_minor::bigint, auth.uid());
  return private.read_work_equipment_rental_rate(p_organization_id, p_equipment_id)
    || jsonb_build_object('recorded_version', current_version + 1);
end $$;
