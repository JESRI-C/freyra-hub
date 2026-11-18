-- Preserve already-saved Qwen drafts and their immutable provenance. New Gemma
-- drafts retain the same auth, source/object pins, leases and total budgets.
-- The prior applied migration is unchanged; only the model capability widens.
alter table public.drone_image_inspections
 drop constraint drone_image_inspections_model_id_check;
alter table public.drone_image_inspections
 add constraint drone_image_inspections_model_id_check
 check(model_id in ('@cf/qwen/qwen3.8-27b','@cf/google/gemma-4-26b-a4b-it'));
create or replace function public.claim_drone_image_inspection(p_project_id uuid,p_media_id uuid,p_actor_id uuid,p_request_id uuid,
 p_provider text,p_model_id text,p_prompt_version text,p_method_version text,
 p_source_snapshot_id uuid default null,p_source_snapshot_sha256 text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prepared jsonb; existing public.drone_image_inspections%rowtype; claimed public.drone_image_inspections%rowtype;
 token uuid; snapshot public.project_baseline_snapshots%rowtype;
begin
 if p_request_id is null or p_provider is distinct from 'cloudflare-workers-ai' or p_model_id is null or p_model_id not in ('@cf/qwen/qwen3.8-27b','@cf/google/gemma-4-26b-a4b-it')
  or p_prompt_version is distinct from 'danish-stream-visual-draft/v1' or p_method_version is distinct from 'visual-photo-followups/v1'
 then raise exception 'Unsupported image inspection method or request' using errcode='22023'; end if;
 -- Shared advisory key serializes the global budget before any project row lock.
 perform pg_catalog.pg_advisory_xact_lock(175391,1);
 prepared:=private.lock_drone_image_inspection_original(p_project_id,p_media_id,p_actor_id);
 if (p_source_snapshot_id is null)<>(p_source_snapshot_sha256 is null) then raise exception 'Incomplete source snapshot pins' using errcode='23514'; end if;
 if p_source_snapshot_id is not null then
  select * into snapshot from public.project_baseline_snapshots where project_id=p_project_id and id=p_source_snapshot_id;
  if not found or snapshot.manifest_sha256 is distinct from p_source_snapshot_sha256
   then raise exception 'Source snapshot pins changed' using errcode='23514'; end if;
  -- A project-level snapshot is context only after this exact original has a
  -- saved round assignment to it. Camera GPS alone never proves a source match.
  if not exists(select 1 from public.survey_round_media_versions binding
   where binding.project_id=p_project_id and binding.media_id=p_media_id
    and binding.baseline_id=p_source_snapshot_id and binding.baseline_sha256=p_source_snapshot_sha256
    and binding.original_sha256=prepared#>>'{media,original_sha256}'
    and binding.original_validation_sha256=prepared#>>'{media,original_validation_sha256}'
    and binding.storage_object_id::text=prepared#>>'{object,id}'
    and binding.storage_object_version is not distinct from prepared#>>'{object,version}'
    and binding.storage_object_updated_at=(prepared#>>'{object,updated_at}')::timestamptz
    and binding.status='draft_assignment' and binding.builder_version='gofreyra.survey-round-media-draft/v1')
   then raise exception 'Source context requires the exact saved photo assignment' using errcode='23514'; end if;
 end if;
 select inspection.* into existing from private.drone_image_inspection_requests receipt
  join public.drone_image_inspections inspection on inspection.id=receipt.inspection_id
  where receipt.project_id=p_project_id and receipt.actor_id=p_actor_id and receipt.request_id=p_request_id;
 if found and (existing.media_id is distinct from p_media_id or existing.provider is distinct from p_provider or existing.model_id is distinct from p_model_id
  or existing.prompt_version is distinct from p_prompt_version or existing.method_version is distinct from p_method_version
  or existing.source_snapshot_id is distinct from p_source_snapshot_id or existing.source_snapshot_sha256 is distinct from p_source_snapshot_sha256)
 then raise exception 'Request already used for another image inspection' using errcode='23514'; end if;
 select * into existing from public.drone_image_inspections where project_id=p_project_id and media_id=p_media_id
  and original_validation_sha256=prepared#>>'{media,original_validation_sha256}' and provider=p_provider and model_id=p_model_id
  and prompt_version=p_prompt_version and method_version=p_method_version and source_snapshot_id is not distinct from p_source_snapshot_id;
 if found then
  if existing.original_sha256 is distinct from prepared#>>'{media,original_sha256}'
   or existing.storage_object_id::text is distinct from prepared#>>'{object,id}'
   or existing.storage_object_version is distinct from prepared#>>'{object,version}'
   or existing.storage_object_updated_at is distinct from (prepared#>>'{object,updated_at}')::timestamptz
  then raise exception 'Current original does not match image inspection' using errcode='23514'; end if;
  insert into private.drone_image_inspection_requests(project_id,actor_id,request_id,inspection_id)
   values(p_project_id,p_actor_id,p_request_id,existing.id) on conflict do nothing;
  if existing.status='completed' then
   return jsonb_build_object('state','completed','inspection',to_jsonb(existing)-'lease_token'-'lease_actor_id','claimToken',null);
  end if;
  if existing.status='pending' and existing.lease_expires_at>clock_timestamp() then
   return jsonb_build_object('state','busy','inspection',to_jsonb(existing)-'lease_token'-'lease_actor_id','claimToken',null);
  end if;
  if existing.attempt_count>=3 then raise exception 'Image inspection retry limit reached' using errcode='54000'; end if;
 end if;
 if (select coalesce(sum(attempt_count),0) from public.drone_image_inspections where project_id=p_project_id
  and updated_at>clock_timestamp()-interval '24 hours')>=40
 then raise exception 'Project image inspection daily limit reached' using errcode='54000'; end if;
 -- Counting all attempts of recently updated rows intentionally overestimates
 -- retries whose first attempt predates the window; it cannot hide recent work.
 if (select coalesce(sum(attempt_count),0) from public.drone_image_inspections
  where updated_at>clock_timestamp()-interval '24 hours')>=200
 then raise exception 'Global image inspection daily limit reached' using errcode='54000'; end if;
 token:=gen_random_uuid();
 if existing.id is null then
  insert into public.drone_image_inspections(project_id,media_id,created_by,request_id,provider,model_id,prompt_version,method_version,
   original_sha256,original_validation_sha256,storage_object_id,storage_object_version,storage_object_updated_at,
   source_snapshot_id,source_snapshot_sha256,status,attempt_count,lease_token,lease_actor_id,lease_expires_at)
  values(p_project_id,p_media_id,p_actor_id,p_request_id,p_provider,p_model_id,p_prompt_version,p_method_version,
   prepared#>>'{media,original_sha256}',prepared#>>'{media,original_validation_sha256}',(prepared#>>'{object,id}')::uuid,
   prepared#>>'{object,version}',(prepared#>>'{object,updated_at}')::timestamptz,p_source_snapshot_id,p_source_snapshot_sha256,
   'pending',1,token,p_actor_id,clock_timestamp()+interval '3 minutes') returning * into claimed;
 else
  update public.drone_image_inspections set status='pending',attempt_count=attempt_count+1,lease_token=token,
   lease_actor_id=p_actor_id,lease_expires_at=clock_timestamp()+interval '3 minutes',failure_code=null,updated_at=clock_timestamp()
   where id=existing.id returning * into claimed;
 end if;
 insert into private.drone_image_inspection_requests(project_id,actor_id,request_id,inspection_id)
  values(p_project_id,p_actor_id,p_request_id,claimed.id) on conflict do nothing;
 return jsonb_build_object('state','claimed','inspection',to_jsonb(claimed)-'lease_token'-'lease_actor_id','claimToken',token);
end $$;
revoke all on function public.claim_drone_image_inspection(uuid,uuid,uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_drone_image_inspection(uuid,uuid,uuid,uuid,text,text,text,text,uuid,text) to service_role;
