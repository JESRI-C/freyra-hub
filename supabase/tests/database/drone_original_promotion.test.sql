-- Disposable local database only. Transactional synthetic metadata fixtures;
-- no Storage bytes are uploaded. Never run --linked or against customer data.
-- This suite proves ordinary application-user protection, including organization
-- admins. Supabase service/admin maintenance bypasses RLS and is outside that
-- guarantee. Byte decoding and checksum computation are covered by Node tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);
set local storage.allow_delete_query = 'true';

create function pg_temp.promotion_history_fixture_supported() returns boolean
language sql stable as $history_support$
  select (select count(*) from pg_catalog.pg_attribute
      where attrelid = 'storage.objects'::regclass and not attisdropped
        and attname in ('archived_at', 'is_delete_marker', 'version')) = 3
    and not exists (
      select 1 from pg_catalog.pg_index object_index
      where object_index.indrelid = 'storage.objects'::regclass
        and object_index.indisunique and object_index.indpred is null
        and object_index.indnkeyatts = 2
        and (select array_agg(attribute.attname::text order by attribute.attname)
          from unnest(object_index.indkey) with ordinality as index_key(attnum, key_order)
          join pg_catalog.pg_attribute attribute
            on attribute.attrelid = object_index.indrelid and attribute.attnum = index_key.attnum
          where index_key.key_order <= object_index.indnkeyatts
        ) = array['bucket_id','name']::text[]
    )
$history_support$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000000', 'ea100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'promotion-field@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
 ('00000000-0000-0000-0000-000000000000', 'ea100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'promotion-viewer@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
 ('00000000-0000-0000-0000-000000000000', 'ea100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'promotion-admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
 ('00000000-0000-0000-0000-000000000000', 'eb100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'promotion-foreign@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.organizations (id, name, type, country) values
 ('ea000000-0000-4000-8000-000000000001', 'Promotion fixture A', 'test', 'Denmark'),
 ('eb000000-0000-4000-8000-000000000001', 'Promotion fixture B', 'test', 'Denmark');
insert into public.organization_memberships (user_id, organization_id, role) values
 ('ea100000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'viewer'),
 ('ea100000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'viewer'),
 ('ea100000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-000000000001', 'admin'),
 ('eb100000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', 'owner');
insert into public.projects (id, organization_id, name, slug, status) values
 ('ea200000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'Promotion fixture A', 'promotion-fixture-a', 'active'),
 ('eb200000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', 'Promotion fixture B', 'promotion-fixture-b', 'active');
insert into public.project_members (project_id, user_id, role) values
 ('ea200000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'field'),
 ('ea200000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000002', 'viewer'),
 ('eb200000-0000-4000-8000-000000000001', 'eb100000-0000-4000-8000-000000000001', 'admin');

create temporary table promotion_fixture_inputs (
  upload_id uuid primary key, project_id uuid, organization_id uuid, actor_id uuid,
  object_id uuid, intent_request_id uuid, original_sha256 text, validation_sha256 text,
  validation_status text, file_name text
);
insert into promotion_fixture_inputs values
 ('ea300000-0000-4000-8000-000000000001', 'ea200000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'ea500000-0000-4000-8000-000000000001', 'ea400000-0000-4000-8000-000000000001', repeat('a',64), repeat('b',64), 'review_required', 'original.JPG'),
 ('ea300000-0000-4000-8000-000000000002', 'ea200000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'ea500000-0000-4000-8000-000000000002', 'ea400000-0000-4000-8000-000000000002', repeat('a',64), repeat('c',64), 'review_required', 'duplicate.JPG'),
 ('eb300000-0000-4000-8000-000000000001', 'eb200000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', 'eb100000-0000-4000-8000-000000000001', 'eb500000-0000-4000-8000-000000000001', 'eb400000-0000-4000-8000-000000000001', repeat('a',64), repeat('d',64), 'review_required', 'other-project.JPG'),
 ('ea300000-0000-4000-8000-000000000003', 'ea200000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'ea500000-0000-4000-8000-000000000003', 'ea400000-0000-4000-8000-000000000003', repeat('e',64), repeat('f',64), 'rejected', 'rejected.JPG'),
 ('ea300000-0000-4000-8000-000000000004', 'ea200000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'ea500000-0000-4000-8000-000000000004', 'ea400000-0000-4000-8000-000000000004', repeat('1',64), repeat('2',64), 'review_required', 'stale.JPG'),
 ('ea300000-0000-4000-8000-000000000005', 'ea200000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'ea500000-0000-4000-8000-000000000005', 'ea400000-0000-4000-8000-000000000005', repeat('3',64), repeat('4',64), 'review_required', 'unpromoted.JPG');
insert into public.uploads (id, project_id, organization_id, uploaded_by, file_name, original_file_name, file_size, mime_type, upload_type, storage_path, intent_request_id, intent_expires_at, received_at, status)
select upload_id, project_id, organization_id, actor_id, file_name, file_name, 10, 'image/jpeg', 'drone_photo',
 actor_id::text || '/intents/' || upload_id::text || '/' || file_name,
 intent_request_id, now() + interval '24 hours', now(), 'awaiting_validation'
from promotion_fixture_inputs;
insert into storage.objects (id, bucket_id, name, owner_id, metadata)
select object_id, 'monitoring-uploads', actor_id::text || '/intents/' || upload_id::text || '/' || file_name,
 actor_id::text, '{"size":10,"mimetype":"image/jpeg"}'::jsonb
from promotion_fixture_inputs;

-- Seed an archived duplicate only when the actual local index contract allows it.
do $history_setup$
begin
  if pg_temp.promotion_history_fixture_supported() then
    execute $sql$
      insert into storage.objects (id, bucket_id, name, owner_id, metadata, version, archived_at, is_delete_marker)
      values ('ea500000-0000-4000-8000-000000000099', 'monitoring-uploads',
        'ea100000-0000-4000-8000-000000000001/intents/ea300000-0000-4000-8000-000000000001/original.JPG',
        'ea100000-0000-4000-8000-000000000001', '{"size":10,"mimetype":"image/jpeg"}',
        'ea600000-0000-4000-8000-000000000099', now() - interval '1 day', false)
    $sql$;
  end if;
end
$history_setup$;

create temporary table promotion_cases as
select input.*, to_jsonb(object) ->> 'version' as object_version, object.updated_at as object_updated_at,
 jsonb_build_object('schema', 'gofreyra.drone-original-validation/v1', 'validatorVersion', 'jpeg-structure-exifr/v1',
  'uploadId', upload.id, 'projectId', upload.project_id, 'validatedBy', input.actor_id, 'validatedAt', now(),
  'original', jsonb_build_object('sha256', input.original_sha256, 'sizeBytes', 10, 'mimeType', 'image/jpeg',
    'storagePath', upload.storage_path, 'receivedAt', upload.received_at,
    'object', jsonb_build_object('id', object.id, 'version', to_jsonb(object) ->> 'version', 'updated_at', object.updated_at,
      'owner_id', object.owner_id, 'size', 10, 'mimetype', 'image/jpeg')),
  'status', input.validation_status,
  'jpegStructure', case when input.validation_status = 'rejected' then null else jsonb_build_object('widthPx',1,'heightPx',1,'components',1,'encoding','baseline','scans',1) end,
  'metadata', null, 'cameraPositionEligible', false, 'pixelDecoded', false, 'georeferenced', false, 'reportEligible', false,
  'errors', case when input.validation_status = 'rejected' then jsonb_build_array(jsonb_build_object('code','JPEG_STRUCTURE_INVALID','message','Synthetic rejected file')) else '[]'::jsonb end,
  'warnings', jsonb_build_array(jsonb_build_object('code','GPS_UNKNOWN','message','Synthetic original has no geolocation'))) as validation_result
from promotion_fixture_inputs input
join public.uploads upload on upload.id = input.upload_id
join storage.objects object on object.id = input.object_id;
grant select on promotion_cases to service_role;
set local role service_role;
do $seed_validations$
begin
  perform public.persist_drone_original_validation(project_id, upload_id, actor_id, object_id, object_version, object_updated_at, validation_result, validation_sha256)
  from pg_temp.promotion_cases;
end
$seed_validations$;
reset role;

create function pg_temp.promote_from_case(p_upload_id uuid, p_actor_id uuid, p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $fixture_promotion$
declare fixture_row record;
begin
  select * into strict fixture_row from pg_temp.promotion_cases where upload_id = p_upload_id;
  return public.persist_drone_original_promotion(fixture_row.project_id, p_upload_id, p_actor_id, p_request_id,
    fixture_row.original_sha256, fixture_row.validation_sha256, fixture_row.object_id,
    fixture_row.object_version, fixture_row.object_updated_at);
end
$fixture_promotion$;
create temporary table promotion_results (name text primary key, result jsonb not null);
grant select, insert on promotion_results to service_role;
grant select on promotion_results to authenticated;
create function pg_temp.promotion_affected_rows(p_sql text) returns bigint
language plpgsql security invoker set search_path = '' as $affected_rows$
declare affected bigint;
begin
  execute p_sql;
  get diagnostics affected = row_count;
  return affected;
end
$affected_rows$;

select ok(not has_function_privilege('anon', 'public.persist_drone_original_promotion(uuid,uuid,uuid,uuid,text,text,uuid,text,timestamptz)', 'EXECUTE'), 'anonymous caller cannot promote originals');
select ok(not has_function_privilege('authenticated', 'public.persist_drone_original_promotion(uuid,uuid,uuid,uuid,text,text,uuid,text,timestamptz)', 'EXECUTE'), 'browser cannot call the trusted promotion writer');
select ok(has_function_privilege('service_role', 'public.persist_drone_original_promotion(uuid,uuid,uuid,uuid,text,text,uuid,text,timestamptz)', 'EXECUTE'), 'server writer has an explicit execute grant');
select ok(not has_function_privilege('authenticated','public.prepare_project_media_original_read(uuid,uuid,uuid)','EXECUTE'), 'browser cannot replace the exact-object read check with a privileged RPC');
select ok(not has_function_privilege('anon','public.prepare_project_media_original_read(uuid,uuid,uuid)','EXECUTE'), 'anonymous caller cannot inspect pinned originals through the service reader');
select ok(has_function_privilege('service_role','public.prepare_project_media_original_read(uuid,uuid,uuid)','EXECUTE'), 'authenticated wrapper has an explicit server-only read capability');
select ok(not has_column_privilege('authenticated', 'public.project_media', 'storage_bucket', 'INSERT'), 'browser cannot choose the canonical bucket');
select ok(not has_column_privilege('authenticated', 'public.project_media', 'source_upload_id', 'INSERT'), 'browser cannot mint an original source reference');
select ok(not has_column_privilege('authenticated', 'public.project_media', 'original_sha256', 'UPDATE'), 'browser cannot rewrite a canonical original hash');
select ok(not has_table_privilege('authenticated', 'public.project_media_upload_origins', 'INSERT'), 'browser cannot insert upload origin provenance');
select ok(not has_table_privilege('authenticated', 'public.project_media_upload_origins', 'UPDATE'), 'browser cannot mutate upload origin provenance');
select ok(not has_table_privilege('authenticated', 'public.project_media_promotion_requests', 'INSERT'), 'browser cannot mint promotion request receipts');
select ok(not has_table_privilege('anon', 'public.project_media_upload_origins', 'SELECT'), 'anonymous caller cannot read upload origins');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.project_media_upload_origins'::regclass), 'upload origin provenance has RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.project_media_promotion_requests'::regclass), 'promotion request receipts have RLS');

set local role service_role;
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000091')$q$,
 '42501', null, 'a foreign tenant cannot promote through the privileged writer');
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000002','ea700000-0000-4000-8000-000000000092')$q$,
 '42501', null, 'project viewer does not acquire contribution rights through service access');
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001',null,'ea700000-0000-4000-8000-000000000093')$q$,
 '42501', null, 'verified actor is required');
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001',null)$q$,
 '22023', null, 'idempotency request ID is required');
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000003','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000094')$q$,
 '23514', null, 'rejected original is not promoted');
select throws_ok($q$select public.persist_drone_original_promotion(project_id, upload_id, actor_id, 'ea700000-0000-4000-8000-000000000095', repeat('0',64), validation_sha256, object_id, object_version, object_updated_at) from promotion_cases where upload_id = 'ea300000-0000-4000-8000-000000000001'$q$,
 '23514', null, 'caller-supplied different original hash is refused');
select throws_ok($q$select public.persist_drone_original_promotion(project_id, upload_id, actor_id, 'ea700000-0000-4000-8000-000000000096', original_sha256, repeat('0',64), object_id, object_version, object_updated_at) from promotion_cases where upload_id = 'ea300000-0000-4000-8000-000000000001'$q$,
 '23514', null, 'caller-supplied different validation hash is refused');
select throws_ok($q$select public.persist_drone_original_promotion(project_id, upload_id, actor_id, 'ea700000-0000-4000-8000-000000000097', original_sha256, validation_sha256, object_id, 'replacement', object_updated_at) from promotion_cases where upload_id = 'ea300000-0000-4000-8000-000000000001'$q$,
 '23514', null, 'changed Storage version is refused');
reset role;
-- A managed timestamp trigger can replace an explicit updated_at value with
-- transaction-local now(). Change a compared source attribute instead, so the
-- stale-source assertion is independent of that vendor implementation detail.
update storage.objects set metadata = jsonb_set(metadata, '{size}', '11'::jsonb)
where id = 'ea500000-0000-4000-8000-000000000004';
set local role service_role;
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000004','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000098')$q$,
 '23514', null, 'persisted validation of a stale Storage object is refused');
select is((select count(*) from public.project_media where project_id = 'ea200000-0000-4000-8000-000000000001'), 0::bigint, 'denied promotions leave no canonical media');

select lives_ok($q$insert into promotion_results values ('first', pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000001'))$q$,
 'field contributor can atomically promote a verified raw original');
select ok((select result #>> '{media,id}' from promotion_results where name = 'first') is not null, 'promotion returns a stable canonical media ID');
select is((select result #>> '{media,storage_bucket}' from promotion_results where name = 'first'), 'monitoring-uploads', 'original reference uses its authorized monitoring bucket');
select is((select result #>> '{media,source_upload_id}' from promotion_results where name = 'first'), 'ea300000-0000-4000-8000-000000000001', 'canonical media keeps the first upload identity');
select is((select result #>> '{media,original_role}' from promotion_results where name = 'first'), 'drone_original', 'canonical original identity has a typed logical role');
select is((select result #>> '{media,original_validation_status}' from promotion_results where name = 'first'), 'review_required', 'missing geolocation remains visible as review required');
select is((select result #> '{media,is_report_ready}' from promotion_results where name = 'first'), 'false'::jsonb, 'raw original promotion cannot mint report readiness');
select ok((select captured_at is null and lat is null and lng is null from public.project_media where id = (select (result #>> '{media,id}')::uuid from promotion_results where name = 'first')), 'unknown capture time and camera position are not filled with upload time or a centroid');
select is((select count(*) from public.drone_assets asset join public.drone_flights flight on flight.id = asset.flight_id where flight.project_id in ('ea200000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001')), 0::bigint, 'promotion does not invent a drone asset flight');
select is((select count(*) from public.drone_flights where project_id in ('ea200000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001')), 0::bigint, 'promotion does not invent a flight timestamp');
select is((select count(*) from public.project_media_upload_origins where project_id = 'ea200000-0000-4000-8000-000000000001'), 1::bigint, 'first promotion records exactly one physical original');
select is((select public.prepare_project_media_original_read('ea200000-0000-4000-8000-000000000001',(result #>> '{media,id}')::uuid,'ea100000-0000-4000-8000-000000000002') #>> '{object,id}' from promotion_results where name = 'first'),
 'ea500000-0000-4000-8000-000000000001','current viewer can read the exact pinned original without contribution rights');
select throws_ok($q$select public.prepare_project_media_original_read('ea200000-0000-4000-8000-000000000001',(result #>> '{media,id}')::uuid,'eb100000-0000-4000-8000-000000000001') from promotion_results where name = 'first'$q$,
 '42501',null,'foreign tenant cannot use the privileged original read');

insert into promotion_results values ('retry', pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000001'));
select is((select result #>> '{media,id}' from promotion_results where name = 'retry'), (select result #>> '{media,id}' from promotion_results where name = 'first'), 'same-request retry returns the same canonical media');
select is((select result #>> '{origin,id}' from promotion_results where name = 'retry'), (select result #>> '{origin,id}' from promotion_results where name = 'first'), 'same-request retry returns the same origin receipt');
select is((select count(*) from public.project_media_promotion_requests where project_id = 'ea200000-0000-4000-8000-000000000001'), 1::bigint, 'retry does not duplicate request receipts');
insert into promotion_results values ('same-upload-new-request', pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000002'));
select is((select result #>> '{media,id}' from promotion_results where name = 'same-upload-new-request'), (select result #>> '{media,id}' from promotion_results where name = 'first'), 'new request for the same upload retains canonical identity');
select is((select count(*) from public.project_media_upload_origins where project_id = 'ea200000-0000-4000-8000-000000000001'), 1::bigint, 'same upload never creates a second physical origin');
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000002','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000001')$q$,
 '23514', null, 'one request ID cannot be reused for a different upload');
insert into promotion_results values ('duplicate', pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000002','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000003'));
select is((select result #>> '{media,id}' from promotion_results where name = 'duplicate'), (select result #>> '{media,id}' from promotion_results where name = 'first'), 'different upload with identical bytes deduplicates within its project');
select is((select result -> 'deduplicated' from promotion_results where name = 'duplicate'), 'true'::jsonb, 'duplicate promotion reports its deduplication');
select is((select count(*) from public.project_media where project_id = 'ea200000-0000-4000-8000-000000000001'), 1::bigint, 'deduplication produces one canonical original media row');
select is((select count(*) from public.project_media_upload_origins where project_id = 'ea200000-0000-4000-8000-000000000001'), 2::bigint, 'both physical duplicate upload origins are preserved');
select is((select count(distinct object_id) from public.project_media_upload_origins where project_id = 'ea200000-0000-4000-8000-000000000001'), 2::bigint, 'duplicate origins retain their distinct Storage object identities');
insert into promotion_results values ('other-project', pg_temp.promote_from_case('eb300000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','eb700000-0000-4000-8000-000000000001'));
select isnt((select result #>> '{media,id}' from promotion_results where name = 'other-project'), (select result #>> '{media,id}' from promotion_results where name = 'first'), 'same original hash in another project is never deduplicated across tenant boundaries');
select throws_ok($q$select public.prepare_project_media_original_read('ea200000-0000-4000-8000-000000000001',(result #>> '{media,id}')::uuid,'ea100000-0000-4000-8000-000000000001') from promotion_results where name = 'other-project'$q$,
 '23514',null,'reader refuses a media ID from a different project');
select throws_ok($q$update public.project_media set title = 'rewrite' where id = (select (result #>> '{media,id}')::uuid from promotion_results where name = 'first')$q$,
 '23514', null, 'canonical media is immutable even under a direct privileged metadata update');
select throws_ok($q$delete from public.uploads where id = 'ea300000-0000-4000-8000-000000000001'$q$,
 '23503', null, 'referenced primary upload cannot be deleted');
select throws_ok($q$delete from public.uploads where id = 'ea300000-0000-4000-8000-000000000002'$q$,
 '23503', null, 'referenced duplicate upload cannot be deleted');
select throws_ok($q$update public.project_media_upload_origins set original_sha256 = repeat('0',64) where upload_id = 'ea300000-0000-4000-8000-000000000001'$q$,
 '23514', null, 'even a privileged update cannot rewrite an immutable physical origin');
select throws_ok($q$update public.project_media_promotion_requests set upload_id = 'ea300000-0000-4000-8000-000000000002' where project_id = 'ea200000-0000-4000-8000-000000000001'$q$,
 '23514', null, 'even a privileged update cannot rewrite an immutable request receipt');
reset role;
select throws_ok($q$delete from public.project_media where id = (select (result #>> '{media,id}')::uuid from promotion_results where name = 'first')$q$,
 '23514', null, 'canonical media deletion is denied by its immutable provenance trigger');
select throws_ok($q$delete from storage.objects where id = 'ea500000-0000-4000-8000-000000000001'$q$,
 '23503', null, 'primary exact-object FK prevents deletion independently of the RLS snapshot');
select throws_ok($q$delete from storage.objects where id = 'ea500000-0000-4000-8000-000000000002'$q$,
 '23503', null, 'duplicate exact-object FK protects every retained physical origin');

-- Existing permissive policies use OR. New restrictive policies must still win
-- if another application policy later grants broad writes to this bucket.
create policy promotion_fixture_permissive_insert on storage.objects
 for insert to authenticated with check (bucket_id = 'monitoring-uploads');
create policy promotion_fixture_permissive_update on storage.objects
 for update to authenticated using (bucket_id = 'monitoring-uploads') with check (bucket_id = 'monitoring-uploads');
select is((select count(*) from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE' and cmd in ('INSERT','UPDATE','DELETE')
 and policyname in ('promoted_drone_original_no_insert','promoted_drone_original_no_update','promoted_drone_original_no_delete')), 3::bigint, 'Storage protects pinned origins with three restrictive operation policies');

select set_config('request.jwt.claims', '{"sub":"ea100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select ok(private.is_promoted_drone_storage_reference('project-media','unrelated/new-name.JPG','ea500000-0000-4000-8000-000000000001'), 'object ID keeps a committed pin visible even at a new bucket or path');
select is(pg_temp.promotion_affected_rows($q$delete from storage.objects where id = 'ea500000-0000-4000-8000-000000000001'$q$), 0::bigint, 'organization admin cannot delete the promoted current original through RLS');
select is(pg_temp.promotion_affected_rows($q$delete from storage.objects where id = 'ea500000-0000-4000-8000-000000000002'$q$), 0::bigint, 'organization admin cannot delete a duplicate original referenced by provenance');
select is(pg_temp.promotion_affected_rows($q$update storage.objects set metadata = '{"size":11,"mimetype":"image/jpeg"}' where id = 'ea500000-0000-4000-8000-000000000001'$q$), 0::bigint, 'restrictive UPDATE blocks replacement despite an explicit permissive update policy');
select is(pg_temp.promotion_affected_rows($q$update storage.objects set name = 'renamed-unpinned.JPG' where id = 'ea500000-0000-4000-8000-000000000001'$q$), 0::bigint, 'ordinary admin cannot rename a pinned object to an unpinned path');
select throws_ok($q$insert into storage.objects (id,bucket_id,name,owner_id,metadata) values ('ea500000-0000-4000-8000-000000000098','monitoring-uploads','ea100000-0000-4000-8000-000000000001/intents/ea300000-0000-4000-8000-000000000001/original.JPG','ea100000-0000-4000-8000-000000000001','{"size":10,"mimetype":"image/jpeg"}')$q$,
 '42501', null, 'restrictive INSERT refuses another object at a promoted path before any uniqueness conflict');
select is(pg_temp.promotion_affected_rows($q$update storage.objects set metadata = '{"size":10,"mimetype":"image/jpeg","fixture":true}' where id = 'ea500000-0000-4000-8000-000000000005'$q$), 1::bigint, 'new protection does not block an unpromoted object under an otherwise allowed update');
select is(pg_temp.promotion_affected_rows($q$delete from storage.objects where id = 'ea500000-0000-4000-8000-000000000005'$q$), 1::bigint, 'new protection preserves ordinary cleanup of an unpromoted upload');
reset role;

create function pg_temp.assert_promotion_storage_history() returns setof text
language plpgsql as $history_tests$
declare removed_count bigint;
begin
  if not pg_temp.promotion_history_fixture_supported() then
    return query select * from skip('Local Storage unique name contract does not support archived duplicate fixtures', 1);
    return;
  end if;
  execute $sql$with removed as (delete from storage.objects where id = 'ea500000-0000-4000-8000-000000000099' returning id) select count(*) from removed$sql$ into removed_count;
  return next is(removed_count, 0::bigint, 'promoted path protection also covers archived versions for organization admins');
end
$history_tests$;
set local role authenticated;
select * from pg_temp.assert_promotion_storage_history();
reset role;
select is((select count(*) from storage.objects where id in ('ea500000-0000-4000-8000-000000000001','ea500000-0000-4000-8000-000000000002')), 2::bigint, 'denied ordinary-user writes leave both physical originals present');

select set_config('request.jwt.claims', '{"sub":"ea100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($q$insert into public.project_media (id,project_id,title,category,source,file_path,url)
 values ('ea800000-0000-4000-8000-000000000001','ea200000-0000-4000-8000-000000000001','Legacy fixture','field_photo','field_upload','ea200000-0000-4000-8000-000000000001/legacy.JPG','')$q$,
 'field contributor retains its existing legacy media registration');
select is((select storage_bucket from public.project_media where id = 'ea800000-0000-4000-8000-000000000001'), 'project-media', 'ordinary legacy media keeps its original bucket default');
select lives_ok($q$update public.project_media set title = 'Edited legacy fixture' where id = 'ea800000-0000-4000-8000-000000000001'$q$,
 'legacy label editing remains possible under existing contribution rights');
reset role;

select set_config('request.jwt.claims', '{"sub":"eb100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.project_media where project_id = 'ea200000-0000-4000-8000-000000000001'), 0::bigint, 'foreign tenant cannot read canonical media');
select is((select count(*) from public.project_media_upload_origins where project_id = 'ea200000-0000-4000-8000-000000000001'), 0::bigint, 'foreign tenant cannot read duplicate origin provenance');
select is((select count(*) from public.project_media_promotion_requests where project_id = 'ea200000-0000-4000-8000-000000000001'), 0::bigint, 'foreign tenant cannot read promotion request receipts');
reset role;
-- Privileged maintenance is outside ordinary RLS. Promotion must still refuse
-- to attach/replay a duplicate if its primary canonical object was changed.
update storage.objects set metadata = '{"size":11,"mimetype":"image/jpeg"}'
where id = 'ea500000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000002','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000003')$q$,
 '23514', null, 'duplicate retry does not silently replace an unavailable or changed primary original');
select throws_ok($q$select public.prepare_project_media_original_read('ea200000-0000-4000-8000-000000000001',(result #>> '{media,id}')::uuid,'ea100000-0000-4000-8000-000000000002') from promotion_results where name = 'first'$q$,
 '23514',null,'read rechecks current bytes metadata instead of silently signing a changed primary');
reset role;
delete from public.project_members where project_id = 'ea200000-0000-4000-8000-000000000001' and user_id = 'ea100000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok($q$select public.prepare_project_media_original_read('ea200000-0000-4000-8000-000000000001',(result #>> '{media,id}')::uuid,'ea100000-0000-4000-8000-000000000002') from promotion_results where name = 'first'$q$,
 '42501',null,'revoked viewer cannot obtain a new original signature through an existing identity');
reset role;
delete from public.project_members where project_id = 'ea200000-0000-4000-8000-000000000001' and user_id = 'ea100000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($q$select pg_temp.promote_from_case('ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001','ea700000-0000-4000-8000-000000000001')$q$,
 '42501', null, 'membership revocation refuses even an idempotent promotion replay');
reset role;
select * from finish();
rollback;
