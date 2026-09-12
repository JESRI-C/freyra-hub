-- PostgreSQL resolves PL/pgSQL RETURNS TABLE columns as variables. Referencing
-- upload_id without qualification in an ON CONFLICT inference clause therefore
-- collides with the function's upload_id output variable (SQLSTATE 42702).
-- Name the existing primary-key constraint explicitly so repeated deployments
-- replace only the affected RPC and preserve its established privileges.

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
