-- Run with the full local Supabase reset and pgTAP lane.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
set local timezone = 'UTC';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
 ('ea100000-0000-4000-8000-000000000001','authenticated','authenticated','registration-a@example.test','{}','{}'),
 ('ea100000-0000-4000-8000-000000000002','authenticated','authenticated','registration-b@example.test','{}','{}');
insert into public.organizations(id,name,type,country)
values
 ('ea200000-0000-4000-8000-000000000001','Registration fixture A','test','Denmark'),
 ('ea200000-0000-4000-8000-000000000002','Registration fixture B','test','Denmark');
insert into public.organization_memberships(organization_id,user_id,role)
values
 ('ea200000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','owner'),
 ('ea200000-0000-4000-8000-000000000002','ea100000-0000-4000-8000-000000000002','owner');
insert into public.projects(id,organization_id,name)
values
 ('ea300000-0000-4000-8000-000000000001','ea200000-0000-4000-8000-000000000001','Registration A'),
 ('ea300000-0000-4000-8000-000000000002','ea200000-0000-4000-8000-000000000002','Registration B');
insert into public.field_observations(id,project_id,observation_type,notes,metadata)
values
 ('ea400000-0000-4000-8000-000000000001','ea300000-0000-4000-8000-000000000001','bridge_visual','Visible fixture',
  '{"schema":"freyra.bridge-visual/v1","objectId":"BR-1"}'),
 ('ea400000-0000-4000-8000-000000000002','ea300000-0000-4000-8000-000000000002','bridge_visual','Foreign fixture',
  '{"schema":"freyra.bridge-visual/v1","objectId":"BR-2"}');

insert into public.monitoring_zones(id,project_id,zone_type,name,created_at)
values ('ea500000-0000-4000-8000-000000000001','ea300000-0000-4000-8000-000000000001',
        'nature_survey','Test area','2026-06-20 12:10:09+00');

set local role authenticated;
select set_config('request.jwt.claim.sub','ea100000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"ea100000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(
 (select count(*)::integer from public.report_registration_sources
  where id in ('field:ea400000-0000-4000-8000-000000000001','field:ea400000-0000-4000-8000-000000000002')),
 1, 'The invoker view exposes only the current organization registration');
select ok(
 (select source->>'checksum' ~ '^[a-f0-9]{64}$' from public.report_registration_sources
  where id='field:ea400000-0000-4000-8000-000000000001'),
 'The database supplies a SHA-256 for the stored registration');

create temporary table registered_report as
select public.save_report_revision(
 null,'ea200000-0000-4000-8000-000000000001','ea300000-0000-4000-8000-000000000001',
 0,'draft',jsonb_build_object(
  'title','Registration report','scope','Fixture','audience','Tests',
  'sources',jsonb_build_array(source),
  'sections',jsonb_build_array(jsonb_build_object(
   'id','section-4','title','Field observations','text','Visible fixture',
   'sourceIds',jsonb_build_array(source->>'id'),'basis','observed','reviewed',true))
 )) as revision
from public.report_registration_sources where id='field:ea400000-0000-4000-8000-000000000001';
select is((select count(*)::integer from registered_report),1,'The registration can be cited in a saved draft');

-- Compare against the original UTC serialization, then load the same field and area
-- from another zone. Compare the full source, including capturedAt and version.
create temporary table utc_area_citation as select source from public.report_registration_sources
where id='survey-area:ea500000-0000-4000-8000-000000000001';
select is((select revision #>> '{content,sources,0,checksum}' from registered_report),
  (select encode(sha256(convert_to(to_jsonb(o)::text, 'UTF8')), 'hex') from public.field_observations o
   where o.id='ea400000-0000-4000-8000-000000000001'), 'Previously saved UTC field hashes are preserved');
select ok((select source->>'checksum' from utc_area_citation) =
  (select encode(sha256(convert_to(to_jsonb(a)::text, 'UTF8')), 'hex') from public.monitoring_zones a
   where a.id='ea500000-0000-4000-8000-000000000001'), 'Previously saved UTC area hashes are preserved');
set local timezone = 'Europe/Copenhagen';
select is((select source from public.report_registration_sources where id='field:ea400000-0000-4000-8000-000000000001'),
  (select revision #> '{content,sources,0}' from registered_report), 'The field citation matches the UTC draft in a Danish session');
select is((select source from public.report_registration_sources where id='survey-area:ea500000-0000-4000-8000-000000000001'),
  (select source from utc_area_citation), 'The survey area citation remains identical across time zones');
select lives_ok($test$
 select public.save_report_revision(
  (revision->>'report_id')::uuid,'ea200000-0000-4000-8000-000000000001',
  'ea300000-0000-4000-8000-000000000001',1,'approved',revision->'content')
 from registered_report
$test$, 'A reviewed report can be approved using its registration source');

select throws_ok($test$
 select public.save_report_revision(
  (revision->>'report_id')::uuid,'ea200000-0000-4000-8000-000000000001',
  'ea300000-0000-4000-8000-000000000001',2,'draft',
  jsonb_set(revision->'content','{sources,0,checksum}',to_jsonb(repeat('0',64))))
 from registered_report
$test$, 'P0001','Registration source changed; reload before saving','A caller cannot substitute a checksum');

select throws_ok($test$
 select public.save_report_revision(
  (revision->>'report_id')::uuid,'ea200000-0000-4000-8000-000000000001',
  'ea300000-0000-4000-8000-000000000001',2,'draft',
  jsonb_set(revision->'content','{sources,0,id}','"field:ea400000-0000-4000-8000-000000000002"'))
 from registered_report
$test$, 'P0001','Registration source is not in selected project','Foreign registrations cannot be cited');

update public.field_observations set notes='Changed fixture'
where id='ea400000-0000-4000-8000-000000000001';
select throws_ok($test$
 select public.save_report_revision(
  (revision->>'report_id')::uuid,'ea200000-0000-4000-8000-000000000001',
  'ea300000-0000-4000-8000-000000000001',2,'draft',revision->'content')
 from registered_report
$test$, 'P0001','Registration source changed; reload before saving','A changed field source requires reloading');
select * from finish();
rollback;
