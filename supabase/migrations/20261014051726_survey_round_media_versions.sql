-- INERT candidate: root creates the real filename with Supabase CLI after review.
-- Append-only draft assignments; no original bytes, observations or approvals.
alter table public.survey_round_versions add constraint survey_round_media_input_unique
  unique(project_id,id,manifest_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256);
alter table public.project_media add constraint project_media_canonical_binding_unique
  unique(project_id,id,original_sha256,original_validation_sha256,storage_object_id);
create table public.survey_round_media_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  version_no integer not null check(version_no>0),
  round_version_id uuid not null, round_sha256 text not null check(round_sha256 ~ '^[0-9a-f]{64}$'),
  baseline_id uuid not null, baseline_sha256 text not null check(baseline_sha256 ~ '^[0-9a-f]{64}$'),
  plan_id uuid not null, plan_sha256 text not null check(plan_sha256 ~ '^[0-9a-f]{64}$'),
  media_id uuid not null, original_sha256 text not null check(original_sha256 ~ '^[0-9a-f]{64}$'),
  original_validation_sha256 text not null check(original_validation_sha256 ~ '^[0-9a-f]{64}$'),
  storage_object_id uuid not null, storage_object_version text, storage_object_updated_at timestamptz not null,
  builder_version text not null check(builder_version='gofreyra.survey-round-media-draft/v1'),
  status text not null default 'draft_assignment' check(status='draft_assignment'),
  manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'), manifest jsonb not null,
  created_at timestamptz not null default now(), created_by uuid not null, request_id uuid not null,
  constraint round_media_exact_round foreign key(project_id,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256)
    references public.survey_round_versions(project_id,id,manifest_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256) on delete restrict,
  constraint round_media_exact_original foreign key(project_id,media_id,original_sha256,original_validation_sha256,storage_object_id)
    references public.project_media(project_id,id,original_sha256,original_validation_sha256,storage_object_id) on delete restrict,
  constraint round_media_manifest_size check(octet_length(manifest::text)<=32768),
  constraint round_media_manifest_shape check((jsonb_typeof(manifest)='object'
    and manifest->>'schema'='gofreyra.survey-round-media/v1' and manifest->>'builderVersion'=builder_version
    and manifest->>'status'=status and manifest->>'projectId'=project_id::text
    and manifest->>'roundVersionId'=round_version_id::text and manifest->>'roundSha256'=round_sha256
    and manifest->>'baselineId'=baseline_id::text and manifest->>'baselineSha256'=baseline_sha256
    and manifest->>'planId'=plan_id::text and manifest->>'planSha256'=plan_sha256
    and manifest->>'mediaId'=media_id::text and manifest->>'originalRole'='drone_original'
    and manifest->>'originalSha256'=original_sha256 and manifest->>'originalValidationSha256'=original_validation_sha256
    and manifest#>>'{storage,bucket}'='monitoring-uploads' and manifest#>>'{storage,objectId}'=storage_object_id::text
    and (manifest#>>'{storage,objectVersion}') is not distinct from storage_object_version
    and (manifest#>>'{storage,objectUpdatedAt}')::timestamptz=storage_object_updated_at
    and jsonb_typeof(manifest->'questionIds')='array'
    and manifest->'acceptance'='{"municipalScopeApproved":false,"professionalApproved":false,"pixelDecoded":false,"georeferenced":false,"reportEligible":false,"reportAccepted":false}'::jsonb) is true),
  unique(project_id,version_no), unique(project_id,round_version_id,media_id), unique(project_id,created_by,request_id),
  unique(project_id,id,manifest_sha256)
);
create index round_media_round_cursor on public.survey_round_media_versions(project_id,round_version_id,version_no desc);
create index round_media_media_cursor on public.survey_round_media_versions(project_id,media_id,version_no desc);
alter table public.survey_round_media_versions enable row level security;
revoke all on public.survey_round_media_versions from public,anon,authenticated,service_role;
grant select on public.survey_round_media_versions to authenticated;
grant select,insert on public.survey_round_media_versions to service_role;
create policy round_media_project_read on public.survey_round_media_versions for select to authenticated using(private.can_read_project(project_id));
create function private.reject_survey_round_media_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'A saved round media binding is immutable; revisions are not supported' using errcode='23514'; end $$;
revoke all on function private.reject_survey_round_media_mutation() from public,anon,authenticated,service_role;
create trigger round_media_immutable before update or delete on public.survey_round_media_versions for each row execute function private.reject_survey_round_media_mutation();

create function public.persist_survey_round_media(
 p_project_id uuid,p_actor_id uuid,p_request_id uuid,p_round_version_id uuid,p_round_sha256 text,p_media_id uuid,p_manifest_text text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare project_row public.projects%rowtype; round_row public.survey_round_versions%rowtype;
 media_row public.project_media%rowtype; existing public.survey_round_media_versions%rowtype; inserted public.survey_round_media_versions%rowtype;
 organization_role text; project_role text; prepared jsonb; validation jsonb; metadata jsonb; capture jsonb; position jsonb;
 manifest jsonb; expected jsonb; source_metadata jsonb; selected_ids jsonb; manifest_hash text; next_version integer;
begin
 if p_actor_id is null or p_request_id is null then raise exception 'Verified actor and request required' using errcode='22023'; end if;
 select * into project_row from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project access denied' using errcode='42501'; end if;
 select membership.role::text into organization_role from public.organization_memberships membership
  where membership.organization_id=project_row.organization_id and membership.user_id=p_actor_id for share;
 select member.role::text into project_role from public.project_members member where member.project_id=p_project_id and member.user_id=p_actor_id for share;
 if coalesce(organization_role in ('owner','admin') or (organization_role is not null and project_role in ('admin','project_manager','editor','field')),false) is not true
  then raise exception 'Project draft assignment access denied' using errcode='42501'; end if;
 -- Immutable round, baseline and plan inputs need SELECT only, never UPDATE grants or row locks.
 select * into round_row from public.survey_round_versions where project_id=p_project_id and id=p_round_version_id;
 if not found or round_row.manifest_sha256 is distinct from p_round_sha256 or round_row.status<>'draft'
  then raise exception 'Invalid saved round binding' using errcode='23514'; end if;
 -- Reuses current role, primary upload and exact active Storage-version checks, under the same transaction's locks.
 prepared:=public.prepare_project_media_original_read(p_project_id,p_media_id,p_actor_id);
 select * into media_row from public.project_media where project_id=p_project_id and id=p_media_id;
 if not found then raise exception 'Canonical original missing' using errcode='23514'; end if;
 validation:=prepared#>'{upload,original_validation}'; metadata:=validation->'metadata'; capture:=metadata->'capture'; position:=metadata->'position';
 if validation->>'schema' is distinct from 'gofreyra.drone-original-validation/v1'
  or validation->>'validatorVersion' is distinct from 'jpeg-structure-exifr/v1'
  or validation->>'projectId' is distinct from p_project_id::text
  or validation->>'uploadId' is distinct from media_row.source_upload_id::text
  or validation#>>'{original,sha256}' is distinct from media_row.original_sha256
  or validation#>>'{original,storagePath}' is distinct from media_row.file_path
  or validation#>'{original,sizeBytes}' is distinct from to_jsonb(media_row.file_size_bytes)
  or validation#>'{original,object}' is distinct from prepared->'object'
  or media_row.status is distinct from 'uploaded' or media_row.category is distinct from 'drone_image'
  or media_row.source is distinct from 'drone' or media_row.mime_type is distinct from 'image/jpeg'
  or validation->>'status' is distinct from media_row.original_validation_status
  or validation->'pixelDecoded' is distinct from 'false'::jsonb or validation->'georeferenced' is distinct from 'false'::jsonb
  or validation->'reportEligible' is distinct from 'false'::jsonb
  or jsonb_typeof(validation->'jpegStructure') is distinct from 'object'
  then raise exception 'Invalid saved original validation' using errcode='23514'; end if;
 if p_manifest_text is null or octet_length(p_manifest_text)>32768 then raise exception 'Invalid or oversized media binding' using errcode='23514'; end if;
 begin manifest:=p_manifest_text::jsonb; exception when invalid_text_representation then raise exception 'Invalid media binding JSON' using errcode='23514'; end;
 if jsonb_typeof(manifest) is distinct from 'object' or jsonb_typeof(manifest->'questionIds') is distinct from 'array'
  then raise exception 'Invalid media binding manifest' using errcode='23514'; end if;
 selected_ids:=manifest->'questionIds';
 if jsonb_array_length(selected_ids) not between 1 and 50 then raise exception 'Select actual saved round questions' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(selected_ids) selected(value) where jsonb_typeof(value)<>'string'
   or char_length(value#>>'{}') not between 1 and 300 or (value#>>'{}')~'[[:cntrl:]]'
   or not (round_row.manifest->'questionIds') @> jsonb_build_array(value))
  or (select count(distinct value) from jsonb_array_elements(selected_ids) selected(value))<>jsonb_array_length(selected_ids)
  or selected_ids is distinct from (select jsonb_agg(value order by (value#>>'{}') collate "C") from jsonb_array_elements(selected_ids) selected(value))
  then raise exception 'Unknown, duplicated or noncanonical round question IDs' using errcode='23514'; end if;
 -- Null metadata remains explicitly unknown. No upload time, planned window, AOI centroid or inferred timezone is substituted.
 if metadata<>'null'::jsonb and metadata is not null then
  if jsonb_typeof(metadata)<>'object' or jsonb_typeof(capture)<>'object' or jsonb_typeof(capture->'timezoneKnown') is distinct from 'boolean'
   or char_length(coalesce(capture->>'localTimestamp',''))>80 or char_length(coalesce(capture->>'offset',''))>16
   or coalesce(capture->>'localTimestamp','')~'[[:cntrl:]]' or coalesce(capture->>'offset','')~'[[:cntrl:]]'
   or ((capture->>'timezoneKnown')::boolean and (capture->>'capturedAtUtc' is null or capture->>'source' not in ('exif-offset','gps-utc','xmp-offset') or capture->>'source' is null))
   or (not (capture->>'timezoneKnown')::boolean and (capture->>'capturedAtUtc' is not null or capture->>'offset' is not null or capture->>'source' is not null))
   then raise exception 'Ambiguous original capture metadata' using errcode='23514'; end if;
 end if;
 source_metadata:=jsonb_build_object('source','saved_original_validation',
  'capture',jsonb_build_object('capturedAtUtc',capture->'capturedAtUtc','localTimestamp',capture->'localTimestamp','offset',capture->'offset',
   'timezoneKnown',coalesce(capture->'timezoneKnown','false'::jsonb),'source',capture->'source','relationToPlannedWindow','not_verified'),
  'cameraPosition',case when position is null or position='null'::jsonb then 'null'::jsonb else jsonb_build_object('latitude',position->'latitude','longitude',position->'longitude',
   'source',position->'source','geometryRole','camera_position_only','objectGeometry',null,'footprint',null) end,
  'jpegStructure',jsonb_build_object('widthPx',validation#>'{jpegStructure,widthPx}','heightPx',validation#>'{jpegStructure,heightPx}'));
 expected:=jsonb_build_object('schema','gofreyra.survey-round-media/v1','builderVersion','gofreyra.survey-round-media-draft/v1','status','draft_assignment',
  'projectId',p_project_id,'roundVersionId',p_round_version_id,'roundSha256',p_round_sha256,
  'baselineId',round_row.baseline_id,'baselineSha256',round_row.baseline_sha256,'planId',round_row.plan_id,'planSha256',round_row.plan_sha256,
  'mediaId',p_media_id,'originalRole','drone_original','originalSha256',media_row.original_sha256,
  'originalValidationSha256',media_row.original_validation_sha256,'originalValidationStatus',media_row.original_validation_status,'sourceUploadId',media_row.source_upload_id,
  'storage',jsonb_build_object('bucket','monitoring-uploads','objectId',media_row.storage_object_id,'objectVersion',media_row.storage_object_version,'objectUpdatedAt',media_row.storage_object_updated_at),
  'questionIds',selected_ids,'sourceMetadata',source_metadata,
  'acceptance',jsonb_build_object('municipalScopeApproved',false,'professionalApproved',false,'pixelDecoded',false,'georeferenced',false,'reportEligible',false,'reportAccepted',false));
 if manifest is distinct from expected then raise exception 'Media binding does not match saved inputs and unapproved source metadata' using errcode='23514'; end if;
 manifest_hash:=encode(pg_catalog.sha256(convert_to(p_manifest_text,'UTF8')),'hex');
 select * into existing from public.survey_round_media_versions where project_id=p_project_id and created_by=p_actor_id and request_id=p_request_id;
 if found then
  if existing.round_version_id is distinct from p_round_version_id or existing.round_sha256 is distinct from p_round_sha256 or existing.media_id is distinct from p_media_id
   or existing.manifest is distinct from manifest or existing.manifest_sha256 is distinct from manifest_hash then raise exception 'Request already used for another binding' using errcode='23514'; end if;
  return to_jsonb(existing);
 end if;
 if exists(select 1 from public.survey_round_media_versions where project_id=p_project_id and round_version_id=p_round_version_id and media_id=p_media_id)
  then raise exception 'Original is already assigned to this saved round; revisions are not supported' using errcode='23514'; end if;
 select coalesce(max(version_no),0)+1 into next_version from public.survey_round_media_versions where project_id=p_project_id;
 insert into public.survey_round_media_versions(project_id,version_no,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256,
  media_id,original_sha256,original_validation_sha256,storage_object_id,storage_object_version,storage_object_updated_at,builder_version,status,manifest_sha256,manifest,created_by,request_id)
 values(p_project_id,next_version,p_round_version_id,p_round_sha256,round_row.baseline_id,round_row.baseline_sha256,round_row.plan_id,round_row.plan_sha256,
  p_media_id,media_row.original_sha256,media_row.original_validation_sha256,media_row.storage_object_id,media_row.storage_object_version,media_row.storage_object_updated_at,
  'gofreyra.survey-round-media-draft/v1','draft_assignment',manifest_hash,manifest,p_actor_id,p_request_id) returning * into inserted;
 return to_jsonb(inserted);
end $$;
revoke all on function public.persist_survey_round_media(uuid,uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.persist_survey_round_media(uuid,uuid,uuid,uuid,text,uuid,text) to service_role;
