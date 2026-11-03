-- Assigned field staff can record their own execution, never edit the whole project.
-- Keep the existing invoker RPC, append-only rows and deferred binding constraint.
CREATE FUNCTION private.can_record_work_order_execution(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_performed_by_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.work_orders w
   WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id
   AND private.can_execute_work_order(w.action_id)
   AND (private.can_write_project(w.project_id)
     OR (p_performed_by_id=auth.uid() AND private.can_contribute_project(w.project_id)))
 )
$$;
REVOKE ALL ON FUNCTION private.can_record_work_order_execution(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.can_record_work_order_execution(uuid,uuid,uuid,uuid) TO authenticated;

-- The existing deferred constraint requires the execution binding in this same
-- transaction. Posting a standalone workspace row does not create an execution.
CREATE POLICY work_order_execution_workspace_insert ON public.project_workspace_entries
 FOR INSERT TO authenticated WITH CHECK (
   created_by=auth.uid() AND kind='decision_note' AND payload->>'source'='action-execution:'||entry_id::text
   AND private.can_record_work_order_execution(entry_id,organization_id,project_id,auth.uid())
 );
ALTER POLICY release_insert_role ON public.project_workspace_entries WITH CHECK (
   private.can_write_project(project_id) OR (
     created_by=auth.uid() AND kind='decision_note' AND payload->>'source'='action-execution:'||entry_id::text
     AND private.can_record_work_order_execution(entry_id,organization_id,project_id,auth.uid())
   )
 );
ALTER POLICY work_order_execution_insert ON public.work_order_execution_bindings WITH CHECK (
 created_by=auth.uid() AND private.can_record_work_order_execution(action_id,organization_id,project_id,performed_by_id)
);

-- Field users must never gain generic INSERT on audit_events. Their scoped row
-- is audited by work_order_execution_audit when its mandatory binding commits.
-- Existing editor/owner workspace audit events are unchanged.
CREATE OR REPLACE FUNCTION public.audit_workspace_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT private.can_write_project(NEW.project_id) AND NEW.created_by=auth.uid()
   AND NEW.kind='decision_note' AND NEW.payload->>'source'='action-execution:'||NEW.entry_id::text
   AND private.can_record_work_order_execution(NEW.entry_id,NEW.organization_id,NEW.project_id,auth.uid())
 THEN RETURN NEW; END IF;
 INSERT INTO public.audit_events(project_id,event_type,title,actor,source,entity_type,entity_id,after_data)
 VALUES(NEW.project_id,'workspace_revision',NEW.title,NEW.created_by::text,'project_workspace',
   'project_workspace_entries',NEW.entry_id,jsonb_build_object('version',NEW.version,'kind',NEW.kind,'revision_id',NEW.id));
 RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION private.guard_work_order_execution_binding() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.project_workspace_entries;j jsonb;plan public.work_order_plan_versions;org_role text;project_role text;previous public.work_order_execution_bindings;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Execution bindings are immutable' USING ERRCODE='42501'; END IF;
 IF NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_record_work_order_execution(NEW.action_id,NEW.organization_id,NEW.project_id,NEW.performed_by_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_work_order_evidence(NEW.action_id,NEW.project_id);
 IF NOT private.can_record_work_order_execution(NEW.action_id,NEW.organization_id,NEW.project_id,NEW.performed_by_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.project_workspace_entries WHERE id=NEW.workspace_entry_id AND entry_id=NEW.action_id AND organization_id=NEW.organization_id AND project_id=NEW.project_id AND version=NEW.version;
 SELECT * INTO plan FROM public.work_order_plan_versions WHERE id=NEW.plan_version_id AND action_id=NEW.action_id AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
 IF e.id IS NULL OR e.created_by IS DISTINCT FROM auth.uid() OR e.kind<>'decision_note' OR e.payload->>'source' IS DISTINCT FROM 'action-execution:'||NEW.action_id::text OR plan.id IS NULL OR NEW.plan_version IS DISTINCT FROM plan.version THEN RAISE EXCEPTION 'Invalid execution/plan binding' USING ERRCODE='22023'; END IF;
 IF plan.version IS DISTINCT FROM (SELECT max(v.version) FROM public.work_order_plan_versions v WHERE v.action_id=NEW.action_id) THEN RAISE EXCEPTION 'Plan changed; reopen before saving execution' USING ERRCODE='PT409'; END IF;
 IF NEW.version IS DISTINCT FROM (SELECT max(w.version) FROM public.project_workspace_entries w WHERE w.entry_id=NEW.action_id) THEN RAISE EXCEPTION 'Execution changed; reopen before saving' USING ERRCODE='PT409'; END IF;
 j:=(e.payload->>'decision')::jsonb;
 NEW.deviation_reason:=btrim(NEW.deviation_reason);
 IF NEW.deviation_reason IS NULL OR (length(btrim(j->>'deviation'))>0 AND length(NEW.deviation_reason)=0) THEN RAISE EXCEPTION 'Explain the execution deviation' USING ERRCODE='22023'; END IF;
 IF NEW.performed_by_id IS NOT NULL THEN
   SELECT om.role::text INTO org_role FROM public.organization_memberships om WHERE om.organization_id=NEW.organization_id AND om.user_id=NEW.performed_by_id;
   SELECT pm.role::text INTO project_role FROM public.project_members pm WHERE pm.project_id=NEW.project_id AND pm.user_id=NEW.performed_by_id;
   IF org_role IS NULL OR (org_role NOT IN('owner','admin') AND (project_role IS NULL OR project_role NOT IN('admin','project_manager','editor','field','external'))) THEN
     SELECT * INTO previous FROM public.work_order_execution_bindings b WHERE b.action_id=NEW.action_id AND b.version<NEW.version ORDER BY b.version DESC LIMIT 1;
     IF previous.performed_by_id IS DISTINCT FROM NEW.performed_by_id OR previous.membership_snapshot IS NULL THEN RAISE EXCEPTION 'Performer is not a current execution member' USING ERRCODE='22023'; END IF;
     NEW.membership_snapshot:=previous.membership_snapshot||jsonb_build_object('basis','historical','sourceExecutionRevisionId',previous.workspace_entry_id);
   ELSE
     NEW.membership_snapshot:=jsonb_build_object('schema','freyra.work-order-performer/v1','userId',NEW.performed_by_id,'organizationRole',org_role,'projectRole',project_role,'assessedAt',clock_timestamp(),'basis','current','sourceExecutionRevisionId',NULL);
   END IF;
 ELSE NEW.membership_snapshot:=NULL; END IF;
 PERFORM private.validate_field_job_values('{"schema":"freyra.field-job-template/v1","title":"Actual dates","domain":"general","fields":[{"key":"actual_start","label":"Start","type":"date","required":false},{"key":"actual_end","label":"End","type":"date","required":false}]}',jsonb_build_object('actual_start',j->'actualDate','actual_end',j->'actualEndDate'));
 NEW.actual_start:=(j->>'actualDate')::date;NEW.actual_end:=(j->>'actualEndDate')::date;NEW.actual_method:=nullif(btrim(j->>'method'),'');NEW.coverage:=j->>'coverage';
 NEW.documentation_gaps:=ARRAY[]::text[];
 IF j->>'stage'<>'performed' THEN NEW.documentation_gaps:=array_append(NEW.documentation_gaps,'execution_not_performed');END IF;
 IF NEW.actual_method IS NULL THEN NEW.documentation_gaps:=array_append(NEW.documentation_gaps,'actual_method_unknown');END IF;
 IF NEW.performed_by_id IS NULL THEN NEW.documentation_gaps:=array_append(NEW.documentation_gaps,'performer_identity_unknown');END IF;
 IF NEW.coverage='unknown' THEN NEW.documentation_gaps:=array_append(NEW.documentation_gaps,'actual_coverage_unknown');END IF;
 IF length(btrim(j->>'deviation'))>0 AND jsonb_array_length(j->'evidenceIds')=0 THEN NEW.documentation_gaps:=array_append(NEW.documentation_gaps,'deviation_attachment_missing');END IF;
 NEW.created_at:=clock_timestamp();RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION private.guard_work_order_execution_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.work_order_assignment_versions;execution jsonb;
BEGIN
 IF NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_record_work_order_execution(NEW.action_id,NEW.organization_id,NEW.project_id,NEW.performed_by_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 SELECT * INTO a FROM public.work_order_assignment_versions v WHERE v.action_id=NEW.action_id AND v.organization_id=NEW.organization_id AND v.project_id=NEW.project_id ORDER BY v.version DESC LIMIT 1;
 IF NEW.assignment_version_id IS DISTINCT FROM a.id THEN RAISE EXCEPTION 'Assignment changed; reopen before saving execution' USING ERRCODE='PT409';END IF;
 SELECT (w.payload->>'decision')::jsonb INTO execution FROM public.project_workspace_entries w WHERE w.id=NEW.workspace_entry_id AND w.entry_id=NEW.action_id AND w.organization_id=NEW.organization_id AND w.project_id=NEW.project_id;
 IF execution->>'stage'='performed' AND a.mode='pool' AND a.claimed_by IS NULL THEN RAISE EXCEPTION 'Claim the pool task before recording execution' USING ERRCODE='22023';END IF;
 RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.save_work_order_execution(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_plan_version_id uuid,p_expected_plan_version integer,p_expected_version integer,p_execution jsonb,p_performed_by_id uuid,p_deviation_reason text,p_request_id uuid,p_expected_assignment_version_id uuid DEFAULT NULL,p_expected_assignment_version integer DEFAULT 0)
RETURNS SETOF public.work_order_execution_bindings LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_execution_bindings;e public.project_workspace_entries;plan public.work_order_plan_versions;current_version integer;current_assignment public.work_order_assignment_versions;
BEGIN
 IF NOT private.can_record_work_order_execution(p_action_id,p_organization_id,p_project_id,p_performed_by_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action_id IS NULL OR p_organization_id IS NULL OR p_project_id IS NULL OR p_plan_version_id IS NULL OR p_expected_plan_version IS NULL OR p_expected_plan_version<1 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL OR p_deviation_reason IS NULL OR length(p_deviation_reason)>2000 OR p_expected_assignment_version IS NULL OR p_expected_assignment_version<0 OR ((p_expected_assignment_version=0) IS DISTINCT FROM (p_expected_assignment_version_id IS NULL)) OR jsonb_typeof(p_execution) IS DISTINCT FROM 'object' OR p_execution->>'actionId' IS DISTINCT FROM p_action_id::text OR p_execution->>'schema' IS DISTINCT FROM 'freyra.action-execution/v1' THEN RAISE EXCEPTION 'Invalid execution mutation' USING ERRCODE='22023'; END IF;
 PERFORM private.lock_work_order_evidence(p_action_id,p_project_id);
 IF NOT private.can_record_work_order_execution(p_action_id,p_organization_id,p_project_id,p_performed_by_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_execution_bindings b WHERE b.project_id=p_project_id AND b.request_id=p_request_id;
 IF saved.workspace_entry_id IS NOT NULL THEN
   SELECT * INTO e FROM public.project_workspace_entries WHERE id=saved.workspace_entry_id;
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.plan_version_id IS DISTINCT FROM p_plan_version_id OR saved.plan_version IS DISTINCT FROM p_expected_plan_version OR saved.performed_by_id IS DISTINCT FROM p_performed_by_id OR saved.assignment_version_id IS DISTINCT FROM p_expected_assignment_version_id OR coalesce((SELECT v.version FROM public.work_order_assignment_versions v WHERE v.id=saved.assignment_version_id),0) IS DISTINCT FROM p_expected_assignment_version OR saved.deviation_reason IS DISTINCT FROM btrim(p_deviation_reason) OR (e.payload->>'decision')::jsonb IS DISTINCT FROM p_execution THEN RAISE EXCEPTION 'Mutation key already has different execution content' USING ERRCODE='22023'; END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT * INTO plan FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id ORDER BY v.version DESC LIMIT 1;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'Work-order plan is unavailable' USING ERRCODE='42501'; END IF;
 IF plan.id IS DISTINCT FROM p_plan_version_id OR plan.version IS DISTINCT FROM p_expected_plan_version THEN RAISE EXCEPTION 'Plan changed; reopen before saving execution' USING ERRCODE='PT409'; END IF;
 SELECT * INTO current_assignment FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id ORDER BY v.version DESC LIMIT 1;
 IF current_assignment.id IS DISTINCT FROM p_expected_assignment_version_id OR coalesce(current_assignment.version,0)<>p_expected_assignment_version THEN RAISE EXCEPTION 'Assignment changed; reopen before saving execution' USING ERRCODE='PT409';END IF;
 SELECT max(w.version) INTO current_version FROM public.project_workspace_entries w WHERE w.entry_id=p_action_id;
 IF coalesce(current_version,0)<>p_expected_version THEN RAISE EXCEPTION 'Execution changed; reopen before saving' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.project_workspace_entries(entry_id,organization_id,project_id,kind,version,title,payload)
 VALUES(p_action_id,p_organization_id,p_project_id,'decision_note',p_expected_version+1,CASE WHEN p_execution->>'workType'='weed_cutting' THEN 'Grødeskæring · udførelsesregistrering' ELSE 'Indsats · udførelsesregistrering' END,
 jsonb_build_object('basis',coalesce(nullif(p_execution->>'sourceReference',''),'Planlagt arbejde; faktisk udførelse ikke dokumenteret.'),'source','action-execution:'||p_action_id::text,'decision',p_execution::text,'alternatives','','uncertainty',p_execution->>'coverageDescription','owner',coalesce(p_execution->>'performedBy',''))) RETURNING * INTO e;
 INSERT INTO public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id,version,plan_version_id,plan_version,performed_by_id,deviation_reason,documentation_gaps,coverage,request_id,assignment_version_id)
 VALUES(e.id,p_action_id,p_organization_id,p_project_id,e.version,plan.id,plan.version,p_performed_by_id,btrim(p_deviation_reason),ARRAY[]::text[],p_execution->>'coverage',p_request_id,current_assignment.id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
