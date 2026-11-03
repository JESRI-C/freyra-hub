-- Bind generic reports to an immutable approved submission using the caller's existing RLS.
create unique index report_one_per_work_order_review on public.report_revisions
  ((content->'workOrderApproval'->>'reviewId'))
  where content ? 'workOrderApproval';

create policy report_work_order_scope on public.report_revisions as restrictive
  for select to authenticated using (
    not (content ? 'workOrderApproval')
    or private.can_read_work_order((content->'workOrderApproval'->>'actionId')::uuid)
  );

create function private.bind_work_order_report() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  doc public.report_documents;
  packet public.work_order_submission_versions;
  review public.work_order_lifecycle_versions;
  pin jsonb := new.content->'workOrderApproval';
  refs jsonb;
  sources jsonb;
  execution jsonb;
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
      'method', 'Fastholdt i afleveringen. ?bn opgavens dokumentation for adgang til originalen.',
      'version', e->>'version'
    ) order by e->>'id')
  into refs, sources from jsonb_array_elements(packet.snapshot->'evidence') e;

  execution := packet.snapshot->'execution'->'values';
  new.content := jsonb_build_object(
    'title', (new.content->>'projectName') || ' - Godkendt arbejdsopgave',
    'projectName', new.content->'projectName', 'organizationName', new.content->'organizationName',
    'scope', 'Versionsbundet udf?relse og dokumentation', 'audience', 'Projektets medarbejdere',
    'workOrderApproval', jsonb_build_object(
      'actionId', packet.action_id, 'submissionId', packet.id, 'submissionVersion', packet.version,
      'reviewId', review.id, 'basisHash', packet.basis_hash),
    'sources', sources,
    'sections', jsonb_build_array(
      jsonb_build_object('id', 'plan', 'title', 'Arbejdsgrundlag', 'reviewed', false,
        'basis', 'not_measured', 'sourceIds', '[]'::jsonb,
        'text', concat_ws(E'\n', 'Opgave ' || packet.action_id,
          'Planversion ' || (packet.snapshot->'plan'->>'version'),
          packet.snapshot->'plan'->'plan'->>'instructions')),
      jsonb_build_object('id', 'execution', 'title', 'Registreret udf?relse', 'reviewed', false,
        'basis', 'documented', 'sourceIds', refs,
        'text', concat_ws(E'\n', execution->>'actualDate', execution->>'actualEndDate',
          execution->>'method', execution->>'coverageDescription', execution->>'deviation')),
      jsonb_build_object('id', 'review', 'title', 'Godkendt afleveringsgrundlag', 'reviewed', false,
        'basis', 'documented', 'sourceIds', refs,
        'text', concat_ws(E'\n', 'Afleveringsversion ' || packet.version, 'Aflevering ' || packet.id,
          'Kontrolsum ' || packet.basis_hash, packet.note, 'Gennemgang ' || review.id,
          review.created_at::text, review.reason,
          'Godkendelsen omfatter den registrerede udf?relse og dokumentation.'))
    )
  );
  return new;
end $$;
revoke all on function private.bind_work_order_report() from public, anon, authenticated;
create trigger zz_bind_work_order_report before insert on public.report_revisions
  for each row execute function private.bind_work_order_report();

create function public.save_approved_work_order_report(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_submission_id uuid, p_review_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.report_revisions;
begin
  if auth.uid() is null or not coalesce(private.can_write_project(p_project_id), false)
    or not coalesce(private.can_read_work_order(p_action_id), false)
  then raise exception 'Work order report cannot be created' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('work-order-report:' || p_review_id, 0));
  select r.* into existing from public.report_revisions r
    join public.report_documents d on d.id = r.report_id
    where d.organization_id = p_organization_id and d.project_id = p_project_id
      and r.content->'workOrderApproval'->>'reviewId' = p_review_id::text
      and r.content->'workOrderApproval'->>'submissionId' = p_submission_id::text
      and r.content->'workOrderApproval'->>'actionId' = p_action_id::text;
  if found then return to_jsonb(existing); end if;
  return public.save_report_revision(null, p_organization_id, p_project_id, 0, 'draft',
    jsonb_build_object('title','Arbejdsopgave','scope','Udf?relse','audience','Projektets medarbejdere',
      'sources','[]'::jsonb,
      'sections',jsonb_build_array(jsonb_build_object('id','work-order','title','Arbejdsopgave',
        'text','','sourceIds','[]'::jsonb,'basis','not_measured','reviewed',false)),
      'workOrderApproval',jsonb_build_object('reviewId',p_review_id,'submissionId',p_submission_id,'actionId',p_action_id)));
end $$;
revoke all on function public.save_approved_work_order_report(uuid,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.save_approved_work_order_report(uuid,uuid,uuid,uuid,uuid) to authenticated;
