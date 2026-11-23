create table public.gps_trip_amendment_history (
  trip_id uuid not null references public.gps_trip_log(id),
  revision integer not null check (revision>0),
  classification text not null check (classification in ('private','business')),
  purpose text,
  captured_at timestamptz not null default clock_timestamp(),
  baseline boolean not null default false,
  primary key (trip_id,revision)
);
alter table public.gps_trip_amendment_history enable row level security;
revoke all on public.gps_trip_amendment_history from public,anon,authenticated,service_role;
grant select on public.gps_trip_amendment_history to authenticated;
-- Historic private classifications are visible only to the trip's own driver.
create policy gps_trip_amendment_history_driver_read
  on public.gps_trip_amendment_history for select to authenticated using (
    exists (select 1 from public.gps_trip_log t where t.id=trip_id
      and t.driver_id=(select auth.uid()))
  );

-- Existing trips have only their current revision available at migration time.
insert into public.gps_trip_amendment_history(trip_id,revision,classification,purpose,baseline)
  select id,revision,classification,purpose,true from public.gps_trip_log;

create function private.capture_gps_trip_amendment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' or new.revision<>old.revision then
    insert into public.gps_trip_amendment_history(trip_id,revision,classification,purpose)
      values (new.id,new.revision,new.classification,new.purpose);
  end if;
  return new;
end $$;
revoke all on function private.capture_gps_trip_amendment() from public,anon,authenticated,service_role;
create trigger gps_trip_amendment_capture
  after insert or update of revision on public.gps_trip_log
  for each row execute function private.capture_gps_trip_amendment();
