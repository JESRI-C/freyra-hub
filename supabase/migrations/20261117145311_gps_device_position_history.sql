-- Extend the existing position projection with bounded, cursor-based history.
create function public.list_gps_device_position_history(
  p_project_id uuid, p_device_id uuid, p_from timestamptz, p_through timestamptz,
  p_before_measured_at timestamptz default null, p_before_id uuid default null
) returns table(id uuid, latitude double precision, longitude double precision, measured_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_from is null or p_through is null or not isfinite(p_from) or not isfinite(p_through)
    or p_from >= p_through or p_through-p_from > interval '168 hours'
    or (p_before_measured_at is null) <> (p_before_id is null)
  then raise exception 'Invalid GPS history window or cursor' using errcode='22023'; end if;

  return query
  select m.id,m.latitude,m.longitude,m.measured_at
  from public.monitoring_devices d
  join public.device_measurements m on m.device_id=d.id
  where d.project_id=p_project_id and d.id=p_device_id and d.device_type='gps_tracker'
    and m.latitude between -90 and 90 and m.longitude between -180 and 180 and m.quality_status<>'invalid'
    and m.measured_at between p_from and least(p_through,statement_timestamp())
    and (p_before_measured_at is null or (m.measured_at,m.id)<(p_before_measured_at,p_before_id))
  order by m.measured_at desc,m.id desc
  limit 101;
end $$;
revoke all on function public.list_gps_device_position_history(uuid,uuid,timestamptz,timestamptz,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.list_gps_device_position_history(uuid,uuid,timestamptz,timestamptz,timestamptz,uuid)
  to authenticated;
