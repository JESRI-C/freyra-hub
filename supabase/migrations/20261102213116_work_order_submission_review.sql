-- D05b: the existing operational lifecycle owns submission/review/reopening.
-- A review covers the pinned execution and documentation, never an automatic nature-effect claim.
ALTER TABLE public.work_order_lifecycle_versions
  ADD COLUMN submission_version_id uuid,
  ADD COLUMN review_scope text,
  DROP CONSTRAINT work_order_lifecycle_versions_operation_check,
  ADD CONSTRAINT work_order_lifecycle_operation_check CHECK(operation IN('transition','confirm','block','unblock','submit','review','reopen')),
  ADD CONSTRAINT work_order_lifecycle_submission_scope FOREIGN KEY(submission_version_id,action_id,organization_id,project_id)
    REFERENCES public.work_order_submission_versions(id,action_id,organization_id,project_id) ON DELETE RESTRICT,
  ADD CONSTRAINT work_order_lifecycle_review_scope CHECK(
    (operation='review' AND status IN('approved','returned') AND review_scope IS NOT NULL AND review_scope='execution_and_documentation' AND submission_version_id IS NOT NULL)
    OR (operation<>'review' AND review_scope IS NULL)),
  ADD CONSTRAINT work_order_lifecycle_submission_required CHECK(operation NOT IN('submit','review','reopen') OR submission_version_id IS NOT NULL);
CREATE INDEX work_order_lifecycle_submission_reference ON public.work_order_lifecycle_versions(submission_version_id,action_id,organization_id,project_id);

-- Same advisory namespaces as the existing task and access writers; membership changes wait.
CREATE FUNCTION private.lock_work_order_review_context(p_action_id uuid,p_project_id uuid,p_operation text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; permitted boolean;
BEGIN
 IF auth.uid() IS NULL OR p_operation IS NULL OR p_operation NOT IN('submit','review','reopen') THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-access:'||p_action_id::text||':'||auth.uid()::text,0));
 SELECT organization_id INTO org FROM public.work_orders WHERE action_id=p_action_id AND project_id=p_project_id;
 IF org IS NULL OR NOT private.can_read_work_order(p_action_id) THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.organization_memberships WHERE organization_id=org AND user_id=auth.uid() FOR SHARE;
 PERFORM 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=auth.uid() FOR SHARE;
 permitted:=CASE p_operation WHEN 'review' THEN private.can_review_work_order(p_action_id)
   WHEN 'submit' THEN private.can_contribute_project(p_project_id) AND private.can_execute_work_order(p_action_id)
   ELSE private.can_manage_project(p_project_id) OR (private.can_contribute_project(p_project_id) AND private.can_execute_work_order(p_action_id)) END;
 IF NOT private.can_read_work_order(p_action_id) OR NOT permitted THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION private.lock_work_order_review_context(uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.lock_work_order_review_context(uuid,uuid,text) TO authenticated;

CREATE FUNCTION private.work_order_submission_self_review(p_submission_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.work_order_submission_versions;
BEGIN
 SELECT * INTO s FROM public.work_order_submission_versions WHERE id=p_submission_id;
 IF s.id IS NULL OR auth.uid() IS NULL OR NOT private.can_read_work_order(s.action_id) THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
 RETURN coalesce(s.created_by=auth.uid()
  OR s.snapshot->'execution'->'binding'->>'created_by'=auth.uid()::text
  OR s.snapshot->'execution'->'binding'->>'performed_by_id'=auth.uid()::text
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.snapshot->'evidence') ev
    WHERE ev->>'created_by'=auth.uid()::text OR ev->'observation_snapshot'->>'recordedBy'=auth.uid()::text)
  OR EXISTS(SELECT 1 FROM public.work_order_lifecycle_versions l WHERE l.submission_version_id=s.id AND l.operation='submit' AND l.created_by=auth.uid()),false);
END $$;
REVOKE ALL ON FUNCTION private.work_order_submission_self_review(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.work_order_submission_self_review(uuid) TO authenticated;

-- Helper result is canonical derived lifecycle fields, not a new status store.
CREATE FUNCTION private.apply_work_order_submission_review(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_previous_id uuid,p_values jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE previous public.work_order_lifecycle_versions;s public.work_order_submission_versions;latest_id uuid;built jsonb;b jsonb;op text:=p_values->>'operation';target text:=p_values->>'targetStatus';
BEGIN
 PERFORM private.lock_work_order_review_context(p_action_id,p_project_id,op);
 SELECT * INTO previous FROM public.work_order_lifecycle_versions WHERE id=p_previous_id AND action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id;
 SELECT * INTO s FROM public.work_order_submission_versions WHERE id=(p_values->>'submissionVersionId')::uuid AND action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id;
 IF previous.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'Submission reference unavailable' USING ERRCODE='42501';END IF;
 IF previous.blocked THEN RAISE EXCEPTION 'Resolve the active block before submission or review' USING ERRCODE='22023';END IF;
 IF op='reopen' THEN
   IF previous.submission_version_id IS DISTINCT FROM s.id OR previous.status NOT IN('submitted','returned','approved') THEN RAISE EXCEPTION 'Submission state changed' USING ERRCODE='PT409';END IF;
   IF previous.status='approved' AND NOT private.can_manage_project(p_project_id) THEN RAISE EXCEPTION 'Reopening approved work requires the project manager' USING ERRCODE='42501';END IF;
   b:=private.work_order_lifecycle_basis(p_action_id);
   IF p_values->>'planVersionId' IS DISTINCT FROM b->>'planVersionId' OR p_values->>'assignmentVersionId' IS DISTINCT FROM b->>'assignmentVersionId' OR p_values->>'executionRevisionId' IS DISTINCT FROM b->>'executionRevisionId' THEN RAISE EXCEPTION 'Work-order basis changed' USING ERRCODE='PT409';END IF;
 ELSE
   IF p_values->>'planVersionId' IS DISTINCT FROM s.plan_version_id::text OR p_values->>'assignmentVersionId' IS DISTINCT FROM s.assignment_version_id::text OR p_values->>'executionRevisionId' IS DISTINCT FROM s.execution_revision_id::text THEN RAISE EXCEPTION 'Pinned submission basis changed' USING ERRCODE='PT409';END IF;
   IF op='submit' THEN
     SELECT id INTO latest_id FROM public.work_order_submission_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;
     IF previous.status<>'performed' OR latest_id IS DISTINCT FROM s.id THEN RAISE EXCEPTION 'Submit the latest prepared version from performed work' USING ERRCODE='PT409';END IF;
     built:=private.build_work_order_submission(p_action_id,p_organization_id,p_project_id,true);
     IF built->>'basisHash' IS DISTINCT FROM s.basis_hash THEN RAISE EXCEPTION 'Submission basis changed' USING ERRCODE='PT409';END IF;
     IF jsonb_array_length(built->'gaps')>0 THEN RAISE EXCEPTION 'Submission requirements incomplete' USING ERRCODE='22023';END IF;
   ELSE
     IF previous.status<>'submitted' OR previous.submission_version_id IS DISTINCT FROM s.id THEN RAISE EXCEPTION 'The submission has already changed or been reviewed' USING ERRCODE='PT409';END IF;
     IF private.work_order_submission_self_review(s.id) THEN RAISE EXCEPTION 'An independent reviewer is required' USING ERRCODE='42501';END IF;
     IF target='approved' THEN
       built:=private.build_work_order_submission(p_action_id,p_organization_id,p_project_id,true);
       IF ((built->'snapshot')-'lifecycle') IS DISTINCT FROM (s.snapshot-'lifecycle') THEN RAISE EXCEPTION 'Current evidence differs from the submitted version' USING ERRCODE='PT409';END IF;
       IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(built->'gaps') gap WHERE gap<>'not_performed') THEN RAISE EXCEPTION 'Submission requirements no longer complete' USING ERRCODE='22023';END IF;
     END IF;
   END IF;
 END IF;
 RETURN jsonb_build_object('status',target,'submission_version_id',s.id,'review_scope',CASE WHEN op='review' THEN 'execution_and_documentation' END);
END $$;
REVOKE ALL ON FUNCTION private.apply_work_order_submission_review(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.apply_work_order_submission_review(uuid,uuid,uuid,uuid,jsonb) TO authenticated;

-- Keep the original normalization byte-compatible for existing idempotent requests.
CREATE FUNCTION private.normalize_work_order_lifecycle_base_request(p_values jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;op text;target text;start_time timestamptz;due date;result jsonb;
BEGIN
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_values)key WHERE key NOT IN('operation','targetStatus','planVersionId','assignmentVersionId','executionRevisionId','reason','startedAt','startedSource','blockOwnerId','blockReason','blockNextAction','blockDueDate')) THEN RAISE EXCEPTION 'Invalid lifecycle request fields' USING ERRCODE='22023';END IF;
 FOR k IN SELECT jsonb_object_keys(p_values) LOOP
   IF jsonb_typeof(p_values->k) NOT IN('string','null') THEN RAISE EXCEPTION 'Invalid lifecycle field type' USING ERRCODE='22023';END IF;
 END LOOP;
 op:=p_values->>'operation';target:=p_values->>'targetStatus';
 IF op IS NULL OR op NOT IN('transition','confirm','block','unblock') OR (op IN('transition','confirm') AND (target IS NULL OR target NOT IN('draft','planned','assigned','started','performed','cancelled'))) OR (op IN('block','unblock') AND target IS NOT NULL) OR (op='confirm' AND target='cancelled') THEN RAISE EXCEPTION 'Invalid lifecycle operation; submission and review require their own verified snapshot' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['planVersionId','assignmentVersionId','executionRevisionId','blockOwnerId'] LOOP
   IF p_values->>k IS NOT NULL AND p_values->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid lifecycle reference' USING ERRCODE='22023';END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['reason','startedSource','blockReason','blockNextAction'] LOOP
   IF length(coalesce(p_values->>k,''))>2000 THEN RAISE EXCEPTION 'Lifecycle text exceeds its limit' USING ERRCODE='22023';END IF;
 END LOOP;
 IF op='transition' AND target='started' THEN
   IF p_values->>'startedAt' IS NULL OR p_values->>'startedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' OR length(btrim(coalesce(p_values->>'startedSource','')))=0 THEN RAISE EXCEPTION 'Actual start requires a timestamp with offset and its source' USING ERRCODE='22023';END IF;
   BEGIN start_time:=(p_values->>'startedAt')::timestamptz;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid actual start' USING ERRCODE='22023';END;
 ELSIF p_values->>'startedAt' IS NOT NULL OR p_values->>'startedSource' IS NOT NULL THEN RAISE EXCEPTION 'Actual start is recorded only by its explicit transition' USING ERRCODE='22023';END IF;
 IF op='block' THEN
   IF p_values->>'blockOwnerId' IS NULL OR length(btrim(coalesce(p_values->>'blockReason','')))=0 OR length(btrim(coalesce(p_values->>'blockNextAction','')))=0 THEN RAISE EXCEPTION 'A block requires reason, owner and next action' USING ERRCODE='22023';END IF;
   IF p_values->>'blockDueDate' IS NOT NULL THEN
     IF p_values->>'blockDueDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid block due date' USING ERRCODE='22023';END IF;
     BEGIN due:=(p_values->>'blockDueDate')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid block due date' USING ERRCODE='22023';END;
   END IF;
 ELSIF p_values->>'blockOwnerId' IS NOT NULL OR p_values->>'blockReason' IS NOT NULL OR p_values->>'blockNextAction' IS NOT NULL OR p_values->>'blockDueDate' IS NOT NULL THEN RAISE EXCEPTION 'Block details belong to a block operation' USING ERRCODE='22023';END IF;
 IF (op IN('confirm','unblock') OR target='cancelled') AND length(btrim(coalesce(p_values->>'reason','')))=0 THEN RAISE EXCEPTION 'Explain the lifecycle correction' USING ERRCODE='22023';END IF;
 result:=jsonb_build_object('operation',op,'targetStatus',target,'planVersionId',(p_values->>'planVersionId')::uuid,'assignmentVersionId',(p_values->>'assignmentVersionId')::uuid,'executionRevisionId',(p_values->>'executionRevisionId')::uuid,'reason',btrim(coalesce(p_values->>'reason','')),'startedAt',CASE WHEN start_time IS NULL THEN NULL ELSE to_char(start_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,'startedSource',nullif(btrim(p_values->>'startedSource'),''),'blockOwnerId',(p_values->>'blockOwnerId')::uuid,'blockReason',nullif(btrim(p_values->>'blockReason'),''),'blockNextAction',nullif(btrim(p_values->>'blockNextAction'),''),'blockDueDate',due);
 RETURN result;
END
$$;
REVOKE ALL ON FUNCTION private.normalize_work_order_lifecycle_base_request(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.normalize_work_order_lifecycle_base_request(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION private.normalize_work_order_lifecycle_request(p_values jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE op text:=p_values->>'operation';target text:=p_values->>'targetStatus';base jsonb;
BEGIN
 IF op IS NULL OR op NOT IN('submit','review','reopen') THEN
  IF p_values->>'submissionVersionId' IS NOT NULL OR p_values->>'reviewScope' IS NOT NULL THEN RAISE EXCEPTION 'Submission fields require their explicit operation' USING ERRCODE='22023';END IF;
  RETURN private.normalize_work_order_lifecycle_base_request(p_values-'submissionVersionId'-'reviewScope');
 END IF;
 IF (op='submit' AND target IS DISTINCT FROM 'submitted') OR (op='review' AND coalesce(target,'') NOT IN('approved','returned')) OR (op='reopen' AND target IS DISTINCT FROM 'reopened')
  OR p_values->>'submissionVersionId' IS NULL OR p_values->>'submissionVersionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR (op='review' AND p_values->>'reviewScope' IS DISTINCT FROM 'execution_and_documentation') OR (op<>'review' AND p_values->>'reviewScope' IS NOT NULL)
  OR (op='review' AND length(btrim(coalesce(p_values->>'reason','')))<10)
 THEN RAISE EXCEPTION 'Explain a valid submission/review operation and its pinned version' USING ERRCODE='22023';END IF;
 base:=private.normalize_work_order_lifecycle_base_request((p_values-'submissionVersionId'-'reviewScope')||jsonb_build_object('operation','confirm','targetStatus','performed'));
 RETURN base||jsonb_build_object('operation',op,'targetStatus',target,'submissionVersionId',(p_values->>'submissionVersionId')::uuid,'reviewScope',CASE WHEN op='review' THEN 'execution_and_documentation' END);
END $$;

-- The builder may assess this exact task for its explicitly authorized reviewer. Packet INSERT permissions remain unchanged.
CREATE OR REPLACE FUNCTION private.build_work_order_submission(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_lock boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  p public.work_order_plan_versions; a public.work_order_assignment_versions;
  e public.work_order_execution_bindings; l public.work_order_lifecycle_versions;
  ev public.work_order_evidence_versions; receipt public.field_photo_receipts;
  b jsonb; packet jsonb; execution jsonb; field jsonb; value jsonb;
  evidence jsonb := '[]'::jsonb; gaps text[] := ARRAY[]::text[]; total integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.work_orders w
    WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id)
    OR NOT ((private.can_contribute_project(p_project_id) AND private.can_execute_work_order(p_action_id)) OR private.can_review_work_order(p_action_id))
  THEN RAISE EXCEPTION 'Submission unavailable' USING ERRCODE='42501'; END IF;
  IF p_lock THEN
    IF private.can_contribute_project(p_project_id) AND private.can_execute_work_order(p_action_id) THEN PERFORM private.lock_work_order_evidence(p_action_id,p_project_id);
    ELSE PERFORM private.lock_work_order_review_context(p_action_id,p_project_id,'review'); END IF;
  END IF;
  b := private.work_order_lifecycle_basis(p_action_id);
  SELECT * INTO p FROM public.work_order_plan_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;
  SELECT * INTO a FROM public.work_order_assignment_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;
  SELECT * INTO e FROM public.work_order_execution_bindings WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;
  SELECT * INTO l FROM public.work_order_lifecycle_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;
  SELECT (entry.payload->>'decision')::jsonb INTO execution FROM public.project_workspace_entries entry WHERE entry.id=e.workspace_entry_id;
  IF jsonb_array_length(b->'planGaps')>0 THEN gaps:=array_append(gaps,'plan_incomplete'); END IF;
  IF NOT (b->>'assignmentValid')::boolean THEN gaps:=array_append(gaps,'assignment_invalid'); END IF;
  IF jsonb_array_length(b->'executionGaps')>0 OR jsonb_array_length(b->'documentationGaps')>0
    THEN gaps:=array_append(gaps,'execution_incomplete'); END IF;
  IF l.id IS NULL OR l.status<>'performed' THEN gaps:=array_append(gaps,'not_performed'); END IF;
  IF coalesce(l.blocked,false) THEN gaps:=array_append(gaps,'task_blocked'); END IF;
  IF l.id IS NOT NULL AND (l.plan_version_id IS DISTINCT FROM p.id OR l.assignment_version_id IS DISTINCT FROM a.id
      OR l.execution_revision_id IS DISTINCT FROM e.workspace_entry_id)
    THEN gaps:=array_append(gaps,'lifecycle_basis_changed'); END IF;
  FOR ev IN SELECT current.* FROM (
    SELECT DISTINCT ON (v.evidence_id) v.* FROM public.work_order_evidence_versions v
    WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id
    ORDER BY v.evidence_id,v.version DESC
  ) current WHERE current.state='attached' ORDER BY current.evidence_id LIMIT 101 LOOP
    total:=total+1;
    IF total>100 THEN gaps:=array_append(gaps,'too_many_evidence'); EXIT; END IF;
    IF ev.observation_snapshot->>'status'<>'recorded' THEN gaps:=array_append(gaps,'observation_needs_review'); END IF;
    FOR field IN SELECT * FROM jsonb_array_elements(ev.observation_snapshot->'template'->'fields') LOOP
      value:=ev.observation_snapshot->'values'->(field->>'key');
      IF (field->>'required')::boolean AND (value IS NULL OR value='null'::jsonb
        OR (jsonb_typeof(value)='string' AND length(btrim(value #>> '{}'))=0))
      THEN gaps:=array_append(gaps,'observation_incomplete'); END IF;
    END LOOP;
    IF p_lock THEN
      PERFORM 1 FROM public.field_photo_receipts r WHERE r.upload_id=ev.upload_id FOR SHARE;
      PERFORM 1 FROM storage.objects o WHERE o.id=(ev.original_snapshot->>'objectId')::uuid FOR SHARE;
    END IF;
    SELECT * INTO receipt FROM public.field_photo_receipts WHERE upload_id=ev.upload_id AND project_id=p_project_id;
    IF receipt.status IS DISTINCT FROM 'verified' OR receipt.sha256 IS DISTINCT FROM ev.original_snapshot->>'sha256'
      OR receipt.size_bytes IS DISTINCT FROM (ev.original_snapshot->>'sizeBytes')::bigint
      OR receipt.object_id IS DISTINCT FROM (ev.original_snapshot->>'objectId')::uuid
      OR receipt.object_version IS DISTINCT FROM ev.original_snapshot->>'objectVersion'
      OR receipt.object_updated_at IS DISTINCT FROM (ev.original_snapshot->>'objectUpdatedAt')::timestamptz
    THEN gaps:=array_append(gaps,'original_unavailable'); END IF;
    BEGIN
      PERFORM private.work_order_evidence_original(ev.id,p_action_id,p_organization_id,p_project_id);
    EXCEPTION WHEN insufficient_privilege THEN gaps:=array_append(gaps,'original_unavailable'); END;
    evidence:=evidence||jsonb_build_array(to_jsonb(ev));
  END LOOP;
  IF total=0 THEN gaps:=array_append(gaps,'evidence_missing'); END IF;
  packet:=jsonb_build_object('schema','freyra.work-order-submission/v1','ruleSet','freyra.submission-core/v1',
    'actionId',p_action_id,'organizationId',p_organization_id,'projectId',p_project_id,
    'plan',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'version',p.version,'plan',p.plan) END,
    'assignment',CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id,'version',a.version,'mode',a.mode,'claimedBy',a.claimed_by) END,
    'execution',CASE WHEN e.workspace_entry_id IS NULL THEN NULL ELSE jsonb_build_object('binding',to_jsonb(e),'values',execution) END,
    'lifecycle',CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object('id',l.id,'version',l.version,'status',l.status) END,
    'evidence',evidence);
  IF octet_length(packet::text)>1048576 THEN gaps:=array_append(gaps,'packet_too_large'); END IF;
  RETURN jsonb_build_object('snapshot',packet,
    'basisHash',encode(sha256(convert_to(packet::text,'UTF8')),'hex'),
    'gaps',(SELECT coalesce(jsonb_agg(g ORDER BY g),'[]'::jsonb) FROM (SELECT DISTINCT unnest(gaps) g) unique_gaps));
END $$;

CREATE OR REPLACE FUNCTION private.guard_work_order_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.work_order_lifecycle_versions;b jsonb;r jsonb;manager boolean;executor boolean;reviewer boolean;target text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Lifecycle history is immutable' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_read_work_order(NEW.action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 SELECT * INTO previous FROM public.work_order_lifecycle_versions WHERE action_id=NEW.action_id ORDER BY version DESC LIMIT 1;
 IF NEW.version IS DISTINCT FROM coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'Lifecycle changed; reopen before saving' USING ERRCODE='PT409';END IF;
 b:=private.work_order_lifecycle_basis(NEW.action_id);r:=private.normalize_work_order_lifecycle_request(NEW.request_values);
 IF r->>'operation' NOT IN('submit','review','reopen') AND ((r->>'planVersionId') IS DISTINCT FROM (b->>'planVersionId') OR (r->>'assignmentVersionId') IS DISTINCT FROM (b->>'assignmentVersionId') OR (r->>'executionRevisionId') IS DISTINCT FROM (b->>'executionRevisionId')) THEN RAISE EXCEPTION 'Work-order basis changed; reopen before saving status' USING ERRCODE='PT409';END IF;
 manager:=private.can_manage_project(NEW.project_id);executor:=private.can_execute_work_order(NEW.action_id);reviewer:=private.can_review_work_order(NEW.action_id);
 NEW.operation:=r->>'operation';NEW.request_values:=r;NEW.reason:=r->>'reason';
 NEW.plan_version_id:=(r->>'planVersionId')::uuid;NEW.assignment_version_id:=(r->>'assignmentVersionId')::uuid;NEW.execution_revision_id:=(r->>'executionRevisionId')::uuid;
 NEW.started_at:=previous.started_at;NEW.started_source:=previous.started_source;NEW.started_by_id:=previous.started_by_id;
 NEW.blocked:=coalesce(previous.blocked,false);NEW.block_reason:=previous.block_reason;NEW.block_owner_id:=previous.block_owner_id;NEW.block_next_action:=previous.block_next_action;NEW.block_due_date:=previous.block_due_date;
 NEW.submission_version_id:=CASE WHEN r->>'operation' IN('block','unblock') THEN previous.submission_version_id END;NEW.review_scope:=NULL;
 IF NEW.operation IN('submit','review','reopen') THEN
   NEW:=jsonb_populate_record(NEW,private.apply_work_order_submission_review(NEW.action_id,NEW.organization_id,NEW.project_id,previous.id,r));
 ELSIF NEW.operation IN('block','unblock') THEN
   IF NOT(manager OR executor OR reviewer) OR previous.id IS NULL THEN RAISE EXCEPTION 'Lifecycle is unavailable' USING ERRCODE='42501';END IF;
   IF previous.status IN('approved','cancelled') THEN RAISE EXCEPTION 'A closed task cannot change its active block' USING ERRCODE='22023';END IF;
   NEW.status:=previous.status;
   IF NEW.operation='block' THEN
     IF previous.blocked THEN RAISE EXCEPTION 'Resolve the current block before creating another' USING ERRCODE='22023';END IF;
     IF NOT private.is_work_order_member(NEW.project_id,(r->>'blockOwnerId')::uuid) THEN RAISE EXCEPTION 'Block owner is unavailable' USING ERRCODE='42501';END IF;
     NEW.blocked:=true;NEW.block_reason:=r->>'blockReason';NEW.block_owner_id:=(r->>'blockOwnerId')::uuid;NEW.block_next_action:=r->>'blockNextAction';NEW.block_due_date:=(r->>'blockDueDate')::date;
   ELSE
     IF NOT previous.blocked THEN RAISE EXCEPTION 'Task has no active block' USING ERRCODE='22023';END IF;
     NEW.blocked:=false;NEW.block_reason:=NULL;NEW.block_owner_id:=NULL;NEW.block_next_action:=NULL;NEW.block_due_date:=NULL;
   END IF;
 ELSE
   target:=r->>'targetStatus';NEW.status:=target;
   IF NEW.operation='confirm' THEN
     IF previous.id IS NULL OR target IS DISTINCT FROM previous.status THEN RAISE EXCEPTION 'Confirmation must preserve the operation status' USING ERRCODE='22023';END IF;
   ELSIF NOT ((previous.id IS NULL AND target='draft') OR (previous.status='draft' AND target='planned') OR (previous.status='planned' AND target='assigned') OR (previous.status='assigned' AND target='started') OR (previous.status='started' AND target='performed') OR (previous.status='reopened' AND target IN('planned','performed')) OR (previous.status IN('draft','planned','assigned','started') AND target='cancelled')) THEN
     RAISE EXCEPTION 'Invalid lifecycle transition; submission and review have separate requirements' USING ERRCODE='22023';
   END IF;
   IF target IN('draft','planned','assigned','cancelled') AND NOT manager THEN RAISE EXCEPTION 'Lifecycle planning requires the project manager' USING ERRCODE='42501';END IF;
   IF target IN('started','performed') AND NOT executor THEN RAISE EXCEPTION 'Execution capability is unavailable' USING ERRCODE='42501';END IF;
   IF target IN('planned','assigned','started','performed') AND jsonb_array_length(b->'planGaps')>0 THEN RAISE EXCEPTION 'Plan is missing a responsible person, profile or instructions' USING ERRCODE='22023';END IF;
   IF target IN('assigned','started','performed') AND NOT (b->>'assignmentValid')::boolean THEN RAISE EXCEPTION 'A valid current assignment is required' USING ERRCODE='22023';END IF;
   IF target='started' AND NEW.operation='transition' THEN
     IF NOT coalesce((SELECT a.can_execute FROM private.work_order_assignment_access(NEW.action_id)a),false) THEN RAISE EXCEPTION 'The assigned executor must confirm their own start' USING ERRCODE='42501';END IF;
     NEW.started_at:=(r->>'startedAt')::timestamptz;NEW.started_source:=r->>'startedSource';NEW.started_by_id:=auth.uid();
     IF NEW.started_at>clock_timestamp() THEN RAISE EXCEPTION 'Actual start cannot be in the future' USING ERRCODE='22023';END IF;
   END IF;
   IF target='performed' AND jsonb_array_length(b->'executionGaps')>0 THEN RAISE EXCEPTION 'Performed status requires the current actual date, method and coverage; attachment gaps may remain' USING ERRCODE='22023';END IF;
   IF target='cancelled' THEN NEW.blocked:=false;NEW.block_reason:=NULL;NEW.block_owner_id:=NULL;NEW.block_next_action:=NULL;NEW.block_due_date:=NULL;END IF;
 END IF;
 NEW.created_at:=clock_timestamp();RETURN NEW;
END
$$;

-- Revalidate live capability under the lock even when recovering a previous receipt.
CREATE OR REPLACE FUNCTION public.mutate_work_order_lifecycle(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_values jsonb,p_request_id uuid)
RETURNS SETOF public.work_order_lifecycle_versions
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_lifecycle_versions;r jsonb;latest integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) OR NOT(private.can_manage_project(p_project_id) OR private.can_execute_work_order(p_action_id) OR private.can_review_work_order(p_action_id)) THEN RAISE EXCEPTION 'Lifecycle is unavailable' USING ERRCODE='42501';END IF;
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid lifecycle mutation' USING ERRCODE='22023';END IF;
 r:=private.normalize_work_order_lifecycle_request(p_values);
 IF r->>'operation' IN('submit','review','reopen') THEN PERFORM private.lock_work_order_review_context(p_action_id,p_project_id,r->>'operation');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_lifecycle_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.request_values IS DISTINCT FROM r THEN RAISE EXCEPTION 'Mutation key has different lifecycle content' USING ERRCODE='22023';END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT max(v.version) INTO latest FROM public.work_order_lifecycle_versions v WHERE v.action_id=p_action_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Lifecycle changed; reopen before saving' USING ERRCODE='PT409';END IF;
 INSERT INTO public.work_order_lifecycle_versions(action_id,organization_id,project_id,version,request_values,request_id)
 VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,r,p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;

-- Same audit-backed timeline, now with the precise reviewed packet reference.
CREATE OR REPLACE FUNCTION public.get_work_order_log(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_as_of timestamptz,p_before_at timestamptz,p_before_key text,p_page_size integer)
RETURNS TABLE(log jsonb) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.read_work_order_log(p_action_id,p_organization_id,p_project_id,p_as_of,p_before_at,p_before_key,p_page_size)
$$;

CREATE FUNCTION public.get_work_order_review_context(p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.work_order_lifecycle_versions;s public.work_order_submission_versions;
 b jsonb;built jsonb;current_packet boolean;self_review boolean:=false;preparer boolean;reviewer boolean;recent jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) THEN RAISE EXCEPTION 'Review unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO l FROM public.work_order_lifecycle_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;
 IF l.submission_version_id IS NOT NULL THEN SELECT * INTO s FROM public.work_order_submission_versions WHERE id=l.submission_version_id;
 ELSE SELECT * INTO s FROM public.work_order_submission_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;END IF;
 preparer:=private.can_contribute_project(p_project_id) AND private.can_execute_work_order(p_action_id);
 reviewer:=private.can_review_work_order(p_action_id);
 b:=private.work_order_lifecycle_basis(p_action_id);
 IF s.id IS NOT NULL THEN
   self_review:=private.work_order_submission_self_review(s.id);
   IF preparer OR reviewer THEN
     built:=private.build_work_order_submission(p_action_id,p_organization_id,p_project_id,false);
     current_packet:=((built->'snapshot')-'lifecycle')=(s.snapshot-'lifecycle')
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(built->'gaps') gap WHERE gap<>'not_performed');
   END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('state',to_jsonb(reviews)-'submission_version','submission_version',reviews.submission_version) ORDER BY reviews.version DESC),'[]'::jsonb) INTO recent FROM (
   SELECT v.*,p.version AS submission_version FROM public.work_order_lifecycle_versions v
   JOIN public.work_order_submission_versions p ON p.id=v.submission_version_id
   WHERE v.action_id=p_action_id AND v.operation='review' ORDER BY v.version DESC LIMIT 5
 ) reviews;
 RETURN jsonb_build_object('action_id',p_action_id,'organization_id',p_organization_id,'project_id',p_project_id,'user_id',auth.uid(),
  'state',CASE WHEN l.id IS NULL THEN NULL ELSE to_jsonb(l) END,'basis',b,
  'packet',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'version',s.version,'plan_version_id',s.plan_version_id,'assignment_version_id',s.assignment_version_id,'execution_revision_id',s.execution_revision_id) END,
  'packet_current',current_packet,'self_review',self_review,'can_review',reviewer AND NOT self_review,
  'can_submit',preparer AND l.status='performed' AND s.id IS NOT NULL AND coalesce(current_packet,false) AND NOT l.blocked,
  'can_reopen',s.id IS NOT NULL AND NOT coalesce(l.blocked,true) AND ((l.status IN('submitted','returned') AND (preparer OR private.can_manage_project(p_project_id))) OR (l.status='approved' AND private.can_manage_project(p_project_id))),
  'recent_reviews',recent);
END $$;
REVOKE ALL ON FUNCTION public.get_work_order_review_context(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_review_context(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.read_work_order_log(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_as_of timestamptz,p_before_at timestamptz,p_before_key text,p_page_size integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE as_of_time timestamptz:=coalesce(p_as_of,statement_timestamp());result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_work_order(p_action_id) OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id) THEN RAISE EXCEPTION 'Work order log is unavailable' USING ERRCODE='42501';END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR as_of_time>statement_timestamp() OR (p_before_at IS NULL)<>(p_before_key IS NULL) OR (p_before_at IS NOT NULL AND (p_as_of IS NULL OR p_before_at>as_of_time OR p_before_key !~ '^(root|plan|access|assignment|execution|status|note|group):[0-9a-f-]{36}$')) THEN RAISE EXCEPTION 'Invalid log cursor' USING ERRCODE='22023';END IF;
 WITH canonical AS(
   SELECT 'root:'||v.action_id event_key,v.created_at,v.created_by,'created'::text kind,'work_order.created'::text event_type,v.action_id source_id,NULL::integer source_version,'system'::text origin,v.request_id,v.action_id audit_entity_id,'{}'::jsonb detail FROM public.work_orders v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'plan:'||v.id,v.created_at,v.created_by,'plan','work_order.plan_saved',v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('title',v.plan->>'title','reason',v.correction_reason) FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'access:'||v.id,v.created_at,v.created_by,'access','work_order.access_changed',v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('recipientId',v.user_id,'active',v.active,'canExecute',v.can_execute,'canReview',v.can_review) FROM public.work_order_access_versions v WHERE v.action_id=p_action_id AND (private.can_manage_project(p_project_id) OR v.user_id=auth.uid())
   UNION ALL SELECT 'assignment:'||v.id,v.created_at,v.created_by,'assignment',CASE WHEN v.change_kind='claimed' THEN 'work_order.pool_claimed' ELSE 'work_order.assignment_configured' END,v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('mode',v.mode,'claimedBy',v.claimed_by,'reason',v.reason) FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'execution:'||v.workspace_entry_id,v.created_at,v.created_by,'execution','work_order.execution_saved',v.workspace_entry_id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('actualDate',v.actual_start,'method',v.actual_method,'coverage',v.coverage,'documentationGaps',v.documentation_gaps) FROM public.work_order_execution_bindings v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'status:'||v.id,v.created_at,v.created_by,'status','work_order.lifecycle_changed',v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('status',v.status,'operation',v.operation,'reason',v.reason,'blocked',v.blocked,'blockReason',v.block_reason,'blockOwnerId',v.block_owner_id,'blockNextAction',v.block_next_action,'blockDueDate',v.block_due_date,'startedAt',v.started_at,'startedSource',v.started_source,'startedBy',v.started_by_id)||CASE WHEN v.submission_version_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('submissionVersionId',v.submission_version_id,'reviewScope',v.review_scope,'submissionVersion',(SELECT p.version FROM public.work_order_submission_versions p WHERE p.id=v.submission_version_id)) END FROM public.work_order_lifecycle_versions v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'note:'||v.id,v.created_at,v.created_by,'note','work_order.note_saved',v.id,v.version,'manual',v.request_id,v.action_id,jsonb_build_object('noteId',v.note_id,'authorId',v.author_id,'kind',v.kind,'body',v.body,'reason',v.correction_reason,'planVersionId',v.plan_version_id,'assignmentVersionId',v.assignment_version_id,'executionRevisionId',v.execution_revision_id,'lifecycleVersionId',v.lifecycle_version_id) FROM public.work_order_note_versions v WHERE v.project_id=p_project_id AND v.action_id=p_action_id AND v.organization_id=p_organization_id
   UNION ALL SELECT 'group:'||v.id,v.created_at,v.created_by,'group','work_order.group_saved',v.id,v.version,'system',v.request_id,v.group_id,jsonb_build_object('name',v.name,'active',v.active,'reason',v.correction_reason) FROM public.work_order_group_versions v WHERE v.project_id=p_project_id AND v.organization_id=p_organization_id AND EXISTS(SELECT 1 FROM public.work_order_assignment_versions a WHERE a.action_id=p_action_id AND a.source_group_id=v.group_id AND a.created_at<=as_of_time)
 ),page AS(
   SELECT c.*,EXISTS(SELECT 1 FROM public.audit_events a WHERE a.project_id=p_project_id AND a.entity_id=c.audit_entity_id AND a.event_type=c.event_type AND a.event_type LIKE 'work_order.%' AND a.source='database_trigger' AND a.actor=c.created_by::text AND a.after_data->>'requestId'=c.request_id::text) audited FROM canonical c
   WHERE c.created_at<=as_of_time AND (p_before_at IS NULL OR (c.created_at,c.event_key)<(p_before_at,p_before_key)) ORDER BY c.created_at DESC,c.event_key DESC LIMIT p_page_size+1
 ),items AS(SELECT * FROM page ORDER BY created_at DESC,event_key DESC LIMIT p_page_size),last_item AS(SELECT * FROM items ORDER BY created_at,event_key LIMIT 1)
 SELECT jsonb_build_object('action_id',p_action_id,'organization_id',p_organization_id,'project_id',p_project_id,'user_id',auth.uid(),'as_of',as_of_time,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('key',event_key,'created_at',created_at,'created_by',created_by,'kind',kind,'event_type',event_type,'source_id',source_id,'source_version',source_version,'origin',origin,'audit_recorded',audited,'detail',detail) ORDER BY created_at DESC,event_key DESC) FROM items),'[]'::jsonb),'next',CASE WHEN (SELECT count(*) FROM page)>p_page_size THEN (SELECT jsonb_build_object('beforeAt',created_at,'beforeKey',event_key,'asOf',as_of_time) FROM last_item) ELSE NULL END) INTO result;
 RETURN result;
END
$$;
