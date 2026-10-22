-- Human review is independent of AI availability and never rewrites an AI draft.
create table public.photo_point_review_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  binding_id uuid not null references public.survey_round_media_versions(id) on delete restrict,
  reviewed_by uuid not null, request_id uuid not null,
  review jsonb not null, review_text text not null,
  binding_sha256 text generated always as (review->>'bindingSha256') stored not null,
  review_sha256 text not null check(review_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(project_id,reviewed_by,request_id),
  constraint photo_review_text_matches check(jsonb_typeof(review)='object' and review_text::jsonb=review and octet_length(review_text)<=16384
    and encode(pg_catalog.sha256(convert_to(review_text,'UTF8')),'hex')=review_sha256),
  constraint photo_review_exact_binding foreign key(project_id,binding_id,binding_sha256)
    references public.survey_round_media_versions(project_id,id,manifest_sha256) on delete restrict,
  constraint photo_review_identity check((review->>'schema'='freyra.photo-point-review/v1'
    and review->>'projectId'=project_id::text and review->>'bindingId'=binding_id::text
    and review->>'decision' in ('confirmed','rejected')) is true)
);
create index photo_point_review_cursor on public.photo_point_review_versions(project_id,binding_id,created_at desc,id desc);
alter table public.photo_point_review_versions enable row level security;
revoke all on public.photo_point_review_versions from public,anon,authenticated,service_role;
grant select on public.photo_point_review_versions to authenticated;
grant select,insert on public.photo_point_review_versions to service_role;
create policy photo_point_review_read on public.photo_point_review_versions for select to authenticated
  using(private.can_read_project(project_id));
create function private.protect_photo_point_review() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Photo point decisions are immutable versions' using errcode='23514'; end $$;
revoke all on function private.protect_photo_point_review() from public,anon,authenticated,service_role;
create trigger photo_point_review_immutable before update or delete on public.photo_point_review_versions
  for each row execute function private.protect_photo_point_review();

create function public.save_photo_point_review(p_project_id uuid,p_binding_id uuid,p_actor_id uuid,p_request_id uuid,p_review_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  binding public.survey_round_media_versions%rowtype;
  media public.project_media%rowtype;
  inspection public.drone_image_inspections%rowtype;
  saved public.photo_point_review_versions%rowtype;
  existing public.photo_point_review_versions%rowtype;
  review jsonb; content_hash text; organization_role text; project_role text;
begin
  if p_actor_id is null or p_request_id is null or p_review_text is null or octet_length(p_review_text)>16384
  then raise exception 'Invalid review envelope' using errcode='22023'; end if;
  select * into binding from public.survey_round_media_versions where id=p_binding_id and project_id=p_project_id;
  if not found then raise exception 'Photo binding unavailable' using errcode='42501'; end if;
  -- The existing lock serializes project/member changes and validates the current
  -- original object before any decision or idempotent replay is returned.
  perform private.lock_drone_image_inspection_original(p_project_id,binding.media_id,p_actor_id);
  select member.role::text into project_role from public.project_members member
    where member.project_id=p_project_id and member.user_id=p_actor_id for share;
  select membership.role::text into organization_role from public.organization_memberships membership
    join public.projects project on project.organization_id=membership.organization_id
    where project.id=p_project_id and membership.user_id=p_actor_id for share of membership;
  if coalesce(organization_role in ('owner','admin') or (organization_role is not null and project_role in ('admin','project_manager','editor')),false) is not true
  then raise exception 'Professional review requires project editor access' using errcode='42501'; end if;
  begin review:=p_review_text::jsonb;
  exception when invalid_text_representation then raise exception 'Invalid review JSON' using errcode='23514'; end;
  if jsonb_typeof(review) is distinct from 'object' then raise exception 'Review must be an object' using errcode='23514'; end if;
  if (select count(*) from jsonb_object_keys(review))<>13 or
    review - array['schema','projectId','bindingId','bindingSha256','mediaId','originalSha256','baselineId','baselineSha256','decision','note','reviewerName','inspectionId','inspectionSha256'] <> '{}'::jsonb
    or review->>'schema' is distinct from 'freyra.photo-point-review/v1'
    or review->>'projectId' is distinct from p_project_id::text
    or review->>'bindingId' is distinct from p_binding_id::text
    or review->>'bindingSha256' is distinct from binding.manifest_sha256
    or review->>'mediaId' is distinct from binding.media_id::text
    or review->>'originalSha256' is distinct from binding.original_sha256
    or review->>'baselineId' is distinct from binding.baseline_id::text
    or review->>'baselineSha256' is distinct from binding.baseline_sha256
    or coalesce(review->>'decision' in ('confirmed','rejected'),false) is not true
    or jsonb_typeof(review->'note') is distinct from 'string'
    or jsonb_typeof(review->'reviewerName') is distinct from 'string'
    or length(btrim(review->>'note')) not between 1 and 2000
    or length(btrim(review->>'reviewerName')) not between 1 and 150
    or replace(review->>'note',E'\n','') ~ '[[:cntrl:]]'
    or replace(review->>'reviewerName',E'\n','') ~ '[[:cntrl:]]'
    or (review->'inspectionId'='null'::jsonb) is distinct from (review->'inspectionSha256'='null'::jsonb)
  then raise exception 'Review does not match the frozen photo and source version' using errcode='23514'; end if;
  select * into strict media from public.project_media where id=binding.media_id and project_id=p_project_id;
  if media.original_sha256 is distinct from binding.original_sha256
    or media.original_validation_sha256 is distinct from binding.original_validation_sha256
    or media.storage_object_id is distinct from binding.storage_object_id
    or media.storage_object_version is distinct from binding.storage_object_version
    or media.storage_object_updated_at is distinct from binding.storage_object_updated_at
  then raise exception 'Original identity changed' using errcode='23514'; end if;
  if review->'inspectionId'<>'null'::jsonb then
    select * into inspection from public.drone_image_inspections where id::text=review->>'inspectionId' and project_id=p_project_id;
    if not found or inspection.status<>'completed' or inspection.media_id<>binding.media_id
      or inspection.result_sha256 is distinct from review->>'inspectionSha256'
      or inspection.original_sha256 is distinct from binding.original_sha256
      or inspection.original_validation_sha256 is distinct from binding.original_validation_sha256
      or inspection.storage_object_id is distinct from binding.storage_object_id
      or inspection.storage_object_version is distinct from binding.storage_object_version
      or inspection.storage_object_updated_at is distinct from binding.storage_object_updated_at
      or inspection.source_snapshot_id is distinct from binding.baseline_id
      or inspection.source_snapshot_sha256 is distinct from binding.baseline_sha256
    then raise exception 'AI draft does not match the reviewed evidence' using errcode='23514'; end if;
  end if;
  content_hash:=encode(pg_catalog.sha256(convert_to(p_review_text,'UTF8')),'hex');
  select * into existing from public.photo_point_review_versions where project_id=p_project_id and reviewed_by=p_actor_id and request_id=p_request_id;
  if found then
    if existing.binding_id is distinct from p_binding_id or existing.review_text is distinct from p_review_text
      or existing.review_sha256 is distinct from content_hash
    then raise exception 'Review request ID is already bound to other content' using errcode='23514'; end if;
    return to_jsonb(existing) - 'binding_sha256';
  end if;
  insert into public.photo_point_review_versions(project_id,binding_id,reviewed_by,request_id,review,review_text,review_sha256)
    values(p_project_id,p_binding_id,p_actor_id,p_request_id,review,p_review_text,content_hash) returning * into saved;
  insert into public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
    values(p_project_id,'photo_point_reviewed','photo_point_review',saved.id,
      case when review->>'decision'='confirmed' then 'Fotopunkt fagligt bekræftet' else 'Fotopunkt fagligt afvist' end,
      p_actor_id::text,'professional_review',jsonb_build_object('review_id',saved.id,'binding_id',p_binding_id,
        'media_id',binding.media_id,'baseline_id',binding.baseline_id,'decision',review->>'decision','review_sha256',content_hash));
  -- Keep the strict public DTO unchanged; the generated FK column is internal.
  return to_jsonb(saved) - 'binding_sha256';
end $$;
revoke all on function public.save_photo_point_review(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_photo_point_review(uuid,uuid,uuid,uuid,text) to service_role;
