-- GoFreyra 4DM P0 tenant-isolation hardening.
--
-- This migration is intentionally not applied by this repository task. It must
-- be replayed and exercised against a disposable local Supabase stack before
-- deployment. Rollback notes live in docs/4dm-supabase-migration-plan.md.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Caller-bound authorization helpers. SECURITY DEFINER is required only to
-- avoid recursive RLS while reading membership tables. The caller identity is
-- always taken from auth.uid(); no caller-supplied user id is trusted.
-- ---------------------------------------------------------------------------

create or replace function private.can_read_organization(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = _organization_id
        and membership.user_id = auth.uid()
    )
$$;

create or replace function private.can_write_organization(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = _organization_id
        and membership.user_id = auth.uid()
        and membership.role in ('owner', 'admin', 'editor')
    )
$$;

create or replace function private.can_manage_organization(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = _organization_id
        and membership.user_id = auth.uid()
        and membership.role in ('owner', 'admin')
    )
$$;

create or replace function private.is_organization_owner(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = _organization_id
        and membership.user_id = auth.uid()
        and membership.role = 'owner'
    )
$$;

create or replace function private.can_read_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.projects project
      where project.id = _project_id
        and project.organization_id is not null
        and (
          private.can_manage_organization(project.organization_id)
          or exists (
            select 1
            from public.project_members member
            where member.project_id = project.id
              and member.user_id = auth.uid()
              and member.role in ('admin', 'project_manager', 'editor', 'field', 'viewer')
              and private.can_read_organization(project.organization_id)
          )
        )
    )
$$;

create or replace function private.can_write_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.projects project
      where project.id = _project_id
        and project.organization_id is not null
        and (
          private.can_manage_organization(project.organization_id)
          or exists (
            select 1
            from public.project_members member
            where member.project_id = project.id
              and member.user_id = auth.uid()
              and member.role in ('admin', 'project_manager', 'editor')
              and private.can_read_organization(project.organization_id)
          )
        )
    )
$$;

-- Field workers may contribute observations and evidence, but they are not
-- general project editors. Policies opt into this helper per table below.
create or replace function private.can_contribute_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write_project(_project_id)
    or (
      auth.uid() is not null
      and exists (
        select 1
        from public.project_members member
        join public.projects project on project.id = member.project_id
        where member.project_id = _project_id
          and member.user_id = auth.uid()
          and member.role = 'field'
          and private.can_read_organization(project.organization_id)
      )
    )
$$;

create or replace function private.can_manage_project(_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.projects project
      where project.id = _project_id
        and project.organization_id is not null
        and (
          private.can_manage_organization(project.organization_id)
          or exists (
            select 1
            from public.project_members member
            where member.project_id = project.id
              and member.user_id = auth.uid()
              and member.role in ('admin', 'project_manager')
              and private.can_read_organization(project.organization_id)
          )
        )
    )
$$;

revoke all on function private.can_read_organization(uuid) from public, anon;
revoke all on function private.can_write_organization(uuid) from public, anon;
revoke all on function private.can_manage_organization(uuid) from public, anon;
revoke all on function private.is_organization_owner(uuid) from public, anon;
revoke all on function private.can_read_project(uuid) from public, anon;
revoke all on function private.can_write_project(uuid) from public, anon;
revoke all on function private.can_contribute_project(uuid) from public, anon;
revoke all on function private.can_manage_project(uuid) from public, anon;
grant execute on function private.can_read_organization(uuid) to authenticated, service_role;
grant execute on function private.can_write_organization(uuid) to authenticated, service_role;
grant execute on function private.can_manage_organization(uuid) to authenticated, service_role;
grant execute on function private.is_organization_owner(uuid) to authenticated, service_role;
grant execute on function private.can_read_project(uuid) to authenticated, service_role;
grant execute on function private.can_write_project(uuid) to authenticated, service_role;
grant execute on function private.can_contribute_project(uuid) to authenticated, service_role;
grant execute on function private.can_manage_project(uuid) to authenticated, service_role;

-- Preserve legacy helper signatures used by older policies while preventing a
-- caller from probing another user's membership by supplying their UUID.
create or replace function public.is_org_member(_user_id uuid, _org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id = auth.uid() and private.can_read_organization(_org_id)
$$;

create or replace function public.has_org_role(_user_id uuid, _org_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id = auth.uid()
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = _org_id
        and membership.user_id = auth.uid()
        and membership.role = any(_roles)
    )
$$;

create or replace function public.is_project_member(_project_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id = auth.uid() and private.can_read_project(_project_id)
$$;

create or replace function public.has_project_role(
  _project_id uuid,
  _user_id uuid,
  _role public.project_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id = auth.uid()
    and exists (
      select 1
      from public.project_members member
      join public.projects project on project.id = member.project_id
      where member.project_id = _project_id
        and member.user_id = auth.uid()
        and member.role = _role
        -- `external` is described as shared-document-only in the application,
        -- but no authoritative document-share relation exists yet. Fail closed
        -- instead of treating that role as a full-project reader.
        and member.role <> 'external'
        and private.can_read_organization(project.organization_id)
    )
$$;

create or replace function public.is_project_admin(_project_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id = auth.uid() and private.can_manage_project(_project_id)
$$;

create or replace function public.is_lavbund_projekt_member(_projekt_id text, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _user_id = auth.uid()
    and exists (
      select 1
      from public.lavbund_projekter project
      where project.id = _projekt_id
        and project.linked_project_id is not null
        and private.can_read_project(project.linked_project_id)
    )
$$;

revoke execute on function public.is_org_member(uuid, uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, uuid, text[]) from public, anon;
revoke execute on function public.is_project_member(uuid, uuid) from public, anon;
revoke execute on function public.has_project_role(uuid, uuid, public.project_role) from public, anon;
revoke execute on function public.is_project_admin(uuid, uuid) from public, anon;
revoke execute on function public.is_lavbund_projekt_member(text, uuid) from public, anon;
grant execute on function public.is_org_member(uuid, uuid) to authenticated;
grant execute on function public.has_org_role(uuid, uuid, text[]) to authenticated;
grant execute on function public.is_project_member(uuid, uuid) to authenticated;
grant execute on function public.has_project_role(uuid, uuid, public.project_role) to authenticated;
grant execute on function public.is_project_admin(uuid, uuid) to authenticated;
grant execute on function public.is_lavbund_projekt_member(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Remove every known permissive legacy policy and anonymous table grant.
-- PostgreSQL combines permissive policies with OR, so leaving even one of
-- these names in place nullifies later tenant policies.
-- ---------------------------------------------------------------------------

drop policy if exists dev_select_all on public.organizations;
drop policy if exists dev_select_all on public.projects;
drop policy if exists dev_select_all on public.sites;
drop policy if exists dev_select_all on public.data_sources;
drop policy if exists dev_select_all on public.sensors;
drop policy if exists dev_select_all on public.observations;
drop policy if exists dev_select_all on public.indicators;
drop policy if exists dev_select_all on public.reports;
drop policy if exists dev_select_all on public.evidence_files;
drop policy if exists dev_select_all on public.audit_events;
drop policy if exists dev_select_all on public.actions;
drop policy if exists dev_select_all on public.impact_units;
drop policy if exists dev_select_all on public.construction_projects;
drop policy if exists dev_select_all on public.nature_contexts;
drop policy if exists dev_select_all on public.runoff_profiles;
drop policy if exists dev_select_all on public.environmental_risks;
drop policy if exists dev_select_all on public.mitigation_measures;
drop policy if exists dev_select_all on public.authority_submissions;
drop policy if exists dev_select_all_connector_logs on public.connector_fetch_logs;
drop policy if exists "Users can view media for their projects" on public.project_media;
drop policy if exists "Authenticated users can insert media" on public.project_media;
drop policy if exists "Authenticated users can update their media" on public.project_media;
drop policy if exists "Authenticated users can delete their media" on public.project_media;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'organizations', 'projects', 'sites', 'data_sources', 'sensors',
    'observations', 'indicators', 'reports', 'evidence_files', 'audit_events',
    'actions', 'impact_units', 'construction_projects', 'nature_contexts',
    'runoff_profiles', 'environmental_risks', 'mitigation_measures',
    'authority_submissions', 'connector_fetch_logs', 'project_media',
    'project_areas', 'map_layers', 'geo_features', 'geo_observations',
    'calculated_metrics'
  ] loop
    foreach policy_name in array array[
      'dev_all', 'dev_read_all', 'auth_read_all', 'auth_write_all',
      'auth_update_all', 'auth_delete_all'
    ] loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
    execute format('revoke all on table public.%I from anon, public', table_name);
  end loop;
end
$$;

-- No private application table is anonymously readable. spatial_ref_sys is a
-- PostGIS reference table and deliberately remains outside this list.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'organization_memberships', 'project_members',
    'indicator_measurements', 'action_evidence', 'documents',
    'monitoring_devices', 'device_parameters', 'device_measurements',
    'device_maintenance_logs', 'monitoring_zones', 'integration_runs',
    'field_observations', 'observation_media', 'data_quality_assessments',
    'integration_connections', 'drone_flights', 'drone_assets',
    'environmental_analyses', 'data_exports', 'monitoring_alerts', 'uploads',
    'upload_import_jobs', 'data_quality_rules', 'data_quality_issues',
    'alert_rules', 'alert_comments', 'data_source_mappings',
    'lavbund_projekter', 'lavbund_maalepunkter', 'lavbund_readings',
    'lavbund_transekter', 'lavbund_groefter', 'lavbund_ledger',
    'lavbund_snapshots'
  ] loop
    execute format('revoke all on table public.%I from anon, public', table_name);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Tenant roots and memberships.
-- ---------------------------------------------------------------------------

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'organizations'
  loop
    execute format('drop policy %I on public.organizations', policy_record.policyname);
  end loop;
end
$$;

create policy organizations_read on public.organizations
  for select to authenticated
  using (private.can_read_organization(id));
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (auth.uid() is not null);
create policy organizations_update on public.organizations
  for update to authenticated
  using (private.can_manage_organization(id))
  with check (private.can_manage_organization(id));
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (private.is_organization_owner(id));

-- Organization creation bootstraps exactly one owner atomically. The trigger
-- function is not API-callable and uses only a fully-qualified object path.
create or replace function public.add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.organization_memberships (organization_id, user_id, role)
    values (new.id, auth.uid(), 'owner')
    on conflict (organization_id, user_id) do nothing;
  end if;
  return new;
end
$$;

revoke all on function public.add_creator_as_owner() from public, anon, authenticated;
drop trigger if exists on_organization_created_add_owner on public.organizations;
create trigger on_organization_created_add_owner
  after insert on public.organizations
  for each row execute function public.add_creator_as_owner();

-- Signup creates only the caller's profile and isolated personal organization.
-- Legacy migrations granted a shared demo organization by matching one email;
-- email addresses are not authorization claims and must never bootstrap access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_organization_id uuid;
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Ny bruger'
  );

  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    display_name,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.organizations (name, type, country)
  values (display_name || ' – organisation', 'personal', 'Denmark')
  returning id into personal_organization_id;

  insert into public.organization_memberships (user_id, organization_id, role)
  values (new.id, personal_organization_id, 'owner')
  on conflict (user_id, organization_id) do nothing;

  return new;
end
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'organization_memberships'
  loop
    execute format('drop policy %I on public.organization_memberships', policy_record.policyname);
  end loop;
end
$$;

create policy organization_memberships_read on public.organization_memberships
  for select to authenticated
  using (private.can_read_organization(organization_id));
create policy organization_memberships_insert on public.organization_memberships
  for insert to authenticated
  with check (
    private.can_manage_organization(organization_id)
    and user_id is distinct from auth.uid()
    and (role <> 'owner' or private.is_organization_owner(organization_id))
  );
create policy organization_memberships_update on public.organization_memberships
  for update to authenticated
  using (
    private.can_manage_organization(organization_id)
    and user_id is distinct from auth.uid()
    and (role <> 'owner' or private.is_organization_owner(organization_id))
  )
  with check (
    private.can_manage_organization(organization_id)
    and user_id is distinct from auth.uid()
    and (role <> 'owner' or private.is_organization_owner(organization_id))
  );
create policy organization_memberships_delete on public.organization_memberships
  for delete to authenticated
  using (
    private.is_organization_owner(organization_id)
    and user_id is distinct from auth.uid()
  );

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'projects'
  loop
    execute format('drop policy %I on public.projects', policy_record.policyname);
  end loop;
end
$$;

create policy projects_read on public.projects
  for select to authenticated
  using (private.can_read_project(id));
create policy projects_insert on public.projects
  for insert to authenticated
  with check (
    organization_id is not null
    and private.can_write_organization(organization_id)
  );
create policy projects_update on public.projects
  for update to authenticated
  using (private.can_manage_project(id))
  with check (private.can_manage_project(id) and organization_id is not null);
create policy projects_delete on public.projects
  for delete to authenticated
  using (private.can_manage_project(id));

drop policy if exists "Project admins can insert project_members" on public.project_members;
do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'project_members'
  loop
    execute format('drop policy %I on public.project_members', policy_record.policyname);
  end loop;
end
$$;

create policy project_members_read on public.project_members
  for select to authenticated
  using (private.can_read_project(project_id));
create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (private.can_manage_project(project_id));
create policy project_members_update on public.project_members
  for update to authenticated
  using (private.can_manage_project(project_id))
  with check (private.can_manage_project(project_id));
create policy project_members_delete on public.project_members
  for delete to authenticated
  using (private.can_manage_project(project_id));

-- Project creation is the sole self-membership bootstrap. It is atomic and
-- cannot be called directly by API roles.
create or replace function private.add_project_creator_as_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.project_members (project_id, user_id, role, invited_by)
    values (new.id, auth.uid(), 'admin'::public.project_role, auth.uid())
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end
$$;

revoke all on function private.add_project_creator_as_admin() from public, anon, authenticated;
drop trigger if exists on_project_created_add_admin on public.projects;
create trigger on_project_created_add_admin
  after insert on public.projects
  for each row execute function private.add_project_creator_as_admin();

-- ---------------------------------------------------------------------------
-- Project data: readers may view; editor+ roles may write; destructive deletion
-- requires a project manager/admin or organization admin. Field contribution is
-- added only for the explicit collection/evidence whitelist below.
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array[
    'actions', 'authority_submissions', 'calculated_metrics',
    'construction_projects', 'connector_fetch_logs', 'data_exports',
    'data_quality_assessments', 'data_quality_issues', 'data_sources',
    'documents', 'drone_flights', 'environmental_analyses',
    'environmental_risks', 'evidence_files', 'field_observations',
    'geo_observations', 'impact_units', 'indicator_measurements', 'indicators',
    'integration_connections', 'integration_runs', 'mitigation_measures',
    'monitoring_alerts', 'monitoring_devices', 'monitoring_zones',
    'nature_contexts', 'observations', 'project_areas', 'project_media',
    'reports', 'runoff_profiles', 'sensors', 'sites'
  ] loop
    for policy_record in
      select policyname from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_record.policyname, table_name);
    end loop;

    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy tenant_read on public.%I for select to authenticated using (project_id is not null and private.can_read_project(project_id))',
      table_name
    );
    execute format(
      'create policy tenant_insert on public.%I for insert to authenticated with check (project_id is not null and private.can_write_project(project_id))',
      table_name
    );
    execute format(
      'create policy tenant_update on public.%I for update to authenticated using (project_id is not null and private.can_write_project(project_id)) with check (project_id is not null and private.can_write_project(project_id))',
      table_name
    );
    execute format(
      'create policy tenant_delete on public.%I for delete to authenticated using (project_id is not null and private.can_manage_project(project_id))',
      table_name
    );
  end loop;
end
$$;

-- Field-role writes are deliberately limited to collection/evidence tables.
-- All configuration, project, report and derived-analysis tables continue to
-- require editor+ through tenant_insert/tenant_update above.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'drone_flights', 'evidence_files', 'field_observations',
    'geo_observations', 'observations', 'project_media'
  ] loop
    execute format(
      'create policy field_contribution_insert on public.%I for insert to authenticated with check (project_id is not null and private.can_contribute_project(project_id))',
      table_name
    );
    execute format(
      'create policy field_contribution_update on public.%I for update to authenticated using (project_id is not null and private.can_contribute_project(project_id)) with check (project_id is not null and private.can_contribute_project(project_id))',
      table_name
    );
  end loop;
end
$$;

-- Audit rows are append-only for API users.
do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'audit_events'
  loop
    execute format('drop policy %I on public.audit_events', policy_record.policyname);
  end loop;
end
$$;
create policy audit_events_read on public.audit_events
  for select to authenticated
  using (project_id is not null and private.can_read_project(project_id));
create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (project_id is not null and private.can_write_project(project_id));

-- Upload creation is audited at the database boundary. This records field-role
-- and unscoped staging uploads without granting clients a general ability to
-- manufacture audit records.
create or replace function private.audit_upload_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    project_id,
    event_type,
    entity_type,
    entity_id,
    title,
    description,
    actor,
    source,
    after_data
  ) values (
    new.project_id,
    'upload_created',
    'upload',
    new.id,
    'Fil uploadet: ' || new.original_file_name,
    new.upload_type || ' · ' || pg_catalog.round(new.file_size::numeric / 1024) || ' KB',
    auth.uid()::text,
    'database_trigger',
    jsonb_build_object(
      'id', new.id,
      'upload_type', new.upload_type,
      'mime_type', new.mime_type,
      'file_size', new.file_size,
      'storage_path', new.storage_path
    )
  );
  return new;
end
$$;

revoke all on function private.audit_upload_created()
  from public, anon, authenticated;
drop trigger if exists uploads_audit_created on public.uploads;
create trigger uploads_audit_created
  after insert on public.uploads
  for each row execute function private.audit_upload_created();

-- Global reference catalog: authenticated read, service-role write only.
do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array['map_layers', 'geo_features'] loop
    for policy_record in
      select policyname from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_record.policyname, table_name);
    end loop;
    execute format('create policy reference_read on public.%I for select to authenticated using (true)', table_name);
  end loop;
end
$$;

-- Nullable project scope is never global. A rule belongs either to a project
-- or to a named organization; unscoped rows are denied.
do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array['data_quality_rules', 'alert_rules'] loop
    for policy_record in
      select policyname from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_record.policyname, table_name);
    end loop;
    execute format(
      'create policy tenant_read on public.%I for select to authenticated using ((project_id is not null and private.can_read_project(project_id)) or (project_id is null and organization_id is not null and private.can_read_organization(organization_id)))',
      table_name
    );
    execute format(
      'create policy tenant_insert on public.%I for insert to authenticated with check ((project_id is not null and private.can_write_project(project_id)) or (project_id is null and organization_id is not null and private.can_write_organization(organization_id)))',
      table_name
    );
    execute format(
      'create policy tenant_update on public.%I for update to authenticated using ((project_id is not null and private.can_write_project(project_id)) or (project_id is null and organization_id is not null and private.can_write_organization(organization_id))) with check ((project_id is not null and private.can_write_project(project_id)) or (project_id is null and organization_id is not null and private.can_write_organization(organization_id)))',
      table_name
    );
    execute format(
      'create policy tenant_delete on public.%I for delete to authenticated using ((project_id is not null and private.can_manage_project(project_id)) or (project_id is null and organization_id is not null and private.can_manage_organization(organization_id)))',
      table_name
    );
  end loop;
end
$$;

-- Upload rows may be user-owned before project assignment. Once scoped, the
-- project/organization boundary and uploaded_by are checked on both old/new row.
do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'uploads'
  loop
    execute format('drop policy %I on public.uploads', policy_record.policyname);
  end loop;
end
$$;
create policy uploads_read on public.uploads
  for select to authenticated
  using (
    (project_id is null and organization_id is null and uploaded_by = auth.uid())
    or (project_id is not null and private.can_read_project(project_id))
    or (project_id is null and organization_id is not null and private.can_read_organization(organization_id))
  );
create policy uploads_insert on public.uploads
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and split_part(storage_path, '/', 1) = uploaded_by::text
    and (
      (project_id is null and organization_id is null)
      or (project_id is not null and private.can_contribute_project(project_id))
      or (project_id is null and organization_id is not null and private.can_write_organization(organization_id))
    )
  );
create policy uploads_update on public.uploads
  for update to authenticated
  using (
    uploaded_by = auth.uid()
    and split_part(storage_path, '/', 1) = uploaded_by::text
    and (
      (project_id is null and organization_id is null)
      or (project_id is not null and private.can_contribute_project(project_id))
      or (project_id is null and organization_id is not null and private.can_write_organization(organization_id))
    )
  )
  with check (
    uploaded_by = auth.uid()
    and split_part(storage_path, '/', 1) = uploaded_by::text
    and (
      (project_id is null and organization_id is null)
      or (project_id is not null and private.can_contribute_project(project_id))
      or (project_id is null and organization_id is not null and private.can_write_organization(organization_id))
    )
  );
create policy uploads_delete on public.uploads
  for delete to authenticated
  using (
    (project_id is null and organization_id is null and uploaded_by = auth.uid())
    or (project_id is not null and private.can_manage_project(project_id))
    or (project_id is null and organization_id is not null and private.can_manage_organization(organization_id))
  );

-- Client users may register raw file identity, classify their own upload into
-- an authorized scope and edit explicit user metadata. Machine-derived
-- provenance, validation/import output and workflow status are
-- service-role/backend owned on both INSERT and UPDATE.
revoke insert on table public.uploads from authenticated;
grant insert (
  organization_id,
  project_id,
  zone_id,
  uploaded_by,
  file_name,
  original_file_name,
  mime_type,
  file_size,
  storage_path,
  upload_type,
  user_metadata
) on table public.uploads to authenticated;
revoke update on table public.uploads from authenticated;
grant update (project_id, organization_id, zone_id, user_metadata)
  on table public.uploads to authenticated;

-- ---------------------------------------------------------------------------
-- Indirectly project-owned child tables.
-- ---------------------------------------------------------------------------

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'action_evidence'
  loop execute format('drop policy %I on public.action_evidence', policy_record.policyname); end loop;
end
$$;
create policy tenant_read on public.action_evidence for select to authenticated
  using (exists (select 1 from public.actions parent where parent.id = action_id and private.can_read_project(parent.project_id)));
create policy tenant_insert on public.action_evidence for insert to authenticated
  with check (exists (select 1 from public.actions parent where parent.id = action_id and private.can_write_project(parent.project_id)));
create policy tenant_update on public.action_evidence for update to authenticated
  using (exists (select 1 from public.actions parent where parent.id = action_id and private.can_write_project(parent.project_id)))
  with check (exists (select 1 from public.actions parent where parent.id = action_id and private.can_write_project(parent.project_id)));
create policy tenant_delete on public.action_evidence for delete to authenticated
  using (exists (select 1 from public.actions parent where parent.id = action_id and private.can_manage_project(parent.project_id)));
create policy field_contribution_insert on public.action_evidence for insert to authenticated
  with check (exists (select 1 from public.actions parent where parent.id = action_id and private.can_contribute_project(parent.project_id)));
create policy field_contribution_update on public.action_evidence for update to authenticated
  using (exists (select 1 from public.actions parent where parent.id = action_id and private.can_contribute_project(parent.project_id)))
  with check (exists (select 1 from public.actions parent where parent.id = action_id and private.can_contribute_project(parent.project_id)));

do $$
declare
  table_name text;
  parent_table text;
  child_key text;
  policy_record record;
begin
  for table_name, parent_table, child_key in
    values
      ('device_parameters', 'monitoring_devices', 'device_id'),
      ('device_measurements', 'monitoring_devices', 'device_id'),
      ('device_maintenance_logs', 'monitoring_devices', 'device_id'),
      ('observation_media', 'field_observations', 'observation_id'),
      ('drone_assets', 'drone_flights', 'flight_id'),
      ('alert_comments', 'monitoring_alerts', 'alert_id'),
      ('data_source_mappings', 'data_sources', 'data_source_id')
  loop
    for policy_record in
      select policyname from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_record.policyname, table_name);
    end loop;
    execute format(
      'create policy tenant_read on public.%I for select to authenticated using (exists (select 1 from public.%I parent where parent.id = %I and private.can_read_project(parent.project_id)))',
      table_name, parent_table, child_key
    );
    execute format(
      'create policy tenant_insert on public.%I for insert to authenticated with check (exists (select 1 from public.%I parent where parent.id = %I and private.can_write_project(parent.project_id)))',
      table_name, parent_table, child_key
    );
    execute format(
      'create policy tenant_update on public.%I for update to authenticated using (exists (select 1 from public.%I parent where parent.id = %I and private.can_write_project(parent.project_id))) with check (exists (select 1 from public.%I parent where parent.id = %I and private.can_write_project(parent.project_id)))',
      table_name, parent_table, child_key, parent_table, child_key
    );
    execute format(
      'create policy tenant_delete on public.%I for delete to authenticated using (exists (select 1 from public.%I parent where parent.id = %I and private.can_manage_project(parent.project_id)))',
      table_name, parent_table, child_key
    );
  end loop;
end
$$;

create policy field_contribution_insert on public.observation_media for insert to authenticated
  with check (exists (select 1 from public.field_observations parent where parent.id = observation_id and private.can_contribute_project(parent.project_id)));
create policy field_contribution_update on public.observation_media for update to authenticated
  using (exists (select 1 from public.field_observations parent where parent.id = observation_id and private.can_contribute_project(parent.project_id)))
  with check (exists (select 1 from public.field_observations parent where parent.id = observation_id and private.can_contribute_project(parent.project_id)));
create policy field_contribution_insert on public.drone_assets for insert to authenticated
  with check (exists (select 1 from public.drone_flights parent where parent.id = flight_id and private.can_contribute_project(parent.project_id)));
create policy field_contribution_update on public.drone_assets for update to authenticated
  using (exists (select 1 from public.drone_flights parent where parent.id = flight_id and private.can_contribute_project(parent.project_id)))
  with check (exists (select 1 from public.drone_flights parent where parent.id = flight_id and private.can_contribute_project(parent.project_id)));

-- Import jobs inherit the complete upload scope, including the personal
-- pre-assignment stage and organization-only uploads.
do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'upload_import_jobs'
  loop
    execute format('drop policy %I on public.upload_import_jobs', policy_record.policyname);
  end loop;
end
$$;
create policy upload_import_jobs_read on public.upload_import_jobs
  for select to authenticated
  using (
    exists (
      select 1 from public.uploads upload
      where upload.id = upload_id
        and (
          (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
          or (upload.project_id is not null and private.can_read_project(upload.project_id))
          or (upload.project_id is null and upload.organization_id is not null and private.can_read_organization(upload.organization_id))
        )
    )
  );
create policy upload_import_jobs_insert on public.upload_import_jobs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.uploads upload
      where upload.id = upload_id
        and (
          (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
          or (upload.project_id is not null and private.can_contribute_project(upload.project_id))
          or (upload.project_id is null and upload.organization_id is not null and private.can_write_organization(upload.organization_id))
        )
    )
  );
create policy upload_import_jobs_update on public.upload_import_jobs
  for update to authenticated
  using (
    exists (
      select 1 from public.uploads upload
      where upload.id = upload_id
        and (
          (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
          or (upload.project_id is not null and private.can_contribute_project(upload.project_id))
          or (upload.project_id is null and upload.organization_id is not null and private.can_write_organization(upload.organization_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.uploads upload
      where upload.id = upload_id
        and (
          (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
          or (upload.project_id is not null and private.can_contribute_project(upload.project_id))
          or (upload.project_id is null and upload.organization_id is not null and private.can_write_organization(upload.organization_id))
        )
    )
  );
create policy upload_import_jobs_delete on public.upload_import_jobs
  for delete to authenticated
  using (
    exists (
      select 1 from public.uploads upload
      where upload.id = upload_id
        and (
          (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
          or (upload.project_id is not null and private.can_manage_project(upload.project_id))
          or (upload.project_id is null and upload.organization_id is not null and private.can_manage_organization(upload.organization_id))
        )
    )
  );

-- Lavbund records inherit their project through linked_project_id.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'lavbund_projekter'
  loop execute format('drop policy %I on public.lavbund_projekter', policy_record.policyname); end loop;
end
$$;
create policy tenant_read on public.lavbund_projekter for select to authenticated
  using (linked_project_id is not null and private.can_read_project(linked_project_id));
create policy tenant_insert on public.lavbund_projekter for insert to authenticated
  with check (linked_project_id is not null and private.can_write_project(linked_project_id));
create policy tenant_update on public.lavbund_projekter for update to authenticated
  using (linked_project_id is not null and private.can_write_project(linked_project_id))
  with check (linked_project_id is not null and private.can_write_project(linked_project_id));
create policy tenant_delete on public.lavbund_projekter for delete to authenticated
  using (linked_project_id is not null and private.can_manage_project(linked_project_id));

do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array[
    'lavbund_maalepunkter', 'lavbund_readings', 'lavbund_transekter',
    'lavbund_groefter', 'lavbund_ledger', 'lavbund_snapshots'
  ] loop
    for policy_record in
      select policyname from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = table_name
    loop execute format('drop policy %I on public.%I', policy_record.policyname, table_name); end loop;
    execute format('create policy tenant_read on public.%I for select to authenticated using (public.is_lavbund_projekt_member(projekt_id, auth.uid()))', table_name);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (exists (select 1 from public.lavbund_projekter parent where parent.id = projekt_id and private.can_write_project(parent.linked_project_id)))', table_name);
    execute format('create policy tenant_update on public.%I for update to authenticated using (exists (select 1 from public.lavbund_projekter parent where parent.id = projekt_id and private.can_write_project(parent.linked_project_id))) with check (exists (select 1 from public.lavbund_projekter parent where parent.id = projekt_id and private.can_write_project(parent.linked_project_id)))', table_name);
    execute format('create policy tenant_delete on public.%I for delete to authenticated using (exists (select 1 from public.lavbund_projekter parent where parent.id = projekt_id and private.can_manage_project(parent.linked_project_id)))', table_name);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Tenant keys cannot be changed after assignment. Uploads have one deliberate
-- personal-staging -> authorized-tenant transition; later transfers require a
-- future audited RPC rather than an ordinary UPDATE.
-- ---------------------------------------------------------------------------

create or replace function private.reject_organization_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function private.reject_project_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'project_id is immutable' using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function private.reject_membership_user_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'membership user_id is immutable' using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function private.reject_parent_key_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare parent_column text;
begin
  if tg_nargs <> 1 then
    raise exception 'parent-key immutability trigger requires one column argument'
      using errcode = '22023';
  end if;
  parent_column := tg_argv[0];
  if (to_jsonb(new) -> parent_column) is distinct from (to_jsonb(old) -> parent_column) then
    raise exception '% is immutable because it defines tenant provenance', parent_column
      using errcode = '23514';
  end if;
  return new;
end
$$;

-- An upload may move once from personal staging into an authorized tenant.
-- Once either tenant key is present, it cannot be detached or reassigned.
create or replace function private.reject_upload_scope_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.project_id is not null and new.project_id is distinct from old.project_id then
    raise exception 'upload project_id cannot be reassigned' using errcode = '23514';
  end if;
  if old.organization_id is not null and new.organization_id is distinct from old.organization_id then
    raise exception 'upload organization_id cannot be reassigned' using errcode = '23514';
  end if;
  return new;
end
$$;

-- A Storage object identity is bound to exactly one uploader-owned path. The
-- advisory lock closes the concurrent-insert race without requiring a unique
-- index that could make this migration fail before legacy duplicates have been
-- inventoried. Existing duplicates fail closed in the Storage helpers below.
create or replace function private.require_upload_storage_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.storage_path is distinct from old.storage_path then
    raise exception 'upload storage_path is immutable' using errcode = '23514';
  end if;

  if split_part(new.storage_path, '/', 1) is distinct from new.uploaded_by::text
     or split_part(new.storage_path, '/', 2) = ''
     or new.storage_path ~ '(^|/)\.{1,2}(/|$)'
     or position(chr(92) in new.storage_path) > 0 then
    raise exception 'upload storage_path must be a safe uploaded_by-prefixed path'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.storage_path, 0)
  );
  if exists (
    select 1
    from public.uploads upload
    where upload.storage_path = new.storage_path
      and upload.id is distinct from new.id
  ) then
    raise exception 'upload storage_path already belongs to another upload'
      using errcode = '23505';
  end if;

  return new;
end
$$;

create or replace function private.require_matching_project_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is not null
     and new.organization_id is not null
     and not exists (
       select 1
       from public.projects project
       where project.id = new.project_id
         and project.organization_id = new.organization_id
     ) then
    raise exception 'organization_id does not own project_id' using errcode = '23514';
  end if;
  return new;
end
$$;

-- A row's own project_id is not enough: every project-owned parent reference
-- must resolve inside that same project. Trigger arguments are fixed identifiers
-- declared below, never caller input. This preserves legacy ON DELETE SET NULL
-- behavior while rejecting cross-tenant links on new writes.
create or replace function private.require_project_parent_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  argument_index integer := 0;
  child_column text;
  parent_table text;
  raw_parent_id text;
  parent_matches boolean;
begin
  if mod(tg_nargs, 2) <> 0 then
    raise exception 'project parent guard requires column/table argument pairs'
      using errcode = '22023';
  end if;

  while argument_index < tg_nargs loop
    child_column := tg_argv[argument_index];
    parent_table := tg_argv[argument_index + 1];
    raw_parent_id := to_jsonb(new) ->> child_column;

    if raw_parent_id is not null then
      if new.project_id is null then
        raise exception '% requires a project-scoped row', child_column
          using errcode = '23514';
      end if;

      execute format(
        'select exists (select 1 from public.%I parent where parent.id = $1 and parent.project_id = $2)',
        parent_table
      )
      into parent_matches
      using raw_parent_id::uuid, new.project_id;

      if not parent_matches then
        raise exception '% does not belong to row project_id', child_column
          using errcode = '23514';
      end if;
    end if;

    argument_index := argument_index + 2;
  end loop;

  return new;
end
$$;

create or replace function private.require_action_evidence_project_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare action_project_id uuid;
begin
  select action.project_id
  into action_project_id
  from public.actions action
  where action.id = new.action_id;

  if action_project_id is null then
    raise exception 'action_evidence requires an existing project action'
      using errcode = '23514';
  end if;
  if new.media_id is not null and not exists (
    select 1 from public.project_media media
    where media.id = new.media_id and media.project_id = action_project_id
  ) then
    raise exception 'media_id does not belong to action project'
      using errcode = '23514';
  end if;
  if new.evidence_file_id is not null and not exists (
    select 1 from public.evidence_files evidence
    where evidence.id = new.evidence_file_id and evidence.project_id = action_project_id
  ) then
    raise exception 'evidence_file_id does not belong to action project'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function private.require_device_parameter_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parameter_id is not null and not exists (
    select 1 from public.device_parameters parameter
    where parameter.id = new.parameter_id
      and parameter.device_id = new.device_id
  ) then
    raise exception 'parameter_id does not belong to device_id'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function private.require_quality_issue_measurement_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.measurement_id is not null and not exists (
    select 1
    from public.device_measurements measurement
    join public.monitoring_devices device on device.id = measurement.device_id
    where measurement.id = new.measurement_id
      and device.project_id = new.project_id
  ) then
    raise exception 'measurement_id does not belong to issue project_id'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create or replace function private.require_quality_assessment_scope_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare scope_matches boolean;
begin
  if new.scope_id is null then
    return new;
  end if;

  case new.scope_type
    when 'data_source' then
      select exists (
        select 1 from public.data_sources source
        where source.id = new.scope_id and source.project_id = new.project_id
      ) into scope_matches;
    when 'device' then
      select exists (
        select 1 from public.monitoring_devices device
        where device.id = new.scope_id and device.project_id = new.project_id
      ) into scope_matches;
    else
      raise exception 'unsupported project quality-assessment scope_type: %', new.scope_type
        using errcode = '23514';
  end case;

  if not scope_matches then
    raise exception 'scope_id does not belong to assessment project_id'
      using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function private.reject_organization_id_change() from public, anon, authenticated;
revoke all on function private.reject_project_id_change() from public, anon, authenticated;
revoke all on function private.reject_membership_user_id_change() from public, anon, authenticated;
revoke all on function private.reject_parent_key_change() from public, anon, authenticated;
revoke all on function private.reject_upload_scope_reassignment() from public, anon, authenticated;
revoke all on function private.require_upload_storage_identity() from public, anon, authenticated;
revoke all on function private.require_matching_project_organization() from public, anon, authenticated;
revoke all on function private.require_project_parent_match() from public, anon, authenticated;
revoke all on function private.require_action_evidence_project_match() from public, anon, authenticated;
revoke all on function private.require_device_parameter_match() from public, anon, authenticated;
revoke all on function private.require_quality_issue_measurement_match() from public, anon, authenticated;
revoke all on function private.require_quality_assessment_scope_match() from public, anon, authenticated;

drop trigger if exists organization_memberships_user_id_immutable on public.organization_memberships;
create trigger organization_memberships_user_id_immutable
  before update of user_id on public.organization_memberships
  for each row execute function private.reject_membership_user_id_change();

drop trigger if exists project_members_user_id_immutable on public.project_members;
create trigger project_members_user_id_immutable
  before update of user_id on public.project_members
  for each row execute function private.reject_membership_user_id_change();

drop trigger if exists projects_organization_id_immutable on public.projects;
create trigger projects_organization_id_immutable
  before update of organization_id on public.projects
  for each row execute function private.reject_organization_id_change();

drop trigger if exists project_areas_project_id_immutable on public.project_areas;
create trigger project_areas_project_id_immutable
  before update of project_id on public.project_areas
  for each row execute function private.reject_project_id_change();
drop trigger if exists geo_observations_project_id_immutable on public.geo_observations;
create trigger geo_observations_project_id_immutable
  before update of project_id on public.geo_observations
  for each row execute function private.reject_project_id_change();
drop trigger if exists calculated_metrics_project_id_immutable on public.calculated_metrics;
create trigger calculated_metrics_project_id_immutable
  before update of project_id on public.calculated_metrics
  for each row execute function private.reject_project_id_change();
drop trigger if exists project_media_project_id_immutable on public.project_media;
create trigger project_media_project_id_immutable
  before update of project_id on public.project_media
  for each row execute function private.reject_project_id_change();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'project_members', 'actions', 'authority_submissions', 'audit_events',
    'construction_projects', 'connector_fetch_logs', 'data_exports',
    'data_quality_assessments', 'data_quality_issues', 'data_sources',
    'documents', 'drone_flights', 'environmental_analyses',
    'environmental_risks', 'evidence_files', 'field_observations',
    'impact_units', 'indicator_measurements', 'indicators',
    'integration_connections', 'integration_runs', 'mitigation_measures',
    'monitoring_alerts', 'monitoring_devices', 'monitoring_zones',
    'nature_contexts', 'observations', 'reports', 'runoff_profiles',
    'sensors', 'sites', 'data_quality_rules', 'alert_rules'
  ] loop
    execute format('drop trigger if exists tenant_project_id_immutable on public.%I', table_name);
    execute format('create trigger tenant_project_id_immutable before update of project_id on public.%I for each row execute function private.reject_project_id_change()', table_name);
  end loop;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'monitoring_devices', 'uploads', 'data_quality_rules', 'alert_rules'
  ] loop
    execute format('drop trigger if exists tenant_project_organization_match on public.%I', table_name);
    execute format('create trigger tenant_project_organization_match before insert or update of project_id, organization_id on public.%I for each row execute function private.require_matching_project_organization()', table_name);
  end loop;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organization_memberships', 'monitoring_devices',
    'data_quality_rules', 'alert_rules'
  ] loop
    execute format('drop trigger if exists tenant_organization_id_immutable on public.%I', table_name);
    execute format('create trigger tenant_organization_id_immutable before update of organization_id on public.%I for each row execute function private.reject_organization_id_change()', table_name);
  end loop;
end
$$;

drop trigger if exists uploads_scope_once on public.uploads;
create trigger uploads_scope_once
  before update of project_id, organization_id on public.uploads
  for each row execute function private.reject_upload_scope_reassignment();

drop trigger if exists uploads_uploader_immutable on public.uploads;
create trigger uploads_uploader_immutable
  before update of uploaded_by on public.uploads
  for each row execute function private.reject_parent_key_change('uploaded_by');

create index if not exists uploads_storage_path_idx
  on public.uploads(storage_path);
drop trigger if exists uploads_storage_identity on public.uploads;
create trigger uploads_storage_identity
  before insert or update of storage_path, uploaded_by on public.uploads
  for each row execute function private.require_upload_storage_identity();

-- Indirect children derive their complete tenant boundary from the parent key.
-- Re-parenting would silently transfer provenance, even when a caller happens
-- to have write access in both projects, so transfers require delete/recreate or
-- a future audited RPC.
do $$
declare
  table_name text;
  parent_column text;
begin
  for table_name, parent_column in
    values
      ('device_parameters', 'device_id'),
      ('device_measurements', 'device_id'),
      ('device_maintenance_logs', 'device_id'),
      ('observation_media', 'observation_id'),
      ('drone_assets', 'flight_id'),
      ('alert_comments', 'alert_id'),
      ('data_source_mappings', 'data_source_id'),
      ('action_evidence', 'action_id'),
      ('upload_import_jobs', 'upload_id'),
      ('lavbund_maalepunkter', 'projekt_id'),
      ('lavbund_readings', 'projekt_id'),
      ('lavbund_transekter', 'projekt_id'),
      ('lavbund_groefter', 'projekt_id'),
      ('lavbund_ledger', 'projekt_id'),
      ('lavbund_snapshots', 'projekt_id')
  loop
    execute format('drop trigger if exists tenant_parent_immutable on public.%I', table_name);
    execute format(
      'create trigger tenant_parent_immutable before update of %I on public.%I for each row execute function private.reject_parent_key_change(%L)',
      parent_column,
      table_name,
      parent_column
    );
  end loop;
end
$$;

-- Enforce same-project provenance for every direct project child that can point
-- at another tenant-owned row. Nullable parents still support ON DELETE SET NULL.
drop trigger if exists project_parent_match on public.data_sources;
create trigger project_parent_match before insert or update on public.data_sources
  for each row execute function private.require_project_parent_match('site_id', 'sites');
drop trigger if exists project_parent_match on public.sensors;
create trigger project_parent_match before insert or update on public.sensors
  for each row execute function private.require_project_parent_match('site_id', 'sites');
drop trigger if exists project_parent_match on public.observations;
create trigger project_parent_match before insert or update on public.observations
  for each row execute function private.require_project_parent_match('site_id', 'sites', 'source_id', 'data_sources');
drop trigger if exists project_parent_match on public.evidence_files;
create trigger project_parent_match before insert or update on public.evidence_files
  for each row execute function private.require_project_parent_match('report_id', 'reports');
drop trigger if exists project_parent_match on public.actions;
create trigger project_parent_match before insert or update on public.actions
  for each row execute function private.require_project_parent_match('site_id', 'sites', 'linked_indicator_id', 'indicators');
drop trigger if exists project_parent_match on public.mitigation_measures;
create trigger project_parent_match before insert or update on public.mitigation_measures
  for each row execute function private.require_project_parent_match('risk_id', 'environmental_risks');
drop trigger if exists project_parent_match on public.documents;
create trigger project_parent_match before insert or update on public.documents
  for each row execute function private.require_project_parent_match('site_id', 'sites', 'action_id', 'actions');
drop trigger if exists project_parent_match on public.project_media;
create trigger project_parent_match before insert or update on public.project_media
  for each row execute function private.require_project_parent_match('action_id', 'actions', 'document_id', 'documents', 'before_media_id', 'project_media');
drop trigger if exists project_parent_match on public.monitoring_devices;
create trigger project_parent_match before insert or update on public.monitoring_devices
  for each row execute function private.require_project_parent_match('zone_id', 'monitoring_zones');
drop trigger if exists project_parent_match on public.integration_runs;
create trigger project_parent_match before insert or update on public.integration_runs
  for each row execute function private.require_project_parent_match('data_source_id', 'data_sources');
drop trigger if exists project_parent_match on public.field_observations;
create trigger project_parent_match before insert or update on public.field_observations
  for each row execute function private.require_project_parent_match('zone_id', 'monitoring_zones');
drop trigger if exists project_parent_match on public.drone_flights;
create trigger project_parent_match before insert or update on public.drone_flights
  for each row execute function private.require_project_parent_match('zone_id', 'monitoring_zones');
drop trigger if exists project_parent_match on public.environmental_analyses;
create trigger project_parent_match before insert or update on public.environmental_analyses
  for each row execute function private.require_project_parent_match('zone_id', 'monitoring_zones');
drop trigger if exists project_parent_match on public.monitoring_alerts;
create trigger project_parent_match before insert or update on public.monitoring_alerts
  for each row execute function private.require_project_parent_match('device_id', 'monitoring_devices', 'zone_id', 'monitoring_zones');
drop trigger if exists project_parent_match on public.data_quality_rules;
create trigger project_parent_match before insert or update on public.data_quality_rules
  for each row execute function private.require_project_parent_match('data_source_id', 'data_sources');
drop trigger if exists project_parent_match on public.data_quality_issues;
create trigger project_parent_match before insert or update on public.data_quality_issues
  for each row execute function private.require_project_parent_match('zone_id', 'monitoring_zones', 'data_source_id', 'data_sources', 'device_id', 'monitoring_devices', 'upload_id', 'uploads');
drop trigger if exists project_parent_match on public.uploads;
create trigger project_parent_match before insert or update on public.uploads
  for each row execute function private.require_project_parent_match('zone_id', 'monitoring_zones');
drop trigger if exists project_parent_match on public.indicator_measurements;
create trigger project_parent_match before insert or update on public.indicator_measurements
  for each row execute function private.require_project_parent_match('indicator_id', 'indicators');

drop trigger if exists action_evidence_project_match on public.action_evidence;
create trigger action_evidence_project_match before insert or update on public.action_evidence
  for each row execute function private.require_action_evidence_project_match();
drop trigger if exists device_parameter_match on public.device_measurements;
create trigger device_parameter_match before insert or update on public.device_measurements
  for each row execute function private.require_device_parameter_match();
drop trigger if exists quality_issue_measurement_match on public.data_quality_issues;
create trigger quality_issue_measurement_match before insert or update on public.data_quality_issues
  for each row execute function private.require_quality_issue_measurement_match();
drop trigger if exists quality_assessment_scope_match on public.data_quality_assessments;
create trigger quality_assessment_scope_match before insert or update on public.data_quality_assessments
  for each row execute function private.require_quality_assessment_scope_match();

-- New writes cannot pair a project A metric with a project B area. NOT VALID
-- avoids asserting that unaudited existing production rows already satisfy it.
create unique index if not exists project_areas_id_project_id_unique
  on public.project_areas (id, project_id);
alter table public.calculated_metrics
  drop constraint if exists calculated_metrics_project_area_same_project;
alter table public.calculated_metrics
  add constraint calculated_metrics_project_area_same_project
  foreign key (project_area_id, project_id)
  references public.project_areas (id, project_id)
  not valid;

-- measurement_id was historically an unconstrained UUID. The trigger above
-- enforces tenant provenance, while this FK prevents new dangling references
-- and preserves the existing nullable cleanup semantics on deletion.
alter table public.data_quality_issues
  drop constraint if exists data_quality_issues_measurement_id_fkey;
alter table public.data_quality_issues
  add constraint data_quality_issues_measurement_id_fkey
  foreign key (measurement_id)
  references public.device_measurements (id)
  on delete set null
  not valid;

-- ---------------------------------------------------------------------------
-- Project RPCs: explicit caller authorization, invoker RLS and locked path.
-- ---------------------------------------------------------------------------

create or replace function public.get_project_geojson(input_project_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.can_read_project(input_project_id) then
    raise exception 'project not accessible' using errcode = '42501';
  end if;

  with project_row as (
    select project.id, project.name
    from public.projects project
    where project.id = input_project_id
  ), area_features as (
    select jsonb_build_object(
      'type', 'Feature',
      'id', area.id,
      'geometry', coalesce(public.st_asgeojson(area.geom)::jsonb, area.geojson),
      'properties', jsonb_build_object(
        'feature_class', 'project_area',
        'name', area.name,
        'area_type', area.area_type,
        'area_ha', area.area_ha
      )
    ) as feature
    from public.project_areas area
    where area.project_id = input_project_id
      and (area.geom is not null or area.geojson is not null)
  ), observation_features as (
    select jsonb_build_object(
      'type', 'Feature',
      'id', observation.id,
      'geometry', coalesce(public.st_asgeojson(observation.geom)::jsonb, observation.geojson),
      'properties', jsonb_build_object(
        'feature_class', 'observation',
        'observation_type', observation.observation_type,
        'value', observation.value,
        'unit', observation.unit,
        'observed_at', observation.observed_at
      )
    ) as feature
    from public.geo_observations observation
    where observation.project_id = input_project_id
      and (observation.geom is not null or observation.geojson is not null)
    order by observation.observed_at desc
    limit 200
  ), all_features as (
    select feature from area_features
    union all
    select feature from observation_features
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'project_id', input_project_id,
    'project_name', (select name from project_row),
    'generated_at', now(),
    'features', coalesce(jsonb_agg(feature), '[]'::jsonb)
  )
  into result
  from all_features;

  return result;
end
$$;

create or replace function public.get_project_metrics(input_project_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.can_read_project(input_project_id) then
    raise exception 'project not accessible' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'project_id', input_project_id,
    'total_area_ha', coalesce(project.geometry_area_ha, 0),
    'protected_nature_overlap_ha', (
      select metric.value from public.calculated_metrics metric
      where metric.project_id = input_project_id
        and metric.metric_key = 'protected_nature_overlap_ha'
      order by metric.calculated_at desc limit 1
    ),
    'observation_count', (
      select count(*) from public.geo_observations observation
      where observation.project_id = input_project_id
    ),
    'nearest_watercourse_distance_m', (
      select metric.value from public.calculated_metrics metric
      where metric.project_id = input_project_id
        and metric.metric_key = 'nearest_watercourse_distance_m'
      order by metric.calculated_at desc limit 1
    ),
    'latest_ndvi', (
      select metric.value from public.calculated_metrics metric
      where metric.project_id = input_project_id and metric.metric_key = 'ndvi_mean'
      order by metric.calculated_at desc limit 1
    ),
    'data_completeness_score', (
      select metric.value from public.calculated_metrics metric
      where metric.project_id = input_project_id
        and metric.metric_key = 'data_completeness_score'
      order by metric.calculated_at desc limit 1
    ),
    'calculated_at', now()
  )
  into result
  from public.projects project
  where project.id = input_project_id;

  return result;
end
$$;

revoke execute on function public.get_project_geojson(uuid) from public, anon;
revoke execute on function public.get_project_metrics(uuid) from public, anon;
grant execute on function public.get_project_geojson(uuid) to authenticated;
grant execute on function public.get_project_metrics(uuid) to authenticated;

-- Trigger functions cannot be invoked directly through an API role.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_creator_as_owner() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage buckets and project-aware object policies.
-- Existing paths remain usable only when the caller can read/write the project
-- encoded in the first segment or owns an exact monitoring upload row.
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'monitoring-uploads',
    'monitoring-uploads',
    false,
    209715200,
    array[
      'image/*',
      'video/*',
      'audio/*',
      'application/pdf',
      'application/json',
      'application/geo+json',
      'application/vnd.google-earth.kml+xml',
      'application/gpx+xml',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/zip',
      'application/x-zip-compressed',
      'text/csv',
      'text/plain',
      'text/xml',
      'application/xml'
    ]::text[]
  ),
  (
    'project-media',
    'project-media',
    false,
    52428800,
    array['image/*', 'application/pdf']::text[]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Evidence accepts several large geospatial/document formats, but the product
-- does not yet define an authoritative size/MIME contract. Keep it private
-- without overwriting any environment-specific restrictions already in place.
insert into storage.buckets (id, name, public)
values ('evidence-files', 'evidence-files', false)
on conflict (id) do update set public = excluded.public;

create or replace function private.storage_project_id(_object_name text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare candidate text;
begin
  if split_part(_object_name, '/', 1) = 'organizations'
     and split_part(_object_name, '/', 3) = 'projects' then
    candidate := split_part(_object_name, '/', 4);
  else
    candidate := split_part(_object_name, '/', 1);
  end if;
  if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return candidate::uuid;
  end if;
  return null;
end
$$;

-- Legacy paths begin with project_id. Canonical paths must additionally prove
-- that their organization segment owns the encoded project; a client cannot
-- manufacture that relationship by choosing folder names.
create or replace function private.storage_path_matches_project(_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  encoded_project_id uuid := private.storage_project_id(_object_name);
  encoded_organization text;
begin
  if encoded_project_id is null then
    return false;
  end if;

  if split_part(_object_name, '/', 1) = 'organizations' then
    encoded_organization := split_part(_object_name, '/', 2);
    if encoded_organization !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or split_part(_object_name, '/', 5) = ''
       or split_part(_object_name, '/', 6) = '' then
      return false;
    end if;
    return exists (
      select 1
      from public.projects project
      where project.id = encoded_project_id
        and project.organization_id = encoded_organization::uuid
    );
  end if;

  return split_part(_object_name, '/', 1) = encoded_project_id::text
    and split_part(_object_name, '/', 2) <> '';
end
$$;

-- Metadata references are part of tenant provenance. A newly attached path
-- must encode the row's own project (and canonical organization, when used),
-- and an established reference cannot later be swapped to another object.
create or replace function private.require_private_storage_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  path_column text;
  old_path text;
  new_path text;
begin
  if tg_nargs <> 1 then
    raise exception 'private storage reference trigger requires one path column'
      using errcode = '22023';
  end if;

  path_column := tg_argv[0];
  new_path := to_jsonb(new) ->> path_column;
  if tg_op = 'UPDATE' then
    old_path := to_jsonb(old) ->> path_column;
    if old_path is not null and new_path is distinct from old_path then
      raise exception '% is immutable because it defines storage provenance', path_column
        using errcode = '23514';
    end if;
  end if;

  if new_path is not null
     and (
       new.project_id is null
       or private.storage_project_id(new_path) is distinct from new.project_id
       or not private.storage_path_matches_project(new_path)
     ) then
    raise exception '% does not belong to row project_id', path_column
      using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function private.require_private_storage_reference()
  from public, anon, authenticated;

drop trigger if exists project_media_storage_reference on public.project_media;
create trigger project_media_storage_reference
  before insert or update of file_path on public.project_media
  for each row execute function private.require_private_storage_reference('file_path');

drop trigger if exists evidence_files_storage_reference on public.evidence_files;
create trigger evidence_files_storage_reference
  before insert or update of file_url on public.evidence_files
  for each row execute function private.require_private_storage_reference('file_url');

create or replace function private.can_read_monitoring_object(_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      (
        (select count(*) from public.uploads upload where upload.storage_path = _object_name) = 1
        and exists (
          select 1 from public.uploads upload
          where upload.storage_path = _object_name
            and split_part(upload.storage_path, '/', 1) = upload.uploaded_by::text
            and (
              (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
              or (upload.project_id is not null and private.can_read_project(upload.project_id))
              or (upload.project_id is null and upload.organization_id is not null and private.can_read_organization(upload.organization_id))
            )
        )
      )
      or (
        split_part(_object_name, '/', 1) = auth.uid()::text
        and not exists (
          select 1 from public.uploads upload
          where upload.storage_path = _object_name
        )
      )
    )
$$;

create or replace function private.can_write_monitoring_object(_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      (
        (select count(*) from public.uploads upload where upload.storage_path = _object_name) = 1
        and exists (
          select 1 from public.uploads upload
          where upload.storage_path = _object_name
            and split_part(upload.storage_path, '/', 1) = upload.uploaded_by::text
            and (
              (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
              or (upload.project_id is not null and private.can_write_project(upload.project_id))
              or (upload.project_id is null and upload.organization_id is not null and private.can_write_organization(upload.organization_id))
            )
        )
      )
      or (
        split_part(_object_name, '/', 1) = auth.uid()::text
        and not exists (
          select 1 from public.uploads upload
          where upload.storage_path = _object_name
        )
      )
    )
$$;

create or replace function private.can_delete_monitoring_object(_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      (
        (select count(*) from public.uploads upload where upload.storage_path = _object_name) = 1
        and exists (
          select 1 from public.uploads upload
          where upload.storage_path = _object_name
            and split_part(upload.storage_path, '/', 1) = upload.uploaded_by::text
            and (
              (upload.project_id is null and upload.organization_id is null and upload.uploaded_by = auth.uid())
              or (upload.project_id is not null and private.can_manage_project(upload.project_id))
              or (upload.project_id is null and upload.organization_id is not null and private.can_manage_organization(upload.organization_id))
            )
        )
      )
      or (
        split_part(_object_name, '/', 1) = auth.uid()::text
        and not exists (
          select 1 from public.uploads upload
          where upload.storage_path = _object_name
        )
      )
    )
$$;

revoke all on function private.storage_project_id(text) from public, anon;
revoke all on function private.storage_path_matches_project(text) from public, anon;
revoke all on function private.can_read_monitoring_object(text) from public, anon;
revoke all on function private.can_write_monitoring_object(text) from public, anon;
revoke all on function private.can_delete_monitoring_object(text) from public, anon;
grant execute on function private.storage_project_id(text) to authenticated, service_role;
grant execute on function private.storage_path_matches_project(text) to authenticated, service_role;
grant execute on function private.can_read_monitoring_object(text) to authenticated, service_role;
grant execute on function private.can_write_monitoring_object(text) to authenticated, service_role;
grant execute on function private.can_delete_monitoring_object(text) to authenticated, service_role;

drop policy if exists monitoring_uploads_read on storage.objects;
drop policy if exists monitoring_uploads_insert on storage.objects;
drop policy if exists monitoring_uploads_update on storage.objects;
drop policy if exists monitoring_uploads_delete on storage.objects;
drop policy if exists project_media_read on storage.objects;
drop policy if exists project_media_insert on storage.objects;
drop policy if exists project_media_update on storage.objects;
drop policy if exists project_media_delete on storage.objects;
drop policy if exists evidence_files_read on storage.objects;
drop policy if exists evidence_files_insert on storage.objects;
drop policy if exists evidence_files_update on storage.objects;
drop policy if exists evidence_files_delete on storage.objects;

create policy monitoring_uploads_read on storage.objects
  for select to authenticated
  using (bucket_id = 'monitoring-uploads' and private.can_read_monitoring_object(name));
create policy monitoring_uploads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'monitoring-uploads'
    and split_part(name, '/', 1) = auth.uid()::text
  );
create policy monitoring_uploads_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'monitoring-uploads'
    and private.can_delete_monitoring_object(name)
    and (
      exists (
        select 1 from public.uploads upload
        where upload.storage_path = storage.objects.name
      )
      or (
        owner_id = (select auth.uid()::text)
        and created_at >= now() - interval '15 minutes'
      )
    )
  );

create policy project_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-media'
    and private.storage_path_matches_project(name)
    and private.can_read_project(private.storage_project_id(name))
  );
create policy project_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-media'
    and private.storage_path_matches_project(name)
    and private.can_contribute_project(private.storage_project_id(name))
  );
create policy project_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-media'
    and private.storage_path_matches_project(name)
    and (
      private.can_manage_project(private.storage_project_id(name))
      or (
        owner_id = (select auth.uid()::text)
        and created_at >= now() - interval '15 minutes'
        and private.can_contribute_project(private.storage_project_id(name))
        and not exists (
          select 1 from public.project_media media
          where media.file_path = storage.objects.name
        )
      )
    )
  );

create policy evidence_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence-files'
    and private.storage_path_matches_project(name)
    and private.can_read_project(private.storage_project_id(name))
  );
create policy evidence_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence-files'
    and private.storage_path_matches_project(name)
    and private.can_contribute_project(private.storage_project_id(name))
  );
create policy evidence_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence-files'
    and private.storage_path_matches_project(name)
    and (
      private.can_manage_project(private.storage_project_id(name))
      or (
        owner_id = (select auth.uid()::text)
        and created_at >= now() - interval '15 minutes'
        and private.can_contribute_project(private.storage_project_id(name))
        and not exists (
          select 1 from public.evidence_files evidence
          where evidence.file_url = storage.objects.name
        )
      )
    )
  );
