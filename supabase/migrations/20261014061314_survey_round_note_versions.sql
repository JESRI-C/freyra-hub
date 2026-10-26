-- INERT candidate. Root creates the actual migration filename with Supabase CLI.
-- Independent manual draft notes, append only. No approval/revision/export API.
alter table public.survey_round_media_versions add constraint round_media_note_inputs_unique
 unique(project_id,id,manifest_sha256,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256,media_id,original_sha256,original_validation_sha256);
create table public.survey_round_note_versions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 logical_note_id uuid not null, note_version_no integer not null default 1 check(note_version_no=1), supersedes_id uuid check(supersedes_id is null),
 version_no integer not null check(version_no>0),
 media_binding_id uuid not null, media_binding_sha256 text not null check(media_binding_sha256 ~ '^[0-9a-f]{64}$'),
 round_version_id uuid not null, round_sha256 text not null check(round_sha256 ~ '^[0-9a-f]{64}$'),
 baseline_id uuid not null, baseline_sha256 text not null check(baseline_sha256 ~ '^[0-9a-f]{64}$'),
 plan_id uuid not null, plan_sha256 text not null check(plan_sha256 ~ '^[0-9a-f]{64}$'),
 media_id uuid not null, original_sha256 text not null check(original_sha256 ~ '^[0-9a-f]{64}$'),
 original_validation_sha256 text not null check(original_validation_sha256 ~ '^[0-9a-f]{64}$'),
 question_id text not null check(char_length(question_id) between 1 and 300 and question_id !~ '[[:cntrl:]]'),
 method_version text not null check(method_version='manual-photo-question-note/v1'),
 status text not null default 'draft_unreviewed' check(status='draft_unreviewed'),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'), manifest jsonb not null,
 created_at timestamptz not null default now(), created_by uuid not null, request_id uuid not null,
 constraint note_exact_assignment foreign key(project_id,media_binding_id,media_binding_sha256,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256,media_id,original_sha256,original_validation_sha256)
  references public.survey_round_media_versions(project_id,id,manifest_sha256,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256,media_id,original_sha256,original_validation_sha256) on delete restrict,
 constraint note_exact_round foreign key(project_id,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256)
  references public.survey_round_versions(project_id,id,manifest_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256) on delete restrict,
 constraint note_manifest_size check(octet_length(manifest::text)<=16384),
 constraint note_manifest_pins check((jsonb_typeof(manifest)='object'
  and manifest->>'schema'='gofreyra.survey-round-note/v1' and manifest->>'methodVersion'=method_version and manifest->>'status'=status
  and manifest->>'projectId'=project_id::text and manifest->>'logicalNoteId'=logical_note_id::text
  and manifest->'noteVersion'='1'::jsonb and manifest->'supersedesId'='null'::jsonb
  and manifest->>'mediaBindingId'=media_binding_id::text and manifest->>'mediaBindingSha256'=media_binding_sha256
  and manifest->>'roundVersionId'=round_version_id::text and manifest->>'roundSha256'=round_sha256
  and manifest->>'baselineId'=baseline_id::text and manifest->>'baselineSha256'=baseline_sha256
  and manifest->>'planId'=plan_id::text and manifest->>'planSha256'=plan_sha256
  and manifest->>'mediaId'=media_id::text and manifest->>'originalSha256'=original_sha256
  and manifest->>'originalValidationSha256'=original_validation_sha256 and manifest->>'questionId'=question_id
  and manifest->>'questionKind'='official-reference-location/v1') is true),
 unique(project_id,version_no), unique(project_id,logical_note_id,note_version_no),
 unique(project_id,created_by,request_id), unique(project_id,id,manifest_sha256)
);
create index round_note_round_cursor on public.survey_round_note_versions(project_id,round_version_id,version_no desc);
create index round_note_binding_cursor on public.survey_round_note_versions(project_id,media_binding_id,version_no desc);
alter table public.survey_round_note_versions enable row level security;
revoke all on public.survey_round_note_versions from public,anon,authenticated,service_role;
grant select on public.survey_round_note_versions to authenticated;
grant select,insert on public.survey_round_note_versions to service_role;
create policy round_note_project_read on public.survey_round_note_versions for select to authenticated using(private.can_read_project(project_id));
create function private.reject_survey_round_note_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'A saved manual draft note is immutable; correction and review require separate records' using errcode='23514'; end $$;
revoke all on function private.reject_survey_round_note_mutation() from public,anon,authenticated,service_role;
create trigger round_note_immutable before update or delete on public.survey_round_note_versions for each row execute function private.reject_survey_round_note_mutation();

create function public.persist_survey_round_note(p_project_id uuid,p_actor_id uuid,p_request_id uuid,p_logical_note_id uuid,
 p_media_binding_id uuid,p_media_binding_sha256 text,p_manifest_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare project_row public.projects%rowtype; binding public.survey_round_media_versions%rowtype;
 round_row public.survey_round_versions%rowtype; plan public.verification_plan_versions%rowtype;
 existing public.survey_round_note_versions%rowtype; inserted public.survey_round_note_versions%rowtype;
 organization_role text; project_role text; prepared jsonb; manifest jsonb; manual jsonb; question jsonb; expected jsonb;
 manifest_hash text; selected_id text; next_version integer;
begin
 if p_actor_id is null or p_request_id is null or p_logical_note_id is null then raise exception 'Verified actor, logical note and request required' using errcode='22023'; end if;
 select * into project_row from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project access denied' using errcode='42501'; end if;
 -- Capture role values under locks: a later role UPDATE cannot change this transaction's authorization snapshot.
 select membership.role::text into organization_role from public.organization_memberships membership
  where membership.organization_id=project_row.organization_id and membership.user_id=p_actor_id for share;
 select member.role::text into project_role from public.project_members member where member.project_id=p_project_id and member.user_id=p_actor_id for share;
 if coalesce(organization_role in ('owner','admin') or (organization_role is not null and project_role in ('admin','project_manager','editor','field')),false) is not true
  then raise exception 'Project manual draft access denied' using errcode='42501'; end if;
 select * into binding from public.survey_round_media_versions where project_id=p_project_id and id=p_media_binding_id;
 if not found or binding.manifest_sha256 is distinct from p_media_binding_sha256 or binding.status is distinct from 'draft_assignment'
  then raise exception 'Invalid saved media assignment' using errcode='23514'; end if;
 select * into round_row from public.survey_round_versions where project_id=p_project_id and id=binding.round_version_id;
 if not found or round_row.manifest_sha256 is distinct from binding.round_sha256 or round_row.baseline_id is distinct from binding.baseline_id
  or round_row.baseline_sha256 is distinct from binding.baseline_sha256 or round_row.plan_id is distinct from binding.plan_id
  or round_row.plan_sha256 is distinct from binding.plan_sha256 or round_row.status is distinct from 'draft'
  then raise exception 'Saved round pins do not match assignment' using errcode='23514'; end if;
 select * into plan from public.verification_plan_versions where project_id=p_project_id and id=binding.plan_id;
 if not found or plan.manifest_sha256 is distinct from binding.plan_sha256 or plan.baseline_id is distinct from binding.baseline_id
  or plan.baseline_sha256 is distinct from binding.baseline_sha256 or plan.generator_version is distinct from 'gofreyra.reference-location-plan/v1'
  then raise exception 'Unsupported saved plan or input pins' using errcode='23514'; end if;
 -- Current available original guard is repeated inside this locked transaction, including exact retries.
 prepared:=public.prepare_project_media_original_read(p_project_id,binding.media_id,p_actor_id);
 if prepared#>>'{media,original_sha256}' is distinct from binding.original_sha256
  or prepared#>>'{media,original_validation_sha256}' is distinct from binding.original_validation_sha256
  or prepared#>>'{object,id}' is distinct from binding.storage_object_id::text
  or prepared#>>'{object,version}' is distinct from binding.storage_object_version
  or (prepared#>>'{object,updated_at}')::timestamptz is distinct from binding.storage_object_updated_at
  then raise exception 'Current original does not match saved assignment' using errcode='23514'; end if;
 if p_manifest_text is null or octet_length(p_manifest_text)>16384 then raise exception 'Invalid or oversized manual note' using errcode='23514'; end if;
 begin manifest:=p_manifest_text::jsonb; exception when invalid_text_representation then raise exception 'Invalid manual note JSON' using errcode='23514'; end;
 manual:=manifest->'manual'; selected_id:=manifest->>'questionId';
 if jsonb_typeof(manifest) is distinct from 'object' or jsonb_typeof(manual) is distinct from 'object'
  or selected_id is distinct from 'verification:'||binding.baseline_id::text||':official-reference-location:v1'
  or not coalesce((binding.manifest->'questionIds') @> jsonb_build_array(selected_id),false)
  or not coalesce((round_row.manifest->'questionIds') @> jsonb_build_array(selected_id),false)
  then raise exception 'Select the saved supported reference question' using errcode='23514'; end if;
 if (select count(*) from jsonb_array_elements(plan.manifest->'questions') q where q->>'id'=selected_id)<>1
  then raise exception 'Question is not unique in saved plan' using errcode='23514'; end if;
 select q into question from jsonb_array_elements(plan.manifest->'questions') q where q->>'id'=selected_id;
 if question->>'snapshotId' is distinct from binding.baseline_id::text or question->>'snapshotSha256' is distinct from binding.baseline_sha256
  or question->'sourceIds' is distinct from '["official-watercourse-reference"]'::jsonb or question->'result' is distinct from 'null'::jsonb
  then raise exception 'Unsupported reference question' using errcode='23514'; end if;
 if manual->>'qualitativeAnswer' is null or manual->>'qualitativeAnswer' not in ('supports_reference','does_not_support_reference','inconclusive')
  or manual->>'proposedPriority' is null or manual->>'proposedPriority' not in ('not_assessed','high','normal','low')
  or exists(select 1 from (values ('manualStatement',2000),('uncertainty',1000),('proposedFollowup',1000)) fields(name,max_chars)
   where jsonb_typeof(manual->name) is distinct from 'string' or char_length(manual->>name) not between 1 and max_chars
    or (manual->>name) !~ '[^[:space:]]' or (manual->>name) ~ '[[:cntrl:]]')
  or manual is distinct from jsonb_build_object('qualitativeAnswer',manual->'qualitativeAnswer','manualStatement',manual->'manualStatement',
   'uncertainty',manual->'uncertainty','proposedFollowup',manual->'proposedFollowup','proposedPriority',manual->'proposedPriority')
  then raise exception 'Invalid bounded manual fields' using errcode='23514'; end if;
 expected:=jsonb_build_object('schema','gofreyra.survey-round-note/v1','methodVersion','manual-photo-question-note/v1','status','draft_unreviewed',
  'projectId',p_project_id,'logicalNoteId',p_logical_note_id,'noteVersion',1,'supersedesId',null,
  'mediaBindingId',p_media_binding_id,'mediaBindingSha256',p_media_binding_sha256,
  'roundVersionId',binding.round_version_id,'roundSha256',binding.round_sha256,'baselineId',binding.baseline_id,'baselineSha256',binding.baseline_sha256,
  'planId',binding.plan_id,'planSha256',binding.plan_sha256,'mediaId',binding.media_id,'originalSha256',binding.original_sha256,
  'originalValidationSha256',binding.original_validation_sha256,'questionId',selected_id,'questionKind','official-reference-location/v1',
  'sourceMetadata',binding.manifest->'sourceMetadata','manual',manual);
 if manifest is distinct from expected then raise exception 'Manual draft note does not match exact saved input and method' using errcode='23514'; end if;
 manifest_hash:=encode(pg_catalog.sha256(convert_to(p_manifest_text,'UTF8')),'hex');
 select * into existing from public.survey_round_note_versions where project_id=p_project_id and created_by=p_actor_id and request_id=p_request_id;
 if found then
  if existing.logical_note_id is distinct from p_logical_note_id or existing.manifest is distinct from manifest or existing.manifest_sha256 is distinct from manifest_hash
   then raise exception 'Request already used for another manual draft note' using errcode='23514'; end if;
  return to_jsonb(existing);
 end if;
 if exists(select 1 from public.survey_round_note_versions where project_id=p_project_id and logical_note_id=p_logical_note_id)
  then raise exception 'Logical note already exists; corrections are a separate record type' using errcode='23514'; end if;
 select coalesce(max(version_no),0)+1 into next_version from public.survey_round_note_versions where project_id=p_project_id;
 insert into public.survey_round_note_versions(project_id,logical_note_id,note_version_no,supersedes_id,version_no,
  media_binding_id,media_binding_sha256,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256,
  media_id,original_sha256,original_validation_sha256,question_id,method_version,status,manifest_sha256,manifest,created_by,request_id)
 values(p_project_id,p_logical_note_id,1,null,next_version,p_media_binding_id,p_media_binding_sha256,binding.round_version_id,binding.round_sha256,
  binding.baseline_id,binding.baseline_sha256,binding.plan_id,binding.plan_sha256,binding.media_id,binding.original_sha256,binding.original_validation_sha256,
  selected_id,'manual-photo-question-note/v1','draft_unreviewed',manifest_hash,manifest,p_actor_id,p_request_id) returning * into inserted;
 return to_jsonb(inserted);
end $$;
revoke all on function public.persist_survey_round_note(uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.persist_survey_round_note(uuid,uuid,uuid,uuid,uuid,text,text) to service_role;
