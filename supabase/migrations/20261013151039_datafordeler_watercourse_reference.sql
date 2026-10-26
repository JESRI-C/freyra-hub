-- Forward-only support for authenticated DS bearbejdet WFS references.
-- Existing v1 manifests, hashes, rows, access rules and immutable reads remain.
-- Registration/validity dates are not a new measured geometry observation.
alter table public.project_baseline_snapshots
  drop constraint project_baseline_snapshots_schema_version_check,
  add constraint baseline_schema_version check (schema_version in (1,2)),
  drop constraint baseline_manifest_shape,
  add constraint baseline_manifest_shape check ((
    jsonb_typeof(manifest) = 'object'
    and ((schema_version = 1 and manifest ->> 'schema' = 'gofreyra.public-baseline/v1')
      or (schema_version = 2 and manifest ->> 'schema' = 'gofreyra.public-baseline/v2'))
    and jsonb_typeof(manifest -> 'project') = 'object'
    and manifest #>> '{project,id}' = project_id::text
    and manifest #>> '{project,crs}' = 'EPSG:4326'
    and manifest #>> '{project,polygonSha256}' = geometry_sha256
    and jsonb_typeof(manifest #> '{project,polygon}') = 'object'
    and manifest #>> '{project,polygon,type}' = 'Polygon'
    and jsonb_typeof(manifest -> 'period') = 'object'
    and jsonb_typeof(manifest -> 'reference') = 'object'
    and jsonb_typeof(manifest -> 'sources') = 'array'
  ) is true);
create or replace function public.persist_project_baseline(
  p_project_id uuid,
  p_actor_id uuid,
  p_request_id uuid,
  p_manifest jsonb,
  p_manifest_sha256 text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_row public.projects%rowtype;
  existing public.project_baseline_snapshots%rowtype;
  inserted public.project_baseline_snapshots%rowtype;
  next_version integer;
  current_reference public.monitoring_zones%rowtype;
  can_write boolean;
begin
  if p_actor_id is null or p_request_id is null then
    raise exception 'Verified actor and request id are required' using errcode = '22023';
  end if;

  -- Serialize versions for one project, including concurrent identical retries.
  select * into project_row from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Project access denied' using errcode = '42501';
  end if;
  -- Membership revocation/role changes cannot race an accepted insert. If a
  -- revocation committed first, the checks below observe it and deny the write.
  perform 1 from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id
      and membership.user_id = p_actor_id for share;
  perform 1 from public.project_members member
    where member.project_id = p_project_id and member.user_id = p_actor_id for share;
  select (
    exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = project_row.organization_id
        and membership.user_id = p_actor_id
        and membership.role in ('owner', 'admin')
    )
    or (
      exists (
        select 1 from public.project_members member
        where member.project_id = p_project_id and member.user_id = p_actor_id
          and member.role in ('admin', 'project_manager', 'editor')
      )
      and exists (
        select 1 from public.organization_memberships membership
        where membership.organization_id = project_row.organization_id
          and membership.user_id = p_actor_id
      )
    )
  ) into can_write;
  if not can_write then
    raise exception 'Project access denied' using errcode = '42501';
  end if;

  select * into existing from public.project_baseline_snapshots
    where project_id = p_project_id and created_by = p_actor_id and request_id = p_request_id;
  if found then
    if existing.manifest -> 'period' is distinct from p_manifest -> 'period' then
      raise exception 'Request id already belongs to another period' using errcode = '23514';
    end if;
    return to_jsonb(existing);
  end if;

  if p_manifest is null or octet_length(p_manifest::text) > 2097152 or jsonb_typeof(p_manifest) <> 'object'
     or p_manifest ->> 'schema' is null or p_manifest ->> 'schema' not in ('gofreyra.public-baseline/v1','gofreyra.public-baseline/v2')
     or p_manifest #>> '{project,id}' is distinct from p_project_id::text
     or p_manifest #>> '{project,name}' is distinct from project_row.name
     or p_manifest #> '{project,polygon}' is distinct from project_row.geometry_polygon
     or p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
     or p_manifest #>> '{project,polygonSha256}' is null
     or p_manifest #>> '{project,polygonSha256}' !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_manifest -> 'sources') is distinct from 'array'
     or jsonb_array_length(p_manifest -> 'sources') < 1
     or p_manifest #>> '{period,from}' is null
     or p_manifest #>> '{period,to}' is null then
    raise exception 'Invalid or stale canonical baseline input' using errcode = '23514';
  end if;

  -- Lock and check the selected reference as well: a boundary/reference edit
  -- that committed during source fetching requires a fresh collection attempt.
  select * into current_reference from public.monitoring_zones zone
    where zone.project_id = p_project_id and zone.zone_type = 'watercourse'
      and zone.status = 'active' and zone.id::text = p_manifest #>> '{reference,zoneId}'
    for share;
  if not found or current_reference.source_type is distinct from 'imported'
     or ((
       (p_manifest ->> 'schema' = 'gofreyra.public-baseline/v1'
        and current_reference.source_metadata ->> 'schema' = 'gofreyra.watercourse-reach-source/v1'
        and current_reference.source_metadata ->> 'source_system' = 'SDFI Danske Stednavne'
        and not ((p_manifest -> 'reference') ? 'sourceProvider'))
       or (p_manifest ->> 'schema' = 'gofreyra.public-baseline/v2'
        and current_reference.source_metadata ->> 'schema' = 'gofreyra.watercourse-reach-source/v2'
        and current_reference.source_metadata ->> 'source_system' = 'KDS Datafordeler Danske Stednavne'
        and current_reference.source_metadata ->> 'source_provider' = 'datafordeler-ds-bearbejdet-wfs/v1'
        and p_manifest #>> '{reference,sourceProvider}' = 'datafordeler-ds-bearbejdet-wfs/v1'
        and current_reference.source_metadata ->> 'source_crs' = 'EPSG:4326'
        and p_manifest #>> '{reference,sourceCrs}' = 'EPSG:4326'
        and current_reference.source_metadata ->> 'source_axis_order' = 'lat-lng'
        and p_manifest #>> '{reference,sourceAxisOrder}' = 'lat-lng'
        and current_reference.source_metadata ->> 'dataset_version' = 'static-2025-09'
        and p_manifest #>> '{reference,datasetVersion}' = 'static-2025-09'
        and current_reference.source_metadata ?& array['source_registered_at','source_valid_from','official_length_m']
        and (p_manifest -> 'reference') ?& array['sourceRegisteredAt','sourceValidFrom','officialLengthM']
        and current_reference.source_metadata -> 'source_registered_at' is not distinct from p_manifest #> '{reference,sourceRegisteredAt}'
        and current_reference.source_metadata -> 'source_valid_from' is not distinct from p_manifest #> '{reference,sourceValidFrom}'
        and current_reference.source_metadata -> 'official_length_m' is not distinct from p_manifest #> '{reference,officialLengthM}'
        and current_reference.source_metadata -> 'source_modified_at' = 'null'::jsonb
        and current_reference.source_metadata -> 'geometry_version' = 'null'::jsonb
        and p_manifest #> '{reference,modifiedAt}' = 'null'::jsonb
        and p_manifest #> '{reference,geometryVersion}' = 'null'::jsonb)
     ) is not true)
     or current_reference.source_metadata ->> 'crs' is distinct from 'EPSG:4326'
     or current_reference.geometry is distinct from p_manifest #> '{reference,geometry}'
     or current_reference.source_metadata ->> 'source_id' is distinct from p_manifest #>> '{reference,id}'
     or current_reference.source_metadata ->> 'source_url' is distinct from p_manifest #>> '{reference,sourceUrl}' then
    raise exception 'The selected official reference changed during collection' using errcode = '23514';
  end if;

  select coalesce(max(version_no), 0) + 1 into next_version
    from public.project_baseline_snapshots where project_id = p_project_id;
  insert into public.project_baseline_snapshots (
    project_id, version_no, schema_version, created_by, request_id, geometry_sha256,
    manifest_sha256, manifest
  ) values (
    p_project_id, next_version, case when p_manifest ->> 'schema' = 'gofreyra.public-baseline/v2' then 2 else 1 end, p_actor_id, p_request_id,
    p_manifest #>> '{project,polygonSha256}', p_manifest_sha256, p_manifest
  ) returning * into inserted;
  return to_jsonb(inserted);
end
$$;

revoke all on function public.persist_project_baseline(uuid, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.persist_project_baseline(uuid, uuid, uuid, jsonb, text)
  to service_role;
