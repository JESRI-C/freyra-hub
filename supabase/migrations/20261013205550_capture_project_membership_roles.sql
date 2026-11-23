-- Inert narrow candidate; root creates the real new migration with CLI.
-- Captured role values close the absent-row/new-grant/revoke race.
-- Existing signatures, role groups, lock order, ACL, Storage/original/dedup/hash
-- checks, immutable triggers and JSON results stay unchanged. CREATE OR REPLACE
-- preserves each existing function's ownership and privileges; no new grants.
-- Fail closed if a prerequisite is missing: never CREATE a new function with
-- PostgreSQL's default PUBLIC execution privileges by accident.

do $role_snapshot_preflight$
declare predecessor text;
begin
  for predecessor in select signature from (values
    ('public.persist_project_baseline(uuid,uuid,uuid,jsonb,text)'),
    ('public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)'),
    ('private.lock_drone_original_upload(uuid,uuid,uuid)'),
    ('public.prepare_project_media_original_read(uuid,uuid,uuid)')
  ) as required(signature) loop
    if pg_catalog.to_regprocedure(predecessor) is null then
      raise exception 'Required authorization predecessor is missing' using errcode='23514';
    end if;
  end loop;
end
$role_snapshot_preflight$;

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
  organization_role text;
  project_role text;
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
  -- Authorize only role values read under these row locks. A later grant
  -- absent here cannot authorize this transaction through an unlocked EXISTS.
  select membership.role::text into organization_role from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id for share;
  select member.role::text into project_role from public.project_members member
    where member.project_id = p_project_id and member.user_id = p_actor_id for share;
  can_write := coalesce(organization_role in ('owner','admin') or
    (organization_role is not null and project_role in ('admin','project_manager','editor')),false);
  if can_write is not true then raise exception 'Project access denied' using errcode = '42501'; end if;

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

create or replace function public.persist_verification_plan(
  p_project_id uuid, p_actor_id uuid, p_request_id uuid,
  p_baseline_id uuid, p_baseline_sha256 text, p_manifest_text text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  project_row public.projects%rowtype;
  baseline_row public.project_baseline_snapshots%rowtype;
  existing public.verification_plan_versions%rowtype;
  inserted public.verification_plan_versions%rowtype;
  plan_manifest jsonb;
  plan_hash text;
  expected_gaps jsonb;
  expected_context jsonb;
  reference_source jsonb;
  question jsonb;
  next_version integer;
  can_write boolean;
  organization_role text;
  project_role text;
begin
  if p_actor_id is null or p_request_id is null then
    raise exception 'Verified actor and request id are required' using errcode = '22023';
  end if;
  -- Same lock order as baseline/original writers: project, organization member,
  -- project member. Versions/retries are serialized by the project lock.
  select * into project_row from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  -- Authorize only role values read under these row locks. A later grant
  -- absent here cannot authorize this transaction through an unlocked EXISTS.
  select membership.role::text into organization_role from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id for share;
  select member.role::text into project_role from public.project_members member
    where member.project_id = p_project_id and member.user_id = p_actor_id for share;
  can_write := coalesce(organization_role in ('owner','admin') or
    (organization_role is not null and project_role in ('admin','project_manager','editor')),false);
  if can_write is not true then raise exception 'Project access denied' using errcode = '42501'; end if;

  -- Baselines are already immutable and the composite FK retains this input.
  -- A row lock would require UPDATE privileges that this reader must not gain.
  select * into baseline_row from public.project_baseline_snapshots
    where project_id = p_project_id and id = p_baseline_id;
  if not found or p_baseline_sha256 is distinct from baseline_row.manifest_sha256 then
    raise exception 'Invalid saved baseline binding' using errcode = '23514';
  end if;
  if p_manifest_text is null or octet_length(p_manifest_text) > 2097152 then
    raise exception 'Invalid or oversized verification plan' using errcode = '23514';
  end if;
  plan_manifest := p_manifest_text::jsonb;
  plan_hash := encode(pg_catalog.sha256(convert_to(p_manifest_text,'UTF8')),'hex');
  if (jsonb_typeof(plan_manifest) = 'object'
    and octet_length(plan_manifest::text) <= 2097152
    and plan_manifest ->> 'schema' = 'gofreyra.verification-plan/v1'
    and plan_manifest ->> 'generatorVersion' = 'gofreyra.reference-location-plan/v1'
    and plan_manifest ->> 'status' = 'draft'
    and plan_manifest ->> 'projectId' = p_project_id::text
    and plan_manifest ->> 'snapshotId' = p_baseline_id::text
    and plan_manifest ->> 'snapshotSha256' = baseline_row.manifest_sha256
    and plan_manifest ->> 'baselineSchema' = baseline_row.manifest ->> 'schema'
    and jsonb_typeof(plan_manifest -> 'questions') = 'array'
    and jsonb_typeof(plan_manifest -> 'baselineDataGaps') = 'array'
    and jsonb_typeof(plan_manifest -> 'contextSourceIds') = 'array'
    and jsonb_typeof(plan_manifest -> 'warnings') = 'array'
    and plan_manifest - array['schema','generatorVersion','baselineSchema','status','projectId',
      'snapshotId','snapshotSha256','questions','baselineDataGaps','contextSourceIds','warnings'] = '{}'::jsonb
  ) is not true then
    raise exception 'Invalid verification plan manifest' using errcode = '23514';
  end if;
  if jsonb_array_length(plan_manifest -> 'questions') > 1 then
    raise exception 'Unsupported v1 verification questions' using errcode = '23514';
  end if;

  with source_rows as (
    select source, source_ordinal, ((source ->> 'mode' in ('live','import'))
      and source ->> 'status' = 'complete' and source -> 'payload' <> 'null'::jsonb
      and source -> 'payloadSha256' <> 'null'::jsonb and source -> 'error' = 'null'::jsonb) is true as available
    from jsonb_array_elements(baseline_row.manifest -> 'sources') with ordinality as sources(source,source_ordinal)
  )
  select coalesce(jsonb_agg(jsonb_build_object('sourceId',source ->> 'id',
      'provider',source ->> 'provider','dataset',source ->> 'dataset',
      'reason',coalesce(source #>> '{error,message}',
        'Kilden mangler fuld, dokumenteret dækning. Afklar datagrundlaget før en faglig konklusion.')) order by source_ordinal)
        filter (where not available),'[]'::jsonb),
    coalesce(jsonb_agg(to_jsonb(source ->> 'id') order by source_ordinal)
        filter (where available and source ->> 'id' <> 'official-watercourse-reference'),'[]'::jsonb)
    into expected_gaps, expected_context from source_rows;
  if plan_manifest -> 'baselineDataGaps' is distinct from expected_gaps
    or plan_manifest -> 'contextSourceIds' is distinct from expected_context then
    raise exception 'Verification plan source gaps or context changed' using errcode = '23514';
  end if;
  select source into reference_source from jsonb_array_elements(baseline_row.manifest -> 'sources') as sources(source)
    where source ->> 'id' = 'official-watercourse-reference';

  for question in select value from jsonb_array_elements(plan_manifest -> 'questions') loop
    if (jsonb_typeof(question) = 'object'
      and question ->> 'id' = 'verification:' || p_baseline_id::text || ':official-reference-location:v1'
      and question ->> 'snapshotId' = p_baseline_id::text
      and question ->> 'snapshotSha256' = p_baseline_sha256
      and question -> 'sourceIds' = '["official-watercourse-reference"]'::jsonb
      and question ->> 'priority' = 'normal'
      and question -> 'result' = 'null'::jsonb
      and question -> 'allowedResults' = '["supported","refuted","inconclusive","site_visit"]'::jsonb
      and question #>> '{area,crs}' = 'EPSG:4326'
      and question #> '{area,aoi}' = baseline_row.manifest #> '{project,polygon}'
      and question #> '{area,referenceGeometry}' = baseline_row.manifest #> '{reference,geometry}'
      and question #>> '{dates,baselineFrom}' = baseline_row.manifest #>> '{period,from}'
      and question #>> '{dates,baselineTo}' = baseline_row.manifest #>> '{period,to}'
      and question #> '{dates,sourceFetchedAt}' = reference_source -> 'fetchedAt'
      and question #> '{dates,sourceModifiedAt}' = reference_source -> 'sourceModifiedAt'
      and question #> '{dates,sourceObservedFrom}' = reference_source #> '{coverage,observedFrom}'
      and question #> '{dates,sourceObservedTo}' = reference_source #> '{coverage,observedTo}'
      and reference_source ->> 'mode' in ('live','import')
      and reference_source ->> 'status' = 'complete'
      and reference_source -> 'payload' <> 'null'::jsonb
      and reference_source -> 'payloadSha256' <> 'null'::jsonb
      and reference_source -> 'error' = 'null'::jsonb
      and reference_source #>> '{quality,evidenceKind}' = 'official_registration'
      and question - array['id','snapshotId','snapshotSha256','sourceIds','priority','title','question',
        'rationale','area','dates','method','requiredEvidence','uncertainty','allowedResults','result'] = '{}'::jsonb
    ) is not true then
      raise exception 'Verification question changed its frozen input or result' using errcode = '23514';
    end if;
  end loop;

  select * into existing from public.verification_plan_versions
    where project_id = p_project_id and created_by = p_actor_id and request_id = p_request_id;
  if found then
    if existing.baseline_id is distinct from p_baseline_id
      or existing.baseline_sha256 is distinct from p_baseline_sha256
      or existing.manifest is distinct from plan_manifest
      or existing.manifest_sha256 is distinct from plan_hash then
      raise exception 'Request id already belongs to another verification plan' using errcode = '23514';
    end if;
    return to_jsonb(existing);
  end if;
  select coalesce(max(version_no),0)+1 into next_version from public.verification_plan_versions where project_id = p_project_id;
  insert into public.verification_plan_versions(project_id,version_no,baseline_id,baseline_sha256,
    generator_version,manifest_sha256,manifest,created_by,request_id)
  values (p_project_id,next_version,p_baseline_id,p_baseline_sha256,
    'gofreyra.reference-location-plan/v1',plan_hash,plan_manifest,p_actor_id,p_request_id)
  returning * into inserted;
  return to_jsonb(inserted);
end
$$;

create or replace function private.lock_drone_original_upload(p_project_id uuid, p_upload_id uuid, p_actor_id uuid)
returns public.uploads language plpgsql security invoker set search_path = '' as $$
declare project_row public.projects%rowtype; upload_row public.uploads%rowtype;
  organization_role text;
  project_role text;
begin
  if p_actor_id is null then raise exception 'Verified actor required' using errcode = '42501'; end if;
  select * into project_row from public.projects where id = p_project_id for share;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  -- Authorize only role values read under these row locks. A later grant
  -- absent here cannot authorize this transaction through an unlocked EXISTS.
  select membership.role::text into organization_role from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id for share;
  select member.role::text into project_role from public.project_members member
    where member.project_id = p_project_id and member.user_id = p_actor_id for share;
  if coalesce(organization_role in ('owner','admin') or
    (organization_role is not null and project_role in ('admin','project_manager','editor','field')),false) is not true then
    raise exception 'Project contribution denied' using errcode = '42501';
  end if;
  select * into upload_row from public.uploads where id = p_upload_id and project_id = p_project_id for update;
  if not found or upload_row.intent_request_id is null or upload_row.received_at is null
    or upload_row.status not in ('awaiting_validation', 'validating', 'rejected')
    or upload_row.mime_type <> 'image/jpeg' or upload_row.upload_type <> 'drone_photo'
    or upload_row.file_size < 1 or upload_row.file_size > 33554432
    or upload_row.file_name !~* '^[a-zA-Z0-9._-]+[.](jpg|jpeg)$'
    or upload_row.storage_path is distinct from (upload_row.uploaded_by::text || '/intents/' || upload_row.id::text || '/' || upload_row.file_name)
  then raise exception 'Not a canonical finalized JPEG drone upload' using errcode = '23514'; end if;
  return upload_row;
end $$;

create or replace function public.prepare_project_media_original_read(p_project_id uuid,p_media_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare project_row public.projects%rowtype; media_row public.project_media%rowtype;
  upload_row public.uploads%rowtype; object_row storage.objects%rowtype;
  organization_role text;
  project_role text;
begin
  if p_actor_id is null then raise exception 'Verified actor required' using errcode = '42501'; end if;
  select * into project_row from public.projects where id = p_project_id for share;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  -- Authorize only role values read under these row locks. A later grant
  -- absent here cannot authorize this transaction through an unlocked EXISTS.
  select membership.role::text into organization_role from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id for share;
  select member.role::text into project_role from public.project_members member
    where member.project_id = p_project_id and member.user_id = p_actor_id for share;
  if coalesce(organization_role in ('owner','admin') or
    (organization_role is not null and project_role in ('admin','project_manager','editor','field','viewer')),false) is not true then
    raise exception 'Project read access denied' using errcode = '42501';
  end if;
  select * into media_row from public.project_media where id = p_media_id and project_id = p_project_id for share;
  if not found or media_row.storage_bucket <> 'monitoring-uploads' or media_row.original_role is distinct from 'drone_original'
    or media_row.source_upload_id is null or media_row.is_report_ready then
    raise exception 'Not a canonical raw original media reference' using errcode = '23514';
  end if;
  select * into upload_row from public.uploads where id = media_row.source_upload_id and project_id = p_project_id for share;
  if not found or upload_row.received_at is null or upload_row.intent_request_id is null
    or upload_row.status in ('draft','archived','rejected')
    or upload_row.original_validation ->> 'status' not in ('raw_original_validated','review_required')
    or upload_row.original_validation ->> 'status' is null
    or upload_row.storage_path is distinct from media_row.file_path
    or upload_row.original_sha256 is distinct from media_row.original_sha256
    or upload_row.original_validation_sha256 is distinct from media_row.original_validation_sha256
    or upload_row.file_size is distinct from media_row.file_size_bytes or upload_row.mime_type is distinct from 'image/jpeg' then
    raise exception 'Canonical primary original changed or is unavailable' using errcode = '23514';
  end if;
  begin
    select * into strict object_row from storage.objects object
      where object.bucket_id = 'monitoring-uploads' and object.name = media_row.file_path
        and to_jsonb(object) ->> 'archived_at' is null
        and not coalesce((to_jsonb(object) ->> 'is_delete_marker')::boolean,false) for share;
  exception when no_data_found or too_many_rows then
    raise exception 'Canonical primary original changed or is unavailable' using errcode = '23514';
  end;
  if object_row.id is distinct from media_row.storage_object_id
    or to_jsonb(object_row) ->> 'version' is distinct from media_row.storage_object_version
    or object_row.updated_at is distinct from media_row.storage_object_updated_at
    or object_row.owner_id is distinct from upload_row.uploaded_by::text
    or object_row.metadata ->> 'size' is null or object_row.metadata ->> 'size' !~ '^[0-9]+$'
    or (object_row.metadata ->> 'size')::bigint is distinct from media_row.file_size_bytes
    or lower(object_row.metadata ->> 'mimetype') is distinct from 'image/jpeg' then
    raise exception 'Canonical primary original changed or is unavailable' using errcode = '23514';
  end if;
  return jsonb_build_object('media',to_jsonb(media_row),'upload',to_jsonb(upload_row),
    'object',jsonb_build_object('id',object_row.id,'version',to_jsonb(object_row) ->> 'version',
    'updated_at',object_row.updated_at,'owner_id',object_row.owner_id,'size',media_row.file_size_bytes,'mimetype','image/jpeg'));
end $$;
