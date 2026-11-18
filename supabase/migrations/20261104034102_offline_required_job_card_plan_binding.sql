-- A local draft declares the exact plan it was collected under; originals and prior rows remain intact.
ALTER TABLE public.field_job_versions ADD COLUMN required_plan_version_id uuid,
 ADD CONSTRAINT field_job_required_plan_scope FOREIGN KEY(required_plan_version_id,action_id,organization_id,project_id)
 REFERENCES public.work_order_plan_versions(id,action_id,organization_id,project_id) ON DELETE RESTRICT;
CREATE INDEX field_job_required_plan_reference ON public.field_job_versions(required_plan_version_id,action_id,organization_id,project_id)
 WHERE required_plan_version_id IS NOT NULL;

CREATE FUNCTION private.guard_field_job_required_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_plan public.work_order_plan_versions;
BEGIN
 IF NEW.required_plan_version_id IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
   OR NOT private.can_contribute_project(NEW.project_id) OR NOT private.can_execute_work_order(NEW.action_id)
 THEN RAISE EXCEPTION 'Task execution access required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 SELECT * INTO current_plan FROM public.work_order_plan_versions p
 WHERE p.action_id=NEW.action_id AND p.project_id=NEW.project_id AND p.organization_id=NEW.organization_id
 ORDER BY p.version DESC LIMIT 1;
 IF current_plan.id IS DISTINCT FROM NEW.required_plan_version_id OR NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(coalesce(current_plan.plan->'requiredJobCards','[]'::jsonb)) card
   WHERE (card->>'templateVersionId')::uuid=NEW.template_version_id
 ) THEN RAISE EXCEPTION 'Required plan changed; preserve the draft and reload' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_field_job_required_plan() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER field_job_required_plan BEFORE INSERT ON public.field_job_versions
 FOR EACH ROW EXECUTE FUNCTION private.guard_field_job_required_plan();

CREATE OR REPLACE FUNCTION private.save_field_job_version_core(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_template_version_id uuid,
  p_expected_version integer, p_values jsonb, p_status text, p_correction_reason text, p_request_id uuid, p_required_plan_version_id uuid
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
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:' || p_action_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('field-job-action:' || p_action_id::text, 0));
  IF p_required_plan_version_id IS NOT NULL AND NOT private.can_execute_work_order(p_action_id) THEN
    RAISE EXCEPTION 'Task execution access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO saved FROM public.field_job_versions WHERE project_id = p_project_id AND request_id = p_request_id;
  IF saved.id IS NOT NULL THEN
    IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id
       OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version + 1
       OR saved.required_plan_version_id IS DISTINCT FROM p_required_plan_version_id OR saved.template_version_id IS DISTINCT FROM p_template_version_id OR saved."values" IS DISTINCT FROM p_values
       OR saved.status IS DISTINCT FROM p_status OR saved.correction_reason IS DISTINCT FROM coalesce(p_correction_reason, '') THEN
      RAISE EXCEPTION 'Job request id was reused with different content' USING ERRCODE = '22023';
    END IF;
    RETURN NEXT saved; RETURN;
  END IF;
  SELECT max(version) INTO latest_version FROM public.field_job_versions WHERE action_id = p_action_id;
  IF coalesce(latest_version, 0) <> p_expected_version THEN
    RAISE EXCEPTION 'Job version conflict; reload' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.field_job_versions(action_id, organization_id, project_id, version, template_version_id, "values", status, correction_reason, request_id, required_plan_version_id)
    VALUES (p_action_id, p_organization_id, p_project_id, p_expected_version + 1, p_template_version_id, p_values, p_status, coalesce(p_correction_reason, ''), p_request_id, p_required_plan_version_id)
    RETURNING * INTO saved;
  RETURN NEXT saved;
END $$;


REVOKE ALL ON FUNCTION private.save_field_job_version_core(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid,uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.save_field_job_version_core(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_field_job_version(
 p_organization_id uuid,p_project_id uuid,p_action_id uuid,p_template_version_id uuid,
 p_expected_version integer,p_values jsonb,p_status text,p_correction_reason text,p_request_id uuid
) RETURNS SETOF public.field_job_versions LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.save_field_job_version_core(p_organization_id,p_project_id,p_action_id,p_template_version_id,
   p_expected_version,p_values,p_status,p_correction_reason,p_request_id,NULL::uuid);
$$;

CREATE FUNCTION public.save_field_job_version_for_plan(
 p_organization_id uuid,p_project_id uuid,p_action_id uuid,p_template_version_id uuid,
 p_expected_version integer,p_values jsonb,p_status text,p_correction_reason text,p_request_id uuid,p_required_plan_version_id uuid
) RETURNS SETOF public.field_job_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_required_plan_version_id IS NULL THEN RAISE EXCEPTION 'Required plan reference is missing' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT * FROM private.save_field_job_version_core(p_organization_id,p_project_id,p_action_id,p_template_version_id,
   p_expected_version,p_values,p_status,p_correction_reason,p_request_id,p_required_plan_version_id);
END $$;
REVOKE ALL ON FUNCTION public.save_field_job_version_for_plan(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid,uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_field_job_version_for_plan(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid,uuid) TO authenticated;
