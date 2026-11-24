-- Synthetic fixtures only. The guarded CI runner starts from the preceding migration.
begin;
do $fixture_guard$
begin
  if current_setting('gofreyra.disposable_postgis_probe',true) is distinct from 'ci-only'
    or current_database()<>'postgres'
    or (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace
        where e.extname='postgis') is distinct from 'public'
  then raise exception 'Use the guarded disposable legacy PostGIS probe'; end if;
end $fixture_guard$;
create schema postgis_upgrade_acceptance;
revoke all on schema postgis_upgrade_acceptance from public,anon,authenticated,service_role;
create table postgis_upgrade_acceptance.proof(kind text primary key,payload jsonb not null);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',
 ('fc550000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'postgis-probe-'||n||'@example.test','',now(),'{"provider":"email"}','{"full_name":"Synthetic PostGIS probe"}',now(),now()
from generate_series(1,2) n;
insert into public.organizations(id,name,type,country) values
 ('fc550000-0000-4000-8000-000000000011','Synthetic coordinate org A','test','Denmark'),
 ('fc550000-0000-4000-8000-000000000012','Synthetic coordinate org B','test','Denmark');
insert into public.organization_memberships(organization_id,user_id,role) values
 ('fc550000-0000-4000-8000-000000000011','fc550000-0000-4000-8000-000000000001','viewer'),
 ('fc550000-0000-4000-8000-000000000012','fc550000-0000-4000-8000-000000000002','viewer');
insert into public.projects(id,organization_id,name) values
 ('fc550000-0000-4000-8000-000000000021','fc550000-0000-4000-8000-000000000011','Synthetic coordinate project A'),
 ('fc550000-0000-4000-8000-000000000022','fc550000-0000-4000-8000-000000000012','Synthetic coordinate project B');
insert into public.project_members(project_id,user_id,role) values
 ('fc550000-0000-4000-8000-000000000021','fc550000-0000-4000-8000-000000000001','project_manager'),
 ('fc550000-0000-4000-8000-000000000022','fc550000-0000-4000-8000-000000000002','project_manager');
insert into public.geo_features(id,name,properties,geom,geojson) values
 ('fc550000-0000-4000-8000-000000000031','Synthetic typed line','{"count":0,"checked":false}',
 public.st_geomfromtext('LINESTRING(0 0,1 1)',4326),null),
 ('fc550000-0000-4000-8000-000000000032','Synthetic fallback line','{"unknown":null}',
 null,'{"type":"LineString","coordinates":[[9,55],[9.1,55.1]]}');
insert into public.geo_observations(id,project_id,observation_type,value,unit,properties,observed_at,geom,geojson) values
 ('fc550000-0000-4000-8000-000000000041','fc550000-0000-4000-8000-000000000021','Synthetic typed point',0,'stk.','{"checked":false}','2026-11-24T00:00:00Z',
 public.st_geomfromtext('POINT(0 0)',4326),null),
 ('fc550000-0000-4000-8000-000000000042','fc550000-0000-4000-8000-000000000021','Synthetic fallback point',null,null,'{}','2026-11-24T00:00:00Z',
 null,'{"type":"Point","coordinates":[9,55]}'),
 ('fc550000-0000-4000-8000-000000000043','fc550000-0000-4000-8000-000000000021','Synthetic missing location',null,null,'{}','2026-11-24T00:00:00Z',null,null),
 ('fc550000-0000-4000-8000-000000000044','fc550000-0000-4000-8000-000000000022','Synthetic foreign point',2,'stk.','{}','2026-11-24T00:00:00Z',
 public.st_geomfromtext('POINT(10 56)',4326),null);
insert into public.project_areas(id,project_id,name,geom,geojson,area_ha) values
 ('fc550000-0000-4000-8000-000000000051','fc550000-0000-4000-8000-000000000021','Synthetic typed polygon',
 public.st_geomfromtext('POLYGON((0 0,1 0,1 1,0 1,0 0))',4326),null,0),
 ('fc550000-0000-4000-8000-000000000052','fc550000-0000-4000-8000-000000000021','Synthetic fallback polygon',
 null,'{"type":"Polygon","coordinates":[[[9,55],[9.1,55],[9.1,55.1],[9,55]]]}',null),
 ('fc550000-0000-4000-8000-000000000053','fc550000-0000-4000-8000-000000000022','Synthetic foreign polygon',
 public.st_geomfromtext('POLYGON((10 56,10.1 56,10.1 56.1,10 56))',4326),null,1);
comment on column public.geo_observations.geom is 'Synthetic migration preservation check';
grant select(geom) on public.geo_observations to authenticated;
insert into public.spatial_ref_sys(srid,auth_name,auth_srid,srtext,proj4text)
 select 998998,'SYNTHETIC',998998,srtext,proj4text from public.spatial_ref_sys where srid=4326;

-- Independent row snapshots complement pg_dump's schema/COPY comparison.
create function postgis_upgrade_acceptance.capture(source_schema text) returns jsonb
language plpgsql security invoker set search_path='' as $capture$
declare rows_snapshot jsonb; binary_snapshot jsonb; references_snapshot jsonb; rpc_security jsonb;
begin
 if source_schema not in ('public','extensions') then raise exception 'Unsupported probe schema'; end if;
 select jsonb_build_object(
   'features',(select jsonb_agg(to_jsonb(r) order by r.id) from public.geo_features r),
   'observations',(select jsonb_agg(to_jsonb(r) order by r.id) from public.geo_observations r),
   'areas',(select jsonb_agg(to_jsonb(r) order by r.id) from public.project_areas r)
 ) into rows_snapshot;
 execute format('select jsonb_build_object(
   ''features'',(select jsonb_agg(jsonb_build_array(id,encode(%1$I.st_asewkb(geom),''hex'')) order by id) from public.geo_features),
   ''observations'',(select jsonb_agg(jsonb_build_array(id,encode(%1$I.st_asewkb(geom),''hex'')) order by id) from public.geo_observations),
   ''areas'',(select jsonb_agg(jsonb_build_array(id,encode(%1$I.st_asewkb(geom),''hex'')) order by id) from public.project_areas)
 )',source_schema) into binary_snapshot;
 execute format('select jsonb_build_object(''count'',count(*),''sha256'',
   encode(sha256(convert_to(string_agg(to_jsonb(r)::text,E''\n'' order by srid),''UTF8'')),''hex''))
   from %I.spatial_ref_sys r',source_schema) into references_snapshot;
 select jsonb_build_object('owner',p.proowner,'definer',p.prosecdef,'settings',p.proconfig,'acl',p.proacl::text)
 into rpc_security from pg_proc p where p.oid='public.get_project_geojson(uuid)'::regprocedure;
 return jsonb_build_object('rows',rows_snapshot,'ewkb',binary_snapshot,'references',references_snapshot,'rpc',rpc_security);
end $capture$;
revoke all on function postgis_upgrade_acceptance.capture(text) from public,anon,authenticated,service_role;
insert into postgis_upgrade_acceptance.proof values('state',postgis_upgrade_acceptance.capture('public'));
create function postgis_upgrade_acceptance.assert_legacy() returns void
language plpgsql security invoker set search_path='' as $legacy$
begin
 if (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis') is distinct from 'public'
   or postgis_upgrade_acceptance.capture('public') is distinct from
      (select payload from postgis_upgrade_acceptance.proof where kind='state')
   or (select encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')
       from pg_proc p where p.oid='public.get_project_geojson(uuid)'::regprocedure)<>
      'a5fac0ad88fec6b8e4a68919318f7c9de2d3e166c586e4e1c90e3e4dff92b648'
 then raise exception 'A refused or rolled-back move changed the original state'; end if;
end $legacy$;
revoke all on function postgis_upgrade_acceptance.assert_legacy() from public,anon,authenticated,service_role;
create temp table postgis_probe_rpc(content jsonb) on commit drop;
grant insert on postgis_probe_rpc to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','fc550000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"fc550000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into postgis_probe_rpc select public.get_project_geojson('fc550000-0000-4000-8000-000000000021')-'generated_at';
reset role;
insert into postgis_upgrade_acceptance.proof select 'rpc',content from postgis_probe_rpc;
commit;
