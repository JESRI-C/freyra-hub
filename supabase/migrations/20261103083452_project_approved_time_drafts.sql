-- Immutable snapshots for reviewing billing evidence.
create table public.project_approved_time_drafts (
  id uuid primary key,
  organization_id uuid not null,
  project_id uuid not null,
  date_from date not null,
  date_through date not null,
  rate_ore integer not null check (rate_ore between 0 and 99999999),
  time_ids uuid[] not null check (cardinality(time_ids) between 1 and 5000),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='array'),
  total_ore bigint not null check (total_ore>=0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete restrict
);
create index project_approved_time_drafts_recent
  on public.project_approved_time_drafts(project_id, created_at desc, id);
alter table public.project_approved_time_drafts enable row level security;
revoke all on public.project_approved_time_drafts from public, anon, authenticated, service_role;
grant select on public.project_approved_time_drafts to authenticated;
grant insert (id,organization_id,project_id,date_from,date_through,rate_ore,time_ids)
  on public.project_approved_time_drafts to authenticated;
create policy project_approved_time_drafts_read on public.project_approved_time_drafts
  for select to authenticated using (private.can_manage_project(project_id));
create policy project_approved_time_drafts_insert on public.project_approved_time_drafts
  for insert to authenticated with check (
    created_by=(select auth.uid()) and private.can_manage_project(project_id)
  );

create function private.populate_project_approved_time_draft() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare current_rows jsonb; current_ids uuid[];
begin
  if new.rate_ore is null or new.rate_ore not between 0 and 99999999
    or coalesce(cardinality(new.time_ids),0) not between 1 and 5000
  then raise exception 'Invalid draft input' using errcode = '22023'; end if;
  current_rows := public.get_project_approved_time_export(
    new.organization_id,new.project_id,new.date_from,new.date_through
  );
  select array_agg((r.value->>'time_id')::uuid order by r.ordinality),
    coalesce(sum(((r.value->>'minutes')::bigint*new.rate_ore+30)/60),0)
  into current_ids,new.total_ore
  from jsonb_array_elements(current_rows) with ordinality r(value,ordinality);
  if current_ids is distinct from new.time_ids
    then raise exception 'Approved time changed' using errcode = '40001'; end if;
  new.snapshot := current_rows;
  new.created_at := now();
  return new;
end $$;
revoke all on function private.populate_project_approved_time_draft() from public, anon, authenticated, service_role;
create trigger populate_project_approved_time_draft before insert on public.project_approved_time_drafts
  for each row execute function private.populate_project_approved_time_draft();
