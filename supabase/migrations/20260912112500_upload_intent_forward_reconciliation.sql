-- Reconcile databases that recorded the upload-intent migrations before their
-- follow-up safety fixes were added to the historical files. This migration is
-- intentionally idempotent so the resulting lease schema and RPC definitions
-- converge whether the database started from the older or current versions.

alter table private.upload_intent_orphan_cleanup_leases
  add column if not exists lease_expires_at timestamptz;

-- Remove either historical constraint shape before backfilling. Old claims did
-- not persist their requested duration, so use the former 300-second default as
-- a conservative fixed expiry while preserving any valid stored expiry.
alter table private.upload_intent_orphan_cleanup_leases
  drop constraint if exists upload_intent_orphan_cleanup_claim_pair,
  drop constraint if exists upload_intent_orphan_cleanup_claim_state,
  drop constraint if exists upload_intent_orphan_cleanup_completed_unclaimed;

update private.upload_intent_orphan_cleanup_leases lease
set lease_expires_at = case
  when lease.completed_at is null
    and lease.claim_token is not null
    and lease.claimed_at is not null
  then case
    when lease.lease_expires_at is null
      or lease.lease_expires_at <= lease.claimed_at
    then lease.claimed_at + interval '300 seconds'
    else lease.lease_expires_at
  end
  else null
end;

alter table private.upload_intent_orphan_cleanup_leases
  add constraint upload_intent_orphan_cleanup_claim_state
    check (
      (
        claim_token is null
        and claimed_at is null
        and lease_expires_at is null
      )
      or (
        claim_token is not null
        and claimed_at is not null
        and lease_expires_at is not null
        and lease_expires_at > claimed_at
      )
    ),
  add constraint upload_intent_orphan_cleanup_completed_unclaimed
    check (
      completed_at is null
      or (
        claim_token is null
        and claimed_at is null
        and lease_expires_at is null
      )
    );

drop index if exists private.upload_intent_orphan_cleanup_available_idx;
create index upload_intent_orphan_cleanup_available_idx
  on private.upload_intent_orphan_cleanup_leases (lease_expires_at, upload_id)
  where completed_at is null;

-- PostgreSQL resolves PL/pgSQL RETURNS TABLE columns as variables. Naming the
-- primary-key constraint avoids SQLSTATE 42702 from an ambiguous upload_id in
-- the ON CONFLICT inference clause.
create or replace function public.claim_upload_intent_orphans(
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  upload_id uuid,
  storage_path text,
  claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := case
    when p_limit is null then 25
    when p_limit < 1 then 1
    when p_limit > 100 then 100
    else p_limit
  end;
  bounded_lease_seconds integer := case
    when p_lease_seconds is null then 300
    when p_lease_seconds < 30 then 30
    when p_lease_seconds > 3600 then 3600
    else p_lease_seconds
  end;
begin
  return query
  with candidates as materialized (
    select upload.id, upload.storage_path
    from public.uploads upload
    left join private.upload_intent_orphan_cleanup_leases lease
      on lease.upload_id = upload.id
    where upload.intent_request_id is not null
      and upload.received_at is null
      and (
        upload.status = 'archived'
        or (
          upload.status = 'draft'
          and upload.intent_expires_at is not null
          and upload.intent_expires_at <= pg_catalog.now()
        )
      )
      and (
        lease.upload_id is null
        or (
          lease.completed_at is null
          and (
            lease.lease_expires_at is null
            or lease.lease_expires_at <= pg_catalog.now()
          )
        )
      )
    order by upload.created_at, upload.id
    limit bounded_limit
    for update of upload skip locked
  ),
  claimed as (
    insert into private.upload_intent_orphan_cleanup_leases as lease (
      upload_id,
      claim_token,
      claimed_at,
      lease_expires_at,
      attempts,
      completed_at,
      last_error,
      updated_at
    )
    select
      candidate.id,
      pg_catalog.gen_random_uuid(),
      pg_catalog.now(),
      pg_catalog.now() + pg_catalog.make_interval(secs => bounded_lease_seconds),
      1,
      null,
      null,
      pg_catalog.now()
    from candidates candidate
    on conflict on constraint upload_intent_orphan_cleanup_leases_pkey do update
    set claim_token = excluded.claim_token,
        claimed_at = excluded.claimed_at,
        lease_expires_at = excluded.lease_expires_at,
        attempts = lease.attempts + 1,
        last_error = null,
        updated_at = pg_catalog.now()
    where lease.completed_at is null
      and (
        lease.lease_expires_at is null
        or lease.lease_expires_at <= pg_catalog.now()
      )
    returning lease.upload_id, lease.claim_token
  ),
  archived as (
    update public.uploads upload
    set status = 'archived',
        updated_at = pg_catalog.now()
    from claimed
    where upload.id = claimed.upload_id
      and upload.received_at is null
      and upload.intent_request_id is not null
      and upload.status in ('draft', 'archived')
    returning upload.id, upload.storage_path
  )
  select archived.id, archived.storage_path, claimed.claim_token
  from archived
  join claimed on claimed.upload_id = archived.id;
end
$$;

revoke all on function public.claim_upload_intent_orphans(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_upload_intent_orphans(integer, integer)
  to service_role;

-- Received evidence must never become readable solely because a backend moved
-- its status without recording successful receipt.
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
        )
    )
$$;

revoke all on function private.can_read_monitoring_object(text)
  from public, anon;
grant execute on function private.can_read_monitoring_object(text)
  to authenticated;

-- Cancellation is reserved for server-issued intents that have not completed
-- receipt; legacy drafts and finalized uploads remain untouched.
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
  from public, anon;
grant execute on function public.cancel_upload_intent(uuid)
  to authenticated;
