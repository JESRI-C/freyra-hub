-- Show the goal from the approved submission in the report and its exports.
create or replace function private.bind_work_order_report() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  doc public.report_documents;
  packet public.work_order_submission_versions;
  review public.work_order_lifecycle_versions;
  pin jsonb := new.content->'workOrderApproval';
  refs jsonb;
  sources jsonb;
  execution jsonb;
  indicator_target jsonb;
begin
  if new.version > 1 and exists (
    select 1 from public.report_revisions where report_id = new.report_id
    and content ? 'workOrderApproval'
  ) then raise exception 'The approved work order report is immutable'; end if;
  if pin is null then return new; end if;
  select * into doc from public.report_documents where id = new.report_id;
  if new.version <> 1 or new.status <> 'draft' or new.content ? 'workflowSnapshot'
    or new.content ? 'photoAtlas' or not coalesce(private.can_write_project(doc.project_id), false)
  then raise exception 'Work order report cannot be created' using errcode = '42501'; end if;

  select * into review from public.work_order_lifecycle_versions
  where id = (pin->>'reviewId')::uuid and operation = 'review' and status = 'approved'
    and review_scope = 'execution_and_documentation' and action_id = (pin->>'actionId')::uuid
    and organization_id = doc.organization_id and project_id = doc.project_id;
  select * into packet from public.work_order_submission_versions
  where id = review.submission_version_id and id = (pin->>'submissionId')::uuid
    and action_id = review.action_id and organization_id = doc.organization_id and project_id = doc.project_id;
  if packet.id is null then raise exception 'Approved submission not accessible' using errcode = '42501'; end if;

  select jsonb_agg('task-original:' || (e->>'id') order by e->>'id'),
    jsonb_agg(jsonb_build_object(
      'id', 'task-original:' || (e->>'id'), 'title', 'Originalfoto ' || (e->>'upload_id'),
      'kind', 'Originalfoto', 'capturedAt', e->'original_snapshot'->'capturedAt',
      'checksum', e->'original_snapshot'->>'sha256', 'position', null,
      'method', 'Fastholdt i afleveringen. Åbn opgavens dokumentation for adgang til originalen.',
      'version', e->>'version'
    ) order by e->>'id')
  into refs, sources from jsonb_array_elements(packet.snapshot->'evidence') e;

  execution := packet.snapshot->'execution'->'values';
  indicator_target := packet.snapshot->'indicatorTarget';
  new.content := jsonb_build_object(
    'title', (new.content->>'projectName') || ' - Godkendt arbejdsopgave',
    'projectName', new.content->'projectName', 'organizationName', new.content->'organizationName',
    'scope', 'Versionsbundet udførelse og dokumentation', 'audience', 'Projektets medarbejdere',
    'workOrderApproval', jsonb_build_object(
      'actionId', packet.action_id, 'submissionId', packet.id, 'submissionVersion', packet.version,
      'reviewId', review.id, 'basisHash', packet.basis_hash),
    'sources', sources,
    'sections', jsonb_build_array(
      jsonb_build_object('id', 'plan', 'title', 'Arbejdsgrundlag', 'reviewed', false,
        'basis', 'not_measured', 'sourceIds', '[]'::jsonb,
        'text', concat_ws(E'\n', 'Opgave ' || packet.action_id,
          'Planversion ' || (packet.snapshot->'plan'->>'version'),
          packet.snapshot->'plan'->'plan'->>'instructions',
          case when indicator_target is not null then
            concat_ws(' ', 'Mål ved aflevering:', (indicator_target->>'label') || ' ·',
              case indicator_target->>'direction' when 'at_most' then 'højst' else 'mindst' end,
              indicator_target->>'value', indicator_target->>'unit')
          end)),
      jsonb_build_object('id', 'execution', 'title', 'Registreret udførelse', 'reviewed', false,
        'basis', 'documented', 'sourceIds', refs,
        'text', concat_ws(E'\n', execution->>'actualDate', execution->>'actualEndDate',
          execution->>'method', execution->>'coverageDescription', execution->>'deviation')),
      jsonb_build_object('id', 'review', 'title', 'Godkendt afleveringsgrundlag', 'reviewed', false,
        'basis', 'documented', 'sourceIds', refs,
        'text', concat_ws(E'\n', 'Afleveringsversion ' || packet.version, 'Aflevering ' || packet.id,
          'Kontrolsum ' || packet.basis_hash, packet.note, 'Gennemgang ' || review.id,
          review.created_at::text, review.reason,
          'Godkendelsen omfatter den registrerede udførelse og dokumentation.'))
    )
  );
  return new;
end $$;
revoke all on function private.bind_work_order_report() from public, anon, authenticated;
