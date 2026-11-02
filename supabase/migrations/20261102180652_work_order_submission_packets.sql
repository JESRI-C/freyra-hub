-- D05a: immutable preparation for review. Does not change lifecycle or grant approval.
CREATE TABLE public.work_order_submission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL, organization_id uuid NOT NULL, project_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  plan_version_id uuid NOT NULL, assignment_version_id uuid NOT NULL,
  execution_revision_id uuid NOT NULL, lifecycle_version_id uuid NOT NULL,
  basis_hash text NOT NULL CHECK (basis_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 1048576),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 2000),
  request_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id, version), UNIQUE (project_id, request_id),
  UNIQUE (id, action_id, organization_id, project_id),
  FOREIGN KEY (action_id,organization_id,project_id) REFERENCES public.work_orders(action_id,organization_id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY (plan_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_plan_versions(id,action_id,organization_id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY (assignment_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_assignment_versions(id,action_id,organization_id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY (execution_revision_id,action_id,organization_id,project_id) REFERENCES public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id) ON DELETE RESTRICT,
  FOREIGN KEY (lifecycle_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_lifecycle_versions(id,action_id,organization_id,project_id) ON DELETE RESTRICT
);
ALTER TABLE public.work_order_submission_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_submission_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.work_order_submission_versions TO authenticated;
GRANT SELECT ON public.work_order_submission_versions TO service_role;
CREATE POLICY work_order_submissions_read ON public.work_order_submission_versions
  FOR SELECT TO authenticated USING (private.can_read_work_order(action_id));
CREATE POLICY work_order_submissions_insert ON public.work_order_submission_versions
  FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.uid())
    AND private.can_contribute_project(project_id) AND private.can_execute_work_order(action_id));

-- Narrow private builder: source rows may have stricter policies than the resulting task packet.
-- It only returns data for an authorized internal contributor/executor on the exact task.
-- Mutation uses the existing task/membership lock and pins Storage metadata with row locks.
CREATE FUNCTION private.build_work_order_submission(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_lock boolean)
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
    OR NOT private.can_contribute_project(p_project_id) OR NOT private.can_execute_work_order(p_action_id)
  THEN RAISE EXCEPTION 'Submission unavailable' USING ERRCODE='42501'; END IF;
  IF p_lock THEN PERFORM private.lock_work_order_evidence(p_action_id,p_project_id); END IF;
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
REVOKE ALL ON FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION private.guard_work_order_submission() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE built jsonb; latest integer;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Submission history is immutable' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor unavailable' USING ERRCODE='42501'; END IF;
  built:=private.build_work_order_submission(NEW.action_id,NEW.organization_id,NEW.project_id,true);
  SELECT coalesce(max(version),0) INTO latest FROM public.work_order_submission_versions WHERE action_id=NEW.action_id;
  IF NEW.version IS DISTINCT FROM latest+1 OR NEW.basis_hash IS DISTINCT FROM built->>'basisHash'
    THEN RAISE EXCEPTION 'Submission basis changed' USING ERRCODE='PT409'; END IF;
  IF jsonb_array_length(built->'gaps')>0 THEN RAISE EXCEPTION 'Submission requirements are incomplete' USING ERRCODE='22023'; END IF;
  -- Ignore caller snapshots/references. Canonical source versions are selected under the lock.
  NEW.snapshot:=built->'snapshot';
  NEW.plan_version_id:=(NEW.snapshot->'plan'->>'id')::uuid;
  NEW.assignment_version_id:=(NEW.snapshot->'assignment'->>'id')::uuid;
  NEW.execution_revision_id:=(NEW.snapshot->'execution'->'binding'->>'workspace_entry_id')::uuid;
  NEW.lifecycle_version_id:=(NEW.snapshot->'lifecycle'->>'id')::uuid;
  NEW.note:=btrim(NEW.note); NEW.created_at:=clock_timestamp();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_work_order_submission() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_submission_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_submission_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_submission();

CREATE FUNCTION private.audit_work_order_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
  VALUES(NEW.project_id,'work_order.submission_saved','work_order',NEW.action_id,'Opgavens afleveringsgrundlag er fastholdt',
    auth.uid()::text,'database_trigger',jsonb_build_object('schema','freyra.work-order-event/v1','requestId',NEW.request_id,
      'submissionVersionId',NEW.id,'version',NEW.version,'basisHash',NEW.basis_hash));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.audit_work_order_submission() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_submission_audit AFTER INSERT ON public.work_order_submission_versions
  FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_submission();

CREATE FUNCTION public.get_work_order_submission_context(p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE built jsonb; latest public.work_order_submission_versions; writable boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id
    AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id))
  THEN RAISE EXCEPTION 'Submission unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO latest FROM public.work_order_submission_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1;
  writable:=private.can_contribute_project(p_project_id) AND private.can_execute_work_order(p_action_id);
  IF writable THEN built:=private.build_work_order_submission(p_action_id,p_organization_id,p_project_id,false); END IF;
  RETURN jsonb_build_object('action_id',p_action_id,'organization_id',p_organization_id,'project_id',p_project_id,'user_id',auth.uid(),
    'latest_version',coalesce(latest.version,0),'can_prepare',writable,
    'basis_hash',built->>'basisHash','gaps',built->'gaps',
    'plan_version',built->'snapshot'->'plan'->'version',
    'execution_version',built->'snapshot'->'execution'->'binding'->'version',
    'evidence_count',CASE WHEN built IS NULL THEN NULL ELSE jsonb_array_length(built->'snapshot'->'evidence') END,
    'context_changed',CASE WHEN built IS NULL OR latest.id IS NULL THEN NULL ELSE latest.basis_hash IS DISTINCT FROM built->>'basisHash' END);
END $$;

CREATE FUNCTION public.save_work_order_submission(p_action_id uuid,p_organization_id uuid,p_project_id uuid,
  p_expected_version integer,p_basis_hash text,p_note text,p_request_id uuid)
RETURNS SETOF public.work_order_submission_versions LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_submission_versions;
BEGIN
  PERFORM private.lock_work_order_evidence(p_action_id,p_project_id);
  IF NOT EXISTS(SELECT 1 FROM public.work_orders WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id)
    THEN RAISE EXCEPTION 'Submission unavailable' USING ERRCODE='42501'; END IF;
  IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL
    OR p_basis_hash IS NULL OR p_basis_hash !~ '^[a-f0-9]{64}$' OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 1 AND 2000
    THEN RAISE EXCEPTION 'Invalid submission input' USING ERRCODE='22023'; END IF;
  SELECT * INTO saved FROM public.work_order_submission_versions WHERE project_id=p_project_id AND request_id=p_request_id;
  IF saved.id IS NOT NULL THEN
    IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id
      OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1
      OR saved.basis_hash IS DISTINCT FROM p_basis_hash OR saved.note IS DISTINCT FROM btrim(p_note)
    THEN RAISE EXCEPTION 'Request identity mismatch' USING ERRCODE='22023'; END IF;
    RETURN NEXT saved; RETURN;
  END IF;
  INSERT INTO public.work_order_submission_versions(action_id,organization_id,project_id,version,basis_hash,note,request_id,snapshot)
  VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_basis_hash,btrim(p_note),p_request_id,'{}') RETURNING * INTO saved;
  RETURN NEXT saved;
END $$;

CREATE FUNCTION public.list_work_order_submissions(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_before_version integer,p_page_size integer)
RETURNS SETOF public.work_order_submission_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id
    AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) THEN RAISE EXCEPTION 'Submission unavailable' USING ERRCODE='42501'; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 5 OR (p_before_version IS NOT NULL AND p_before_version<1)
    THEN RAISE EXCEPTION 'Invalid submission page' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT * FROM public.work_order_submission_versions v WHERE v.action_id=p_action_id
    AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND (p_before_version IS NULL OR v.version<p_before_version)
    ORDER BY v.version DESC LIMIT p_page_size+1;
END $$;
REVOKE ALL ON FUNCTION public.get_work_order_submission_context(uuid,uuid,uuid),
  public.save_work_order_submission(uuid,uuid,uuid,integer,text,text,uuid),
  public.list_work_order_submissions(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_submission_context(uuid,uuid,uuid),
  public.save_work_order_submission(uuid,uuid,uuid,integer,text,text,uuid),
  public.list_work_order_submissions(uuid,uuid,uuid,integer,integer) TO authenticated;
