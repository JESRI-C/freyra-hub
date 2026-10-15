-- Immutable report snapshots. Browser input selects a round; the authenticated
-- server loads canonical versions and compiles the full manifest before writing.
-- A report is always an unreviewed draft, never municipal/professional approval.
-- Select latest versions before bounding new-report inputs. The invoker's base
-- table permissions and RLS still apply; historical report reads use base IDs.
create view public.municipal_report_latest_answers with (security_invoker = true) as
select distinct on (project_id,inspection_id)
  id,project_id,inspection_id,inspection_result_sha256,created_by,request_id,
  answers,answers_text,answers_sha256,status,professionally_reviewed,report_eligible,created_at
from public.drone_image_inspection_answer_versions
order by project_id,inspection_id,created_at desc,id desc;
revoke all on public.municipal_report_latest_answers from public,anon,authenticated,service_role;
grant select on public.municipal_report_latest_answers to authenticated,service_role;

create table public.municipal_report_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  baseline_id uuid not null, baseline_sha256 text not null check (baseline_sha256 ~ '^[0-9a-f]{64}$'),
  plan_id uuid not null, plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  round_version_id uuid not null, round_sha256 text not null check (round_sha256 ~ '^[0-9a-f]{64}$'),
  generator_version text not null check (generator_version = 'municipal-evidence-report/v1'),
  status text not null default 'draft_unreviewed' check (status = 'draft_unreviewed'),
  report_eligible boolean not null default false check (not report_eligible),
  professionally_reviewed boolean not null default false check (not professionally_reviewed),
  municipal_scope_approved boolean not null default false check (not municipal_scope_approved),
  generated_at timestamptz not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null, manifest_text text not null,
  created_at timestamptz not null default now(), created_by uuid not null, request_id uuid not null,
  constraint municipal_report_baseline foreign key (project_id,baseline_id,baseline_sha256)
    references public.project_baseline_snapshots(project_id,id,manifest_sha256) on delete restrict,
  constraint municipal_report_plan foreign key (project_id,plan_id,plan_sha256,baseline_id,baseline_sha256)
    references public.verification_plan_versions(project_id,id,manifest_sha256,baseline_id,baseline_sha256) on delete restrict,
  constraint municipal_report_round foreign key (project_id,round_version_id,round_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256)
    references public.survey_round_versions(project_id,id,manifest_sha256,baseline_id,baseline_sha256,plan_id,plan_sha256) on delete restrict,
  constraint municipal_report_bytes check (
    octet_length(manifest_text) <= 2097152 and octet_length(manifest::text) <= 2097152
    and manifest_text::jsonb = manifest
    and encode(pg_catalog.sha256(convert_to(manifest_text,'UTF8')),'hex') = manifest_sha256
  ),
  constraint municipal_report_shape check ((
    jsonb_typeof(manifest) = 'object'
    and manifest->>'schema' = 'gofreyra.municipal-report/v1'
    and manifest->>'generatorVersion' = generator_version
    and manifest->>'projectId' = project_id::text and manifest->>'status' = status
    and manifest->>'recipient' = 'Haderslev Kommune'
    and manifest->'reportEligible' = 'false'::jsonb
    and manifest->'professionallyReviewed' = 'false'::jsonb
    and manifest->'municipalScopeApproved' = 'false'::jsonb
    and manifest#>>'{pins,baseline,id}' = baseline_id::text
    and manifest#>>'{pins,baseline,sha256}' = baseline_sha256
    and manifest#>>'{pins,plan,id}' = plan_id::text
    and manifest#>>'{pins,plan,sha256}' = plan_sha256
    and manifest#>>'{pins,round,id}' = round_version_id::text
    and manifest#>>'{pins,round,sha256}' = round_sha256
    and jsonb_typeof(manifest->'generatedAt') = 'string'
    and (manifest->>'generatedAt')::timestamptz = generated_at
  ) is true),
  unique(project_id,version_no), unique(project_id,created_by,request_id),
  unique(project_id,id,manifest_sha256)
);
create index municipal_report_round_cursor
  on public.municipal_report_versions(project_id,round_version_id,version_no desc);
alter table public.municipal_report_versions enable row level security;
revoke all on public.municipal_report_versions from public,anon,authenticated,service_role;
grant select on public.municipal_report_versions to authenticated;
grant select,insert on public.municipal_report_versions to service_role;
create policy municipal_report_project_read on public.municipal_report_versions
  for select to authenticated using (private.can_read_project(project_id));
create function private.reject_municipal_report_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Saved municipal report versions are immutable' using errcode = '23514';
end $$;
revoke all on function private.reject_municipal_report_mutation() from public,anon,authenticated,service_role;
create trigger municipal_report_immutable before update or delete on public.municipal_report_versions
  for each row execute function private.reject_municipal_report_mutation();

-- Canonical text is produced by the frozen server compiler, never the browser.
-- The database hashes its exact UTF-8 bytes and independently checks every pin
-- against real immutable rows. Existing report reads never sign/read Storage.
create function public.persist_municipal_report(
  p_project_id uuid, p_actor_id uuid, p_request_id uuid, p_manifest_text text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  project_row public.projects%rowtype;
  baseline_row public.project_baseline_snapshots%rowtype;
  plan_row public.verification_plan_versions%rowtype;
  round_row public.survey_round_versions%rowtype;
  binding_row public.survey_round_media_versions%rowtype;
  note_row public.survey_round_note_versions%rowtype;
  inspection_row public.drone_image_inspections%rowtype;
  answer_row public.drone_image_inspection_answer_versions%rowtype;
  existing public.municipal_report_versions%rowtype;
  inserted public.municipal_report_versions%rowtype;
  organization_role text; project_role text; report_manifest jsonb; pins jsonb; pin jsonb;
  selected_baseline_id uuid; selected_plan_id uuid; selected_round_id uuid; generated_time timestamptz;
  binding_ids uuid[] := '{}'; media_ids uuid[] := '{}'; note_ids uuid[] := '{}';
  inspection_ids uuid[] := '{}'; answer_ids uuid[] := '{}'; answer_inspection_ids uuid[] := '{}';
  report_hash text; next_version integer;
begin
  if p_actor_id is null or p_request_id is null then
    raise exception 'Verified actor and request required' using errcode = '22023';
  end if;
  -- Same global ordering as the other writers. Only captured locked roles may authorize.
  select * into project_row from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project access denied' using errcode = '42501'; end if;
  select membership.role::text into organization_role from public.organization_memberships membership
    where membership.organization_id = project_row.organization_id and membership.user_id = p_actor_id for share;
  select member.role::text into project_role from public.project_members member
    where member.project_id = p_project_id and member.user_id = p_actor_id for share;
  if coalesce(organization_role in ('owner','admin') or
    (organization_role is not null and project_role in ('admin','project_manager','editor')),false) is not true then
    raise exception 'Project report access denied' using errcode = '42501';
  end if;
  if p_manifest_text is null or octet_length(p_manifest_text) > 2097152 then
    raise exception 'Invalid or oversized municipal report' using errcode = '23514';
  end if;
  report_manifest := p_manifest_text::jsonb;
  if (
    jsonb_typeof(report_manifest) = 'object'
    and octet_length(report_manifest::text) <= 2097152
    and report_manifest->>'schema' = 'gofreyra.municipal-report/v1'
    and report_manifest->>'generatorVersion' = 'municipal-evidence-report/v1'
    and report_manifest->>'projectId' = p_project_id::text
    and report_manifest->>'recipient' = 'Haderslev Kommune'
    and report_manifest->>'status' = 'draft_unreviewed'
    and report_manifest->'reportEligible' = 'false'::jsonb
    and report_manifest->'professionallyReviewed' = 'false'::jsonb
    and report_manifest->'municipalScopeApproved' = 'false'::jsonb
    and jsonb_typeof(report_manifest->'generatedAt') = 'string'
    and report_manifest->>'generatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    and jsonb_typeof(report_manifest->'projectName') = 'string'
    and jsonb_typeof(report_manifest->'purpose') = 'string'
    and jsonb_typeof(report_manifest->'executiveSummary') = 'array'
    and jsonb_typeof(report_manifest->'scope') = 'object'
    and report_manifest#>>'{scope,actualCoverage}' = 'not_verified'
    and report_manifest#>>'{scope,spatialInterpretation}' = 'saved_reference_and_aoi_not_approved_municipal_reach'
    and jsonb_typeof(report_manifest->'sources') = 'array'
    and jsonb_array_length(report_manifest->'sources') <= 30
    and jsonb_typeof(report_manifest->'photos') = 'array'
    and jsonb_array_length(report_manifest->'photos') <= 200
    and jsonb_typeof(report_manifest->'prioritizedFollowup') = 'array'
    and jsonb_array_length(report_manifest->'prioritizedFollowup') <= 5000
    and jsonb_typeof(report_manifest->'deliveryGaps') = 'array'
    and jsonb_array_length(report_manifest->'deliveryGaps') <= 500
    and jsonb_typeof(report_manifest->'limitations') = 'array'
    and report_manifest - array['schema','generatorVersion','projectId','generatedAt','recipient','status',
      'reportEligible','professionallyReviewed','municipalScopeApproved','projectName','purpose','executiveSummary',
      'pins','scope','sources','photos','prioritizedFollowup','deliveryGaps','limitations'] = '{}'::jsonb
  ) is not true then raise exception 'Invalid municipal report schema' using errcode = '23514'; end if;
  generated_time := (report_manifest->>'generatedAt')::timestamptz;
  if not isfinite(generated_time) or generated_time < timestamptz '0001-01-01T00:00:00Z'
    or generated_time >= timestamptz '10000-01-01T00:00:00Z' then
    raise exception 'Invalid report generation time' using errcode = '23514';
  end if;
  pins := report_manifest->'pins';
  if (
    jsonb_typeof(pins) = 'object'
    and jsonb_typeof(pins->'baseline') = 'object'
    and jsonb_typeof(pins->'plan') = 'object'
    and jsonb_typeof(pins->'round') = 'object'
    and jsonb_typeof(pins->'mediaBindings') = 'array' and jsonb_array_length(pins->'mediaBindings') <= 200
    and jsonb_typeof(pins->'notes') = 'array' and jsonb_array_length(pins->'notes') <= 400
    and jsonb_typeof(pins->'inspections') = 'array' and jsonb_array_length(pins->'inspections') <= 400
    and jsonb_typeof(pins->'answers') = 'array' and jsonb_array_length(pins->'answers') <= 400
    and pins - array['baseline','plan','round','mediaBindings','notes','inspections','answers'] = '{}'::jsonb
  ) is not true then raise exception 'Invalid report source pins' using errcode = '23514'; end if;
  selected_baseline_id := (pins#>>'{baseline,id}')::uuid;
  selected_plan_id := (pins#>>'{plan,id}')::uuid;
  selected_round_id := (pins#>>'{round,id}')::uuid;
  -- Immutable inputs need SELECT only, never new UPDATE grants or row locks.
  select * into baseline_row from public.project_baseline_snapshots
    where project_id = p_project_id and id = selected_baseline_id;
  if not found or pins->'baseline' is distinct from
    jsonb_build_object('id',baseline_row.id,'sha256',baseline_row.manifest_sha256) then
    raise exception 'Invalid exact report baseline' using errcode = '23514';
  end if;
  select * into plan_row from public.verification_plan_versions where project_id = p_project_id and id = selected_plan_id;
  if not found or plan_row.baseline_id is distinct from selected_baseline_id
    or plan_row.baseline_sha256 is distinct from baseline_row.manifest_sha256 or plan_row.status <> 'draft'
    or pins->'plan' is distinct from jsonb_build_object('id',plan_row.id,'sha256',plan_row.manifest_sha256) then
    raise exception 'Invalid exact report plan' using errcode = '23514';
  end if;
  select * into round_row from public.survey_round_versions where project_id = p_project_id and id = selected_round_id;
  if not found or round_row.baseline_id is distinct from selected_baseline_id
    or round_row.baseline_sha256 is distinct from baseline_row.manifest_sha256
    or round_row.plan_id is distinct from selected_plan_id or round_row.plan_sha256 is distinct from plan_row.manifest_sha256
    or round_row.status <> 'draft'
    or pins->'round' is distinct from jsonb_build_object('id',round_row.id,'sha256',round_row.manifest_sha256) then
    raise exception 'Invalid exact report round' using errcode = '23514';
  end if;
  for pin in select value from jsonb_array_elements(pins->'mediaBindings') loop
    select * into binding_row from public.survey_round_media_versions
      where project_id = p_project_id and id = (pin->>'id')::uuid;
    if not found or binding_row.id = any(binding_ids) or binding_row.media_id = any(media_ids)
      or binding_row.round_version_id is distinct from selected_round_id or binding_row.round_sha256 is distinct from round_row.manifest_sha256
      or binding_row.baseline_id is distinct from selected_baseline_id or binding_row.baseline_sha256 is distinct from baseline_row.manifest_sha256
      or binding_row.plan_id is distinct from selected_plan_id or binding_row.plan_sha256 is distinct from plan_row.manifest_sha256
      or binding_row.status <> 'draft_assignment'
      or pin is distinct from jsonb_build_object('id',binding_row.id,'sha256',binding_row.manifest_sha256,
        'mediaId',binding_row.media_id,'originalSha256',binding_row.original_sha256,
        'originalValidationSha256',binding_row.original_validation_sha256) then
      raise exception 'Invalid exact report photo binding' using errcode = '23514';
    end if;
    binding_ids := array_append(binding_ids,binding_row.id);
    media_ids := array_append(media_ids,binding_row.media_id);
  end loop;
  for pin in select value from jsonb_array_elements(pins->'notes') loop
    select * into note_row from public.survey_round_note_versions
      where project_id = p_project_id and id = (pin->>'id')::uuid;
    if not found or note_row.id = any(note_ids) or not (note_row.media_binding_id = any(binding_ids))
      or note_row.round_version_id is distinct from selected_round_id or note_row.round_sha256 is distinct from round_row.manifest_sha256
      or note_row.baseline_id is distinct from selected_baseline_id or note_row.baseline_sha256 is distinct from baseline_row.manifest_sha256
      or note_row.plan_id is distinct from selected_plan_id or note_row.plan_sha256 is distinct from plan_row.manifest_sha256
      or note_row.status <> 'draft_unreviewed'
      or pin is distinct from jsonb_build_object('id',note_row.id,'sha256',note_row.manifest_sha256) then
      raise exception 'Invalid exact report manual note' using errcode = '23514';
    end if;
    note_ids := array_append(note_ids,note_row.id);
  end loop;
  for pin in select value from jsonb_array_elements(pins->'inspections') loop
    select * into inspection_row from public.drone_image_inspections
      where project_id = p_project_id and id = (pin->>'id')::uuid;
    if not found or inspection_row.id = any(inspection_ids) or not (inspection_row.media_id = any(media_ids))
      or inspection_row.status <> 'completed' or inspection_row.result_sha256 is null
      or inspection_row.source_snapshot_id is distinct from selected_baseline_id
      or inspection_row.source_snapshot_sha256 is distinct from baseline_row.manifest_sha256
      or pin is distinct from jsonb_build_object('id',inspection_row.id,'sha256',inspection_row.result_sha256,'mediaId',inspection_row.media_id)
      or not exists (select 1 from public.survey_round_media_versions binding
        where binding.id = any(binding_ids) and binding.media_id = inspection_row.media_id
          and binding.original_sha256 = inspection_row.original_sha256
          and binding.original_validation_sha256 = inspection_row.original_validation_sha256) then
      raise exception 'Invalid exact report image inspection' using errcode = '23514';
    end if;
    inspection_ids := array_append(inspection_ids,inspection_row.id);
  end loop;
  for pin in select value from jsonb_array_elements(pins->'answers') loop
    select * into answer_row from public.drone_image_inspection_answer_versions
      where project_id = p_project_id and id = (pin->>'id')::uuid;
    if not found or answer_row.id = any(answer_ids) or answer_row.inspection_id = any(answer_inspection_ids)
      or not (answer_row.inspection_id = any(inspection_ids))
      or answer_row.status <> 'draft_unreviewed' or answer_row.professionally_reviewed or answer_row.report_eligible
      or pin is distinct from jsonb_build_object('id',answer_row.id,'sha256',answer_row.answers_sha256,'inspectionId',answer_row.inspection_id)
      or not exists (select 1 from public.drone_image_inspections inspection
        where inspection.id = answer_row.inspection_id and inspection.project_id = p_project_id
          and inspection.result_sha256 = answer_row.inspection_result_sha256) then
      raise exception 'Invalid exact report answer version' using errcode = '23514';
    end if;
    answer_ids := array_append(answer_ids,answer_row.id);
    answer_inspection_ids := array_append(answer_inspection_ids,answer_row.inspection_id);
  end loop;
  -- One photo section per included original; extra invented or dropped sections fail closed.
  if jsonb_array_length(report_manifest->'photos') <> cardinality(media_ids)
    or exists (select 1 from jsonb_array_elements(report_manifest->'photos') photo
      where jsonb_typeof(photo) <> 'object' or not exists (
        select 1 from public.survey_round_media_versions binding
        where binding.id = any(binding_ids) and binding.id::text = photo->>'bindingId'
          and binding.manifest_sha256 = photo->>'bindingSha256'
          and binding.media_id::text = photo->>'mediaId'
          and binding.original_sha256 = photo->>'originalSha256'
          and binding.original_validation_sha256 = photo->>'originalValidationSha256'
      ))
    or (select count(distinct photo->>'mediaId') from jsonb_array_elements(report_manifest->'photos') photo) <> cardinality(media_ids) then
    raise exception 'Report photo sections do not match pinned originals' using errcode = '23514';
  end if;
  select * into existing from public.municipal_report_versions
    where project_id = p_project_id and created_by = p_actor_id and request_id = p_request_id;
  if found then
    -- Concurrent first calls may choose different generation times. Every other
    -- value, including selected versions, text, status and source data, must match.
    if (existing.manifest - 'generatedAt') is distinct from (report_manifest - 'generatedAt') then
      raise exception 'Request already belongs to another report snapshot' using errcode = '23514';
    end if;
    return to_jsonb(existing);
  end if;
  report_hash := encode(pg_catalog.sha256(convert_to(p_manifest_text,'UTF8')),'hex');
  select coalesce(max(version_no),0)+1 into next_version from public.municipal_report_versions where project_id = p_project_id;
  insert into public.municipal_report_versions(project_id,version_no,baseline_id,baseline_sha256,plan_id,plan_sha256,
    round_version_id,round_sha256,generator_version,status,generated_at,manifest_sha256,manifest,manifest_text,created_by,request_id)
  values(p_project_id,next_version,selected_baseline_id,baseline_row.manifest_sha256,selected_plan_id,plan_row.manifest_sha256,
    selected_round_id,round_row.manifest_sha256,'municipal-evidence-report/v1','draft_unreviewed',generated_time,report_hash,
    report_manifest,p_manifest_text,p_actor_id,p_request_id) returning * into inserted;
  return to_jsonb(inserted);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'Invalid municipal report content or source pin' using errcode = '23514';
end $$;
revoke all on function public.persist_municipal_report(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.persist_municipal_report(uuid,uuid,uuid,text) to service_role;
