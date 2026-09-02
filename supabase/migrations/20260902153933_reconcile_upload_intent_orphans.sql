-- Reconcile Storage objects that can be left behind when an upload intent is
-- cancelled or expires before trusted finalization. PostgreSQL only claims
-- exact immutable paths; the server removes bytes through the Storage API and
-- then acknowledges the claim. No SQL in this migration mutates
-- storage.objects directly.

create table if not exists private.upload_intent_orphan_cleanup_leases (
  upload_id uuid primary key
    references public.uploads(id) on delete restrict,
  claim_token uuid,
  claimed_at timestamptz,
  attempts integer not null default 0,
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint upload_intent_orphan_cleanup_attempts_nonnegative
    check (attempts >= 0),
  constraint upload_intent_orphan_cleanup_claim_pair
    check ((claim_token is null) = (claimed_at is null)),
  constraint upload_intent_orphan_cleanup_completed_unclaimed
    check (
      completed_at is null
      or (claim_token is null and claimed_at is null)
    ),
  constraint upload_intent_orphan_cleanup_error_length
    check (last_error is null or pg_catalog.length(last_error) <= 1000)
);

alter table private.upload_intent_orphan_cleanup_leases
  enable row level security;

revoke all on table private.upload_intent_orphan_cleanup_leases
  from public, anon, authenticated, service_role;

-- Intent rows are the durable audit/provenance record. Cancellation archives
-- them and reconciliation removes only their Storage bytes. A future metadata
-- purge requires an explicit retention migration; ordinary or privileged row
-- deletion must not silently strand bytes or erase the private cleanup ledger.
create or replace function private.reject_upload_intent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Upload intent audit rows must be archived, not deleted'
    using errcode = '23514';
  return old;
end
$$;

revoke all on function private.reject_upload_intent_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists upload_intent_delete_rejected on public.uploads;
create trigger upload_intent_delete_rejected
  before delete on public.uploads
  for each row
  when (old.intent_request_id is not null and old.received_at is null)
  execute function private.reject_upload_intent_delete();

drop policy if exists uploads_delete on public.uploads;
create policy uploads_delete on public.uploads
  for delete to authenticated
  using (
    (intent_request_id is null or received_at is not null)
    and (
      (project_id is null and organization_id is null and uploaded_by = auth.uid())
      or (project_id is not null and private.can_manage_project(project_id))
      or (
        project_id is null
        and organization_id is not null
        and private.can_manage_organization(organization_id)
      )
    )
  );

create index if not exists upload_intent_orphan_cleanup_available_idx
  on private.upload_intent_orphan_cleanup_leases (claimed_at, upload_id)
  where completed_at is null;

create index if not exists uploads_orphan_cleanup_candidates_idx
  on public.uploads (intent_expires_at, created_at, id)
  where intent_request_id is not null
    and received_at is null
    and status in ('draft', 'archived');

-- Claim a small batch without waiting for another worker. The row locks live
-- only for this statement; the potentially slow Storage API call happens
-- after the RPC has committed. A lease can be reclaimed after a worker dies.
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
            lease.claimed_at is null
            or lease.claimed_at <= pg_catalog.now()
              - pg_catalog.make_interval(secs => bounded_lease_seconds)
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
      attempts,
      completed_at,
      last_error,
      updated_at
    )
    select
      candidate.id,
      pg_catalog.gen_random_uuid(),
      pg_catalog.now(),
      1,
      null,
      null,
      pg_catalog.now()
    from candidates candidate
    on conflict (upload_id) do update
    set claim_token = excluded.claim_token,
        claimed_at = excluded.claimed_at,
        attempts = lease.attempts + 1,
        last_error = null,
        updated_at = pg_catalog.now()
    where lease.completed_at is null
      and (
        lease.claimed_at is null
        or lease.claimed_at <= pg_catalog.now()
          - pg_catalog.make_interval(secs => bounded_lease_seconds)
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

-- Release a failed claim for immediate retry, or mark a successful Storage API
-- deletion complete. The opaque token prevents a stale worker from completing
-- a lease that has already been reclaimed by a newer worker.
create or replace function public.complete_upload_intent_orphan_cleanup(
  p_upload_id uuid,
  p_claim_token uuid,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_upload_id uuid;
begin
  if p_upload_id is null or p_claim_token is null then
    raise exception 'Upload id and claim token are required' using errcode = '22023';
  end if;

  update private.upload_intent_orphan_cleanup_leases lease
  set claim_token = null,
      claimed_at = null,
      completed_at = case
        when p_error is null then pg_catalog.now()
        else null
      end,
      last_error = case
        when p_error is null then null
        else pg_catalog.left(
          case
            when pg_catalog.btrim(p_error) = ''
              then 'Storage cleanup failed without an error message'
            else pg_catalog.btrim(p_error)
          end,
          1000
        )
      end,
      updated_at = pg_catalog.now()
  where lease.upload_id = p_upload_id
    and lease.claim_token = p_claim_token
    and lease.completed_at is null
  returning lease.upload_id into completed_upload_id;

  if completed_upload_id is null then
    raise exception 'Upload cleanup claim is missing or stale' using errcode = '55000';
  end if;

  return p_error is null;
end
$$;

revoke all on function public.complete_upload_intent_orphan_cleanup(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_upload_intent_orphan_cleanup(uuid, uuid, text)
  to service_role;
