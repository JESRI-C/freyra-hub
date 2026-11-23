alter table public.gps_trip_log
  add column gps_distance_m bigint check (gps_distance_m>=0),
  add column gps_sample_count integer check (gps_sample_count>=0),
  add column gps_gap_count integer check (gps_gap_count>=0);

create function private.gps_trip_distance(
  p_device_id uuid,p_started_at timestamptz,p_ended_at timestamptz,
  p_start_position_id uuid,p_end_position_id uuid
) returns table(distance_m bigint,sample_count integer,gap_count integer)
language sql stable security invoker set search_path='' as $$
  with samples as (
    select distinct on (m.measured_at) m.measured_at,m.latitude,m.longitude
    from public.device_measurements m
    where m.device_id=p_device_id and m.measured_at between p_started_at and p_ended_at
      and m.latitude between -90 and 90 and m.longitude between -180 and 180
      and m.quality_status<>'invalid'
    order by m.measured_at,(m.id in (p_start_position_id,p_end_position_id)) desc,
      m.received_at desc,m.id desc
  ), segments as (
    select measured_at-lag(measured_at) over time_order as gap,
      power(sin(radians(latitude-lag(latitude) over time_order)/2),2)
      + cos(radians(latitude))*cos(radians(lag(latitude) over time_order))
      * power(sin(radians(longitude-lag(longitude) over time_order)/2),2) as haversine
    from samples
    window time_order as (order by measured_at)
  )
  select round(sum(12742000*asin(sqrt(least(1::double precision,greatest(0::double precision,haversine)))))
    filter (where gap<=interval '15 minutes'))::bigint,
    count(*)::integer,count(*) filter (where gap>interval '15 minutes')::integer
  from segments;
$$;

create function private.capture_gps_trip_distance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  select result.distance_m,result.sample_count,result.gap_count
    into new.gps_distance_m,new.gps_sample_count,new.gps_gap_count
    from private.gps_trip_distance(new.device_id,new.started_at,new.ended_at,
      new.start_position_id,new.end_position_id) result;
  return new;
end $$;
revoke all on function private.gps_trip_distance(uuid,timestamptz,timestamptz,uuid,uuid),
  private.capture_gps_trip_distance() from public,anon,authenticated,service_role;
create trigger gps_trip_distance_on_insert
  before insert on public.gps_trip_log for each row execute function private.capture_gps_trip_distance();

with distances as (
  select t.id,c.distance_m,c.sample_count,c.gap_count
  from public.gps_trip_log t
  cross join lateral private.gps_trip_distance(t.device_id,t.started_at,t.ended_at,t.start_position_id,t.end_position_id) c
)
update public.gps_trip_log t
  set gps_distance_m=d.distance_m,gps_sample_count=d.sample_count,gps_gap_count=d.gap_count
  from distances d where t.id=d.id;

create or replace function public.export_approved_gps_trips(
  p_project_id uuid,p_device_id uuid,p_from date,p_through date
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  rows jsonb;
begin
  if public.can_review_gps_trips(p_project_id) is not true then
    raise exception 'GPS trip export is unavailable' using errcode='42501';
  end if;
  if p_from is null or p_through is null
    or not isfinite(p_from) or not isfinite(p_through)
    or p_from>p_through or p_through-p_from>365
  then raise exception 'Invalid GPS trip export period' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.started_at,t.id),'[]'::jsonb) into rows
  from (
    select id,driver_id,started_at,ended_at,purpose,approved_at,approved_by,
      gps_distance_m,gps_sample_count,gps_gap_count
    from public.gps_trip_log b where b.project_id=p_project_id and b.device_id=p_device_id
      and b.classification='business' and b.approved_at is not null
      and b.started_at>=p_from::timestamp at time zone 'Europe/Copenhagen'
      and b.started_at<(p_through+1)::timestamp at time zone 'Europe/Copenhagen'
    order by b.started_at,b.id limit 1001
  ) t;
  if jsonb_array_length(rows)>1000 then
    raise exception 'Select a shorter GPS trip export period' using errcode='54000';
  end if;
  return rows;
end $$;
