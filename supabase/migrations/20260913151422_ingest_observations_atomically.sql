-- The public observations endpoint authenticates one server credential and
-- binds it to one configured project before calling this RPC. Keep all
-- database validation and the batch insert in the same transaction so a
-- relation cannot change between separate Data API requests.
create or replace function public.ingest_observations_atomic(
  p_project_id uuid,
  p_observations jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested_count integer;
  v_expected_relations integer;
  v_locked_relations integer;
  v_inserted_count integer;
begin
  if p_project_id is null then
    raise exception 'Project id is required' using errcode = '22023';
  end if;

  if p_observations is null
     or pg_catalog.jsonb_typeof(p_observations) <> 'array' then
    raise exception 'Observations must be a JSON array' using errcode = '22023';
  end if;

  v_requested_count := pg_catalog.jsonb_array_length(p_observations);
  if v_requested_count < 1 or v_requested_count > 500 then
    raise exception 'Observation batch must contain between 1 and 500 items'
      using errcode = '22023';
  end if;

  if pg_catalog.pg_column_size(p_observations) > 4194304 then
    raise exception 'Observation batch exceeds the 4 MiB database limit'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_observations) as element(item)
    where pg_catalog.jsonb_typeof(element.item) <> 'object'
  ) then
    raise exception 'Every observation must be a JSON object'
      using errcode = '22023';
  end if;

  -- Reject unknown fields, especially a caller-controlled per-item project_id.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_observations) as element(item)
    cross join lateral pg_catalog.jsonb_object_keys(element.item) as item_key(name)
    where item_key.name not in (
      'indicator_key',
      'value',
      'unit',
      'observed_at',
      'observation_type',
      'site_id',
      'source_id',
      'confidence',
      'metadata'
    )
  ) then
    raise exception 'Observation contains an unsupported field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_observations) as element(item)
    where pg_catalog.jsonb_typeof(element.item -> 'indicator_key') is distinct from 'string'
       or pg_catalog.length(element.item ->> 'indicator_key') > 100
       or pg_catalog.length(pg_catalog.btrim(element.item ->> 'indicator_key')) < 1
       or pg_catalog.jsonb_typeof(element.item -> 'value') is distinct from 'number'
       or (
         element.item ? 'unit'
         and pg_catalog.jsonb_typeof(element.item -> 'unit') not in ('string', 'null')
       )
       or (
         pg_catalog.jsonb_typeof(element.item -> 'unit') = 'string'
         and pg_catalog.length(element.item ->> 'unit') > 50
       )
       or (
         element.item ? 'observation_type'
         and pg_catalog.jsonb_typeof(element.item -> 'observation_type') not in ('string', 'null')
       )
       or (
         pg_catalog.jsonb_typeof(element.item -> 'observation_type') = 'string'
         and pg_catalog.length(element.item ->> 'observation_type') > 100
       )
       or (
         element.item ? 'confidence'
         and pg_catalog.jsonb_typeof(element.item -> 'confidence') not in ('number', 'null')
       )
       or (
         pg_catalog.jsonb_typeof(element.item -> 'confidence') = 'number'
         and (
           (element.item ->> 'confidence')::numeric < 0
           or (element.item ->> 'confidence')::numeric > 1
         )
       )
       or (
         element.item ? 'metadata'
         and pg_catalog.jsonb_typeof(element.item -> 'metadata') not in ('object', 'null')
       )
       or (
         element.item ? 'observed_at'
         and pg_catalog.jsonb_typeof(element.item -> 'observed_at') not in ('string', 'null')
       )
       or (
         pg_catalog.jsonb_typeof(element.item -> 'observed_at') = 'string'
         and (
           pg_catalog.length(element.item ->> 'observed_at') > 64
           or (element.item ->> 'observed_at') !~
             '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?([zZ]|[+-][0-9]{2}:[0-9]{2})$'
         )
       )
       or (
         element.item ? 'site_id'
         and pg_catalog.jsonb_typeof(element.item -> 'site_id') not in ('string', 'null')
       )
       or (
         pg_catalog.jsonb_typeof(element.item -> 'site_id') = 'string'
         and (
           (element.item ->> 'site_id') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         )
       )
       or (
         element.item ? 'source_id'
         and pg_catalog.jsonb_typeof(element.item -> 'source_id') not in ('string', 'null')
       )
       or (
         pg_catalog.jsonb_typeof(element.item -> 'source_id') = 'string'
         and (
           (element.item ->> 'source_id') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         )
       )
  ) then
    raise exception 'Observation fields are invalid' using errcode = '22023';
  end if;

  -- Cast once inside a narrow exception boundary. This turns UUID, timestamp
  -- and double-precision overflow/parser failures into the same public input
  -- contract on both PostgreSQL 15 and newer database images.
  begin
    perform (element.item ->> 'value')::double precision
    from pg_catalog.jsonb_array_elements(p_observations) as element(item);

    perform (element.item ->> 'confidence')::double precision
    from pg_catalog.jsonb_array_elements(p_observations) as element(item)
    where pg_catalog.jsonb_typeof(element.item -> 'confidence') = 'number';

    perform (element.item ->> 'observed_at')::timestamp with time zone
    from pg_catalog.jsonb_array_elements(p_observations) as element(item)
    where pg_catalog.jsonb_typeof(element.item -> 'observed_at') = 'string';

    perform (element.item ->> 'site_id')::uuid
    from pg_catalog.jsonb_array_elements(p_observations) as element(item)
    where pg_catalog.jsonb_typeof(element.item -> 'site_id') = 'string';

    perform (element.item ->> 'source_id')::uuid
    from pg_catalog.jsonb_array_elements(p_observations) as element(item)
    where pg_catalog.jsonb_typeof(element.item -> 'source_id') = 'string';
  exception
    when data_exception then
      raise exception 'Observation fields are invalid' using errcode = '22023';
  end;

  -- Hold the tenant root and every referenced parent until this transaction
  -- commits. ROW_COUNT equality turns missing or cross-project IDs into one
  -- deterministic scope error before the insert starts.
  perform project.id
  from public.projects as project
  where project.id = p_project_id
    and project.organization_id is not null
  for share of project;
  if not found then
    raise exception 'Project not found or missing organization'
      using errcode = 'P0002';
  end if;

  select pg_catalog.count(distinct (element.item ->> 'site_id')::uuid)::integer
    into v_expected_relations
  from pg_catalog.jsonb_array_elements(p_observations) as element(item)
  where pg_catalog.jsonb_typeof(element.item -> 'site_id') = 'string';

  perform site.id
  from public.sites as site
  where site.project_id = p_project_id
    and site.id in (
      select distinct (element.item ->> 'site_id')::uuid
      from pg_catalog.jsonb_array_elements(p_observations) as element(item)
      where pg_catalog.jsonb_typeof(element.item -> 'site_id') = 'string'
    )
  order by site.id
  for share of site;
  get diagnostics v_locked_relations = row_count;

  if v_locked_relations <> v_expected_relations then
    raise exception 'Observation site does not belong to project'
      using errcode = '23514';
  end if;

  select pg_catalog.count(distinct (element.item ->> 'source_id')::uuid)::integer
    into v_expected_relations
  from pg_catalog.jsonb_array_elements(p_observations) as element(item)
  where pg_catalog.jsonb_typeof(element.item -> 'source_id') = 'string';

  perform source.id
  from public.data_sources as source
  where source.project_id = p_project_id
    and source.id in (
      select distinct (element.item ->> 'source_id')::uuid
      from pg_catalog.jsonb_array_elements(p_observations) as element(item)
      where pg_catalog.jsonb_typeof(element.item -> 'source_id') = 'string'
    )
  order by source.id
  for share of source;
  get diagnostics v_locked_relations = row_count;

  if v_locked_relations <> v_expected_relations then
    raise exception 'Observation source does not belong to project'
      using errcode = '23514';
  end if;

  insert into public.observations (
    project_id,
    site_id,
    source_id,
    observation_type,
    indicator_key,
    value,
    unit,
    confidence,
    observed_at,
    metadata
  )
  select
    p_project_id,
    input_row.site_id,
    input_row.source_id,
    coalesce(input_row.observation_type, 'ingest'),
    input_row.indicator_key,
    input_row.value,
    input_row.unit,
    input_row.confidence,
    coalesce(input_row.observed_at, pg_catalog.statement_timestamp()),
    coalesce(input_row.metadata, '{}'::jsonb)
  from pg_catalog.jsonb_to_recordset(p_observations) as input_row(
    indicator_key text,
    value double precision,
    unit text,
    observed_at timestamp with time zone,
    observation_type text,
    site_id uuid,
    source_id uuid,
    confidence double precision,
    metadata jsonb
  );

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> v_requested_count then
    raise exception 'Observation batch insert count mismatch'
      using errcode = '55000';
  end if;

  return v_inserted_count;
end
$$;

-- Functions are executable by PUBLIC by default. Make the exposed RPC
-- server-only; the route's dedicated credential remains the outer boundary.
revoke all on function public.ingest_observations_atomic(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_observations_atomic(uuid, jsonb)
  to service_role;
