-- Actual photo-derived AI drafts are separate from reviewed findings. Claims are
-- bounded and serialized per project; only the server service role can call them.
create table public.drone_image_inspections (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 media_id uuid not null references public.project_media(id) on delete restrict,
 created_by uuid not null, request_id uuid not null,
 provider text not null check(provider='cloudflare-workers-ai'),
 model_id text not null check(model_id='@cf/qwen/qwen3.8-27b'),
 prompt_version text not null check(prompt_version='danish-stream-visual-draft/v1'),
 method_version text not null check(method_version='visual-photo-followups/v1'),
 original_sha256 text not null check(original_sha256 ~ '^[0-9a-f]{64}$'),
 original_validation_sha256 text not null check(original_validation_sha256 ~ '^[0-9a-f]{64}$'),
 storage_object_id uuid not null references storage.objects(id) on delete restrict on update restrict,
 storage_object_version text, storage_object_updated_at timestamptz not null,
 source_snapshot_id uuid references public.project_baseline_snapshots(id) on delete restrict,
 source_snapshot_sha256 text check(source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 status text not null check(status in ('pending','failed','completed')),
 attempt_count integer not null check(attempt_count between 1 and 3),
 lease_token uuid, lease_actor_id uuid, lease_expires_at timestamptz,
 result jsonb, result_text text, result_sha256 text check(result_sha256 ~ '^[0-9a-f]{64}$'),
 failure_code text check(failure_code in ('provider_unavailable','provider_error','invalid_output','image_error','timeout')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
 constraint image_inspection_context check((source_snapshot_id is null)=(source_snapshot_sha256 is null)),
 constraint image_inspection_state check((
  (status='pending' and lease_token is not null and lease_actor_id is not null and lease_expires_at is not null
   and result is null and result_text is null and result_sha256 is null and completed_at is null and failure_code is null)
  or (status='failed' and lease_token is null and lease_actor_id is null and lease_expires_at is null
   and result is null and result_text is null and result_sha256 is null and completed_at is null and failure_code is not null)
  or (status='completed' and lease_token is null and lease_actor_id is null and lease_expires_at is null
   and result is not null and result_text is not null and result_text::jsonb=result and octet_length(result_text)<=24576
   and result_sha256 is not null and completed_at is not null and failure_code is null)
 ) is true),
 constraint image_inspection_draft check(result is null or ((jsonb_typeof(result)='object'
  and octet_length(result::text)<=65536 and result->>'schema'='gofreyra.drone-image-inspection/v1'
  and result->>'methodVersion'=method_version and result->>'status'='draft_unreviewed'
  and result->'objectGeometry'='null'::jsonb and result->'footprint'='null'::jsonb
  and result->'reportEligible'='false'::jsonb and result->'professionallyReviewed'='false'::jsonb) is true)),
 unique(project_id,created_by,request_id), unique(project_id,id,result_sha256)
);
create unique index drone_image_inspection_exact_input on public.drone_image_inspections(
 project_id,media_id,original_validation_sha256,provider,model_id,prompt_version,method_version,
 coalesce(source_snapshot_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index drone_image_inspection_project_cursor on public.drone_image_inspections(project_id,created_at desc,id);
create index drone_image_inspection_budget_window on public.drone_image_inspections(updated_at desc);
create index drone_image_inspection_source on public.drone_image_inspections(source_snapshot_id) where source_snapshot_id is not null;
create index drone_image_inspection_media on public.drone_image_inspections(media_id);
create index drone_image_inspection_storage on public.drone_image_inspections(storage_object_id);
alter table public.drone_image_inspections enable row level security;
revoke all on public.drone_image_inspections from public,anon,authenticated,service_role;
grant select(id,project_id,media_id,created_by,request_id,provider,model_id,prompt_version,method_version,
 original_sha256,original_validation_sha256,storage_object_id,storage_object_version,storage_object_updated_at,
 source_snapshot_id,source_snapshot_sha256,status,attempt_count,lease_expires_at,result,result_text,result_sha256,failure_code,
 created_at,updated_at,completed_at) on public.drone_image_inspections to authenticated;
grant select,insert,update on public.drone_image_inspections to service_role;
create policy drone_image_inspection_project_read on public.drone_image_inspections for select to authenticated
 using(private.can_read_project(project_id));

create function private.protect_drone_image_inspection() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.status='completed' then
  raise exception 'Saved image inspections are immutable' using errcode='23514';
 end if;
 if (to_jsonb(new)-array['status','attempt_count','lease_token','lease_actor_id','lease_expires_at','result','result_text','result_sha256','failure_code','updated_at','completed_at'])
  is distinct from (to_jsonb(old)-array['status','attempt_count','lease_token','lease_actor_id','lease_expires_at','result','result_text','result_sha256','failure_code','updated_at','completed_at'])
 then raise exception 'Image inspection input pins are immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.protect_drone_image_inspection() from public,anon,authenticated,service_role;
create trigger drone_image_inspection_immutable before update or delete on public.drone_image_inspections
 for each row execute function private.protect_drone_image_inspection();

-- Project lock serializes claims, quota counters and membership snapshots.
create function private.lock_drone_image_inspection_original(p_project_id uuid,p_media_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare project_row public.projects%rowtype; organization_role text; project_role text;
begin
 if p_actor_id is null then raise exception 'Verified actor required' using errcode='42501'; end if;
 select * into project_row from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project access denied' using errcode='42501'; end if;
 select membership.role::text into organization_role from public.organization_memberships membership
  where membership.organization_id=project_row.organization_id and membership.user_id=p_actor_id for share;
 select member.role::text into project_role from public.project_members member
  where member.project_id=p_project_id and member.user_id=p_actor_id for share;
 if coalesce(organization_role in ('owner','admin') or (organization_role is not null and project_role in ('admin','project_manager','editor','field')),false) is not true
 then raise exception 'Project image inspection access denied' using errcode='42501'; end if;
 return public.prepare_project_media_original_read(p_project_id,p_media_id,p_actor_id);
end $$;
revoke all on function private.lock_drone_image_inspection_original(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.lock_drone_image_inspection_original(uuid,uuid,uuid) to service_role;

-- Every caller request remains pinned even when another actor/request already
-- produced the same image draft. This prevents reusing a replayed request ID for
-- a different photo while keeping the completed draft's historical request ID.
create table private.drone_image_inspection_requests (
 project_id uuid not null references public.projects(id) on delete restrict,
 actor_id uuid not null, request_id uuid not null,
 inspection_id uuid not null references public.drone_image_inspections(id) on delete restrict,
 created_at timestamptz not null default now(), primary key(project_id,actor_id,request_id)
);
create index drone_image_inspection_request_target on private.drone_image_inspection_requests(inspection_id);
alter table private.drone_image_inspection_requests enable row level security;
revoke all on private.drone_image_inspection_requests from public,anon,authenticated,service_role;
grant select,insert on private.drone_image_inspection_requests to service_role;

create function public.claim_drone_image_inspection(p_project_id uuid,p_media_id uuid,p_actor_id uuid,p_request_id uuid,
 p_provider text,p_model_id text,p_prompt_version text,p_method_version text,
 p_source_snapshot_id uuid default null,p_source_snapshot_sha256 text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prepared jsonb; existing public.drone_image_inspections%rowtype; claimed public.drone_image_inspections%rowtype;
 token uuid; snapshot public.project_baseline_snapshots%rowtype;
begin
 if p_request_id is null or p_provider is distinct from 'cloudflare-workers-ai' or p_model_id is distinct from '@cf/qwen/qwen3.8-27b'
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

create function public.finish_drone_image_inspection(p_project_id uuid,p_inspection_id uuid,p_actor_id uuid,p_claim_token uuid,
 p_result_text text default null,p_failure_code text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_row public.drone_image_inspections%rowtype; finished public.drone_image_inspections%rowtype;
 prepared jsonb; provenance jsonb; derivative jsonb; p_result jsonb;
begin
 -- Same project -> membership -> media/object -> inspection lock order as claim.
 select * into current_row from public.drone_image_inspections where project_id=p_project_id and id=p_inspection_id;
 if not found then raise exception 'Image inspection unavailable' using errcode='23514'; end if;
 prepared:=private.lock_drone_image_inspection_original(p_project_id,current_row.media_id,p_actor_id);
 select * into current_row from public.drone_image_inspections where project_id=p_project_id and id=p_inspection_id for update;
 if current_row.status is distinct from 'pending' or current_row.lease_token is distinct from p_claim_token or p_claim_token is null
  or current_row.lease_actor_id is distinct from p_actor_id or current_row.lease_expires_at<=clock_timestamp()
 then raise exception 'Image inspection claim expired or changed' using errcode='23514'; end if;
 if current_row.original_sha256 is distinct from prepared#>>'{media,original_sha256}'
  or current_row.original_validation_sha256 is distinct from prepared#>>'{media,original_validation_sha256}'
  or current_row.storage_object_id::text is distinct from prepared#>>'{object,id}'
  or current_row.storage_object_version is distinct from prepared#>>'{object,version}'
  or current_row.storage_object_updated_at is distinct from (prepared#>>'{object,updated_at}')::timestamptz
 then raise exception 'Current original does not match image inspection' using errcode='23514'; end if;
 if p_failure_code is not null then
  if p_result_text is not null or p_failure_code not in ('provider_unavailable','provider_error','invalid_output','image_error','timeout')
  then raise exception 'Invalid safe image inspection failure' using errcode='23514'; end if;
  update public.drone_image_inspections set status='failed',failure_code=p_failure_code,lease_token=null,lease_actor_id=null,
   lease_expires_at=null,updated_at=clock_timestamp() where id=p_inspection_id returning * into finished;
  return to_jsonb(finished)-'lease_token'-'lease_actor_id';
 end if;
 if p_result_text is null or octet_length(p_result_text)>24576 then raise exception 'Invalid or oversized image inspection draft' using errcode='23514'; end if;
 begin p_result:=p_result_text::jsonb; exception when invalid_text_representation then raise exception 'Invalid image inspection JSON' using errcode='23514'; end;
 if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>65536
 then raise exception 'Invalid or oversized image inspection draft' using errcode='23514'; end if;
 provenance:=p_result->'provenance'; derivative:=provenance->'derivative';
 if (p_result-array['schema','methodVersion','status','provenance','sourceContext','visual','confidenceKind','followupQuestions','reportSummary','objectGeometry','footprint','reportEligible','professionallyReviewed'])<>'{}'::jsonb
  or p_result->>'schema' is distinct from 'gofreyra.drone-image-inspection/v1' or p_result->>'methodVersion' is distinct from current_row.method_version
  or p_result->>'status' is distinct from 'draft_unreviewed' or p_result->'objectGeometry' is distinct from 'null'::jsonb
  or p_result->'footprint' is distinct from 'null'::jsonb or p_result->'reportEligible' is distinct from 'false'::jsonb
  or p_result->'professionallyReviewed' is distinct from 'false'::jsonb
  or p_result->>'confidenceKind' is distinct from 'model_self_assessment_uncalibrated'
  or jsonb_typeof(p_result->'visual') is distinct from 'object' or jsonb_typeof(p_result->'reportSummary') is distinct from 'object'
  or jsonb_typeof(p_result->'followupQuestions') is distinct from 'array'
 then raise exception 'Image inspection must remain an unreviewed visual draft' using errcode='23514'; end if;
 if jsonb_array_length(p_result->'followupQuestions')>9 then raise exception 'Too many photo followups' using errcode='23514'; end if;
 if jsonb_typeof(provenance) is distinct from 'object' or provenance->>'projectId' is distinct from p_project_id::text
  or provenance->>'mediaId' is distinct from current_row.media_id::text or provenance->>'requestId' is distinct from current_row.request_id::text
  or provenance->>'originalSha256' is distinct from current_row.original_sha256
  or provenance->>'originalValidationSha256' is distinct from current_row.original_validation_sha256
  or provenance->>'provider' is distinct from current_row.provider or provenance->>'model' is distinct from current_row.model_id
  or provenance->>'promptVersion' is distinct from current_row.prompt_version
  or provenance-array['projectId','mediaId','requestId','originalSha256','originalValidationSha256','derivative','provider','model','promptVersion','generatedAt']<>'{}'::jsonb
 then raise exception 'Image inspection provenance does not match claimed inputs' using errcode='23514'; end if;
 if jsonb_typeof(derivative) is distinct from 'object' or derivative->>'sha256' is null or derivative->>'sha256' !~ '^[0-9a-f]{64}$'
  or derivative->>'mimeType' is distinct from 'image/jpeg' or derivative->>'transformVersion' is null
  or char_length(derivative->>'transformVersion') not between 1 and 100
  or jsonb_typeof(derivative->'widthPx') is distinct from 'number' or jsonb_typeof(derivative->'heightPx') is distinct from 'number'
 then raise exception 'Invalid bounded derivative provenance' using errcode='23514'; end if;
 if (derivative->>'widthPx')::numeric not between 1 and 8192 or (derivative->>'heightPx')::numeric not between 1 and 8192
  or trunc((derivative->>'widthPx')::numeric)<>(derivative->>'widthPx')::numeric
  or trunc((derivative->>'heightPx')::numeric)<>(derivative->>'heightPx')::numeric
 then raise exception 'Invalid derivative dimensions' using errcode='23514'; end if;
 if current_row.source_snapshot_id is null then
  if p_result->'sourceContext' is distinct from 'null'::jsonb then raise exception 'Unexpected source context' using errcode='23514'; end if;
 elsif p_result#>>'{sourceContext,snapshotId}' is distinct from current_row.source_snapshot_id::text
  or p_result#>>'{sourceContext,snapshotSha256}' is distinct from current_row.source_snapshot_sha256
 then raise exception 'Image inspection source context changed' using errcode='23514'; end if;
 update public.drone_image_inspections set status='completed',result=p_result,result_text=p_result_text,
  result_sha256=encode(pg_catalog.sha256(convert_to(p_result_text,'UTF8')),'hex'),
  lease_token=null,lease_actor_id=null,lease_expires_at=null,completed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=p_inspection_id returning * into finished;
 return to_jsonb(finished)-'lease_token'-'lease_actor_id';
end $$;
revoke all on function public.finish_drone_image_inspection(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_drone_image_inspection(uuid,uuid,uuid,uuid,text,text) to service_role;

-- Human answers remain append-only draft snapshots. They never alter the
-- original AI output, camera metadata, baseline, reference or review state.
create table public.drone_image_inspection_answer_versions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 inspection_id uuid not null, inspection_result_sha256 text not null check(inspection_result_sha256 ~ '^[0-9a-f]{64}$'),
 created_by uuid not null, request_id uuid not null,
 answers jsonb not null, answers_text text not null,
 answers_sha256 text not null check(answers_sha256 ~ '^[0-9a-f]{64}$'),
 status text not null default 'draft_unreviewed' check(status='draft_unreviewed'),
 professionally_reviewed boolean not null default false check(not professionally_reviewed),
 report_eligible boolean not null default false check(not report_eligible),
 created_at timestamptz not null default now(),
 constraint image_answers_exact_inspection foreign key(project_id,inspection_id,inspection_result_sha256)
  references public.drone_image_inspections(project_id,id,result_sha256) on delete restrict,
 constraint image_answers_bounded check(jsonb_typeof(answers)='array' and jsonb_array_length(answers) between 1 and 9
  and answers_text::jsonb=answers and octet_length(answers_text)<=32768),
 unique(project_id,created_by,request_id)
);
create index drone_image_answers_project_cursor on public.drone_image_inspection_answer_versions(project_id,inspection_id,created_at desc,id);
alter table public.drone_image_inspection_answer_versions enable row level security;
revoke all on public.drone_image_inspection_answer_versions from public,anon,authenticated,service_role;
grant select on public.drone_image_inspection_answer_versions to authenticated;
grant select,insert on public.drone_image_inspection_answer_versions to service_role;
create policy drone_image_answers_project_read on public.drone_image_inspection_answer_versions for select to authenticated
 using(private.can_read_project(project_id));
create function private.reject_drone_image_answer_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Saved image answers are immutable draft versions' using errcode='23514'; end $$;
revoke all on function private.reject_drone_image_answer_mutation() from public,anon,authenticated,service_role;
create trigger drone_image_answers_immutable before update or delete on public.drone_image_inspection_answer_versions
 for each row execute function private.reject_drone_image_answer_mutation();

create function public.save_drone_image_inspection_answers(p_project_id uuid,p_inspection_id uuid,p_actor_id uuid,p_request_id uuid,
 p_inspection_result_sha256 text,p_answers_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inspection public.drone_image_inspections%rowtype; existing public.drone_image_inspection_answer_versions%rowtype;
 saved public.drone_image_inspection_answer_versions%rowtype; prepared jsonb; answers jsonb; answer jsonb; content_hash text;
begin
 if p_request_id is null or p_answers_text is null or octet_length(p_answers_text)>32768
 then raise exception 'Bounded answer request required' using errcode='22023'; end if;
 select * into inspection from public.drone_image_inspections where project_id=p_project_id and id=p_inspection_id;
 if not found then raise exception 'Saved image inspection unavailable' using errcode='23514'; end if;
 prepared:=private.lock_drone_image_inspection_original(p_project_id,inspection.media_id,p_actor_id);
 if inspection.status is distinct from 'completed' or inspection.result_sha256 is distinct from p_inspection_result_sha256
  or inspection.original_sha256 is distinct from prepared#>>'{media,original_sha256}'
  or inspection.original_validation_sha256 is distinct from prepared#>>'{media,original_validation_sha256}'
  or inspection.storage_object_id::text is distinct from prepared#>>'{object,id}'
  or inspection.storage_object_version is distinct from prepared#>>'{object,version}'
  or inspection.storage_object_updated_at is distinct from (prepared#>>'{object,updated_at}')::timestamptz
 then raise exception 'Answers require the exact current original and completed draft' using errcode='23514'; end if;
 begin answers:=p_answers_text::jsonb; exception when invalid_text_representation then raise exception 'Invalid answer JSON' using errcode='23514'; end;
 if jsonb_typeof(answers) is distinct from 'array' then raise exception 'Answers must be an array' using errcode='23514'; end if;
 if jsonb_array_length(answers) not between 1 and 9
  or (select count(distinct item->>'questionId') from jsonb_array_elements(answers) item)<>jsonb_array_length(answers)
 then raise exception 'Answers must have unique saved question IDs' using errcode='23514'; end if;
 for answer in select item from jsonb_array_elements(answers) item loop
  if jsonb_typeof(answer) is distinct from 'object' or answer-array['questionId','assessment','note','followup']<>'{}'::jsonb
   or jsonb_typeof(answer->'questionId') is distinct from 'string'
   or (select count(*) from jsonb_array_elements(inspection.result->'followupQuestions') question where question->>'id'=answer->>'questionId')<>1
   or answer->>'assessment' is null or answer->>'assessment' not in ('confirmed','not_confirmed','uncertain')
   or jsonb_typeof(answer->'note') is distinct from 'string' or char_length(answer->>'note') not between 1 and 2000
   or answer->>'note' !~ '[^[:space:]]' or replace(answer->>'note',E'\n','') ~ '[[:cntrl:]]'
   or jsonb_typeof(answer->'followup') is distinct from 'string' or char_length(answer->>'followup')>1000
   or replace(answer->>'followup',E'\n','') ~ '[[:cntrl:]]'
  then raise exception 'Answer does not match a bounded saved photo question' using errcode='23514'; end if;
 end loop;
 content_hash:=encode(pg_catalog.sha256(convert_to(p_answers_text,'UTF8')),'hex');
 select * into existing from public.drone_image_inspection_answer_versions where project_id=p_project_id and created_by=p_actor_id and request_id=p_request_id;
 if found then
  if existing.inspection_id is distinct from p_inspection_id or existing.inspection_result_sha256 is distinct from p_inspection_result_sha256
   or existing.answers is distinct from answers or existing.answers_sha256 is distinct from content_hash
  then raise exception 'Request already used for another answer snapshot' using errcode='23514'; end if;
  return to_jsonb(existing);
 end if;
 insert into public.drone_image_inspection_answer_versions(project_id,inspection_id,inspection_result_sha256,created_by,request_id,answers,answers_text,answers_sha256)
 values(p_project_id,p_inspection_id,p_inspection_result_sha256,p_actor_id,p_request_id,answers,p_answers_text,content_hash) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.save_drone_image_inspection_answers(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_drone_image_inspection_answers(uuid,uuid,uuid,uuid,text,text) to service_role;
