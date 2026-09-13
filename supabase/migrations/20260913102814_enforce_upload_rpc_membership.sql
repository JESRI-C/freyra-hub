-- SECURITY DEFINER upload RPCs must re-check the caller's current tenant
-- access. Upload ownership alone is not authorization after membership revoke,
-- including the idempotent already-received finalization path.

create or replace function public.finalize_upload_intent(p_upload_id uuid)
returns table (
  upload_id uuid,
  storage_path text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  intent public.uploads%rowtype;
  object_owner_id text;
  object_metadata jsonb;
  object_size_text text;
  object_mime_type text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select upload.*
    into intent
  from public.uploads upload
  where upload.id = p_upload_id
    and upload.uploaded_by = actor_id
  for update;

  if not found then
    raise exception 'Upload intent not found' using errcode = '42501';
  end if;
  if intent.project_id is null or not private.can_contribute_project(intent.project_id) then
    raise exception 'Project contribution denied' using errcode = '42501';
  end if;
  if intent.received_at is not null then
    upload_id := intent.id;
    storage_path := intent.storage_path;
    status := intent.status;
    return next;
    return;
  end if;
  if intent.status <> 'draft' then
    raise exception 'Upload intent is not pending' using errcode = '55000';
  end if;
  if intent.intent_expires_at is null or intent.intent_expires_at <= pg_catalog.now() then
    raise exception 'Upload intent expired' using errcode = '55000';
  end if;

  select object.owner_id, object.metadata
    into object_owner_id, object_metadata
  from storage.objects object
  where object.bucket_id = 'monitoring-uploads'
    and object.name = intent.storage_path;

  if not found or object_owner_id is distinct from actor_id::text then
    raise exception 'Completed upload object not found' using errcode = '55000';
  end if;

  object_size_text := object_metadata ->> 'size';
  object_mime_type := pg_catalog.lower(object_metadata ->> 'mimetype');
  if object_size_text is null
     or object_size_text !~ '^[0-9]+$'
     or object_size_text::bigint <> intent.file_size then
    raise exception 'Uploaded object size does not match intent' using errcode = '23514';
  end if;
  if object_mime_type is null or object_mime_type <> pg_catalog.lower(intent.mime_type) then
    raise exception 'Uploaded object MIME type does not match intent' using errcode = '23514';
  end if;

  update public.uploads upload
  set status = 'awaiting_validation',
      received_at = coalesce(upload.received_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where upload.id = intent.id
  returning upload.id, upload.storage_path, upload.status
    into upload_id, storage_path, status;

  insert into public.audit_events (
    project_id,
    event_type,
    entity_type,
    entity_id,
    title,
    description,
    actor,
    source,
    after_data
  ) values (
    intent.project_id,
    'upload_received',
    'upload',
    intent.id,
    'Fil modtaget: ' || intent.original_file_name,
    'Resumable Storage-transfer er verificeret; backendvalidering afventer',
    actor_id::text,
    'database_rpc',
    pg_catalog.jsonb_build_object(
      'id', intent.id,
      'storage_path', intent.storage_path,
      'file_size', intent.file_size,
      'mime_type', intent.mime_type,
      'status', status
    )
  );

  return next;
end
$$;

revoke all on function public.finalize_upload_intent(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_upload_intent(uuid)
  to authenticated;

create or replace function public.cancel_upload_intent(p_upload_id uuid)
returns table (
  upload_id uuid,
  storage_path text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  intent public.uploads%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select upload.*
    into intent
  from public.uploads upload
  where upload.id = p_upload_id
    and upload.uploaded_by = actor_id
  for update;

  if not found then
    raise exception 'Upload intent not found' using errcode = '42501';
  end if;
  if intent.project_id is null or not private.can_contribute_project(intent.project_id) then
    raise exception 'Project contribution denied' using errcode = '42501';
  end if;
  if intent.intent_request_id is null
     or intent.received_at is not null
     or intent.status <> 'draft' then
    raise exception 'Only pending, unreceived upload intents can be cancelled' using errcode = '55000';
  end if;

  update public.uploads upload
  set status = 'archived',
      updated_at = pg_catalog.now()
  where upload.id = intent.id
  returning upload.id, upload.storage_path, upload.status
    into upload_id, storage_path, status;

  insert into public.audit_events (
    project_id,
    event_type,
    entity_type,
    entity_id,
    title,
    description,
    actor,
    source,
    after_data
  ) values (
    intent.project_id,
    'upload_cancelled',
    'upload',
    intent.id,
    'Upload annulleret: ' || intent.original_file_name,
    'Upload-intent er lukket; eventuel Storage-oprydning afventer reconciliation',
    actor_id::text,
    'database_rpc',
    pg_catalog.jsonb_build_object('id', intent.id, 'status', status)
  );

  return next;
end
$$;

revoke all on function public.cancel_upload_intent(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_upload_intent(uuid)
  to authenticated;
