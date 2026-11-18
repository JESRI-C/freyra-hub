-- D02b reads the existing D01 capability history. No duplicate authority store.
CREATE FUNCTION public.get_work_order_access_subjects(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_after_user_id uuid,p_page_size integer)
RETURNS TABLE(user_id uuid) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_manage_project(p_project_id) OR NOT EXISTS(
   SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id
 ) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid access history page' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT DISTINCT v.user_id FROM public.work_order_access_versions v
 WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND (p_after_user_id IS NULL OR v.user_id>p_after_user_id)
 ORDER BY v.user_id LIMIT p_page_size+1;
END
$$;
CREATE FUNCTION public.get_work_order_access_history(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_user_id uuid,p_before_version integer,p_page_size integer)
RETURNS SETOF public.work_order_access_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT(private.can_manage_project(p_project_id) OR p_user_id=auth.uid()) OR NOT EXISTS(
   SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)
 ) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN RAISE EXCEPTION 'Invalid access history page' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT v.* FROM public.work_order_access_versions v
 WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND v.user_id=p_user_id AND (p_before_version IS NULL OR v.version<p_before_version)
 ORDER BY v.version DESC LIMIT p_page_size+1;
END
$$;
REVOKE ALL ON FUNCTION public.get_work_order_access_subjects(uuid,uuid,uuid,uuid,integer),public.get_work_order_access_history(uuid,uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_access_subjects(uuid,uuid,uuid,uuid,integer),public.get_work_order_access_history(uuid,uuid,uuid,uuid,integer,integer) TO authenticated;
