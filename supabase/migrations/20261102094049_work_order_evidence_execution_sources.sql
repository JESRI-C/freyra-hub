-- Reuse the existing immutable execution bindings. No new execution model or file copies.
CREATE INDEX work_order_evidence_execution_sources ON public.work_order_execution_bindings(project_id,action_id,workspace_entry_id)
WHERE NOT ('execution_not_performed'=ANY(documentation_gaps));
CREATE FUNCTION public.list_work_order_evidence_executions(
 p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_after_id uuid,p_page_size integer
) RETURNS SETOF public.work_order_execution_bindings
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_contribute_project(p_project_id)
 OR NOT private.can_execute_work_order(p_action_id)
 OR NOT EXISTS(SELECT 1 FROM public.work_orders WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT b.* FROM public.work_order_execution_bindings b
 WHERE b.action_id=p_action_id AND b.organization_id=p_organization_id AND b.project_id=p_project_id
 AND NOT ('execution_not_performed'=ANY(b.documentation_gaps))
 AND (p_after_id IS NULL OR b.workspace_entry_id>p_after_id)
 ORDER BY b.workspace_entry_id LIMIT p_page_size+1;
END $$;
REVOKE ALL ON FUNCTION public.list_work_order_evidence_executions(uuid,uuid,uuid,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_work_order_evidence_executions(uuid,uuid,uuid,uuid,integer) TO authenticated;

-- A planned-only record cannot be presented as documentation of actual execution.
-- The existing canonical guard still validates actor, versions, source pins and withdrawal.
CREATE FUNCTION private.guard_work_order_evidence_execution() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE binding public.work_order_execution_bindings;
BEGIN
 IF NEW.execution_revision_id IS NULL OR NEW.state='withdrawn' THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
 OR NOT private.can_contribute_project(NEW.project_id) OR NOT private.can_execute_work_order(NEW.action_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO binding FROM public.work_order_execution_bindings
 WHERE workspace_entry_id=NEW.execution_revision_id AND action_id=NEW.action_id
 AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
 IF binding.workspace_entry_id IS NULL THEN RAISE EXCEPTION 'Execution scope mismatch' USING ERRCODE='23503'; END IF;
 IF 'execution_not_performed'=ANY(binding.documentation_gaps)
 THEN RAISE EXCEPTION 'Actual execution is not recorded' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_work_order_evidence_execution() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_evidence_execution_check BEFORE INSERT ON public.work_order_evidence_versions
FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_evidence_execution();
