-- Task 17 / H08: canonical raw files and duplicate intake provenance only.
-- No flight, round, reviewer, georeferencing or report approval is invented.
-- Local candidate: fresh replay/pgTAP and hosted acceptance remain required.
alter table public.project_media
  add column storage_bucket text not null default 'project-media',
  add column original_role text,
  add column original_sha256 text,
  add column original_validation_sha256 text,
  add column source_upload_id uuid references public.uploads(id) on delete restrict,
  add column storage_object_id uuid references storage.objects(id) on delete restrict on update restrict,
  add column storage_object_version text,
  add column storage_object_updated_at timestamptz,
  add column original_validation_status text,
  add column promoted_at timestamptz,
  add column promoted_by uuid;
-- Actor UUIDs retain historical provenance if an actor account later changes;
-- like baseline.created_by, they deliberately have no auth.users deletion FK.
-- Current actor existence/rights are verified through FK-backed memberships.
alter table public.project_media add constraint project_media_original_shape check ((
  (storage_bucket = 'project-media' and original_role is null
    and original_sha256 is null and original_validation_sha256 is null
    and source_upload_id is null and storage_object_id is null
    and storage_object_version is null and storage_object_updated_at is null
    and original_validation_status is null and promoted_at is null and promoted_by is null)
  or (storage_bucket = 'monitoring-uploads' and original_role = 'drone_original'
    and original_sha256 ~ '^[0-9a-f]{64}$' and original_validation_sha256 ~ '^[0-9a-f]{64}$'
    and source_upload_id is not null and storage_object_id is not null
    and storage_object_updated_at is not null and promoted_at is not null and promoted_by is not null
    and original_validation_status in ('raw_original_validated','review_required')
    and category = 'drone_image' and source = 'drone' and mime_type = 'image/jpeg'
    and file_size_bytes between 1 and 33554432 and url = '' and thumbnail_url is null
    and not is_report_ready and status = 'uploaded')
) is true);
create unique index project_media_original_identity
  on public.project_media(project_id, original_sha256, original_role)
  where original_role is not null;
create index project_media_source_upload on public.project_media(source_upload_id)
  where source_upload_id is not null;
create index project_media_storage_object on public.project_media(storage_object_id)
  where storage_object_id is not null;

-- Table-wide grants would make every additive server field writable. Preserve
-- existing legacy column writes explicitly; do not grant the new server fields.
revoke insert, update on public.project_media from authenticated, anon;
do $$
declare legacy_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into legacy_columns
  from pg_catalog.pg_attribute
  where attrelid = 'public.project_media'::regclass and attnum > 0 and not attisdropped
    and attname not in ('storage_bucket','original_role','original_sha256','original_validation_sha256',
      'source_upload_id','storage_object_id','storage_object_version','storage_object_updated_at',
      'original_validation_status','promoted_at','promoted_by');
  execute format('grant insert (%s), update (%s) on public.project_media to authenticated', legacy_columns, legacy_columns);
end $$;
revoke insert (storage_bucket,original_role,original_sha256,original_validation_sha256,source_upload_id,
  storage_object_id,storage_object_version,storage_object_updated_at,original_validation_status,promoted_at,promoted_by),
  update (storage_bucket,original_role,original_sha256,original_validation_sha256,source_upload_id,
  storage_object_id,storage_object_version,storage_object_updated_at,original_validation_status,promoted_at,promoted_by)
  on public.project_media from authenticated, anon;
grant select, insert, update on public.project_media to service_role;

create table public.project_media_upload_origins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  media_id uuid not null references public.project_media(id) on delete restrict,
  upload_id uuid not null unique references public.uploads(id) on delete restrict,
  original_role text not null check (original_role = 'drone_original'),
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  original_validation_sha256 text not null check (original_validation_sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null check (storage_bucket = 'monitoring-uploads'),
  storage_path text not null,
  object_id uuid not null references storage.objects(id) on delete restrict on update restrict,
  object_version text,
  object_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null
);
create index project_media_upload_origins_media on public.project_media_upload_origins(media_id);
create index project_media_upload_origins_project on public.project_media_upload_origins(project_id);
create index project_media_upload_origins_storage on public.project_media_upload_origins(storage_bucket,storage_path);
create index project_media_upload_origins_object on public.project_media_upload_origins(object_id);

-- Separate immutable receipts remember every request ID, including a fresh
-- request for an already-promoted upload. The physical origin remains unique.
create table public.project_media_promotion_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  created_by uuid not null,
  request_id uuid not null,
  upload_id uuid not null references public.uploads(id) on delete restrict,
  media_id uuid not null references public.project_media(id) on delete restrict,
  origin_id uuid not null references public.project_media_upload_origins(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(project_id,created_by,request_id)
);
create index project_media_promotion_requests_media on public.project_media_promotion_requests(media_id);
create index project_media_promotion_requests_upload on public.project_media_promotion_requests(upload_id);
alter table public.project_media_upload_origins enable row level security;
alter table public.project_media_promotion_requests enable row level security;
revoke all on public.project_media_upload_origins,public.project_media_promotion_requests from public,anon,authenticated,service_role;
grant select on public.project_media_upload_origins,public.project_media_promotion_requests to authenticated;
-- UPDATE is needed for FOR SHARE locks; immutable triggers reject mutations.
grant select,insert,update on public.project_media_upload_origins,public.project_media_promotion_requests to service_role;
create policy project_media_origin_read on public.project_media_upload_origins
  for select to authenticated using (private.can_read_project(project_id));
create policy project_media_promotion_request_read on public.project_media_promotion_requests
  for select to authenticated using (private.can_read_project(project_id));

create function private.require_project_media_promotion_graph()
returns trigger language plpgsql set search_path = '' as $$
declare media_row public.project_media%rowtype; upload_row public.uploads%rowtype;
  origin_row public.project_media_upload_origins%rowtype;
begin
  select * into media_row from public.project_media where id = new.media_id;
  select * into upload_row from public.uploads where id = new.upload_id;
  if media_row.id is null or upload_row.id is null
    or media_row.project_id is distinct from new.project_id or upload_row.project_id is distinct from new.project_id
    or media_row.original_role is distinct from 'drone_original'
    or media_row.original_sha256 is distinct from upload_row.original_sha256 then
    raise exception 'Promotion graph crosses project or original identity' using errcode = '23514';
  end if;
  if tg_table_name = 'project_media_upload_origins' then
    if new.original_sha256 is distinct from upload_row.original_sha256
      or new.original_validation_sha256 is distinct from upload_row.original_validation_sha256
      or new.storage_bucket is distinct from 'monitoring-uploads' or new.storage_path is distinct from upload_row.storage_path
      or new.object_id::text is distinct from upload_row.original_validation #>> '{original,object,id}'
      or new.object_version is distinct from upload_row.original_validation #>> '{original,object,version}'
      or new.object_updated_at is distinct from (upload_row.original_validation #>> '{original,object,updated_at}')::timestamptz then
      raise exception 'Promotion origin does not match validated upload' using errcode = '23514';
    end if;
  else
    select * into origin_row from public.project_media_upload_origins where id = new.origin_id;
    if origin_row.id is null or origin_row.project_id is distinct from new.project_id
      or origin_row.media_id is distinct from new.media_id or origin_row.upload_id is distinct from new.upload_id then
      raise exception 'Promotion receipt does not match its origin' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.require_project_media_promotion_graph() from public,anon,authenticated;
create trigger project_media_upload_origin_graph before insert on public.project_media_upload_origins
  for each row execute function private.require_project_media_promotion_graph();
create trigger project_media_promotion_request_graph before insert on public.project_media_promotion_requests
  for each row execute function private.require_project_media_promotion_graph();

create function private.require_project_media_storage_reference()
returns trigger language plpgsql set search_path = '' as $$
declare upload_row public.uploads%rowtype;
begin
  if tg_op = 'UPDATE' then
    if old.original_role is not null and to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'Canonical drone media is immutable' using errcode = '23514';
    end if;
    if new.file_path is distinct from old.file_path or new.storage_bucket is distinct from old.storage_bucket
      or new.original_role is distinct from old.original_role or new.source_upload_id is distinct from old.source_upload_id
      or new.original_sha256 is distinct from old.original_sha256
      or new.original_validation_sha256 is distinct from old.original_validation_sha256
      or new.storage_object_id is distinct from old.storage_object_id
      or new.storage_object_version is distinct from old.storage_object_version
      or new.storage_object_updated_at is distinct from old.storage_object_updated_at
      or new.original_validation_status is distinct from old.original_validation_status
      or new.promoted_at is distinct from old.promoted_at or new.promoted_by is distinct from old.promoted_by then
      raise exception 'Media storage provenance is immutable' using errcode = '23514';
    end if;
  end if;
  if new.storage_bucket = 'project-media' then
    if new.project_id is null or private.storage_project_id(new.file_path) is distinct from new.project_id
      or not private.storage_path_matches_project(new.file_path) then
      raise exception 'file_path does not belong to row project_id' using errcode = '23514';
    end if;
    return new;
  end if;
  select * into upload_row from public.uploads where id = new.source_upload_id;
  if not found or new.project_id is distinct from upload_row.project_id
    or new.storage_bucket <> 'monitoring-uploads' or new.original_role is distinct from 'drone_original'
    or new.file_path is distinct from upload_row.storage_path or new.original_sha256 is distinct from upload_row.original_sha256
    or new.original_validation_sha256 is distinct from upload_row.original_validation_sha256
    or new.original_validation_status is distinct from upload_row.original_validation ->> 'status'
    or new.original_validation_status not in ('raw_original_validated','review_required')
    or new.storage_object_id::text is distinct from upload_row.original_validation #>> '{original,object,id}'
    or new.storage_object_version is distinct from upload_row.original_validation #>> '{original,object,version}'
    or new.storage_object_updated_at is distinct from (upload_row.original_validation #>> '{original,object,updated_at}')::timestamptz
    or new.file_size_bytes is distinct from upload_row.file_size or new.mime_type is distinct from upload_row.mime_type then
    raise exception 'Canonical media does not match its validated original' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.require_project_media_storage_reference() from public,anon,authenticated;
drop trigger project_media_storage_reference on public.project_media;
create trigger project_media_storage_reference before insert or update on public.project_media
  for each row execute function private.require_project_media_storage_reference();

create function private.reject_project_media_promotion_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Trigger records have different row types. Keep the media-only field in a
  -- separate statement; SQL expression planning resolves fields before OR
  -- short-circuiting and request receipts do not have original_role.
  if tg_table_name <> 'project_media' then
    raise exception 'Canonical media promotion provenance is immutable' using errcode = '23514';
  end if;
  if old.original_role is not null then
    raise exception 'Canonical media promotion provenance is immutable' using errcode = '23514';
  end if;
  return old;
end $$;
revoke all on function private.reject_project_media_promotion_mutation() from public,anon,authenticated;
create trigger project_media_canonical_delete before delete on public.project_media
  for each row execute function private.reject_project_media_promotion_mutation();
create trigger project_media_upload_origins_immutable before update or delete on public.project_media_upload_origins
  for each row execute function private.reject_project_media_promotion_mutation();
create trigger project_media_promotion_requests_immutable before update or delete on public.project_media_promotion_requests
  for each row execute function private.reject_project_media_promotion_mutation();

-- Narrow private lookup required by Storage RLS regardless of the caller's
-- project. It returns only whether a path is pinned, never another tenant's row.
create function private.is_promoted_drone_storage_reference(_bucket text,_path text,_object_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required for original storage policy' using errcode = '42501';
  end if;
  -- Policies call this only for writes. Lock the existing candidate before the
  -- origin lookup, ordering Storage writes against H08's FOR SHARE lock. A
  -- pin committed while this lock waited is visible to the following query.
  -- The lookup does not acquire a project lock or mutate vendor metadata.
  perform 1 from storage.objects object where object.id = _object_id for update;
  return exists (
    select 1 from public.project_media_upload_origins origin
    where origin.object_id = _object_id
      or (_bucket = 'monitoring-uploads' and origin.storage_bucket = _bucket and origin.storage_path = _path)
  );
end
$$;
revoke all on function private.is_promoted_drone_storage_reference(text,text,uuid) from public,anon;
grant execute on function private.is_promoted_drone_storage_reference(text,text,uuid) to authenticated,service_role;
-- Restrictive rules AND with every present/future ordinary-user allow rule.
-- VOLATILE lookup sees current committed pins at UPDATE WITH CHECK, rather
-- than freezing all policy lookups at a statement's initial snapshot. Exact
-- object RESTRICT FKs also guard DELETE that started before promotion committed.
-- WITH CHECK includes the immutable object ID: renaming to an unpinned path or
-- bucket cannot evade a pin committed while UPDATE waited for the object lock.
-- Service/admin maintenance bypasses RLS and remains a separate privileged
-- process outside app access. Promotion never changes Storage bytes/metadata.
create policy promoted_drone_original_no_delete on storage.objects as restrictive
  for delete to authenticated using (not private.is_promoted_drone_storage_reference(bucket_id,name,id));
create policy promoted_drone_original_no_update on storage.objects as restrictive
  for update to authenticated using (not private.is_promoted_drone_storage_reference(bucket_id,name,id))
  with check (not private.is_promoted_drone_storage_reference(bucket_id,name,id));
create policy promoted_drone_original_no_insert on storage.objects as restrictive
  for insert to authenticated with check (not private.is_promoted_drone_storage_reference(bucket_id,name,id));

create function public.persist_drone_original_promotion(
  p_project_id uuid,p_upload_id uuid,p_actor_id uuid,p_request_id uuid,
  p_original_sha256 text,p_validation_sha256 text,p_object_id uuid,
  p_object_version text,p_object_updated_at timestamptz
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare prepared jsonb; primary_prepared jsonb; upload_row public.uploads%rowtype; media_row public.project_media%rowtype;
  origin_row public.project_media_upload_origins%rowtype;
  request_row public.project_media_promotion_requests%rowtype;
begin
  if p_request_id is null then raise exception 'Promotion request id required' using errcode = '22023'; end if;
  -- Lock before H08 takes its shared project lock. Concurrent promotions must
  -- not each hold SHARE then deadlock while upgrading to UPDATE.
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  -- Existing H08 prepare rechecks current contribution and project memberships,
  -- finalized intent and exact current Storage row under shared/row locks.
  prepared := public.prepare_drone_original_validation(p_project_id,p_upload_id,p_actor_id);
  select * into upload_row from public.uploads where id = p_upload_id;
  if prepared -> 'existing' is null or prepared -> 'existing' = 'null'::jsonb
    or upload_row.original_validation ->> 'status' not in ('raw_original_validated','review_required')
    or upload_row.original_validation ->> 'status' is null
    or upload_row.status = 'rejected'
    or upload_row.original_sha256 is distinct from p_original_sha256
    or upload_row.original_validation_sha256 is distinct from p_validation_sha256
    or p_original_sha256 is null or p_original_sha256 !~ '^[0-9a-f]{64}$'
    or p_validation_sha256 is null or p_validation_sha256 !~ '^[0-9a-f]{64}$'
    or (prepared #>> '{object,id}')::uuid is distinct from p_object_id
    or prepared #>> '{object,version}' is distinct from p_object_version
    or (prepared #>> '{object,updated_at}')::timestamptz is distinct from p_object_updated_at
    or upload_row.original_validation #> '{original,object}' is distinct from prepared -> 'object'
    or upload_row.original_validation #>> '{original,sha256}' is distinct from upload_row.original_sha256
    or upload_row.original_validation -> 'pixelDecoded' is distinct from 'false'::jsonb
    or upload_row.original_validation -> 'georeferenced' is distinct from 'false'::jsonb
    or upload_row.original_validation -> 'reportEligible' is distinct from 'false'::jsonb then
    raise exception 'Original is unvalidated, rejected or changed before promotion' using errcode = '23514';
  end if;
  -- One project lock serializes hash dedup and request collisions. A UUID/hash
  -- in another project never resolves this project's canonical media.
  select * into request_row from public.project_media_promotion_requests
    where project_id = p_project_id and created_by = p_actor_id and request_id = p_request_id for share;
  if found and request_row.upload_id is distinct from p_upload_id then
    raise exception 'Promotion request already belongs to another upload' using errcode = '23514';
  end if;
  select * into origin_row from public.project_media_upload_origins where upload_id = p_upload_id for share;
  if found then
    if origin_row.project_id is distinct from p_project_id or origin_row.original_sha256 is distinct from p_original_sha256
      or origin_row.original_validation_sha256 is distinct from p_validation_sha256
      or origin_row.storage_path is distinct from upload_row.storage_path
      or origin_row.object_id is distinct from p_object_id or origin_row.object_version is distinct from p_object_version
      or origin_row.object_updated_at is distinct from p_object_updated_at then
      raise exception 'Promoted origin binding changed' using errcode = '23514';
    end if;
    select * into strict media_row from public.project_media where id = origin_row.media_id for share;
  else
    select * into media_row from public.project_media
      where project_id = p_project_id and original_sha256 = p_original_sha256 and original_role = 'drone_original' for share;
    if not found then
      insert into public.project_media(project_id,title,description,category,source,file_path,url,
        uploaded_at,status,is_report_ready,file_size_bytes,mime_type,storage_bucket,original_role,
        original_sha256,original_validation_sha256,source_upload_id,storage_object_id,storage_object_version,
        storage_object_updated_at,original_validation_status,promoted_at,promoted_by)
      values(p_project_id,upload_row.original_file_name,'Kanonisk råoriginal; ingen georeferering eller faglig godkendelse.',
        'drone_image','drone',upload_row.storage_path,'',upload_row.received_at,'uploaded',false,
        upload_row.file_size,'image/jpeg','monitoring-uploads','drone_original',p_original_sha256,p_validation_sha256,
        p_upload_id,p_object_id,p_object_version,p_object_updated_at,upload_row.original_validation ->> 'status',now(),p_actor_id)
      returning * into media_row;
    end if;
    insert into public.project_media_upload_origins(project_id,media_id,upload_id,original_role,
      original_sha256,original_validation_sha256,storage_bucket,storage_path,object_id,object_version,object_updated_at,created_by)
    values(p_project_id,media_row.id,p_upload_id,'drone_original',p_original_sha256,p_validation_sha256,
      'monitoring-uploads',upload_row.storage_path,p_object_id,p_object_version,p_object_updated_at,p_actor_id)
    returning * into origin_row;
  end if;
  if media_row.project_id is distinct from p_project_id or media_row.original_sha256 is distinct from p_original_sha256
    or media_row.original_role is distinct from 'drone_original' or media_row.is_report_ready then
    raise exception 'Canonical media identity does not match this promotion' using errcode = '23514';
  end if;
  -- Dedup never swaps an unavailable primary object for a newer duplicate.
  -- Privileged maintenance can bypass Storage RLS; the saved pin must still
  -- match the current primary original before a retry/new origin is accepted.
  primary_prepared := public.prepare_drone_original_validation(p_project_id,media_row.source_upload_id,p_actor_id);
  if (primary_prepared #>> '{object,id}')::uuid is distinct from media_row.storage_object_id
    or primary_prepared #>> '{object,version}' is distinct from media_row.storage_object_version
    or (primary_prepared #>> '{object,updated_at}')::timestamptz is distinct from media_row.storage_object_updated_at
    or primary_prepared #>> '{upload,original_sha256}' is distinct from media_row.original_sha256
    or primary_prepared #>> '{upload,original_validation_sha256}' is distinct from media_row.original_validation_sha256 then
    raise exception 'Canonical primary original changed or is unavailable' using errcode = '23514';
  end if;
  if request_row.id is null then
    insert into public.project_media_promotion_requests(project_id,created_by,request_id,upload_id,media_id,origin_id)
    values(p_project_id,p_actor_id,p_request_id,p_upload_id,media_row.id,origin_row.id) returning * into request_row;
    insert into public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
    values(p_project_id,'drone_original_promoted','project_media',media_row.id,'Råoriginal tilknyttet kanonisk medieregister',
      p_actor_id::text,'server_validation',jsonb_build_object('media_id',media_row.id,'upload_id',p_upload_id,
      'origin_id',origin_row.id,'sha256',p_original_sha256,'report_eligible',false));
  elsif request_row.media_id is distinct from media_row.id or request_row.origin_id is distinct from origin_row.id then
    raise exception 'Promotion receipt does not match its origin' using errcode = '23514';
  end if;
  return jsonb_build_object('media',to_jsonb(media_row),'origin',to_jsonb(origin_row),'request',to_jsonb(request_row),
    'deduplicated',media_row.source_upload_id <> p_upload_id);
end $$;
revoke all on function public.persist_drone_original_promotion(uuid,uuid,uuid,uuid,text,text,uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.persist_drone_original_promotion(uuid,uuid,uuid,uuid,text,text,uuid,text,timestamptz) to service_role;

-- A viewer may read a pinned original without gaining contribution rights.
-- Storage's public Info endpoint reports last_modified, not the exact database
-- updated_at pin. This service-only read performs that precise lookup after
-- the application has authorized a caller-bound media row; it never signs URLs
-- or mutates metadata. Current membership and object bindings are rechecked.
create function public.prepare_project_media_original_read(p_project_id uuid,p_media_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare project_row public.projects%rowtype; media_row public.project_media%rowtype;
  upload_row public.uploads%rowtype; object_row storage.objects%rowtype;
begin
  if p_actor_id is null then raise exception 'Verified actor required' using errcode = '42501'; end if;
  select * into project_row from public.projects where id = p_project_id for share;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  perform 1 from public.organization_memberships where organization_id = project_row.organization_id and user_id = p_actor_id for share;
  perform 1 from public.project_members where project_id = p_project_id and user_id = p_actor_id for share;
  if not (
    exists (select 1 from public.organization_memberships where organization_id = project_row.organization_id and user_id = p_actor_id and role in ('owner','admin'))
    or (exists (select 1 from public.organization_memberships where organization_id = project_row.organization_id and user_id = p_actor_id)
      and exists (select 1 from public.project_members where project_id = p_project_id and user_id = p_actor_id and role in ('admin','project_manager','editor','field','viewer')))
  ) then raise exception 'Project read access denied' using errcode = '42501'; end if;
  select * into media_row from public.project_media where id = p_media_id and project_id = p_project_id for share;
  if not found or media_row.storage_bucket <> 'monitoring-uploads' or media_row.original_role is distinct from 'drone_original'
    or media_row.source_upload_id is null or media_row.is_report_ready then
    raise exception 'Not a canonical raw original media reference' using errcode = '23514';
  end if;
  select * into upload_row from public.uploads where id = media_row.source_upload_id and project_id = p_project_id for share;
  if not found or upload_row.received_at is null or upload_row.intent_request_id is null
    or upload_row.status in ('draft','archived','rejected')
    or upload_row.original_validation ->> 'status' not in ('raw_original_validated','review_required')
    or upload_row.original_validation ->> 'status' is null
    or upload_row.storage_path is distinct from media_row.file_path
    or upload_row.original_sha256 is distinct from media_row.original_sha256
    or upload_row.original_validation_sha256 is distinct from media_row.original_validation_sha256
    or upload_row.file_size is distinct from media_row.file_size_bytes or upload_row.mime_type is distinct from 'image/jpeg' then
    raise exception 'Canonical primary original changed or is unavailable' using errcode = '23514';
  end if;
  begin
    select * into strict object_row from storage.objects object
      where object.bucket_id = 'monitoring-uploads' and object.name = media_row.file_path
        and to_jsonb(object) ->> 'archived_at' is null
        and not coalesce((to_jsonb(object) ->> 'is_delete_marker')::boolean,false) for share;
  exception when no_data_found or too_many_rows then
    raise exception 'Canonical primary original changed or is unavailable' using errcode = '23514';
  end;
  if object_row.id is distinct from media_row.storage_object_id
    or to_jsonb(object_row) ->> 'version' is distinct from media_row.storage_object_version
    or object_row.updated_at is distinct from media_row.storage_object_updated_at
    or object_row.owner_id is distinct from upload_row.uploaded_by::text
    or object_row.metadata ->> 'size' is null or object_row.metadata ->> 'size' !~ '^[0-9]+$'
    or (object_row.metadata ->> 'size')::bigint is distinct from media_row.file_size_bytes
    or lower(object_row.metadata ->> 'mimetype') is distinct from 'image/jpeg' then
    raise exception 'Canonical primary original changed or is unavailable' using errcode = '23514';
  end if;
  return jsonb_build_object('media',to_jsonb(media_row),'upload',to_jsonb(upload_row),
    'object',jsonb_build_object('id',object_row.id,'version',to_jsonb(object_row) ->> 'version',
    'updated_at',object_row.updated_at,'owner_id',object_row.owner_id,'size',media_row.file_size_bytes,'mimetype','image/jpeg'));
end $$;
revoke all on function public.prepare_project_media_original_read(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_project_media_original_read(uuid,uuid,uuid) to service_role;
