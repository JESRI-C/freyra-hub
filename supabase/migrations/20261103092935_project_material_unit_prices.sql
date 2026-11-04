-- Unit prices are manager-only and independent of field material snapshots.
create table public.project_material_unit_prices (
  id uuid primary key,
  catalog_id uuid not null,
  organization_id uuid not null,
  project_id uuid not null,
  version integer not null check (version > 0),
  unit_price_ore integer check (unit_price_ore between 0 and 99999999),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  check (version > 1 or unit_price_ore is not null),
  unique (catalog_id, version),
  foreign key (catalog_id, organization_id, project_id)
    references public.project_material_catalog(id, organization_id, project_id) on delete restrict
);
alter table public.project_material_unit_prices enable row level security;
revoke all on public.project_material_unit_prices from public, anon, authenticated, service_role;
grant select on public.project_material_unit_prices to authenticated;
grant insert (id,catalog_id,organization_id,project_id,version,unit_price_ore)
  on public.project_material_unit_prices to authenticated;
create policy project_material_unit_prices_read on public.project_material_unit_prices for select to authenticated
  using (private.can_manage_project(project_id));
create policy project_material_unit_prices_insert on public.project_material_unit_prices for insert to authenticated
  with check (created_by=(select auth.uid()) and private.can_manage_project(project_id));

create function private.validate_project_material_price_insert() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare previous public.project_material_unit_prices;
begin
  if auth.uid() is null or new.created_by is distinct from auth.uid()
    or not private.can_manage_project(new.project_id)
  then raise exception 'Material price is unavailable' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('project-material-price:' || new.catalog_id, 0));
  select p.* into previous from public.project_material_unit_prices p
    where p.catalog_id=new.catalog_id and p.organization_id=new.organization_id and p.project_id=new.project_id
    order by p.version desc limit 1;
  if new.version <> coalesce(previous.version,0) + 1
  then raise exception 'Material price changed' using errcode = '40001'; end if;
  new.created_at := clock_timestamp();
  return new;
end $$;
revoke all on function private.validate_project_material_price_insert() from public, anon, authenticated, service_role;
create trigger validate_project_material_price before insert on public.project_material_unit_prices
  for each row execute function private.validate_project_material_price_insert();
