create index device_measurements_latest_position
  on public.device_measurements (device_id, measured_at desc, received_at desc, id desc)
  include (latitude, longitude)
  where latitude between -90 and 90 and longitude between -180 and 180
    and quality_status <> 'invalid';

-- Keep both device and measurement access under the existing project RLS.
create function public.list_latest_gps_device_positions(p_project_id uuid)
returns table(device_id uuid, latitude double precision, longitude double precision, measured_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select d.id, position.latitude, position.longitude, position.measured_at
  from public.monitoring_devices d
  cross join lateral (
    select m.latitude,m.longitude,m.measured_at
    from public.device_measurements m
    where m.device_id=d.id and m.latitude between -90 and 90 and m.longitude between -180 and 180
      and m.quality_status<>'invalid' and m.measured_at<=statement_timestamp()
    order by m.measured_at desc,m.received_at desc,m.id desc
    limit 1
  ) position
  where d.project_id=p_project_id and d.device_type='gps_tracker'
  order by d.id;
$$;
revoke all on function public.list_latest_gps_device_positions(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.list_latest_gps_device_positions(uuid) to authenticated;
