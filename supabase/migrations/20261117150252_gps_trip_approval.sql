alter table public.gps_trip_log
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id),
  add constraint gps_trip_approval_consistent check (
    (approved_at is null and approved_by is null)
    or (classification='business' and approved_at is not null and approved_by is not null)
  );

create function public.can_review_gps_trips(p_project_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and
    coalesce(public.is_project_member(p_project_id,auth.uid()),false)
    and coalesce(private.can_manage_project(p_project_id),false);
$$;

create function private.approve_gps_trip(p_project_id uuid,p_device_id uuid,p_trip_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare approved timestamptz;
begin
  if public.can_review_gps_trips(p_project_id) is not true then
    raise exception 'GPS trip approval is unavailable' using errcode='42501';
  end if;
  select t.approved_at into approved from public.gps_trip_log t
  where t.id=p_trip_id and t.project_id=p_project_id and t.device_id=p_device_id
    and t.classification='business' for update;
  if not found then raise exception 'GPS trip approval is unavailable' using errcode='42501'; end if;
  if approved is not null then return approved; end if;
  update public.gps_trip_log set approved_at=clock_timestamp(),approved_by=auth.uid()
    where id=p_trip_id returning approved_at into approved;
  return approved;
end $$;

create function public.approve_gps_trip(p_project_id uuid,p_device_id uuid,p_trip_id uuid)
returns timestamptz language sql security invoker set search_path='' as $$
  select private.approve_gps_trip(p_project_id,p_device_id,p_trip_id);
$$;

create function public.export_approved_gps_trips(
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
    select id,driver_id,started_at,ended_at,purpose,approved_at,approved_by
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

revoke all on function public.can_review_gps_trips(uuid),private.approve_gps_trip(uuid,uuid,uuid),
  public.approve_gps_trip(uuid,uuid,uuid),public.export_approved_gps_trips(uuid,uuid,date,date)
  from public,anon,authenticated,service_role;
grant execute on function public.can_review_gps_trips(uuid),private.approve_gps_trip(uuid,uuid,uuid),
  public.approve_gps_trip(uuid,uuid,uuid),public.export_approved_gps_trips(uuid,uuid,date,date)
  to authenticated;
