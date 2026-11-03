-- Project-specific daily availability, separate from estimated and actual work.
create table public.project_work_availability_versions (
  id uuid primary key,
  organization_id uuid not null,
  project_id uuid not null,
  person_id uuid not null references auth.users(id) on delete restrict,
  work_date date not null check (work_date between date '0001-01-01' and date '9999-12-31'),
  version integer not null check (version > 0),
  hours numeric not null check (hours between 0 and 24 and round(hours, 2) = hours),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete restrict,
  unique (project_id, person_id, work_date, version)
);
alter table public.project_work_availability_versions enable row level security;
revoke all on public.project_work_availability_versions from public, anon, authenticated, service_role;
grant select, insert on public.project_work_availability_versions to authenticated;
create policy project_work_availability_read on public.project_work_availability_versions
  for select to authenticated using (private.can_manage_project(project_id));
create policy project_work_availability_insert on public.project_work_availability_versions
  for insert to authenticated with check (
    created_by = (select auth.uid()) and private.can_manage_project(project_id)
    and private.is_work_order_executor_member(project_id, person_id)
  );

create function private.validate_project_work_availability_insert() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare latest integer;
begin
  if auth.uid() is null or new.created_by is distinct from auth.uid()
    or not private.can_manage_project(new.project_id)
    or not private.is_work_order_executor_member(new.project_id,new.person_id)
  then raise exception 'Availability is unavailable' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'work-availability:' || new.project_id || ':' || new.person_id || ':' || new.work_date, 0));
  select coalesce(max(v.version),0) into latest
    from public.project_work_availability_versions v
    where v.project_id=new.project_id and v.person_id=new.person_id and v.work_date=new.work_date;
  if new.version <> latest + 1
    then raise exception 'Availability changed' using errcode = '40001'; end if;
  new.created_at := now();
  return new;
end $$;
revoke all on function private.validate_project_work_availability_insert() from public, anon, authenticated, service_role;
create trigger validate_project_work_availability before insert on public.project_work_availability_versions
  for each row execute function private.validate_project_work_availability_insert();
