-- A stale field version is a domain conflict. PostgREST must not replay it as a serialization failure.
CREATE OR REPLACE FUNCTION public.save_field_job_version(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_template_version_id uuid,
  p_expected_version integer, p_values jsonb, p_status text, p_correction_reason text, p_request_id uuid
) RETURNS SETOF public.field_job_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.field_job_versions; latest_version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_contribute_project(p_project_id)
     OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Job field contribution access required' USING ERRCODE = '42501';
  END IF;
  IF p_action_id IS NULL OR p_template_version_id IS NULL OR p_request_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 THEN
    RAISE EXCEPTION 'Invalid job request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('field-job-action:' || p_action_id::text, 0));
  SELECT * INTO saved FROM public.field_job_versions WHERE project_id = p_project_id AND request_id = p_request_id;
  IF saved.id IS NOT NULL THEN
    IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id
       OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version + 1
       OR saved.template_version_id IS DISTINCT FROM p_template_version_id OR saved."values" IS DISTINCT FROM p_values
       OR saved.status IS DISTINCT FROM p_status OR saved.correction_reason IS DISTINCT FROM coalesce(p_correction_reason, '') THEN
      RAISE EXCEPTION 'Job request id was reused with different content' USING ERRCODE = '22023';
    END IF;
    RETURN NEXT saved; RETURN;
  END IF;
  SELECT max(version) INTO latest_version FROM public.field_job_versions WHERE action_id = p_action_id;
  IF coalesce(latest_version, 0) <> p_expected_version THEN
    RAISE EXCEPTION 'Job version conflict; reload' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.field_job_versions(action_id, organization_id, project_id, version, template_version_id, "values", status, correction_reason, request_id)
    VALUES (p_action_id, p_organization_id, p_project_id, p_expected_version + 1, p_template_version_id, p_values, p_status, coalesce(p_correction_reason, ''), p_request_id)
    RETURNING * INTO saved;
  RETURN NEXT saved;
END $$;
