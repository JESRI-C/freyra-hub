-- Move PostGIS reference objects outside the Data API's exposed public schema.
-- Uses an EWKB bridge and RESTRICT: unexpected dependencies abort the transaction.
-- Requires a verified backup and a later reconnect of PostGIS-using API connections.
-- https://supabase.com/kb/troubleshooting/security-advisor-flags-spatial_ref_sys-and-other-postgis-objects-in-the-public-schema-f9d408
do $move_postgis$
declare
  extension_schema text;
  extension_version text;
  phase integer;
  source_schema text;
  relation record;
  relation_oid oid;
  actual_geometry_type text;
  non_geometry_columns text;
  row_expression text;
  data_fingerprint jsonb;
  table_contract jsonb;
  before_data jsonb := '{}'::jsonb;
  before_contract jsonb := '{}'::jsonb;
  before_reference_hash text;
  after_reference_hash text;
  before_rpc_contract jsonb;
  after_rpc_contract jsonb;
  rpc_body_hash text;
begin
  select n.nspname,e.extversion into extension_schema,extension_version
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  where e.extname='postgis';
  if extension_schema is null or extension_schema not in ('public','extensions')
    or extension_version<>'3.3.7' or to_regnamespace('extensions') is null
  then raise exception 'PostGIS layout or version requires review'; end if;

  -- Only the Data API schema list controls exposure; extra search_path is different.
  if exists (
      select 1 from regexp_split_to_table(
        coalesce(current_setting('pgrst.db_schemas',true),''),',') schema_name
      where btrim(schema_name,E' \t\n\r"')='extensions'
    ) or exists (
      select 1 from pg_db_role_setting settings,
        unnest(settings.setconfig) setting,
        regexp_split_to_table(substring(setting from length('pgrst.db_schemas=')+1),',') schema_name
      where setting like 'pgrst.db_schemas=%'
        and btrim(schema_name,E' \t\n\r"')='extensions'
    )
  then raise exception 'The extensions schema must not be exposed by the Data API'; end if;

  select encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex'),
    jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,
      'settings',p.proconfig,'acl',p.proacl::text)
    into rpc_body_hash,before_rpc_contract
  from pg_proc p where p.oid='public.get_project_geojson(uuid)'::regprocedure;

  if extension_schema='extensions' then
    if to_regclass('public.spatial_ref_sys') is not null
      or rpc_body_hash<>'d3eeff0c589300e62c1eb87488e5d9cb4fc31bb0dd985857676fd98154e76a31'
      or (before_rpc_contract->>'securityDefiner')::boolean
      or before_rpc_contract->'settings'<>to_jsonb(array['search_path=""']::text[])
      or (select count(*) from (values
        ('geo_features','geometry(Geometry,4326)','idx_geo_features_geom'),
        ('geo_observations','geometry(Point,4326)','idx_geo_obs_geom'),
        ('project_areas','geometry(Polygon,4326)','idx_project_areas_geom')
      ) expected(table_name,geometry_type,index_name)
      join pg_class c on c.oid=to_regclass(format('public.%I',expected.table_name))
      join pg_attribute a on a.attrelid=c.oid and a.attname='geom' and not a.attisdropped
      join pg_index i on i.indexrelid=to_regclass(format('public.%I',expected.index_name)) and i.indrelid=c.oid
      where a.atttypid='extensions.geometry'::regtype and not a.attnotnull and not a.atthasdef
        and replace(format_type(a.atttypid,a.atttypmod),'extensions.','')=expected.geometry_type
        and i.indisvalid and i.indisready
        and pg_get_indexdef(i.indexrelid)=format(
          'CREATE INDEX %I ON public.%I USING gist (geom) WHERE (geom IS NOT NULL)',expected.index_name,expected.table_name))<>3
    then raise exception 'Existing PostGIS isolation is incomplete'; end if;
    return;
  end if;
  if rpc_body_hash<>'a5fac0ad88fec6b8e4a68919318f7c9de2d3e166c586e4e1c90e3e4dff92b648'
    or (before_rpc_contract->>'securityDefiner')::boolean
    or before_rpc_contract->'settings'<>to_jsonb(array['search_path=""']::text[])
  then raise exception 'GeoJSON function changed; review before moving PostGIS'; end if;

  -- Lock before taking the original fingerprints; no source row can change mid-move.
  lock table public.geo_features,public.geo_observations,public.project_areas,
    public.spatial_ref_sys in access exclusive mode;
  create temp table postgis_reference_before on commit drop
    as table public.spatial_ref_sys;
  select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,E'\n'
    order by s.srid),''),'UTF8')),'hex') into before_reference_hash
  from pg_temp.postgis_reference_before s;

  for phase in 1..2 loop
    source_schema:=case when phase=1 then 'public' else 'extensions' end;
    for relation in select * from (values
      ('geo_features','geometry(Geometry,4326)','idx_geo_features_geom'),
      ('geo_observations','geometry(Point,4326)','idx_geo_obs_geom'),
      ('project_areas','geometry(Polygon,4326)','idx_project_areas_geom')
    ) expected(table_name,geometry_type,index_name)
    loop
      relation_oid:=to_regclass(format('public.%I',relation.table_name));
      select replace(replace(format_type(a.atttypid,a.atttypmod),'public.',''),'extensions.','')
        into actual_geometry_type
      from pg_attribute a
      where a.attrelid=relation_oid and a.attname='geom' and not a.attisdropped
        and a.atttypid=to_regtype(format('%I.geometry',source_schema))
        and not a.attnotnull and not a.atthasdef and a.attgenerated='' and a.attidentity='';
      if actual_geometry_type is distinct from relation.geometry_type
      then raise exception 'Unexpected geometry column in %',relation.table_name; end if;
      if (select count(*) from pg_index i join pg_attribute a
            on a.attrelid=i.indrelid and a.attname='geom' and a.attnum=any(i.indkey)
          where i.indrelid=relation_oid)<>1
        or pg_get_indexdef(to_regclass(format('public.%I',relation.index_name)))
          is distinct from format('CREATE INDEX %I ON public.%I USING gist (geom) WHERE (geom IS NOT NULL)',
            relation.index_name,relation.table_name)
      then raise exception 'Unexpected geometry index in %',relation.table_name; end if;

      -- Avoid geometry's JSON cast: compare non-spatial values plus exact EWKB.
      select string_agg(format('t.%I',a.attname),',' order by a.attnum)
        into non_geometry_columns
      from pg_attribute a where a.attrelid=relation_oid and a.attnum>0
        and not a.attisdropped and a.attname<>'geom';
      row_expression:=format(
        'jsonb_build_array(to_jsonb(row(%s)),encode(%I.st_asewkb(t.geom),''hex''))::text',
        non_geometry_columns,source_schema);
      execute format(
        'select jsonb_build_object(''rows'',count(*),''sha256'',
         encode(sha256(convert_to(coalesce(string_agg(%s,E''\n'' order by %s collate "C"),''''),''UTF8'')),''hex''))
         from public.%I t',row_expression,row_expression,relation.table_name)
        into data_fingerprint;

      select jsonb_build_object(
        'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
        'columns',(select jsonb_agg(jsonb_build_object(
          'name',a.attname,'number',a.attnum,'type',case when a.attname='geom' then 'geometry' else a.atttypid::regtype::text end,
          'typmod',a.atttypmod,'notNull',a.attnotnull,'dimensions',a.attndims,
          'storage',a.attstorage,'compression',a.attcompression,'collation',a.attcollation,
          'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text,
          'default',pg_get_expr(d.adbin,d.adrelid),'comment',col_description(a.attrelid,a.attnum)
        ) order by a.attnum) from pg_attribute a
          left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
          where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
        'policies',(select coalesce(jsonb_agg(jsonb_build_object(
          'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,
          'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)
        ) order by p.polname),'[]'::jsonb) from pg_policy p where p.polrelid=c.oid),
        'constraints',(select coalesce(jsonb_agg(jsonb_build_object(
          'name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated
        ) order by k.conname),'[]'::jsonb) from pg_constraint k where k.conrelid=c.oid),
        'indexes',(select coalesce(jsonb_agg(jsonb_build_object(
          'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready
        ) order by i.indexrelid::regclass::text),'[]'::jsonb)
          from pg_index i where i.indrelid=c.oid),
        'triggers',(select coalesce(jsonb_agg(jsonb_build_object(
          'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)
        ) order by t.tgname),'[]'::jsonb) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)
      ) into table_contract from pg_class c where c.oid=relation_oid;

      if phase=1 then
        before_data:=jsonb_set(before_data,array[relation.table_name],data_fingerprint);
        before_contract:=jsonb_set(before_contract,array[relation.table_name],table_contract);
      elsif data_fingerprint is distinct from before_data->relation.table_name
        or table_contract is distinct from before_contract->relation.table_name
      then raise exception 'PostGIS move changed original data or metadata in %',relation.table_name; end if;
    end loop;

    if phase=1 then
      drop index public.idx_geo_features_geom;
      drop index public.idx_geo_obs_geom;
      drop index public.idx_project_areas_geom;
      alter table public.geo_features alter column geom type bytea using public.st_asewkb(geom);
      alter table public.geo_observations alter column geom type bytea using public.st_asewkb(geom);
      alter table public.project_areas alter column geom type bytea using public.st_asewkb(geom);

      -- RESTRICT must reject every unhandled dependency. Never broaden this to CASCADE.
      drop extension postgis restrict;
      create extension postgis with schema extensions version '3.3.7';
      insert into extensions.spatial_ref_sys
        select * from pg_temp.postgis_reference_before on conflict (srid) do nothing;
      alter table public.geo_features alter column geom type extensions.geometry(Geometry,4326)
        using extensions.st_geomfromewkb(geom);
      alter table public.geo_observations alter column geom type extensions.geometry(Point,4326)
        using extensions.st_geomfromewkb(geom);
      alter table public.project_areas alter column geom type extensions.geometry(Polygon,4326)
        using extensions.st_geomfromewkb(geom);
      create index idx_geo_features_geom on public.geo_features using gist(geom) where geom is not null;
      create index idx_geo_obs_geom on public.geo_observations using gist(geom) where geom is not null;
      create index idx_project_areas_geom on public.project_areas using gist(geom) where geom is not null;

      execute $geojson_rpc$
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
      'geometry', coalesce(extensions.st_asgeojson(area.geom)::jsonb, area.geojson),
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
      'geometry', coalesce(extensions.st_asgeojson(observation.geom)::jsonb, observation.geojson),
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
$geojson_rpc$;
    end if;
  end loop;

  select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,E'\n'
    order by s.srid),''),'UTF8')),'hex') into after_reference_hash
  from extensions.spatial_ref_sys s;
  if after_reference_hash is distinct from before_reference_hash
    or to_regclass('public.spatial_ref_sys') is not null
  then raise exception 'Spatial reference content or API boundary changed unexpectedly'; end if;
  select jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,
    'settings',p.proconfig,'acl',p.proacl::text)
    into after_rpc_contract from pg_proc p
  where p.oid='public.get_project_geojson(uuid)'::regprocedure;
  if after_rpc_contract is distinct from before_rpc_contract
  then raise exception 'GeoJSON function security changed'; end if;
  perform pg_notify('pgrst','reload schema');
end
$move_postgis$;
