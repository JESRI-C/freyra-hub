create table public.gps_trip_log (
  id uuid primary key,
  project_id uuid not null references public.projects(id),
  device_id uuid not null references public.monitoring_devices(id),
  driver_id uuid not null references auth.users(id),
  start_position_id uuid not null references public.device_measurements(id),
  end_position_id uuid not null references public.device_measurements(id),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  classification text not null check (classification in ('private','business')),
  purpose text,
  recorded_at timestamptz not null default clock_timestamp(),
  check (started_at<ended_at),
  check ((classification='private' and purpose is null) or
         (classification='business' and purpose is not null and length(purpose) between 1 and 500))
);
create index gps_trip_log_device_time on public.gps_trip_log (project_id,device_id,started_at desc,id desc);
alter table public.gps_trip_log enable row level security;
revoke all on public.gps_trip_log from public,anon,authenticated,service_role;
grant select on public.gps_trip_log to authenticated;
create policy gps_trip_log_read on public.gps_trip_log for select to authenticated using (
  public.is_project_member(project_id,(select auth.uid()))
  and (driver_id=(select auth.uid()) or (classification='business' and private.can_manage_project(project_id)))
);

create function private.record_gps_trip(
  p_id uuid,p_project_id uuid,p_device_id uuid,p_start_id uuid,p_end_id uuid,
  p_classification text,p_purpose text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  start_time timestamptz;
  end_time timestamptz;
  reason text := nullif(btrim(p_purpose),'');
  saved_id uuid;
begin
  if actor is null or public.is_project_member(p_project_id,actor) is not true then
    raise exception 'GPS trip is unavailable' using errcode='42501';
  end if;
  if p_id is null or p_classification is null or p_classification not in ('private','business')
    or (p_classification='private' and reason is not null)
    or (p_classification='business' and (reason is null or length(reason)>500)) then
    raise exception 'Invalid GPS trip classification' using errcode='22023';
  end if;
  perform 1 from public.monitoring_devices d where d.id=p_device_id
    and d.project_id=p_project_id and d.device_type='gps_tracker' for share;
  if not found then raise exception 'GPS tracker is unavailable' using errcode='42501'; end if;

  select max(m.measured_at) filter (where m.id=p_start_id),
    max(m.measured_at) filter (where m.id=p_end_id) into start_time,end_time
  from public.device_measurements m where m.device_id=p_device_id and m.id in (p_start_id,p_end_id)
    and m.latitude between -90 and 90 and m.longitude between -180 and 180
    and m.quality_status<>'invalid' and m.measured_at<=statement_timestamp();
  if start_time is null or end_time is null or start_time>=end_time then
    raise exception 'Select two valid positions in chronological order' using errcode='22023';
  end if;

  -- Serialize overlapping entries for the same driver and tracker.
  perform pg_advisory_xact_lock(hashtextextended('gps-trip:'||actor::text||':'||p_device_id::text,0));
  select t.id into saved_id from public.gps_trip_log t
  where t.id=p_id and t.project_id=p_project_id and t.device_id=p_device_id and t.driver_id=actor
    and t.start_position_id=p_start_id and t.end_position_id=p_end_id
    and t.classification=p_classification and t.purpose is not distinct from reason;
  if saved_id is not null then return saved_id; end if;
  if exists (select 1 from public.gps_trip_log t where t.project_id=p_project_id
    and t.device_id=p_device_id and t.driver_id=actor and t.started_at<end_time and t.ended_at>start_time)
  then raise exception 'GPS trip overlaps an existing driver trip' using errcode='23P01'; end if;

  insert into public.gps_trip_log(id,project_id,device_id,driver_id,start_position_id,end_position_id,
      started_at,ended_at,classification,purpose)
    values (p_id,p_project_id,p_device_id,actor,p_start_id,p_end_id,start_time,end_time,p_classification,reason);
  return p_id;
end $$;

create function public.record_gps_trip(
  p_id uuid,p_project_id uuid,p_device_id uuid,p_start_id uuid,p_end_id uuid,
  p_classification text,p_purpose text default null
) returns uuid language sql security invoker set search_path='' as $$
  select private.record_gps_trip(p_id,p_project_id,p_device_id,p_start_id,p_end_id,p_classification,p_purpose);
$$;
revoke all on function private.record_gps_trip(uuid,uuid,uuid,uuid,uuid,text,text),
  public.record_gps_trip(uuid,uuid,uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.record_gps_trip(uuid,uuid,uuid,uuid,uuid,text,text),
  public.record_gps_trip(uuid,uuid,uuid,uuid,uuid,text,text) to authenticated;
