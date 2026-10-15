-- Task 16: immutable draft plans derived from a saved baseline, never approval.
-- Local candidate only; fresh database replay and runtime acceptance are separate.
-- The source manifest/hash is retained. Current project geometry is not substituted.

alter table public.project_baseline_snapshots
  add constraint baseline_project_id_hash_unique unique (project_id, id, manifest_sha256);

create table public.verification_plan_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  baseline_id uuid not null,
  baseline_sha256 text not null check (baseline_sha256 ~ '^[0-9a-f]{64}$'),
  generator_version text not null check (generator_version = 'gofreyra.reference-location-plan/v1'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  request_id uuid not null,
  constraint verification_plan_baseline_binding foreign key (project_id, baseline_id, baseline_sha256)
    references public.project_baseline_snapshots (project_id, id, manifest_sha256) on delete restrict,
  constraint verification_plan_manifest_size check (octet_length(manifest::text) <= 2097152),
  constraint verification_plan_manifest_shape check ((
    jsonb_typeof(manifest) = 'object'
    and manifest ->> 'schema' = 'gofreyra.verification-plan/v1'
    and manifest ->> 'generatorVersion' = generator_version
    and manifest ->> 'status' = 'draft'
    and manifest ->> 'projectId' = project_id::text
    and manifest ->> 'snapshotId' = baseline_id::text
    and manifest ->> 'snapshotSha256' = baseline_sha256
    and manifest ->> 'baselineSchema' in ('gofreyra.public-baseline/v1','gofreyra.public-baseline/v2')
    and jsonb_typeof(manifest -> 'questions') = 'array'
    and jsonb_typeof(manifest -> 'baselineDataGaps') = 'array'
    and jsonb_typeof(manifest -> 'contextSourceIds') = 'array'
    and jsonb_typeof(manifest -> 'warnings') = 'array'
  ) is true),
  unique (project_id, version_no),
  unique (project_id, created_by, request_id),
  unique (project_id, id, manifest_sha256)
);
create index verification_plan_baseline_versions
  on public.verification_plan_versions (project_id, baseline_id, version_no desc);
alter table public.verification_plan_versions enable row level security;
revoke all on public.verification_plan_versions from public, anon, authenticated, service_role;
grant select on public.verification_plan_versions to authenticated;
grant select, insert on public.verification_plan_versions to service_role;
create policy verification_plan_project_read on public.verification_plan_versions
  for select to authenticated using (private.can_read_project(project_id));

create or replace function private.reject_verification_plan_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'A saved verification plan is immutable; create a new version' using errcode = '23514';
end
$$;
revoke all on function private.reject_verification_plan_mutation() from public, anon, authenticated;
create trigger verification_plan_versions_immutable before update or delete
  on public.verification_plan_versions for each row
  execute function private.reject_verification_plan_mutation();

-- Caller sends only project/baseline/request IDs to the app. The authenticated
-- server reads that baseline through RLS, verifies its hash, runs the frozen v1
-- generator, then imports this privileged writer. No upstream fetch is involved.
-- The writer rechecks memberships, exact baseline binding, source gaps, dates,
-- AOI and reference geometry. App reload also checks the full deterministic v1
-- output, including method/text/uncertainty, against the stored baseline.
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
begin
  if p_actor_id is null or p_request_id is null then
    raise exception 'Verified actor and request id are required' using errcode = '22023';
  end if;
  -- Same lock order as baseline/original writers: project, organization member,
  -- project member. Versions/retries are serialized by the project lock.
  select * into project_row from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  perform 1 from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id for share;
  perform 1 from public.project_members member
    where member.project_id = p_project_id and member.user_id = p_actor_id for share;
  select (exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id
      and membership.role in ('owner','admin')
  ) or (exists (
    select 1 from public.project_members member where member.project_id = p_project_id
      and member.user_id = p_actor_id and member.role in ('admin','project_manager','editor')
  ) and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id
  ))) into can_write;
  if not can_write then raise exception 'Project access denied' using errcode = '42501'; end if;

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
revoke all on function public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.persist_verification_plan(uuid,uuid,uuid,uuid,text,text) to service_role;
