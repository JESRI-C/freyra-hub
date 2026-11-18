-- Project-scoped, append-only job-card templates and answers on existing actions.
-- A recorded answer is a user's registration, never professional approval.
CREATE TABLE public.field_job_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  definition jsonb NOT NULL,
  request_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version),
  UNIQUE (project_id, request_id)
);
CREATE INDEX field_job_templates_project ON public.field_job_template_versions(project_id, template_id, version DESC);

CREATE TABLE public.field_job_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  template_version_id uuid NOT NULL REFERENCES public.field_job_template_versions(id) ON DELETE RESTRICT,
  "values" jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'recorded', 'needs_review')),
  correction_reason text NOT NULL DEFAULT '' CHECK (length(correction_reason) <= 2000),
  request_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id, version),
  UNIQUE (project_id, request_id)
);
CREATE INDEX field_jobs_project ON public.field_job_versions(project_id, action_id, version DESC);

ALTER TABLE public.field_job_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_job_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_job_template_versions, public.field_job_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.field_job_template_versions, public.field_job_versions TO authenticated;
GRANT SELECT ON public.field_job_template_versions, public.field_job_versions TO service_role;
CREATE POLICY field_job_templates_read ON public.field_job_template_versions FOR SELECT TO authenticated
  USING (private.can_read_project(project_id));
CREATE POLICY field_job_templates_insert ON public.field_job_template_versions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND private.can_write_project(project_id));
CREATE POLICY field_jobs_read ON public.field_job_versions FOR SELECT TO authenticated
  USING (private.can_read_project(project_id));
CREATE POLICY field_jobs_insert ON public.field_job_versions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND private.can_contribute_project(project_id));

CREATE FUNCTION private.validate_field_job_definition(p_definition jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE field jsonb; option_value jsonb; keys text[] := ARRAY[]::text[]; field_type text;
BEGIN
  IF jsonb_typeof(p_definition) IS DISTINCT FROM 'object'
     OR (p_definition - ARRAY['schema','title','domain','fields']) <> '{}'::jsonb
     OR p_definition->>'schema' IS DISTINCT FROM 'freyra.field-job-template/v1'
     OR jsonb_typeof(p_definition->'title') IS DISTINCT FROM 'string'
     OR length(p_definition->>'title') NOT BETWEEN 1 AND 160
     OR length(btrim(p_definition->>'title')) = 0
     OR p_definition->>'domain' IS NULL
     OR p_definition->>'domain' NOT IN ('watercourse','nature','construction','grazing','general')
     OR jsonb_typeof(p_definition->'fields') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid job template definition' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_definition->'fields') NOT BETWEEN 1 AND 40
     OR octet_length(p_definition::text) > 2097152 THEN
    RAISE EXCEPTION 'Job template exceeds its limits' USING ERRCODE = '22023';
  END IF;
  FOR field IN SELECT value FROM jsonb_array_elements(p_definition->'fields') LOOP
    IF jsonb_typeof(field) IS DISTINCT FROM 'object'
       OR (field - ARRAY['key','label','type','required','helpText','unit','options']) <> '{}'::jsonb
       OR jsonb_typeof(field->'key') IS DISTINCT FROM 'string'
       OR (field->>'key') !~ '^[a-z][a-z0-9_]{0,47}$'
       OR (field->>'key') = ANY(keys)
       OR jsonb_typeof(field->'label') IS DISTINCT FROM 'string'
       OR length(field->>'label') NOT BETWEEN 1 AND 120
       OR length(btrim(field->>'label')) = 0
       OR jsonb_typeof(field->'required') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(field->'type') IS DISTINCT FROM 'string'
       OR field->>'type' NOT IN ('text','textarea','number','date','boolean','select') THEN
      RAISE EXCEPTION 'Invalid or duplicate job template field' USING ERRCODE = '22023';
    END IF;
    keys := array_append(keys, field->>'key');
    IF (field ? 'helpText' AND (jsonb_typeof(field->'helpText') IS DISTINCT FROM 'string' OR length(field->>'helpText') > 500))
       OR (field ? 'unit' AND (jsonb_typeof(field->'unit') IS DISTINCT FROM 'string' OR length(field->>'unit') > 40)) THEN
      RAISE EXCEPTION 'Invalid job template help or unit' USING ERRCODE = '22023';
    END IF;
    field_type := field->>'type';
    IF field_type = 'select' THEN
      IF jsonb_typeof(field->'options') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Select fields require options' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(field->'options') NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION 'Invalid select option count' USING ERRCODE = '22023';
      END IF;
      FOR option_value IN SELECT value FROM jsonb_array_elements(field->'options') LOOP
        IF jsonb_typeof(option_value) IS DISTINCT FROM 'string'
           OR length(option_value #>> '{}') NOT BETWEEN 1 AND 120
           OR length(btrim(option_value #>> '{}')) = 0 THEN
          RAISE EXCEPTION 'Invalid select option' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      IF (SELECT count(*) FROM jsonb_array_elements(field->'options')) <>
         (SELECT count(DISTINCT value) FROM jsonb_array_elements(field->'options')) THEN
        RAISE EXCEPTION 'Duplicate select options' USING ERRCODE = '22023';
      END IF;
    ELSIF field ? 'options' THEN
      RAISE EXCEPTION 'Only select fields accept options' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION private.validate_field_job_values(p_definition jsonb, p_values jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE field jsonb; field_value jsonb; value_text text; value_key text; parsed_date date;
BEGIN
  PERFORM private.validate_field_job_definition(p_definition);
  IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR octet_length(p_values::text) > 2097152 THEN
    RAISE EXCEPTION 'Invalid job values' USING ERRCODE = '22023';
  END IF;
  FOR value_key IN SELECT jsonb_object_keys(p_values) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_definition->'fields') f WHERE f->>'key' = value_key) THEN
      RAISE EXCEPTION 'Unknown job field' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR field IN SELECT value FROM jsonb_array_elements(p_definition->'fields') LOOP
    field_value := p_values->(field->>'key');
    -- Unanswered required fields are data gaps, not a reason to lose a field record.
    IF field_value IS NULL OR field_value = 'null'::jsonb THEN CONTINUE; END IF;
    value_text := field_value #>> '{}';
    CASE field->>'type'
    WHEN 'text', 'textarea' THEN
      IF jsonb_typeof(field_value) <> 'string' OR length(value_text) > 4000 THEN
        RAISE EXCEPTION 'Invalid text job value' USING ERRCODE = '22023';
      END IF;
    WHEN 'number' THEN
      IF jsonb_typeof(field_value) <> 'number' THEN
        RAISE EXCEPTION 'Invalid numeric job value' USING ERRCODE = '22023';
      END IF;
      IF abs(value_text::numeric) > 1.7976931348623157e308::numeric THEN
        RAISE EXCEPTION 'Numeric job value must be finite' USING ERRCODE = '22023';
      END IF;
    WHEN 'boolean' THEN
      IF jsonb_typeof(field_value) <> 'boolean' THEN
        RAISE EXCEPTION 'Invalid boolean job value' USING ERRCODE = '22023';
      END IF;
    WHEN 'date' THEN
      IF jsonb_typeof(field_value) <> 'string' OR value_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Invalid calendar date job value' USING ERRCODE = '22023';
      END IF;
      BEGIN
        parsed_date := value_text::date;
        IF to_char(parsed_date, 'YYYY-MM-DD') <> value_text THEN
          RAISE EXCEPTION 'Invalid calendar date';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid calendar date job value' USING ERRCODE = '22023';
      END;
    WHEN 'select' THEN
      IF jsonb_typeof(field_value) <> 'string' OR NOT (field->'options' @> jsonb_build_array(value_text)) THEN
        RAISE EXCEPTION 'Unknown job select option' USING ERRCODE = '22023';
      END IF;
    ELSE RAISE EXCEPTION 'Unknown job field type' USING ERRCODE = '22023';
    END CASE;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION private.validate_field_job_definition(jsonb), private.validate_field_job_values(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.validate_field_job_definition(jsonb), private.validate_field_job_values(jsonb,jsonb) TO authenticated, service_role;

CREATE FUNCTION private.validate_field_job_template_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.field_job_template_versions; project_organization uuid;
BEGIN
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_write_project(NEW.project_id) THEN
    RAISE EXCEPTION 'Job template write access required' USING ERRCODE = '42501';
  END IF;
  SELECT organization_id INTO project_organization FROM public.projects WHERE id = NEW.project_id;
  IF project_organization IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Invalid job template project scope' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('field-job-template:' || NEW.template_id::text, 0));
  SELECT * INTO previous FROM public.field_job_template_versions WHERE template_id = NEW.template_id ORDER BY version DESC LIMIT 1;
  IF NEW.version IS DISTINCT FROM coalesce(previous.version, 0) + 1 THEN
    RAISE EXCEPTION 'Job template version conflict; reload' USING ERRCODE = '40001';
  END IF;
  IF previous.id IS NOT NULL AND (previous.project_id <> NEW.project_id OR previous.organization_id <> NEW.organization_id) THEN
    RAISE EXCEPTION 'Job template scope is immutable' USING ERRCODE = '23514';
  END IF;
  PERFORM private.validate_field_job_definition(NEW.definition);
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE FUNCTION private.validate_field_job_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.field_job_versions; bound public.field_job_template_versions; action_project uuid; project_organization uuid;
BEGIN
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_contribute_project(NEW.project_id) THEN
    RAISE EXCEPTION 'Job field contribution access required' USING ERRCODE = '42501';
  END IF;
  SELECT organization_id INTO project_organization FROM public.projects WHERE id = NEW.project_id;
  SELECT project_id INTO action_project FROM public.actions WHERE id = NEW.action_id;
  SELECT * INTO bound FROM public.field_job_template_versions WHERE id = NEW.template_version_id;
  IF project_organization IS DISTINCT FROM NEW.organization_id OR action_project IS DISTINCT FROM NEW.project_id
     OR bound.id IS NULL OR bound.project_id <> NEW.project_id OR bound.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Invalid job action, template or project scope' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('field-job-action:' || NEW.action_id::text, 0));
  SELECT * INTO previous FROM public.field_job_versions WHERE action_id = NEW.action_id ORDER BY version DESC LIMIT 1;
  IF NEW.version IS DISTINCT FROM coalesce(previous.version, 0) + 1 THEN
    RAISE EXCEPTION 'Job version conflict; reload' USING ERRCODE = '40001';
  END IF;
  IF previous.id IS NOT NULL AND (previous.project_id <> NEW.project_id OR previous.organization_id <> NEW.organization_id) THEN
    RAISE EXCEPTION 'Job project scope is immutable' USING ERRCODE = '23514';
  END IF;
  IF (previous.id IS NULL OR previous.template_version_id <> NEW.template_version_id) AND NOT private.can_write_project(NEW.project_id) THEN
    RAISE EXCEPTION 'Only a project editor may bind a job template' USING ERRCODE = '42501';
  END IF;
  IF previous.id IS NOT NULL AND coalesce(length(btrim(NEW.correction_reason)), 0) = 0 THEN
    RAISE EXCEPTION 'A new job revision requires a correction reason' USING ERRCODE = '22023';
  END IF;
  PERFORM private.validate_field_job_values(bound.definition, NEW."values");
  NEW.created_at := now();
  RETURN NEW;
END $$;

CREATE FUNCTION private.reject_field_job_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Saved job templates and registrations are immutable versions' USING ERRCODE = '23514';
END $$;
REVOKE ALL ON FUNCTION private.validate_field_job_template_insert(), private.validate_field_job_insert(), private.reject_field_job_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER field_job_template_validate BEFORE INSERT ON public.field_job_template_versions FOR EACH ROW EXECUTE FUNCTION private.validate_field_job_template_insert();
CREATE TRIGGER field_job_validate BEFORE INSERT ON public.field_job_versions FOR EACH ROW EXECUTE FUNCTION private.validate_field_job_insert();
CREATE TRIGGER field_job_template_immutable BEFORE UPDATE OR DELETE ON public.field_job_template_versions FOR EACH ROW EXECUTE FUNCTION private.reject_field_job_mutation();
CREATE TRIGGER field_job_immutable BEFORE UPDATE OR DELETE ON public.field_job_versions FOR EACH ROW EXECUTE FUNCTION private.reject_field_job_mutation();

CREATE FUNCTION public.save_field_job_template_version(
  p_organization_id uuid, p_project_id uuid, p_template_id uuid, p_expected_version integer,
  p_definition jsonb, p_request_id uuid
) RETURNS SETOF public.field_job_template_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.field_job_template_versions; latest_version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_write_project(p_project_id)
     OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Job template write access required' USING ERRCODE = '42501';
  END IF;
  IF p_template_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 THEN
    RAISE EXCEPTION 'Invalid job template request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('field-job-template:' || p_template_id::text, 0));
  SELECT * INTO saved FROM public.field_job_template_versions WHERE project_id = p_project_id AND request_id = p_request_id;
  IF saved.id IS NOT NULL THEN
    IF saved.template_id IS DISTINCT FROM p_template_id OR saved.organization_id IS DISTINCT FROM p_organization_id
       OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version + 1
       OR saved.definition IS DISTINCT FROM p_definition THEN
      RAISE EXCEPTION 'Job template request id was reused with different content' USING ERRCODE = '22023';
    END IF;
    RETURN NEXT saved; RETURN;
  END IF;
  SELECT max(version) INTO latest_version FROM public.field_job_template_versions WHERE template_id = p_template_id;
  IF coalesce(latest_version, 0) <> p_expected_version THEN
    RAISE EXCEPTION 'Job template version conflict; reload' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.field_job_template_versions(template_id, organization_id, project_id, version, definition, request_id)
    VALUES (p_template_id, p_organization_id, p_project_id, p_expected_version + 1, p_definition, p_request_id)
    RETURNING * INTO saved;
  RETURN NEXT saved;
END $$;

CREATE FUNCTION public.save_field_job_version(
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
    RAISE EXCEPTION 'Job version conflict; reload' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.field_job_versions(action_id, organization_id, project_id, version, template_version_id, "values", status, correction_reason, request_id)
    VALUES (p_action_id, p_organization_id, p_project_id, p_expected_version + 1, p_template_version_id, p_values, p_status, coalesce(p_correction_reason, ''), p_request_id)
    RETURNING * INTO saved;
  RETURN NEXT saved;
END $$;
REVOKE ALL ON FUNCTION public.save_field_job_template_version(uuid,uuid,uuid,integer,jsonb,uuid), public.save_field_job_version(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_field_job_template_version(uuid,uuid,uuid,integer,jsonb,uuid), public.save_field_job_version(uuid,uuid,uuid,uuid,integer,jsonb,text,text,uuid) TO authenticated;
