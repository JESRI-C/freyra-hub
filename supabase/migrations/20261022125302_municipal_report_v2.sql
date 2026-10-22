-- Additive report generator v2. Historical v1 rows and canonical bytes remain unchanged.
-- The writer retains all v1 authorization, immutable input and idempotency guards.
-- New reports bind a planting sketch and exact immutable professional photo decisions.
alter table public.municipal_report_versions
  drop constraint municipal_report_versions_generator_version_check;
alter table public.municipal_report_versions
  add constraint municipal_report_versions_generator_version_check
  check (generator_version in ('municipal-evidence-report/v1','municipal-evidence-report/v2'));
alter table public.municipal_report_versions
  add constraint municipal_report_v2_shape check ((
    (generator_version = 'municipal-evidence-report/v1' and not (manifest ? 'planting') and not (manifest ? 'photoPointReviews'))
    or (generator_version = 'municipal-evidence-report/v2'
      and manifest#>>'{planting,schema}' = 'freyra.planting-suitability/v1'
      and manifest#>>'{planting,projectId}' = project_id::text
      and manifest#>>'{planting,baselineId}' = baseline_id::text
      and manifest#>>'{planting,baselineSha256}' = baseline_sha256
      and manifest#>'{planting,localEffectsCalculated}' = 'false'::jsonb
      and jsonb_typeof(manifest->'photoPointReviews') = 'array'
      and jsonb_array_length(manifest->'photoPointReviews') <= 200)
  ) is true);

create or replace function public.persist_municipal_report(
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
  review_row public.photo_point_review_versions%rowtype;
  review_ids uuid[] := '{}'; review_binding_ids uuid[] := '{}';
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
    and report_manifest->>'generatorVersion' in ('municipal-evidence-report/v1','municipal-evidence-report/v2')
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
      'pins','scope','sources','photos','prioritizedFollowup','deliveryGaps','limitations','planting','photoPointReviews'] = '{}'::jsonb
    and (
      (report_manifest->>'generatorVersion' = 'municipal-evidence-report/v1' and not (report_manifest ? 'planting') and not (report_manifest ? 'photoPointReviews'))
      or (report_manifest->>'generatorVersion' = 'municipal-evidence-report/v2' and jsonb_typeof(report_manifest->'planting') = 'object' and jsonb_typeof(report_manifest->'photoPointReviews') = 'array' and jsonb_array_length(report_manifest->'photoPointReviews') <= 200)
    )
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
    or plan_row.baseline_sha256 is distinct from baseline_row.manifest_sha256 or plan_row.manifest->>'status' is distinct from 'draft'
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
  if report_manifest->>'generatorVersion' = 'municipal-evidence-report/v2' then
    if (report_manifest#>>'{planting,schema}' = 'freyra.planting-suitability/v1'
      and report_manifest#>>'{planting,notice}' = 'Skitse – kræver faglig validering'
      and report_manifest#>>'{planting,projectId}' = p_project_id::text
      and report_manifest#>>'{planting,baselineId}' = selected_baseline_id::text
      and report_manifest#>>'{planting,baselineSha256}' = baseline_row.manifest_sha256
      and report_manifest#>'{planting,localEffectsCalculated}' = 'false'::jsonb
      and report_manifest#>>'{planting,status}' in ('complete','partial','unavailable')
      and jsonb_typeof(report_manifest#>'{planting,warnings}') = 'array'
      and (report_manifest->'planting') - array['schema','notice','projectId','baselineId','baselineSha256',
        'status','sources','warnings','reaches','localEffectsCalculated','literature'] = '{}'::jsonb
      and jsonb_typeof(report_manifest#>'{planting,reaches}') = 'array'
      and jsonb_array_length(report_manifest#>'{planting,reaches}') = 10
      and jsonb_typeof(report_manifest#>'{planting,sources}') = 'array'
      and jsonb_array_length(report_manifest#>'{planting,sources}') = 5
      and jsonb_typeof(report_manifest#>'{planting,literature}') = 'array'
      and jsonb_array_length(report_manifest#>'{planting,literature}') = 4
    ) is not true then raise exception 'Invalid exact planting summary' using errcode = '23514'; end if;
    -- Reject unreadable summaries at the DB boundary as well as in the compiler.
    -- Unknown hectare coverage must stay null; it must never silently become zero.
    if exists (select 1 from jsonb_array_elements(report_manifest#>'{planting,reaches}') reach
      where case when jsonb_typeof(reach) <> 'object' then true else (reach->>'reach' in ('A','B','C','D','E')
        and reach->'bufferM' in ('10'::jsonb,'20'::jsonb)
        and reach->>'status' in ('complete','unknown')
        and jsonb_typeof(reach->'reason') in ('string','null')
        and reach - array['reach','bufferM','status','suitableHa','conditionalHa','unsuitableHa','reason'] = '{}'::jsonb
        and case when reach->>'status' = 'unknown' then
          reach->'suitableHa' = 'null'::jsonb and reach->'conditionalHa' = 'null'::jsonb and reach->'unsuitableHa' = 'null'::jsonb
        else
          case when jsonb_typeof(reach->'suitableHa') = 'number' then (reach->>'suitableHa')::numeric >= 0 else false end
          and case when jsonb_typeof(reach->'conditionalHa') = 'number' then (reach->>'conditionalHa')::numeric >= 0 else false end
          and case when jsonb_typeof(reach->'unsuitableHa') = 'number' then (reach->>'unsuitableHa')::numeric >= 0 else false end
        end) is not true end)
      or (select count(distinct (reach->>'reach',reach->>'bufferM'))
          from jsonb_array_elements(report_manifest#>'{planting,reaches}') reach) <> 10
      or exists (select 1 from jsonb_array_elements(report_manifest#>'{planting,sources}') source
        where case when jsonb_typeof(source) <> 'object' then true else (source->>'id' in ('watercourse','section3','woodland','lowland','fields')
          and jsonb_typeof(source->'label') = 'string'
          and source->>'coverage' in ('complete','partial','unavailable')
          and jsonb_typeof(source->'fetchedAt') in ('string','null')
          and jsonb_typeof(source->'sourceUrl') in ('string','null')
          and jsonb_typeof(source->'warnings') = 'array'
          and source - array['id','label','coverage','fetchedAt','sourceUrl','warnings'] = '{}'::jsonb) is not true end)
      or (select count(distinct source->>'id') from jsonb_array_elements(report_manifest#>'{planting,sources}') source) <> 5
      or exists (select 1 from jsonb_array_elements(report_manifest#>'{planting,literature}') citation
        where case when jsonb_typeof(citation) <> 'object' then true else (jsonb_typeof(citation->'effect') = 'string'
          and jsonb_typeof(citation->'interval') in ('string','null')
          and jsonb_typeof(citation->'context') = 'string'
          and jsonb_typeof(citation->'citation') = 'string'
          and citation->>'sourceUrl' like 'https://%'
          and citation->>'checkedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          and citation - array['effect','interval','context','citation','sourceUrl','checkedAt'] = '{}'::jsonb) is not true end)
    then raise exception 'Invalid planting sources, literature or reach coverage' using errcode = '23514'; end if;
    for pin in select value from jsonb_array_elements(report_manifest->'photoPointReviews') loop
      select * into review_row from public.photo_point_review_versions
        where project_id = p_project_id and id = (pin->>'id')::uuid;
      if not found or review_row.id = any(review_ids) or review_row.binding_id = any(review_binding_ids)
        or not (review_row.binding_id = any(binding_ids))
        or review_row.created_at > generated_time
        or (pin->>'createdAt')::timestamptz is distinct from review_row.created_at
        or (pin - 'createdAt') is distinct from jsonb_build_object(
          'id',review_row.id,'projectId',review_row.project_id,'bindingId',review_row.binding_id,
          'reviewedBy',review_row.reviewed_by,'requestId',review_row.request_id,
          'review',review_row.review,'reviewSha256',review_row.review_sha256)
        or review_row.review->>'baselineId' is distinct from selected_baseline_id::text
        or review_row.review->>'baselineSha256' is distinct from baseline_row.manifest_sha256
        or not exists (select 1 from public.survey_round_media_versions b
          where b.id = review_row.binding_id and b.id = any(binding_ids)
            and b.manifest_sha256 = review_row.review->>'bindingSha256'
            and b.media_id::text = review_row.review->>'mediaId'
            and b.original_sha256 = review_row.review->>'originalSha256')
        or (review_row.review->>'inspectionId' is not null and not exists (
          select 1 from public.drone_image_inspections i
          where i.id = any(inspection_ids) and i.id::text = review_row.review->>'inspectionId'
            and i.result_sha256 = review_row.review->>'inspectionSha256'
            and i.media_id::text = review_row.review->>'mediaId')) then
        raise exception 'Invalid exact photo point review' using errcode = '23514';
      end if;
      review_ids := array_append(review_ids,review_row.id);
      review_binding_ids := array_append(review_binding_ids,review_row.binding_id);
    end loop;
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
    selected_round_id,round_row.manifest_sha256,report_manifest->>'generatorVersion','draft_unreviewed',generated_time,report_hash,
    report_manifest,p_manifest_text,p_actor_id,p_request_id) returning * into inserted;
  return to_jsonb(inserted);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'Invalid municipal report content or source pin' using errcode = '23514';
end $$;
revoke all on function public.persist_municipal_report(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.persist_municipal_report(uuid,uuid,uuid,text) to service_role;
