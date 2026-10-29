-- D02c: bind the existing execution note to its frozen plan. No second execution store.
CREATE UNIQUE INDEX work_order_plan_binding_scope ON public.work_order_plan_versions(id,action_id,organization_id,project_id);
CREATE UNIQUE INDEX workspace_execution_binding_scope ON public.project_workspace_entries(id,entry_id,organization_id,project_id,version);
CREATE TABLE public.work_order_execution_bindings(
 workspace_entry_id uuid PRIMARY KEY,action_id uuid NOT NULL,organization_id uuid NOT NULL,project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),plan_version_id uuid NOT NULL,plan_version integer NOT NULL CHECK(plan_version>0),
 performed_by_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,membership_snapshot jsonb,
 deviation_reason text NOT NULL CHECK(length(deviation_reason)<=2000),documentation_gaps text[] NOT NULL,
 actual_start date,actual_end date,actual_method text,coverage text NOT NULL CHECK(coverage IN('unknown','limited','documented')),
 request_id uuid NOT NULL,created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,request_id),UNIQUE(action_id,version),
 FOREIGN KEY(plan_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_plan_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(workspace_entry_id,action_id,organization_id,project_id,version) REFERENCES public.project_workspace_entries(id,entry_id,organization_id,project_id,version) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_order_execution_history ON public.work_order_execution_bindings(project_id,action_id,version DESC);
ALTER TABLE public.work_order_execution_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_execution_bindings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.work_order_execution_bindings TO authenticated;
GRANT SELECT ON public.work_order_execution_bindings TO service_role;
CREATE POLICY work_order_execution_read ON public.work_order_execution_bindings FOR SELECT TO authenticated USING(private.can_read_project(project_id) OR private.can_read_work_order(action_id));
CREATE POLICY work_order_execution_insert ON public.work_order_execution_bindings FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND private.can_write_project(project_id) AND private.can_execute_work_order(action_id));

CREATE FUNCTION private.guard_work_order_execution_binding() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.project_workspace_entries;j jsonb;plan public.work_order_plan_versions;org_role text;project_role text;previous public.work_order_execution_bindings;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Execution bindings are immutable' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_write_project(NEW.project_id) OR NOT private.can_execute_work_order(NEW.action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 SELECT * INTO e FROM public.project_workspace_entries WHERE id=NEW.workspace_entry_id AND entry_id=NEW.action_id AND organization_id=NEW.organization_id AND project_id=NEW.project_id AND version=NEW.version;
 SELECT * INTO plan FROM public.work_order_plan_versions WHERE id=NEW.plan_version_id AND action_id=NEW.action_id AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
 IF e.id IS NULL OR e.created_by IS DISTINCT FROM auth.uid() OR e.kind<>'decision_note' OR e.payload->>'source' IS DISTINCT FROM 'action-execution:'||NEW.action_id::text OR plan.id IS NULL OR NEW.plan_version IS DISTINCT FROM plan.version THEN RAISE EXCEPTION 'Invalid execution/plan binding' USING ERRCODE='22023'; END IF;
 IF plan.version IS DISTINCT FROM (SELECT max(v.version) FROM public.work_order_plan_versions v WHERE v.action_id=NEW.action_id) THEN RAISE EXCEPTION 'Plan changed; reopen before saving execution' USING ERRCODE='40001'; END IF;
 IF NEW.version IS DISTINCT FROM (SELECT max(w.version) FROM public.project_workspace_entries w WHERE w.entry_id=NEW.action_id) THEN RAISE EXCEPTION 'Execution changed; reopen before saving' USING ERRCODE='40001'; END IF;
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
REVOKE ALL ON FUNCTION private.guard_work_order_execution_binding() FROM PUBLIC,anon;
CREATE TRIGGER work_order_execution_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_execution_bindings FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_execution_binding();

-- Deferred integrity must still see the root if membership is revoked before COMMIT.
-- This trigger has no callable read or mutation API and returns only NEW.
CREATE FUNCTION private.require_work_order_execution_binding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=NEW.entry_id AND w.organization_id=NEW.organization_id AND w.project_id=NEW.project_id) THEN
   IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor is unavailable' USING ERRCODE='42501'; END IF;
   IF NEW.kind IS DISTINCT FROM 'decision_note' OR NEW.payload->>'source' IS DISTINCT FROM 'action-execution:'||NEW.entry_id::text OR NOT EXISTS(SELECT 1 FROM public.work_order_execution_bindings b WHERE b.workspace_entry_id=NEW.id AND b.action_id=NEW.entry_id AND b.organization_id=NEW.organization_id AND b.project_id=NEW.project_id AND b.version=NEW.version) THEN
     RAISE EXCEPTION 'Work-order execution requires a frozen plan binding' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.require_work_order_execution_binding() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER work_order_execution_required AFTER INSERT ON public.project_workspace_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.require_work_order_execution_binding();

CREATE FUNCTION private.audit_work_order_execution_binding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor is unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
 VALUES(NEW.project_id,'work_order.execution_saved','work_order',NEW.action_id,'Faktisk udførelse er versionsbundet til planen',auth.uid()::text,'database_trigger',jsonb_build_object('schema','freyra.work-order-event/v1','actionId',NEW.action_id,'executionRevisionId',NEW.workspace_entry_id,'version',NEW.version,'planVersionId',NEW.plan_version_id,'requestId',NEW.request_id));RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.audit_work_order_execution_binding() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_execution_audit AFTER INSERT ON public.work_order_execution_bindings FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_execution_binding();

CREATE FUNCTION public.save_work_order_execution(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_plan_version_id uuid,p_expected_plan_version integer,p_expected_version integer,p_execution jsonb,p_performed_by_id uuid,p_deviation_reason text,p_request_id uuid)
RETURNS SETOF public.work_order_execution_bindings LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_execution_bindings;e public.project_workspace_entries;plan public.work_order_plan_versions;current_version integer;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_write_project(p_project_id) OR NOT private.can_execute_work_order(p_action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action_id IS NULL OR p_organization_id IS NULL OR p_project_id IS NULL OR p_plan_version_id IS NULL OR p_expected_plan_version IS NULL OR p_expected_plan_version<1 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL OR p_deviation_reason IS NULL OR length(p_deviation_reason)>2000 OR jsonb_typeof(p_execution) IS DISTINCT FROM 'object' OR p_execution->>'actionId' IS DISTINCT FROM p_action_id::text OR p_execution->>'schema' IS DISTINCT FROM 'freyra.action-execution/v1' THEN RAISE EXCEPTION 'Invalid execution mutation' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_execution_bindings b WHERE b.project_id=p_project_id AND b.request_id=p_request_id;
 IF saved.workspace_entry_id IS NOT NULL THEN
   SELECT * INTO e FROM public.project_workspace_entries WHERE id=saved.workspace_entry_id;
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.plan_version_id IS DISTINCT FROM p_plan_version_id OR saved.plan_version IS DISTINCT FROM p_expected_plan_version OR saved.performed_by_id IS DISTINCT FROM p_performed_by_id OR saved.deviation_reason IS DISTINCT FROM btrim(p_deviation_reason) OR (e.payload->>'decision')::jsonb IS DISTINCT FROM p_execution THEN RAISE EXCEPTION 'Mutation key already has different execution content' USING ERRCODE='22023'; END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT * INTO plan FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id ORDER BY v.version DESC LIMIT 1;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'Work-order plan is unavailable' USING ERRCODE='42501'; END IF;
 IF plan.id IS DISTINCT FROM p_plan_version_id OR plan.version IS DISTINCT FROM p_expected_plan_version THEN RAISE EXCEPTION 'Plan changed; reopen before saving execution' USING ERRCODE='40001'; END IF;
 SELECT max(w.version) INTO current_version FROM public.project_workspace_entries w WHERE w.entry_id=p_action_id;
 IF coalesce(current_version,0)<>p_expected_version THEN RAISE EXCEPTION 'Execution changed; reopen before saving' USING ERRCODE='40001'; END IF;
 INSERT INTO public.project_workspace_entries(entry_id,organization_id,project_id,kind,version,title,payload)
 VALUES(p_action_id,p_organization_id,p_project_id,'decision_note',p_expected_version+1,CASE WHEN p_execution->>'workType'='weed_cutting' THEN 'Grødeskæring · udførelsesregistrering' ELSE 'Indsats · udførelsesregistrering' END,
 jsonb_build_object('basis',coalesce(nullif(p_execution->>'sourceReference',''),'Planlagt arbejde; faktisk udførelse ikke dokumenteret.'),'source','action-execution:'||p_action_id::text,'decision',p_execution::text,'alternatives','','uncertainty',p_execution->>'coverageDescription','owner',coalesce(p_execution->>'performedBy',''))) RETURNING * INTO e;
 INSERT INTO public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id,version,plan_version_id,plan_version,performed_by_id,deviation_reason,documentation_gaps,coverage,request_id)
 VALUES(e.id,p_action_id,p_organization_id,p_project_id,e.version,plan.id,plan.version,p_performed_by_id,btrim(p_deviation_reason),ARRAY[]::text[],p_execution->>'coverage',p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
CREATE FUNCTION public.get_work_order_execution_binding(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_workspace_entry_id uuid)
RETURNS SETOF public.work_order_execution_bindings LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT b.* FROM public.work_order_execution_bindings b WHERE b.workspace_entry_id=p_workspace_entry_id AND b.action_id=p_action_id AND b.organization_id=p_organization_id AND b.project_id=p_project_id;
END
$$;
REVOKE ALL ON FUNCTION public.save_work_order_execution(uuid,uuid,uuid,uuid,integer,integer,jsonb,uuid,text,uuid),public.get_work_order_execution_binding(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_execution(uuid,uuid,uuid,uuid,integer,integer,jsonb,uuid,text,uuid),public.get_work_order_execution_binding(uuid,uuid,uuid,uuid) TO authenticated;

-- Preserve legacy readers: an existing readable action with no plan is an empty history,
-- not a missing work-order permission. The action query still applies its existing RLS.
CREATE OR REPLACE FUNCTION public.get_work_order_plan_history(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_before_version integer,p_page_size integer)
RETURNS SETOF public.work_order_plan_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT(
   EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id))
   OR (private.can_read_project(p_project_id) AND EXISTS(SELECT 1 FROM public.actions a JOIN public.projects p ON p.id=a.project_id WHERE a.id=p_action_id AND p.id=p_project_id AND p.organization_id=p_organization_id))
 ) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN RAISE EXCEPTION 'Invalid history page' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT v.* FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND (p_before_version IS NULL OR v.version<p_before_version) ORDER BY v.version DESC LIMIT p_page_size+1;
END
$$;
