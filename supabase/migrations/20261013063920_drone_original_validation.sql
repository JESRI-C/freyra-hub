-- Local H08 candidate. Replay and isolation tests are required before deployment.
-- One canonical upload remains the file record. These original-byte results are
-- server owned and do not constitute a footprint, classification or reviewer approval.
alter table public.uploads
  add column original_sha256 text,
  add column original_validation_sha256 text,
  add column original_validation jsonb;
alter table public.uploads add constraint uploads_original_validation_shape check (
  (original_sha256 is null and original_validation_sha256 is null and original_validation is null)
  or (original_sha256 is not null and original_validation_sha256 is not null
    and original_sha256 ~ '^[0-9a-f]{64}$' and original_validation_sha256 ~ '^[0-9a-f]{64}$'
    and original_validation is not null and jsonb_typeof(original_validation) = 'object'
    and octet_length(original_validation::text) <= 1048576)
);
revoke update (original_sha256, original_validation_sha256, original_validation) on public.uploads from authenticated, anon;

create or replace function private.protect_drone_original_validation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.original_validation is not null and (
    new.original_validation is distinct from old.original_validation
    or new.original_sha256 is distinct from old.original_sha256
    or new.original_validation_sha256 is distinct from old.original_validation_sha256
    or new.detected_metadata -> 'drone_original' is distinct from old.detected_metadata -> 'drone_original'
    or new.validation_result -> 'drone_original' is distinct from old.validation_result -> 'drone_original'
    or new.storage_path is distinct from old.storage_path
    or new.file_size is distinct from old.file_size
    or new.mime_type is distinct from old.mime_type
    or new.file_name is distinct from old.file_name
    or new.original_file_name is distinct from old.original_file_name
    or new.upload_type is distinct from old.upload_type
    or new.received_at is distinct from old.received_at
  ) then
    raise exception 'Server original validation is immutable' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.protect_drone_original_validation() from public, anon, authenticated;
create trigger uploads_original_validation_immutable before update on public.uploads
  for each row execute function private.protect_drone_original_validation();

-- Resolve the verified actor's current contribution rights under locks, then
-- lock the exact finalized intent. No JWT identity is accepted from the browser.
create or replace function private.lock_drone_original_upload(p_project_id uuid, p_upload_id uuid, p_actor_id uuid)
returns public.uploads language plpgsql security invoker set search_path = '' as $$
declare project_row public.projects%rowtype; upload_row public.uploads%rowtype;
begin
  if p_actor_id is null then raise exception 'Verified actor required' using errcode = '42501'; end if;
  select * into project_row from public.projects where id = p_project_id for share;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  perform 1 from public.organization_memberships where organization_id = project_row.organization_id and user_id = p_actor_id for share;
  perform 1 from public.project_members where project_id = p_project_id and user_id = p_actor_id for share;
  if not (
    exists (select 1 from public.organization_memberships where organization_id = project_row.organization_id and user_id = p_actor_id and role in ('owner', 'admin'))
    or (exists (select 1 from public.organization_memberships where organization_id = project_row.organization_id and user_id = p_actor_id)
      and exists (select 1 from public.project_members where project_id = p_project_id and user_id = p_actor_id and role in ('admin', 'project_manager', 'editor', 'field')))
  ) then raise exception 'Project contribution denied' using errcode = '42501'; end if;
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
revoke all on function private.lock_drone_original_upload(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.lock_drone_original_upload(uuid, uuid, uuid) to service_role;

create or replace function public.prepare_drone_original_validation(p_project_id uuid, p_upload_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare upload_row public.uploads%rowtype; object_row storage.objects%rowtype;
begin
  upload_row := private.lock_drone_original_upload(p_project_id, p_upload_id, p_actor_id);
  -- Path downloads resolve the current object, never an archived historical
  -- version or delete marker. JSON access also supports older Storage schemas
  -- where the current-version columns do not exist and names are unique.
  begin
    select * into strict object_row from storage.objects object
      where object.bucket_id = 'monitoring-uploads' and object.name = upload_row.storage_path
        and to_jsonb(object) ->> 'archived_at' is null
        and not coalesce((to_jsonb(object) ->> 'is_delete_marker')::boolean, false)
      for share;
  exception when no_data_found or too_many_rows then
    raise exception 'Original Storage object does not match finalized intent' using errcode = '23514';
  end;
  if not found or object_row.owner_id is distinct from upload_row.uploaded_by::text
    or object_row.metadata ->> 'size' is null or object_row.metadata ->> 'size' !~ '^[0-9]+$'
    or (object_row.metadata ->> 'size')::bigint <> upload_row.file_size
    or lower(object_row.metadata ->> 'mimetype') is distinct from 'image/jpeg'
  then raise exception 'Original Storage object does not match finalized intent' using errcode = '23514'; end if;
  return jsonb_build_object('upload', to_jsonb(upload_row),
    'object', jsonb_build_object('id', object_row.id, 'version', to_jsonb(object_row) ->> 'version', 'updated_at', object_row.updated_at,
      'owner_id', object_row.owner_id, 'size', upload_row.file_size, 'mimetype', 'image/jpeg'),
    'existing', upload_row.original_validation, 'existing_sha256', upload_row.original_validation_sha256);
end $$;
revoke all on function public.prepare_drone_original_validation(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_drone_original_validation(uuid, uuid, uuid) to service_role;

create or replace function public.persist_drone_original_validation(
  p_project_id uuid, p_upload_id uuid, p_actor_id uuid, p_object_id uuid,
  p_object_version text, p_object_updated_at timestamptz, p_result jsonb, p_result_sha256 text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare upload_row public.uploads%rowtype; object_row storage.objects%rowtype;
begin
  upload_row := private.lock_drone_original_upload(p_project_id, p_upload_id, p_actor_id);
  begin
    select * into strict object_row from storage.objects object
      where object.bucket_id = 'monitoring-uploads' and object.name = upload_row.storage_path
        and to_jsonb(object) ->> 'archived_at' is null
        and not coalesce((to_jsonb(object) ->> 'is_delete_marker')::boolean, false)
      for share;
  exception when no_data_found or too_many_rows then
    raise exception 'Original changed during validation' using errcode = '23514';
  end;
  if not found or object_row.id is distinct from p_object_id
    or (to_jsonb(object_row) ->> 'version') is distinct from p_object_version
    or object_row.updated_at is distinct from p_object_updated_at
    or object_row.owner_id is distinct from upload_row.uploaded_by::text
    or object_row.metadata ->> 'size' is null or object_row.metadata ->> 'size' !~ '^[0-9]+$'
    or (object_row.metadata ->> 'size')::bigint <> upload_row.file_size
    or lower(object_row.metadata ->> 'mimetype') is distinct from 'image/jpeg'
  then raise exception 'Original changed during validation' using errcode = '23514'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text) > 1048576
    or p_result_sha256 is null or p_result_sha256 !~ '^[0-9a-f]{64}$'
    or p_result ->> 'schema' is distinct from 'gofreyra.drone-original-validation/v1'
    or p_result ->> 'validatorVersion' is distinct from 'jpeg-structure-exifr/v1'
    or p_result ->> 'uploadId' is distinct from p_upload_id::text
    or p_result ->> 'projectId' is distinct from p_project_id::text
    or p_result ->> 'validatedBy' is distinct from p_actor_id::text
    or p_result #>> '{original,storagePath}' is distinct from upload_row.storage_path
    or (p_result #>> '{original,receivedAt}')::timestamptz is distinct from upload_row.received_at
    or (p_result #>> '{original,sizeBytes}')::bigint is distinct from upload_row.file_size
    or p_result #>> '{original,mimeType}' is distinct from 'image/jpeg'
    or p_result #>> '{original,object,id}' is distinct from p_object_id::text
    or p_result #>> '{original,object,version}' is distinct from p_object_version
    or (p_result #>> '{original,object,updated_at}')::timestamptz is distinct from p_object_updated_at
    or p_result #>> '{original,object,owner_id}' is distinct from upload_row.uploaded_by::text
    or (p_result #>> '{original,object,size}')::bigint is distinct from upload_row.file_size
    or p_result #>> '{original,object,mimetype}' is distinct from 'image/jpeg'
    or p_result #>> '{original,sha256}' is null or p_result #>> '{original,sha256}' !~ '^[0-9a-f]{64}$'
    or (p_result ->> 'status') not in ('raw_original_validated', 'review_required', 'rejected')
    or p_result ->> 'status' is null
    or p_result -> 'pixelDecoded' is distinct from 'false'::jsonb
    or p_result -> 'georeferenced' is distinct from 'false'::jsonb
    or p_result -> 'reportEligible' is distinct from 'false'::jsonb
    or jsonb_typeof(p_result -> 'errors') is distinct from 'array'
    or jsonb_typeof(p_result -> 'warnings') is distinct from 'array'
  then raise exception 'Invalid server original validation' using errcode = '23514'; end if;
  if upload_row.original_validation is not null then
    if upload_row.original_sha256 is distinct from p_result #>> '{original,sha256}' then
      raise exception 'Original SHA-256 differs from previously validated bytes' using errcode = '23514';
    end if;
    return jsonb_build_object('result', upload_row.original_validation, 'result_sha256', upload_row.original_validation_sha256);
  end if;
  update public.uploads set original_sha256 = p_result #>> '{original,sha256}',
    original_validation_sha256 = p_result_sha256, original_validation = p_result,
    detected_metadata = jsonb_set(detected_metadata, '{drone_original}', p_result -> 'metadata', true),
    validation_result = jsonb_set(validation_result, '{drone_original}', p_result, true),
    status = case when p_result ->> 'status' = 'rejected' then 'rejected' else status end,
    updated_at = now() where id = p_upload_id;
  insert into public.audit_events (project_id, event_type, entity_type, entity_id, title, actor, source, after_data)
    values (p_project_id, 'drone_original_validated', 'upload', p_upload_id, 'Originalfilens bytes og metadata kontrolleret', p_actor_id::text, 'server_validation',
      jsonb_build_object('upload_id', p_upload_id, 'sha256', p_result #>> '{original,sha256}', 'status', p_result ->> 'status', 'report_eligible', false));
  return jsonb_build_object('result', p_result, 'result_sha256', p_result_sha256);
end $$;
revoke all on function public.persist_drone_original_validation(uuid, uuid, uuid, uuid, text, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.persist_drone_original_validation(uuid, uuid, uuid, uuid, text, timestamptz, jsonb, text) to service_role;
