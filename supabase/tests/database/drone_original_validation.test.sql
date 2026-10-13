-- Disposable local database only. Transactional synthetic metadata fixtures;
-- no Storage bytes are uploaded. Never run --linked or against customer data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000000', 'da100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'original-field@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
 ('00000000-0000-0000-0000-000000000000', 'db100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'original-foreign@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.organizations (id, name, type, country) values
 ('da000000-0000-4000-8000-000000000001', 'Original validation A', 'test', 'Denmark'),
 ('db000000-0000-4000-8000-000000000001', 'Original validation B', 'test', 'Denmark');
insert into public.organization_memberships (user_id, organization_id, role) values
 ('da100000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'viewer'),
 ('db100000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'owner');
insert into public.projects (id, organization_id, name, slug, status) values
 ('da200000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'Original test A', 'original-validation-a', 'active'),
 ('db200000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'Original test B', 'original-validation-b', 'active');
insert into public.project_members (project_id, user_id, role) values
 ('da200000-0000-4000-8000-000000000001', 'da100000-0000-4000-8000-000000000001', 'field'),
 ('db200000-0000-4000-8000-000000000001', 'db100000-0000-4000-8000-000000000001', 'admin');
insert into public.uploads (id, project_id, organization_id, uploaded_by, file_name, original_file_name, file_size, mime_type, upload_type, storage_path, intent_request_id, intent_expires_at, received_at, status)
values ('da300000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001',
 'da100000-0000-4000-8000-000000000001', 'original.JPG', 'original.JPG', 10, 'image/jpeg', 'drone_photo',
 'da100000-0000-4000-8000-000000000001/intents/da300000-0000-4000-8000-000000000001/original.JPG',
 'da400000-0000-4000-8000-000000000001', now() + interval '24 hours', now(), 'awaiting_validation');
-- Put an archived version before the current object when the local Storage
-- schema supports history. This also prevents a non-STRICT first-row lookup
-- from accidentally passing the regression merely because current was inserted first.
do $history_setup$
begin
  if (select count(*) from pg_catalog.pg_attribute
      where attrelid = 'storage.objects'::regclass and not attisdropped
        and attname in ('archived_at', 'is_delete_marker', 'version')) = 3 then
    execute $sql$
      insert into storage.objects (id, bucket_id, name, owner_id, metadata, version, archived_at, is_delete_marker)
      values ('da500000-0000-4000-8000-000000000002', 'monitoring-uploads',
        'da100000-0000-4000-8000-000000000001/intents/da300000-0000-4000-8000-000000000001/original.JPG',
        'da100000-0000-4000-8000-000000000001', '{"size":10,"mimetype":"image/jpeg"}',
        'da600000-0000-4000-8000-000000000001', now() - interval '1 day', false)
    $sql$;
  end if;
end
$history_setup$;

insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values ('da500000-0000-4000-8000-000000000001', 'monitoring-uploads',
 'da100000-0000-4000-8000-000000000001/intents/da300000-0000-4000-8000-000000000001/original.JPG',
 'da100000-0000-4000-8000-000000000001', '{"size":10,"mimetype":"image/jpeg"}');

select ok(not has_function_privilege('authenticated', 'public.prepare_drone_original_validation(uuid,uuid,uuid)', 'EXECUTE'), 'browser cannot prepare a trusted original');
select ok(not has_function_privilege('anon', 'public.persist_drone_original_validation(uuid,uuid,uuid,uuid,text,timestamptz,jsonb,text)', 'EXECUTE'), 'anonymous caller cannot persist validation');
select ok(not has_function_privilege('authenticated', 'public.persist_drone_original_validation(uuid,uuid,uuid,uuid,text,timestamptz,jsonb,text)', 'EXECUTE'), 'browser cannot mint approval or server metadata');
select ok(not has_column_privilege('authenticated', 'public.uploads', 'original_validation', 'UPDATE'), 'original validation has no browser update grant');
select ok(has_table_privilege('service_role', 'storage.objects', 'SELECT')
  and has_table_privilege('service_role', 'storage.objects', 'UPDATE'),
  'service-role original lookup has SELECT and the UPDATE privilege required by FOR SHARE');

-- The guarded EXECUTEs are parsed only on a version-aware Storage schema.
-- Legacy local schemas produce exactly two TAP skips, without pretending that
-- historical-version/delete-marker behavior has been executed.
create function pg_temp.assert_original_storage_versions() returns setof text
language plpgsql as $version_tests$
begin
  if (select count(*) from pg_catalog.pg_attribute
      where attrelid = 'storage.objects'::regclass and not attisdropped
        and attname in ('archived_at', 'is_delete_marker', 'version')) <> 3 then
    return query select * from skip('Local Storage schema has no version-history columns', 2);
    return;
  end if;

  return next is(
    public.prepare_drone_original_validation(
      'da200000-0000-4000-8000-000000000001',
      'da300000-0000-4000-8000-000000000001',
      'da100000-0000-4000-8000-000000000001'
    ) #>> '{object,id}',
    'da500000-0000-4000-8000-000000000001',
    'archived historical version is ignored; only the current original is prepared'
  );

  execute $sql$ update storage.objects set is_delete_marker = true
    where id = 'da500000-0000-4000-8000-000000000001' $sql$;
  return next throws_ok(
    $q$ select public.prepare_drone_original_validation(
      'da200000-0000-4000-8000-000000000001',
      'da300000-0000-4000-8000-000000000001',
      'da100000-0000-4000-8000-000000000001'
    ) $q$,
    '23514', 'Original Storage object does not match finalized intent',
    'a current delete marker cannot be prepared as an original'
  );
  execute $sql$ update storage.objects set is_delete_marker = false
    where id = 'da500000-0000-4000-8000-000000000001' $sql$;
end
$version_tests$;

-- A server-computed checksum is represented by a fixed digest here; byte/hash
-- computation and metadata parsing are covered by the Node tests.
create temporary table original_case as
select object.id as object_id, to_jsonb(object) ->> 'version' as object_version, object.updated_at as object_updated_at,
 jsonb_build_object('schema', 'gofreyra.drone-original-validation/v1', 'validatorVersion', 'jpeg-structure-exifr/v1',
 'uploadId', upload.id, 'projectId', upload.project_id, 'validatedBy', upload.uploaded_by, 'validatedAt', now(),
 'original', jsonb_build_object('sha256', repeat('a',64), 'sizeBytes', 10, 'mimeType', 'image/jpeg', 'storagePath', upload.storage_path, 'receivedAt', upload.received_at,
   'object', jsonb_build_object('id', object.id, 'version', to_jsonb(object) ->> 'version', 'updated_at', object.updated_at, 'owner_id', object.owner_id, 'size', 10, 'mimetype', 'image/jpeg')),
 'status', 'rejected', 'jpegStructure', null, 'metadata', null, 'cameraPositionEligible', false, 'pixelDecoded', false, 'georeferenced', false, 'reportEligible', false,
 'errors', jsonb_build_array(jsonb_build_object('code', 'JPEG_STRUCTURE_INVALID', 'message', 'Synthetic rejected file')), 'warnings', '[]'::jsonb) as result
from public.uploads upload join storage.objects object on object.name = upload.storage_path where upload.id = 'da300000-0000-4000-8000-000000000001';
grant select on original_case to service_role;
set local role service_role;
select is(public.prepare_drone_original_validation('da200000-0000-4000-8000-000000000001', 'da300000-0000-4000-8000-000000000001', 'da100000-0000-4000-8000-000000000001') #>> '{object,id}',
 'da500000-0000-4000-8000-000000000001', 'field contribution can prepare its finalized canonical original');
select throws_ok($$select public.prepare_drone_original_validation('da200000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000001','db100000-0000-4000-8000-000000000001')$$,
 '42501', 'Project contribution denied', 'foreign tenant cannot use privileged prepare');
select throws_ok($$select public.persist_drone_original_validation('da200000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001',object_id,'replacement',object_updated_at,result,repeat('b',64)) from original_case$$,
 '23514', 'Original changed during validation', 'replacement Storage version is refused');
select throws_ok($$select public.persist_drone_original_validation('da200000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001',object_id,object_version,object_updated_at,jsonb_set(result,'{reportEligible}','true'::jsonb),repeat('b',64)) from original_case$$,
 '23514', 'Invalid server original validation', 'raw bytes cannot be promoted to report-ready by this RPC');
select lives_ok($$select public.persist_drone_original_validation('da200000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001',object_id,object_version,object_updated_at,result,repeat('b',64)) from original_case$$,
 'valid server rejection is atomically stored');
select is((select status from public.uploads where id = 'da300000-0000-4000-8000-000000000001'), 'rejected', 'invalid JPEG remains rejected');
select is((select original_sha256 from public.uploads where id = 'da300000-0000-4000-8000-000000000001'), repeat('a',64), 'original checksum is bound to the canonical upload');
select is((select public.persist_drone_original_validation('da200000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001',object_id,object_version,object_updated_at,result,repeat('c',64)) ->> 'result_sha256' from original_case),
 repeat('b',64), 'same-original replay returns the first immutable result');
select throws_ok($$select public.persist_drone_original_validation('da200000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001',object_id,object_version,object_updated_at,jsonb_set(result,'{original,sha256}',to_jsonb(repeat('d',64))),repeat('c',64)) from original_case$$,
 '23514', 'Original SHA-256 differs from previously validated bytes', 'changed file hash cannot replay as the same original');
select throws_ok($$update public.uploads set original_sha256 = repeat('c',64) where id = 'da300000-0000-4000-8000-000000000001'$$,
 '23514', 'Server original validation is immutable', 'even a privileged direct update cannot rewrite accepted original provenance');
select * from pg_temp.assert_original_storage_versions();

reset role;
select set_config('request.jwt.claims', '{"sub":"db100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.uploads where id = 'da300000-0000-4000-8000-000000000001'), 0::bigint, 'foreign tenant cannot read original metadata');
reset role;
delete from public.project_members where project_id = 'da200000-0000-4000-8000-000000000001' and user_id = 'da100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select public.persist_drone_original_validation('da200000-0000-4000-8000-000000000001','da300000-0000-4000-8000-000000000001','da100000-0000-4000-8000-000000000001',object_id,object_version,object_updated_at,result,repeat('b',64)) from original_case$$,
 '42501', 'Project contribution denied', 'revocation before commit also refuses idempotent replay');
reset role;
select * from finish();
rollback;
