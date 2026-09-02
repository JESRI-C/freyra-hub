-- Bind every new monitoring object to one short-lived, server-issued upload
-- intent before the browser starts a resumable TUS transfer. Existing upload
-- rows remain readable, but direct client INSERT can no longer mint an intent.

alter table public.uploads
  add column if not exists intent_expires_at timestamptz,
  add column if not exists intent_request_id uuid,
  add column if not exists received_at timestamptz;

update public.uploads
set received_at = coalesce(updated_at, created_at)
where received_at is null
  and status not in ('draft', 'archived');

-- Legacy clients wrote the object before the metadata row and left the default
-- status as draft. Preserve project-reader access only when an exact historical
-- object actually exists; new intent drafts remain uploader-only.
update public.uploads upload
set received_at = coalesce(upload.updated_at, upload.created_at)
where upload.received_at is null
  and upload.intent_request_id is null
  and upload.status = 'draft'
  and exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'monitoring-uploads'
      and object.name = upload.storage_path
  );

revoke insert on table public.uploads from authenticated;
revoke insert (
  organization_id,
  project_id,
  zone_id,
  uploaded_by,
  file_name,
  original_file_name,
  mime_type,
  file_size,
  storage_path,
  upload_type,
  user_metadata
) on table public.uploads from authenticated;

create index if not exists uploads_pending_intent_idx
  on public.uploads (uploaded_by, intent_expires_at)
  where status = 'draft' and intent_expires_at is not null;

create unique index if not exists uploads_intent_request_id_uidx
  on public.uploads (uploaded_by, intent_request_id)
  where intent_request_id is not null;

-- Zone provenance cannot be detached from an accepted original. Make the FK
-- behavior explicit: zones with referenced upload evidence must be archived,
-- not physically deleted and silently nulled.
alter table public.uploads
  drop constraint if exists uploads_zone_id_fkey;
alter table public.uploads
  add constraint uploads_zone_id_fkey
  foreign key (zone_id) references public.monitoring_zones(id) on delete restrict;

create or replace function private.audit_upload_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_event_type text := case
    when new.intent_request_id is not null then 'upload_intent_created'
    else 'upload_created'
  end;
  audit_title text := case
    when new.intent_request_id is not null then 'Upload-intent oprettet: '
    else 'Fil uploadet: '
  end;
begin
  insert into public.audit_events (
    project_id, event_type, entity_type, entity_id, title, description,
    actor, source, after_data
  ) values (
    new.project_id,
    audit_event_type,
    'upload',
    new.id,
    audit_title || new.original_file_name,
    new.upload_type || ' · ' || pg_catalog.round(new.file_size::numeric / 1024) || ' KB',
    auth.uid()::text,
    'database_trigger',
    pg_catalog.jsonb_build_object(
      'id', new.id,
      'upload_type', new.upload_type,
      'mime_type', new.mime_type,
      'file_size', new.file_size,
      'storage_path', new.storage_path,
      'status', new.status
    )
  );
  return new;
end
$$;

revoke all on function private.audit_upload_created()
  from public, anon, authenticated;

create or replace function public.create_upload_intent(
  p_project_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_client_request_id uuid,
  p_zone_id uuid default null,
  p_upload_type text default 'drone_photo',
  p_user_metadata jsonb default '{}'::jsonb
)
returns table (
  upload_id uuid,
  storage_path text,
  intent_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  intent_id uuid := pg_catalog.gen_random_uuid();
  project_organization_id uuid;
  existing_intent public.uploads%rowtype;
  safe_file_name text;
  expires_at timestamptz := pg_catalog.now() + interval '24 hours';
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_client_request_id is null then
    raise exception 'Client request id is required' using errcode = '22023';
  end if;

  if p_project_id is null or not private.can_contribute_project(p_project_id) then
    raise exception 'Project contribution denied' using errcode = '42501';
  end if;

  select project.organization_id
    into project_organization_id
  from public.projects project
  where project.id = p_project_id;

  if project_organization_id is null then
    raise exception 'Project not found or missing organization' using errcode = '23503';
  end if;

  if p_zone_id is not null and not exists (
    select 1
    from public.monitoring_zones zone
    where zone.id = p_zone_id
      and zone.project_id = p_project_id
  ) then
    raise exception 'Monitoring zone does not belong to project' using errcode = '23514';
  end if;

  if p_original_file_name is null
     or pg_catalog.length(pg_catalog.btrim(p_original_file_name)) = 0
     or pg_catalog.length(p_original_file_name) > 255 then
    raise exception 'Invalid original file name' using errcode = '22023';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 209715200 then
    raise exception 'File size must be between 1 byte and 200 MiB' using errcode = '22023';
  end if;

  if p_mime_type is null or not (
    p_mime_type like 'image/%'
    or p_mime_type like 'video/%'
    or p_mime_type like 'audio/%'
    or p_mime_type in (
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
    )
  ) then
    raise exception 'Unsupported MIME type' using errcode = '22023';
  end if;

  if p_upload_type is null or p_upload_type not in (
    'image', 'video', 'audio', 'csv', 'excel', 'geojson', 'kml', 'gpx',
    'pdf', 'document', 'archive', 'drone_photo', 'drone_video',
    'orthophoto', 'sensor_data', 'field_observation',
    'species_observation', 'map_layer', 'other'
  ) then
    raise exception 'Unsupported upload type' using errcode = '22023';
  end if;

  if p_user_metadata is null
     or pg_catalog.jsonb_typeof(p_user_metadata) <> 'object'
     or pg_catalog.pg_column_size(p_user_metadata) > 1048576 then
    raise exception 'User metadata must be an object no larger than 1 MiB' using errcode = '22023';
  end if;

  -- A browser retry uses the same opaque request id. The database serializes
  -- the request and returns the already-issued server path after a lost RPC
  -- response instead of creating an orphaned second intent.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_client_request_id::text, 0)
  );
  select upload.*
    into existing_intent
  from public.uploads upload
  where upload.uploaded_by = actor_id
    and upload.intent_request_id = p_client_request_id;

  if found then
    if existing_intent.project_id is distinct from p_project_id
       or existing_intent.zone_id is distinct from p_zone_id
       or existing_intent.original_file_name is distinct from p_original_file_name
       or pg_catalog.lower(existing_intent.mime_type) is distinct from pg_catalog.lower(p_mime_type)
       or existing_intent.file_size is distinct from p_file_size
       or existing_intent.upload_type is distinct from p_upload_type
       or existing_intent.user_metadata is distinct from p_user_metadata then
      raise exception 'Upload request id was reused with different content' using errcode = '23514';
    end if;
    if existing_intent.status <> 'draft' and existing_intent.received_at is null then
      raise exception 'Upload request is no longer resumable' using errcode = '55000';
    end if;

    upload_id := existing_intent.id;
    storage_path := existing_intent.storage_path;
    intent_expires_at := existing_intent.intent_expires_at;
    return next;
    return;
  end if;

  -- Serialize quota checks across different request ids for the same actor and
  -- project. This is a safety ceiling, not the UX batch limit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_project_id::text || ':upload-quota', 0)
  );
  if (
    select pg_catalog.count(*) >= 250
    from public.uploads upload
    where upload.uploaded_by = actor_id
      and upload.project_id = p_project_id
      and upload.status = 'draft'
      and upload.intent_expires_at > pg_catalog.now()
  ) then
    raise exception 'Too many active upload intents' using errcode = '54000';
  end if;
  if (
    select pg_catalog.count(*) >= 500
    from public.uploads upload
    where upload.uploaded_by = actor_id
      and upload.project_id = p_project_id
      and upload.intent_request_id is not null
      and upload.created_at > pg_catalog.now() - interval '1 hour'
  ) then
    raise exception 'Upload intent rate limit exceeded' using errcode = '54000';
  end if;

  safe_file_name := pg_catalog.left(
    pg_catalog.regexp_replace(p_original_file_name, '[^a-zA-Z0-9._-]', '_', 'g'),
    180
  );
  if safe_file_name = '' then
    safe_file_name := 'upload.bin';
  end if;

  storage_path := actor_id::text || '/intents/' || intent_id::text || '/' || safe_file_name;
  upload_id := intent_id;
  intent_expires_at := expires_at;

  insert into public.uploads (
    id,
    organization_id,
    project_id,
    zone_id,
    uploaded_by,
    file_name,
    original_file_name,
    mime_type,
    file_size,
    storage_path,
    upload_type,
    status,
    user_metadata,
    intent_expires_at,
    intent_request_id
  ) values (
    intent_id,
    project_organization_id,
    p_project_id,
    p_zone_id,
    actor_id,
    safe_file_name,
    p_original_file_name,
    p_mime_type,
    p_file_size,
    storage_path,
    p_upload_type,
    'draft',
    p_user_metadata,
    expires_at,
    p_client_request_id
  );

  return next;
end
$$;

revoke all on function public.create_upload_intent(uuid, text, text, bigint, uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.create_upload_intent(uuid, text, text, bigint, uuid, uuid, text, jsonb)
  to authenticated;

create or replace function private.reject_upload_intent_scope_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.intent_request_id is not null and (
    new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.zone_id is distinct from old.zone_id
    or new.intent_request_id is distinct from old.intent_request_id
    or new.intent_expires_at is distinct from old.intent_expires_at
  ) then
    raise exception 'upload intent scope is immutable' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke all on function private.reject_upload_intent_scope_change()
  from public, anon, authenticated;

drop trigger if exists upload_intent_scope_immutable on public.uploads;
create trigger upload_intent_scope_immutable
  before update of organization_id, project_id, zone_id, intent_request_id, intent_expires_at
  on public.uploads
  for each row execute function private.reject_upload_intent_scope_change();

-- Draft bytes are visible only to their uploader. Project readers only gain
-- Storage read access after the trusted finalize transition, and archived
-- objects are never exposed through the bucket policy.
create or replace function private.can_read_monitoring_object(_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      select pg_catalog.count(*) = 1
      from public.uploads upload
      where upload.storage_path = _object_name
        and pg_catalog.split_part(upload.storage_path, '/', 1) = upload.uploaded_by::text
        and (
          (
            upload.status = 'draft'
            and upload.intent_request_id is not null
            and upload.uploaded_by = auth.uid()
            and upload.intent_expires_at > pg_catalog.now()
            and upload.project_id is not null
            and private.can_contribute_project(upload.project_id)
          )
          or (
            upload.status = 'draft'
            and upload.intent_request_id is null
            and upload.received_at is not null
            and (
              (upload.project_id is not null and private.can_read_project(upload.project_id))
              or (
                upload.project_id is null
                and upload.organization_id is not null
                and private.can_read_organization(upload.organization_id)
              )
              or (
                upload.project_id is null
                and upload.organization_id is null
                and upload.uploaded_by = auth.uid()
              )
            )
          )
          or (
            upload.status not in ('draft', 'archived')
            and (
              (upload.project_id is not null and private.can_read_project(upload.project_id))
              or (
                upload.project_id is null
                and upload.organization_id is not null
                and private.can_read_organization(upload.organization_id)
              )
              or (
                upload.project_id is null
                and upload.organization_id is null
                and upload.uploaded_by = auth.uid()
              )
            )
          )
        )
    )
$$;

revoke all on function private.can_read_monitoring_object(text)
  from public, anon;
grant execute on function private.can_read_monitoring_object(text)
  to authenticated;

create or replace function private.can_write_monitoring_object(_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      select pg_catalog.count(*) = 1
      from public.uploads upload
      where upload.storage_path = _object_name
        and upload.uploaded_by = auth.uid()
        and pg_catalog.split_part(upload.storage_path, '/', 1) = auth.uid()::text
        and upload.project_id is not null
        and upload.status = 'draft'
        and upload.intent_expires_at is not null
        and upload.intent_expires_at > pg_catalog.now()
        and private.can_contribute_project(upload.project_id)
    )
$$;

revoke all on function private.can_write_monitoring_object(text)
  from public, anon;
grant execute on function private.can_write_monitoring_object(text)
  to authenticated;

drop policy if exists monitoring_uploads_insert on storage.objects;
create policy monitoring_uploads_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'monitoring-uploads'
    and private.can_write_monitoring_object(name)
  );

-- The browser cannot mark an upload as received. This RPC verifies that the
-- immutable object exists with the expected owner, size and MIME type before
-- moving the row to the backend-validation queue.
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
  if not private.can_contribute_project(intent.project_id) then
    raise exception 'Project contribution denied' using errcode = '42501';
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
      received_at = pg_catalog.coalesce(upload.received_at, pg_catalog.now()),
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

revoke all on function public.finalize_upload_intent(uuid) from public, anon;
grant execute on function public.finalize_upload_intent(uuid) to authenticated;

-- Cancelling is a state transition, never a direct write to storage.objects.
-- A separate trusted reconciliation job owns eventual object cleanup.
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
  if intent.status <> 'draft' then
    raise exception 'Only pending upload intents can be cancelled' using errcode = '55000';
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

revoke all on function public.cancel_upload_intent(uuid) from public, anon;
grant execute on function public.cancel_upload_intent(uuid) to authenticated;
