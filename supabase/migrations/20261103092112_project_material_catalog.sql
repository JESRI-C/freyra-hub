-- Project catalog with stable identities. Old free-text material versions keep a null catalog id.
create table public.project_material_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  material text not null check (material = btrim(material) and length(material) between 1 and 120),
  unit text not null check (unit in ('stk','kg','l','m','m2','m3')),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id, project_id),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete restrict
);
create unique index project_material_catalog_identity
  on public.project_material_catalog (project_id, lower(material), unit);
create index project_material_catalog_list
  on public.project_material_catalog (project_id, material, id);

alter table public.project_material_catalog enable row level security;
revoke all on public.project_material_catalog from public, anon, authenticated, service_role;
grant select on public.project_material_catalog to authenticated;
grant insert (id,organization_id,project_id,material,unit) on public.project_material_catalog to authenticated;
grant update (active) on public.project_material_catalog to authenticated;
create policy project_material_catalog_read on public.project_material_catalog for select to authenticated
  using (
    private.can_manage_project(project_id) or (
      active and exists (
        select 1 from public.work_orders w
        where w.project_id=project_material_catalog.project_id
          and w.organization_id=project_material_catalog.organization_id
          and private.can_execute_work_order(w.action_id)
      )
    )
  );
create policy project_material_catalog_create on public.project_material_catalog for insert to authenticated
  with check (created_by=(select auth.uid()) and private.can_manage_project(project_id));
create policy project_material_catalog_archive on public.project_material_catalog for update to authenticated
  using (private.can_manage_project(project_id))
  with check (private.can_manage_project(project_id));

alter table public.work_order_material_versions
  add column catalog_id uuid,
  add foreign key (catalog_id, organization_id, project_id)
    references public.project_material_catalog(id, organization_id, project_id) on delete restrict;
grant insert (catalog_id) on public.work_order_material_versions to authenticated;
create index work_order_material_catalog_reference
  on public.work_order_material_versions(catalog_id, organization_id, project_id)
  where catalog_id is not null;

create or replace function private.validate_work_order_material_insert() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare previous public.work_order_material_versions;
begin
  if auth.uid() is null or new.actor_id is distinct from auth.uid()
    or not private.can_execute_work_order(new.action_id)
  then raise exception 'Material registration is unavailable' using errcode = '42501'; end if;
  if new.version > 1 then
    select v.* into previous from public.work_order_material_versions v
      where v.entry_id=new.entry_id and v.actor_id=new.actor_id and v.action_id=new.action_id
        and v.organization_id=new.organization_id and v.project_id=new.project_id
      order by v.version desc limit 1;
    if previous.version is null or new.version <> previous.version + 1
    then raise exception 'Material registration changed' using errcode = '40001'; end if;
    if new.material is distinct from previous.material or new.unit is distinct from previous.unit
      or new.catalog_id is distinct from previous.catalog_id
    then raise exception 'Material and unit are fixed for a registration' using errcode = '22023'; end if;
  elsif new.catalog_id is not null and not exists (
    select 1 from public.project_material_catalog c
      where c.id=new.catalog_id and c.organization_id=new.organization_id and c.project_id=new.project_id
        and c.active and c.material=new.material and c.unit=new.unit
  ) then raise exception 'Catalog material is unavailable or changed' using errcode = '22023';
  end if;
  return new;
end $$;
