-- Run only against a disposable local Supabase database:
--   supabase db reset
--   supabase test db supabase/tests/database/4dm_tenant_isolation.test.sql
--
-- The test is transactional and rolls all fixtures back. It must never be run
-- with --linked or against a production/staging database.

begin;

create extension if not exists pgtap with schema extensions;
select plan(83);

-- Stable, synthetic identities. Inserting auth users also exercises the real
-- signup trigger, but none of its personal organizations are used below.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '4dm-a-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"4DM A Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', '4dm-a-viewer@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"4DM A Viewer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', '4dm-a-org-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"4DM A Org Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', '4dm-a-field@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"4DM A Field"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', '4dm-a-external@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"4DM A External"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '4dm-b-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"4DM B Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', '4dm-outsider@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"4DM Outsider"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'jesper_riel@hotmail.com', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Founder Address Regression"}', now(), now());

select is(
  (
    select count(*)
    from public.organization_memberships membership
    where membership.user_id = 'f1000000-0000-4000-8000-000000000001'
      and membership.organization_id = '00000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'matching a legacy founder email does not grant shared demo ownership'
);

select is(
  (
    select count(*)
    from public.organization_memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    where membership.user_id = 'f1000000-0000-4000-8000-000000000001'
      and membership.role = 'owner'
      and organization.type = 'personal'
  ),
  1::bigint,
  'signup still bootstraps one isolated personal organization'
);

insert into public.organizations (id, name, type, country)
values
  ('a0000000-0000-4000-8000-000000000001', '4DM tenant A', 'test', 'Denmark'),
  ('b0000000-0000-4000-8000-000000000001', '4DM tenant B', 'test', 'Denmark');

insert into public.organization_memberships (user_id, organization_id, role)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'viewer'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'admin'),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'viewer'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'owner');

insert into public.projects (id, organization_id, name, slug, status)
values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '4DM project A', '4dm-tenant-test-a', 'active'),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '4DM project B', '4dm-tenant-test-b', 'active');

insert into public.monitoring_zones (id, project_id, name, zone_type)
values (
  'a6100000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'A watercourse reach',
  'watercourse'
);

insert into public.project_members (project_id, user_id, role)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'admin'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'viewer'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'field'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'external'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'admin');

insert into public.sites (id, project_id, name)
values ('b6000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'B private site');

insert into public.actions (id, project_id, title)
values
  ('a7000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'A action one'),
  ('a7000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'A action two');

insert into public.action_evidence (id, action_id, evidence_type)
values ('a8000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'field_photo');

insert into public.project_areas (id, project_id, name, area_type, geojson, area_ha)
values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'A boundary', 'pilot_area', '{"type":"Polygon","coordinates":[[[9.0,55.0],[9.1,55.0],[9.1,55.1],[9.0,55.1],[9.0,55.0]]]}', 77),
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'B boundary', 'pilot_area', '{"type":"Polygon","coordinates":[[[10.0,56.0],[10.1,56.0],[10.1,56.1],[10.0,56.1],[10.0,56.0]]]}', 77);

insert into public.project_media (
  id,
  project_id,
  title,
  category,
  source,
  file_path,
  url
)
values
  (
    'a4000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'A private drone image',
    'drone_image',
    'drone',
    'organizations/a0000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-private.tif',
    'private://a-private.tif'
  ),
  (
    'b4000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'B private drone image',
    'drone_image',
    'drone',
    'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/drone/b-private.tif',
    'private://b-private.tif'
  );

-- Upload rows begin without a project while metadata is extracted. The A admin
-- must be able to queue that upload and later attach it to project A.
insert into public.uploads (
  id,
  uploaded_by,
  file_name,
  original_file_name,
  mime_type,
  file_size,
  storage_path
)
values
  (
    'a5000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a-unscoped.tif',
    'a-unscoped.tif',
    'image/tiff',
    1024,
    'a1000000-0000-4000-8000-000000000001/staging/a-unscoped.tif'
  ),
  (
    'a5000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'a-project.tif',
    'a-project.tif',
    'image/tiff',
    1024,
    'a1000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-project.tif'
  );

-- The bucket fixtures are inserted by postgres before the API role is assumed.
-- This uses the standard local Supabase storage.objects shape: id and timestamps
-- have defaults; bucket_id and name are the required object identity fields.
insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', false)
on conflict (id) do update set public = false;

select is(
  (select file_size_limit from storage.buckets where id = 'monitoring-uploads'),
  209715200::bigint,
  'monitoring uploads enforce the documented 200 MiB bucket limit'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'monitoring-uploads'),
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
  ]::text[],
  'monitoring uploads enforce the documented MIME allowlist'
);

select is(
  (select file_size_limit from storage.buckets where id = 'project-media'),
  52428800::bigint,
  'project media enforce the documented 50 MiB bucket limit'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'project-media'),
  array['image/*', 'application/pdf']::text[],
  'project media enforce the documented MIME allowlist'
);

insert into storage.objects (bucket_id, name, owner)
values
  (
    'project-media',
    'organizations/a0000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-private.tif',
    'a1000000-0000-4000-8000-000000000001'
  ),
  (
    'project-media',
    'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/drone/b-private.tif',
    'b1000000-0000-4000-8000-000000000001'
  );

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'monitoring-uploads',
  'a1000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-project.tif',
  'a1000000-0000-4000-8000-000000000001',
  '{"size":1024,"mimetype":"image/tiff"}'::jsonb
);
update public.uploads
set received_at = created_at
where id = 'a5000000-0000-4000-8000-000000000002';

-- A administrator.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.projects where id = 'a2000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A admin can read project A'
);

select is(
  (select count(*) from public.projects where id = 'b2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'A admin cannot read project B by UUID'
);

select throws_ok(
  $$
    insert into public.project_members (project_id, user_id, role)
    values ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'admin')
  $$,
  '42501',
  null,
  'A admin cannot self-enrol as project B admin'
);

reset role;

-- Even a legitimate editor in both tenants must not be able to transfer bytes
-- by renaming an existing private Storage object across project paths.
insert into public.organization_memberships (organization_id, user_id, role)
values (
  'b0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'editor'
);
insert into public.project_members (project_id, user_id, role)
values (
  'b2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'editor'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is_empty(
  $$
    update storage.objects
    set name = 'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/drone/moved-from-a.tif'
    where bucket_id = 'project-media'
      and name = 'organizations/a0000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-private.tif'
    returning id
  $$,
  'dual-tenant editor cannot rename a private A object into tenant B'
);

reset role;
delete from public.project_members
where project_id = 'b2000000-0000-4000-8000-000000000001'
  and user_id = 'a1000000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'b0000000-0000-4000-8000-000000000001'
  and user_id = 'a1000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.project_members where project_id = 'b2000000-0000-4000-8000-000000000001' and user_id = 'a1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'rejected self-enrolment writes no membership row'
);

-- An organisation admin may manage members, but may not manufacture owners or
-- rewrite an existing membership identity to acquire an owner row.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$
    insert into public.organization_memberships (user_id, organization_id, role)
    values ('c1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner')
  $$,
  '42501',
  null,
  'organization admin cannot create an owner membership'
);

select throws_ok(
  $$
    update public.organization_memberships
    set role = 'owner'
    where user_id = 'a1000000-0000-4000-8000-000000000002'
      and organization_id = 'a0000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'organization admin cannot promote a member to owner'
);

select throws_ok(
  $$
    update public.organization_memberships
    set user_id = 'a1000000-0000-4000-8000-000000000003'
    where user_id = 'a1000000-0000-4000-8000-000000000002'
      and organization_id = 'a0000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'organization admin cannot rewrite another membership identity'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$
    update public.projects
    set geometry_polygon = '{"type":"Polygon","coordinates":[[[9.0,55.0],[9.1,55.0],[9.1,55.1],[9.0,55.1],[9.0,55.0]]]}',
        geometry_source = 'manual'
    where id = 'a2000000-0000-4000-8000-000000000001'
  $$,
  'A admin can update project A boundary'
);

select lives_ok(
  $$
    insert into public.project_areas (id, project_id, name, area_type, geojson, area_ha)
    values ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'A second area', 'reference', '{"type":"Polygon","coordinates":[[[9.2,55.0],[9.3,55.0],[9.3,55.1],[9.2,55.1],[9.2,55.0]]]}', 77)
  $$,
  'A admin can create a project A area'
);

select throws_ok(
  $$
    insert into public.project_areas (id, project_id, name, area_type, geojson, area_ha)
    values ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'poison B', 'reference', '{"type":"Polygon","coordinates":[[[10.2,56.0],[10.3,56.0],[10.3,56.1],[10.2,56.1],[10.2,56.0]]]}', 77)
  $$,
  '42501',
  null,
  'A admin cannot create a project B area'
);

select throws_ok(
  $$
    insert into public.documents (project_id, site_id, title, document_type)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'b6000000-0000-4000-8000-000000000001',
      'Cross-project document poison',
      'test'
    )
  $$,
  '23514',
  null,
  'A admin cannot link a project A document to a project B site'
);

select throws_ok(
  $$
    update public.action_evidence
    set action_id = 'a7000000-0000-4000-8000-000000000002'
    where id = 'a8000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'A admin cannot re-parent indirect evidence even inside the same project'
);

select throws_ok(
  $$
    update public.projects
    set organization_id = 'b0000000-0000-4000-8000-000000000001'
    where id = 'a2000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'A admin cannot move project A to tenant B'
);

select throws_ok(
  $$
    update public.project_areas
    set project_id = 'b2000000-0000-4000-8000-000000000001'
    where id = 'a3000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'A admin cannot move an existing area to project B'
);

select lives_ok(
  $$
    insert into public.upload_import_jobs (upload_id, job_type)
    values ('a5000000-0000-4000-8000-000000000001', 'exif_extract')
  $$,
  'A admin can queue an unscoped upload import job'
);

select lives_ok(
  $$
    update public.uploads
    set project_id = 'a2000000-0000-4000-8000-000000000001'
    where id = 'a5000000-0000-4000-8000-000000000001'
  $$,
  'A admin can attach an unscoped upload to project A'
);

select throws_ok(
  $$
    update public.uploads
    set status = 'imported',
        detected_metadata = '{"gps":"forged"}'::jsonb,
        validation_result = '{"valid":true}'::jsonb
    where id = 'a5000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'client uploader cannot forge derived metadata or import status'
);

select throws_ok(
  $$
    insert into public.uploads (
      id,
      project_id,
      uploaded_by,
      file_name,
      original_file_name,
      mime_type,
      file_size,
      storage_path,
      upload_type,
      status,
      detected_metadata
    ) values (
      'a5000000-0000-4000-8000-000000000004',
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'forged-derived.tif',
      'forged-derived.tif',
      'image/tiff',
      1024,
      'a1000000-0000-4000-8000-000000000001/staging/forged-derived.tif',
      'orthophoto',
      'imported',
      '{"gps":"forged"}'::jsonb
    )
  $$,
  '42501',
  null,
  'client uploader cannot forge derived metadata during insert'
);

select lives_ok(
  $$
    insert into public.upload_import_jobs (upload_id, job_type)
    values ('a5000000-0000-4000-8000-000000000001', 'orthomosaic_prepare')
  $$,
  'A admin can queue a project-scoped upload import job'
);

select throws_ok(
  $$
    insert into public.evidence_files (project_id, title, file_url, evidence_type)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'Cross-tenant poisoned evidence',
      'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/evidence/b-private.pdf',
      'field_report'
    )
  $$,
  '23514',
  null,
  'A evidence metadata cannot point at a tenant B Storage path'
);

select throws_ok(
  $$
    update public.project_media
    set file_path = 'organizations/a0000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/swapped-a-object.tif'
    where id = 'a4000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'project media cannot swap an established Storage reference'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'project-media'
      and name = 'organizations/a0000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-private.tif'
  ),
  1::bigint,
  'A admin can read project A storage object'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'project-media'
      and name = 'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/drone/b-private.tif'
  ),
  0::bigint,
  'A admin cannot read project B storage object'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner)
    values (
      'project-media',
      'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/drone/a-forged-write.tif',
      'a1000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'A admin cannot create a project B storage object'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner)
    values (
      'project-media',
      'organizations/b0000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-forged-organization.tif',
      'a1000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  null,
  'A admin cannot forge organization B in a project A canonical storage path'
);

select is_empty(
  $$
    update storage.objects
    set name = name
    where bucket_id = 'project-media'
      and name = 'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/drone/b-private.tif'
    returning id
  $$,
  'A admin cannot update a project B storage object'
);

select is_empty(
  $$
    delete from storage.objects
    where bucket_id = 'project-media'
      and name = 'organizations/b0000000-0000-4000-8000-000000000001/projects/b2000000-0000-4000-8000-000000000001/drone/b-private.tif'
    returning id
  $$,
  'A admin cannot delete a project B storage object'
);

reset role;
select is(
  (select organization_id from public.projects where id = 'a2000000-0000-4000-8000-000000000001'),
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'rejected tenant move leaves project A ownership unchanged'
);

select is(
  (select project_id from public.project_areas where id = 'a3000000-0000-4000-8000-000000000001'),
  'a2000000-0000-4000-8000-000000000001'::uuid,
  'rejected project move leaves area A ownership unchanged'
);

-- A viewer can read but cannot mutate project geometry.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is_empty(
  $$
    update public.projects
    set geometry_source = 'manual'
    where id = 'a2000000-0000-4000-8000-000000000001'
    returning id
  $$,
  'A viewer cannot update project A geometry'
);

select is(
  (
    select count(*)
    from storage.objects object
    where object.bucket_id = 'monitoring-uploads'
      and object.name like '%/a-project.tif'
  ),
  1::bigint,
  'project reader retains access to a pre-intent legacy object that actually exists'
);

-- A field worker can capture observations/evidence, but cannot edit reports or
-- project configuration.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$
    insert into public.field_observations (id, project_id, observation_type)
    values (
      'a6000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000001',
      'vegetation_cut_follow_up'
    )
  $$,
  'A field worker can record project A field observations'
);

select throws_ok(
  $$
    insert into public.reports (project_id, title, report_type)
    values ('a2000000-0000-4000-8000-000000000001', 'Unauthorized report', 'field')
  $$,
  '42501',
  null,
  'A field worker cannot create reports'
);

select is_empty(
  $$
    update public.projects
    set geometry_source = 'field-forged'
    where id = 'a2000000-0000-4000-8000-000000000001'
    returning id
  $$,
  'A field worker cannot update project configuration'
);

select lives_ok(
  $$
    select * from public.create_upload_intent(
      p_project_id => 'a2000000-0000-4000-8000-000000000001',
      p_original_file_name => 'field-audit.tif',
      p_mime_type => 'image/tiff',
      p_file_size => 1024,
      p_client_request_id => 'a9000000-0000-4000-8000-000000000001',
      p_upload_type => 'orthophoto'
    )
  $$,
  'A field worker can request a server-issued project A upload intent'
);

select is(
  (
    select count(*)
    from public.audit_events event
    join public.uploads upload on upload.id = event.entity_id
    where event.entity_type = 'upload'
      and upload.original_file_name = 'field-audit.tif'
      and event.event_type = 'upload_intent_created'
      and event.actor = 'a1000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'field upload intent creation is audited without claiming bytes were received'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'project-media',
      'a2000000-0000-4000-8000-000000000001/field-cleanup-orphan.tif',
      'a1000000-0000-4000-8000-000000000004'
    )
  $$,
  'A field worker can upload a project A object'
);

select lives_ok(
  $$
    delete from storage.objects
    where bucket_id = 'project-media'
      and name = 'a2000000-0000-4000-8000-000000000001/field-cleanup-orphan.tif'
  $$,
  'A field worker can clean up their own recent metadata-less object'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'project-media'
      and name = 'a2000000-0000-4000-8000-000000000001/field-cleanup-orphan.tif'
  ),
  0::bigint,
  'field cleanup removes the orphan object'
);

-- `external` is declared as shared-document-only. No authoritative share table
-- exists yet, so the database must fail closed instead of granting project-wide
-- read access from a bare project_members row.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select is(
  (select count(*) from public.projects where id = 'a2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'external member cannot read the whole project without a document-share relation'
);

select is(
  (select count(*) from public.project_areas where project_id = 'a2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'external member cannot read project data without a document-share relation'
);

-- The second tenant has the symmetric positive path, while an authenticated
-- outsider cannot discover either tenant by guessed UUID.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.projects where id = 'b2000000-0000-4000-8000-000000000001'),
  1::bigint,
  'B admin can read project B'
);

select lives_ok(
  $$
    update public.projects
    set geometry_source = 'manual'
    where id = 'b2000000-0000-4000-8000-000000000001'
  $$,
  'B admin can update project B boundary metadata'
);

select throws_ok(
  $$
    insert into public.uploads (
      id,
      uploaded_by,
      file_name,
      original_file_name,
      mime_type,
      file_size,
      storage_path
    ) values (
      'b5000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'forged-a-alias.tif',
      'forged-a-alias.tif',
      'image/tiff',
      1024,
      'a1000000-0000-4000-8000-000000000001/staging/a-unscoped.tif'
    )
  $$,
  '42501',
  null,
  'B admin cannot bypass upload intents to alias an A-owned monitoring object'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.projects where id = 'a2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'authenticated outsider cannot read project A'
);

select is(
  (select count(*) from public.projects where id = 'b2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'authenticated outsider cannot read project B'
);

-- Back to A admin for child, RPC and relationship tests.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.project_media where id = 'b4000000-0000-4000-8000-000000000001'),
  0::bigint,
  'A admin cannot read project B media by UUID'
);

select lives_ok(
  $$ select public.get_project_geojson('a2000000-0000-4000-8000-000000000001') $$,
  'A admin can call the project A GeoJSON RPC'
);

select throws_ok(
  $$ select public.get_project_geojson('b2000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'A admin cannot call the project B GeoJSON RPC'
);

select lives_ok(
  $$ select public.get_project_metrics('a2000000-0000-4000-8000-000000000001') $$,
  'A admin can call the project A metrics RPC'
);

select throws_ok(
  $$ select public.get_project_metrics('b2000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'A admin cannot call the project B metrics RPC'
);

select throws_ok(
  $$
    insert into public.calculated_metrics (
      project_id,
      project_area_id,
      metric_key,
      metric_label,
      value,
      unit,
      method
    ) values (
      'a2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'cross_project_poison',
      'Cross-project poison',
      1,
      'test',
      'pgtap'
    )
  $$,
  '23503',
  null,
  'A admin cannot reference a project B area from project A metrics'
);

-- A project contributor can only upload to a short-lived path issued by the
-- database. Prefix-only objects and cross-project intents remain denied.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select throws_ok(
  $$
    insert into public.uploads (
      project_id, uploaded_by, file_name, original_file_name,
      mime_type, file_size, storage_path, upload_type
    ) values (
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000004',
      'direct.jpg', 'direct.jpg', 'image/jpeg', 1024,
      'a1000000-0000-4000-8000-000000000004/intents/direct/direct.jpg',
      'drone_photo'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot mint upload intents with direct table inserts'
);

select lives_ok(
  $$
    select * from public.create_upload_intent(
      p_project_id => 'a2000000-0000-4000-8000-000000000001',
      p_original_file_name => 'field-before-001.jpg',
      p_mime_type => 'image/jpeg',
      p_file_size => 1024,
      p_client_request_id => 'a9000000-0000-4000-8000-000000000002',
      p_zone_id => 'a6100000-0000-4000-8000-000000000001',
      p_upload_type => 'drone_photo',
      p_user_metadata => '{"intake":{"phase":"BEFORE"}}'::jsonb
    )
  $$,
  'A field contributor can request a project A upload intent'
);

select is(
  (
    select count(*)
    from public.uploads upload
    where upload.original_file_name = 'field-before-001.jpg'
      and upload.project_id = 'a2000000-0000-4000-8000-000000000001'
      and upload.uploaded_by = 'a1000000-0000-4000-8000-000000000004'
      and upload.status = 'draft'
      and upload.intent_expires_at > now()
      and upload.storage_path like 'a1000000-0000-4000-8000-000000000004/intents/%/field-before-001.jpg'
  ),
  1::bigint,
  'server-issued intent binds one expiring draft path to actor and project'
);

select lives_ok(
  $$
    select * from public.create_upload_intent(
      p_project_id => 'a2000000-0000-4000-8000-000000000001',
      p_original_file_name => 'field-before-001.jpg',
      p_mime_type => 'image/jpeg',
      p_file_size => 1024,
      p_client_request_id => 'a9000000-0000-4000-8000-000000000002',
      p_zone_id => 'a6100000-0000-4000-8000-000000000001',
      p_upload_type => 'drone_photo',
      p_user_metadata => '{"intake":{"phase":"BEFORE"}}'::jsonb
    )
  $$,
  'retrying a committed create request returns the existing intent'
);

select is(
  (
    select count(*)
    from public.uploads upload
    where upload.uploaded_by = 'a1000000-0000-4000-8000-000000000004'
      and upload.intent_request_id = 'a9000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'one idempotency key can create only one upload row'
);

select is(
  (
    select count(*)
    from public.audit_events event
    join public.uploads upload on upload.id = event.entity_id
    where upload.intent_request_id = 'a9000000-0000-4000-8000-000000000002'
      and event.event_type = 'upload_received'
  ),
  0::bigint,
  'an intent without completed bytes never emits an upload-received audit event'
);

select throws_ok(
  $$
    update public.uploads
    set zone_id = 'a6000000-0000-4000-8000-000000000099'
    where intent_request_id = 'a9000000-0000-4000-8000-000000000002'
  $$,
  '23514',
  null,
  'browser cannot reassign the project or zone scope of an issued intent'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'monitoring-uploads',
      'a1000000-0000-4000-8000-000000000004/arbitrary/no-intent.jpg',
      'a1000000-0000-4000-8000-000000000004',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb
    )
  $$,
  '42501',
  null,
  'same-user prefix without an exact upload intent is denied'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      'monitoring-uploads',
      upload.storage_path,
      'a1000000-0000-4000-8000-000000000004',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb
    from public.uploads upload
    where upload.original_file_name = 'field-before-001.jpg'
  $$,
  'exact non-expired intent authorizes one immutable monitoring object'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (
    select count(*)
    from storage.objects object
    where object.bucket_id = 'monitoring-uploads'
      and object.name like '%/field-before-001.jpg'
  ),
  0::bigint,
  'project readers cannot read draft upload bytes before trusted finalization'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

reset role;
alter table public.uploads disable trigger upload_intent_scope_immutable;
update public.uploads
set intent_expires_at = now() - interval '1 minute'
where intent_request_id = 'a9000000-0000-4000-8000-000000000002';
alter table public.uploads enable trigger upload_intent_scope_immutable;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(
  (
    select count(*)
    from storage.objects object
    where object.bucket_id = 'monitoring-uploads'
      and object.name like '%/field-before-001.jpg'
  ),
  0::bigint,
  'uploader cannot read draft bytes after the upload intent expires'
);

reset role;
alter table public.uploads disable trigger upload_intent_scope_immutable;
update public.uploads
set intent_expires_at = now() + interval '24 hours'
where intent_request_id = 'a9000000-0000-4000-8000-000000000002';
alter table public.uploads enable trigger upload_intent_scope_immutable;
delete from public.project_members
where project_id = 'a2000000-0000-4000-8000-000000000001'
  and user_id = 'a1000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(
  (
    select count(*)
    from storage.objects object
    where object.bucket_id = 'monitoring-uploads'
      and object.name like '%/field-before-001.jpg'
  ),
  0::bigint,
  'uploader cannot read draft bytes after project contribution access is revoked'
);

reset role;
insert into public.project_members (project_id, user_id, role)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000004',
  'field'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$
    select * from public.finalize_upload_intent(
      (select id from public.uploads where original_file_name = 'field-before-001.jpg')
    )
  $$,
  'owner can finalize only after matching Storage object exists'
);

select is(
  (
    select status
    from public.uploads
    where original_file_name = 'field-before-001.jpg'
  ),
  'awaiting_validation',
  'trusted finalizer queues the original for backend validation'
);

select lives_ok(
  $$
    select * from public.finalize_upload_intent(
      (select id from public.uploads where original_file_name = 'field-before-001.jpg')
    )
  $$,
  'finalize is idempotent after a committed response is lost'
);

reset role;
select throws_ok(
  $$
    delete from public.monitoring_zones
    where id = 'a6100000-0000-4000-8000-000000000001'
  $$,
  '23503',
  null,
  'a referenced evidence zone must be archived instead of silently detached'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select throws_ok(
  $$
    select * from public.create_upload_intent(
      p_project_id => 'b2000000-0000-4000-8000-000000000001',
      p_original_file_name => 'cross-tenant.jpg',
      p_mime_type => 'image/jpeg',
      p_file_size => 1024,
      p_client_request_id => 'a9000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501',
  null,
  'A field contributor cannot mint a tenant B upload intent'
);

select lives_ok(
  $$
    select * from public.create_upload_intent(
      p_project_id => 'a2000000-0000-4000-8000-000000000001',
      p_original_file_name => 'field-before-cancelled.jpg',
      p_mime_type => 'image/jpeg',
      p_file_size => 1024,
      p_client_request_id => 'a9000000-0000-4000-8000-000000000004'
    )
  $$,
  'A field contributor can request a second upload intent'
);

select lives_ok(
  $$
    select * from public.cancel_upload_intent(
      (select id from public.uploads where original_file_name = 'field-before-cancelled.jpg')
    )
  $$,
  'owner can cancel their own pending intent'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      'monitoring-uploads',
      upload.storage_path,
      'a1000000-0000-4000-8000-000000000004',
      '{"size":1024,"mimetype":"image/jpeg"}'::jsonb
    from public.uploads upload
    where upload.original_file_name = 'field-before-cancelled.jpg'
  $$,
  '42501',
  null,
  'cancelled intent cannot authorize a later Storage completion'
);

-- RPC execution is not available to anon, regardless of guessed UUID.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.get_project_geojson('a2000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'anon cannot execute the project GeoJSON RPC'
);

select throws_ok(
  $$ select id from public.projects limit 1 $$,
  '42501',
  null,
  'anon cannot query tenant projects'
);

-- Revoking both tenant and project membership invalidates access immediately,
-- even though the JWT subject remains unchanged.
reset role;
delete from public.project_members
where project_id = 'a2000000-0000-4000-8000-000000000001'
  and user_id = 'a1000000-0000-4000-8000-000000000001';
delete from public.organization_memberships
where organization_id = 'a0000000-0000-4000-8000-000000000001'
  and user_id = 'a1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.projects where id = 'a2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'removed A member cannot reuse the same JWT to read project A'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'project-media'
      and name = 'organizations/a0000000-0000-4000-8000-000000000001/projects/a2000000-0000-4000-8000-000000000001/drone/a-private.tif'
  ),
  0::bigint,
  'removed A member cannot reuse the same JWT to read their former project storage object'
);

select * from finish();
rollback;
