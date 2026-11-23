create function public.ingest_gps_position(
  p_project_id uuid, p_device_id uuid, p_event_id uuid,
  p_measured_at timestamptz, p_latitude double precision, p_longitude double precision
) returns boolean language plpgsql security invoker set search_path='' as $$
declare
  inserted uuid;
  marker constant jsonb := '{"kind":"gps_position"}'::jsonb;
begin
  if p_event_id is null or p_measured_at is null or not isfinite(p_measured_at)
    or p_measured_at>statement_timestamp() or p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
  then raise exception 'Invalid GPS measurement' using errcode='22023'; end if;

  perform 1 from public.monitoring_devices d where d.id=p_device_id
    and d.project_id=p_project_id and d.device_type='gps_tracker' for update;
  if not found then raise exception 'GPS tracker is unavailable' using errcode='P0002'; end if;

  insert into public.device_measurements
    (id,device_id,measured_at,value,quality_status,latitude,longitude,source_payload)
    values (p_event_id,p_device_id,p_measured_at,1,'valid',p_latitude,p_longitude,marker)
    on conflict (id) do nothing returning id into inserted;
  if inserted is null then
    if exists (select 1 from public.device_measurements m where m.id=p_event_id
      and m.device_id=p_device_id and m.measured_at=p_measured_at
      and m.latitude=p_latitude and m.longitude=p_longitude and m.source_payload=marker)
    then return false; end if;
    raise exception 'GPS measurement ID is already in use' using errcode='23505';
  end if;

  update public.monitoring_devices d
    set last_seen_at=greatest(d.last_seen_at,p_measured_at),
      last_measurement_at=greatest(d.last_measurement_at,p_measured_at),
      status=case when d.status='not_activated' then 'active' else d.status end
    where d.id=p_device_id;
  return true;
end $$;

revoke all on function public.ingest_gps_position(uuid,uuid,uuid,timestamptz,double precision,double precision)
  from public,anon,authenticated,service_role;
grant execute on function public.ingest_gps_position(uuid,uuid,uuid,timestamptz,double precision,double precision)
  to service_role;
