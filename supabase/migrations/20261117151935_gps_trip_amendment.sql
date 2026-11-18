alter table public.gps_trip_log add column revision integer not null default 1 check (revision>0);

create function private.amend_gps_trip(
  p_project_id uuid,p_device_id uuid,p_trip_id uuid,p_revision integer,
  p_classification text,p_purpose text
) returns integer language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  reason text := nullif(btrim(p_purpose,E' \t\r\n'),'');
  trip public.gps_trip_log;
begin
  if actor is null or public.is_project_member(p_project_id,actor) is not true then
    raise exception 'GPS trip is unavailable' using errcode='42501';
  end if;
  if p_revision is null or p_revision<1 or p_classification is null
    or p_classification not in ('private','business')
    or (p_classification='private' and reason is not null)
    or (p_classification='business' and (reason is null or length(reason)>500)) then
    raise exception 'Invalid GPS trip amendment' using errcode='22023';
  end if;
  select * into trip from public.gps_trip_log t where t.id=p_trip_id and t.project_id=p_project_id
    and t.device_id=p_device_id and t.driver_id=actor for update;
  if not found then raise exception 'GPS trip is unavailable' using errcode='42501'; end if;
  if trip.approved_at is not null then
    raise exception 'Approved GPS trips cannot be amended' using errcode='PT409';
  end if;
  if trip.classification=p_classification and trip.purpose is not distinct from reason
    and trip.revision-p_revision between 0 and 1 then return trip.revision; end if;
  if trip.revision<>p_revision then raise exception 'GPS trip changed' using errcode='PT409'; end if;
  update public.gps_trip_log set classification=p_classification,purpose=reason,revision=revision+1
    where id=p_trip_id returning revision into trip.revision;
  return trip.revision;
end $$;

create function public.amend_gps_trip(
  p_project_id uuid,p_device_id uuid,p_trip_id uuid,p_revision integer,
  p_classification text,p_purpose text default null
) returns integer language sql security invoker set search_path='' as $$
  select private.amend_gps_trip(p_project_id,p_device_id,p_trip_id,p_revision,p_classification,p_purpose);
$$;

drop function public.approve_gps_trip(uuid,uuid,uuid);
drop function private.approve_gps_trip(uuid,uuid,uuid);
create function private.approve_gps_trip(p_project_id uuid,p_device_id uuid,p_trip_id uuid,p_revision integer)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare trip public.gps_trip_log;
begin
  if public.can_review_gps_trips(p_project_id) is not true then
    raise exception 'GPS trip approval is unavailable' using errcode='42501';
  end if;
  select * into trip from public.gps_trip_log t where t.id=p_trip_id and t.project_id=p_project_id
    and t.device_id=p_device_id and t.classification='business' for update;
  if not found then raise exception 'GPS trip approval is unavailable' using errcode='42501'; end if;
  if trip.revision is distinct from p_revision then
    raise exception 'GPS trip changed; review the current revision' using errcode='PT409';
  end if;
  if trip.approved_at is not null then return trip.approved_at; end if;
  update public.gps_trip_log set approved_at=clock_timestamp(),approved_by=auth.uid()
    where id=p_trip_id returning approved_at into trip.approved_at;
  return trip.approved_at;
end $$;

create function public.approve_gps_trip(p_project_id uuid,p_device_id uuid,p_trip_id uuid,p_revision integer)
returns timestamptz language sql security invoker set search_path='' as $$
  select private.approve_gps_trip(p_project_id,p_device_id,p_trip_id,p_revision);
$$;

revoke all on function private.amend_gps_trip(uuid,uuid,uuid,integer,text,text),
  public.amend_gps_trip(uuid,uuid,uuid,integer,text,text),private.approve_gps_trip(uuid,uuid,uuid,integer),
  public.approve_gps_trip(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.amend_gps_trip(uuid,uuid,uuid,integer,text,text),
  public.amend_gps_trip(uuid,uuid,uuid,integer,text,text),private.approve_gps_trip(uuid,uuid,uuid,integer),
  public.approve_gps_trip(uuid,uuid,uuid,integer) to authenticated;
