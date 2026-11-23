-- OBS-09: manager-confirmed ordinary draft from existing field_observations.
-- This is a creation-time source snapshot, not a source revision, verified file,
-- actual execution, professional approval, offline record or geography guess.
CREATE TABLE private.work_order_observation_drafts (
  action_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  request_id uuid NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200 AND title=btrim(title)),
  description text NOT NULL CHECK(length(description)<=10000 AND description=btrim(description)),
  request_sources jsonb NOT NULL CHECK(jsonb_typeof(request_sources)='array' AND jsonb_array_length(request_sources) BETWEEN 1 AND 20),
  sources jsonb NOT NULL CHECK(jsonb_typeof(sources)='array' AND jsonb_array_length(sources) BETWEEN 1 AND 20),
  UNIQUE(project_id,request_id),
  FOREIGN KEY(action_id,organization_id,project_id)
    REFERENCES public.work_orders(action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
  -- Source IDs and media IDs are historical values inside sources. No source
  -- foreign key or cascade can erase a snapshot when a mutable source is deleted.
);
ALTER TABLE private.work_order_observation_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.work_order_observation_drafts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON private.work_order_observation_drafts TO authenticated;
CREATE POLICY observation_draft_read ON private.work_order_observation_drafts FOR SELECT TO authenticated
  USING(private.can_manage_project(project_id));
CREATE POLICY observation_draft_insert ON private.work_order_observation_drafts FOR INSERT TO authenticated
  WITH CHECK(created_by=auth.uid() AND private.can_manage_project(project_id));

CREATE FUNCTION private.read_work_order_observation_source(p_observation_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET TimeZone='UTC' AS $$
DECLARE snapshot jsonb; refs jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_manage_project(p_project_id),false)
    OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project_id AND p.organization_id=p_organization_id)
  THEN RAISE EXCEPTION 'Observation sources are unavailable' USING ERRCODE='42501'; END IF;
  SELECT to_jsonb(o) INTO snapshot FROM public.field_observations o
    WHERE o.id=p_observation_id AND o.project_id=p_project_id;
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Observation sources are unavailable' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb) INTO refs
    FROM public.observation_media m WHERE m.observation_id=p_observation_id;
  RETURN jsonb_build_object('observation_id',p_observation_id,'snapshot',snapshot,'media_refs',refs,
    'source_hash',encode(sha256(convert_to(jsonb_build_object('snapshot',snapshot,'media_refs',refs)::text,'UTF8')),'hex'));
END;
$$;
REVOKE ALL ON FUNCTION private.read_work_order_observation_source(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_work_order_observation_source(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION private.guard_work_order_observation_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET TimeZone='UTC' AS $$
DECLARE source jsonb; expected jsonb; source_id uuid; last_id uuid; canonical jsonb:='[]'::jsonb;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Observation origin is immutable' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
    OR NOT coalesce(private.can_manage_project(NEW.project_id),false)
    OR NOT EXISTS(SELECT 1 FROM public.work_orders w JOIN public.actions a ON a.id=w.action_id AND a.project_id=w.project_id
      WHERE w.action_id=NEW.action_id AND w.organization_id=NEW.organization_id AND w.project_id=NEW.project_id
        AND w.created_by=auth.uid() AND w.request_id=NEW.request_id
        AND a.title=NEW.title AND a.description=NEW.description AND a.action_type IS DISTINCT FROM 'workflow_followup')
    OR NOT EXISTS(SELECT 1 FROM public.work_order_lifecycle_versions l WHERE l.action_id=NEW.action_id
      AND l.organization_id=NEW.organization_id AND l.project_id=NEW.project_id AND l.version=1
      AND l.status='draft' AND l.operation='transition' AND l.request_id=NEW.request_id
      AND l.created_by=auth.uid() AND l.plan_version_id IS NULL AND l.assignment_version_id IS NULL AND l.execution_revision_id IS NULL)
    OR EXISTS(SELECT 1 FROM public.work_order_lifecycle_versions l WHERE l.action_id=NEW.action_id AND l.version>1)
    OR EXISTS(SELECT 1 FROM public.work_order_plan_versions p WHERE p.action_id=NEW.action_id)
    OR EXISTS(SELECT 1 FROM public.work_order_assignment_versions a WHERE a.action_id=NEW.action_id)
    OR EXISTS(SELECT 1 FROM public.work_order_execution_bindings e WHERE e.action_id=NEW.action_id)
    OR EXISTS(SELECT 1 FROM public.work_order_submission_versions s WHERE s.action_id=NEW.action_id)
  THEN RAISE EXCEPTION 'Observation origin is unavailable' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(NEW.sources) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.sources) NOT BETWEEN 1 AND 20
    OR jsonb_typeof(NEW.request_sources) IS DISTINCT FROM 'array'
    OR jsonb_array_length(NEW.sources)<>jsonb_array_length(NEW.request_sources)
  THEN RAISE EXCEPTION 'Invalid observation origin' USING ERRCODE='22023'; END IF;
  FOR source IN SELECT value FROM jsonb_array_elements(NEW.sources) LOOP
    source_id:=(source->>'observation_id')::uuid;
    IF source_id IS NULL OR (last_id IS NOT NULL AND source_id<=last_id) THEN
      RAISE EXCEPTION 'Invalid observation origin order' USING ERRCODE='22023'; END IF;
    expected:=private.read_work_order_observation_source(source_id,NEW.organization_id,NEW.project_id);
    IF source IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Observation source changed' USING ERRCODE='PT409'; END IF;
    canonical:=canonical||jsonb_build_array(jsonb_build_object('observationId',source_id,'sourceHash',source->>'source_hash'));
    last_id:=source_id;
  END LOOP;
  IF NEW.request_sources IS DISTINCT FROM canonical THEN RAISE EXCEPTION 'Invalid observation origin request' USING ERRCODE='22023'; END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_observation_draft() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_observation_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON private.work_order_observation_drafts
  FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_observation_draft();

CREATE FUNCTION public.list_work_order_observation_sources(
  p_organization_id uuid,p_project_id uuid,p_after_observation_id uuid,p_page_size integer,p_search text
) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET TimeZone='UTC' AS $$
DECLARE items jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_manage_project(p_project_id),false)
    OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project_id AND p.organization_id=p_organization_id)
  THEN RAISE EXCEPTION 'Observation sources are unavailable' USING ERRCODE='42501'; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR p_search IS NULL OR length(btrim(p_search))>200
  THEN RAISE EXCEPTION 'Invalid observation page' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(private.read_work_order_observation_source(o.id,p_organization_id,p_project_id) ORDER BY o.id),'[]'::jsonb)
  INTO items FROM (
    SELECT source.id FROM public.field_observations source WHERE source.project_id=p_project_id
      AND (p_after_observation_id IS NULL OR source.id>p_after_observation_id)
      AND (btrim(p_search)='' OR position(lower(btrim(p_search)) IN lower(concat_ws(' ',source.observation_type,source.species_name,source.notes)))>0)
    ORDER BY source.id LIMIT p_page_size+1
  )o;
  RETURN NEXT jsonb_build_object('organization_id',p_organization_id,'project_id',p_project_id,'user_id',auth.uid(),'items',items);
END;
$$;

CREATE FUNCTION public.get_work_order_observation_draft(p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET TimeZone='UTC' AS $$
DECLARE origin private.work_order_observation_drafts; receipt jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_manage_project(p_project_id),false)
    OR NOT EXISTS(SELECT 1 FROM public.actions a JOIN public.projects p ON p.id=a.project_id
      WHERE a.id=p_action_id AND p.id=p_project_id AND p.organization_id=p_organization_id)
  THEN RAISE EXCEPTION 'Observation origin is unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO origin FROM private.work_order_observation_drafts d
    WHERE d.action_id=p_action_id AND d.project_id=p_project_id AND d.organization_id=p_organization_id;
  IF origin.action_id IS NOT NULL THEN
    receipt:=jsonb_build_object('action_id',origin.action_id,'organization_id',origin.organization_id,
      'project_id',origin.project_id,'user_id',auth.uid(),'request_id',origin.request_id,
      'created_by',origin.created_by,'created_at',origin.created_at,'title',origin.title,
      'description',origin.description,'status','draft','sources',origin.sources);
  END IF;
  RETURN NEXT jsonb_build_object('organization_id',p_organization_id,'project_id',p_project_id,'user_id',auth.uid(),
    'action_id',p_action_id,'origin',receipt);
END;
$$;

CREATE FUNCTION public.create_work_order_observation_draft(
  p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_title text,p_description text,p_sources jsonb,p_request_id uuid
) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET TimeZone='UTC' AS $$
DECLARE prior private.work_order_observation_drafts; entry jsonb; canonical jsonb; snapshots jsonb:='[]'::jsonb;
  current_source jsonb; ids uuid[]; locked_count integer; normalized_title text:=btrim(p_title); normalized_description text:=btrim(p_description);
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_manage_project(p_project_id),false)
    OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project_id AND p.organization_id=p_organization_id)
  THEN RAISE EXCEPTION 'Observation draft is unavailable' USING ERRCODE='42501'; END IF;
  IF p_action_id IS NULL OR p_request_id IS NULL OR p_title IS NULL OR length(normalized_title) NOT BETWEEN 1 AND 200
    OR p_description IS NULL OR length(normalized_description)>10000 OR jsonb_typeof(p_sources) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid observation draft' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_sources) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid observation selection' USING ERRCODE='22023'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR NOT(entry ?& ARRAY['observationId','sourceHash'])
      OR entry-ARRAY['observationId','sourceHash']<>'{}'::jsonb
      OR jsonb_typeof(entry->'observationId') IS DISTINCT FROM 'string'
      OR (entry->>'observationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(entry->'sourceHash') IS DISTINCT FROM 'string' OR (entry->>'sourceHash') !~ '^[0-9a-f]{64}$'
    THEN RAISE EXCEPTION 'Invalid observation selection fields' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT array_agg((s.value->>'observationId')::uuid ORDER BY (s.value->>'observationId')::uuid),
    jsonb_agg(jsonb_build_object('observationId',(s.value->>'observationId')::uuid,'sourceHash',s.value->>'sourceHash') ORDER BY (s.value->>'observationId')::uuid)
  INTO ids,canonical FROM jsonb_array_elements(p_sources)s(value);
  IF (SELECT count(DISTINCT id) FROM unnest(ids)selected(id))<>cardinality(ids) THEN
    RAISE EXCEPTION 'Select each observation once' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('observation-draft-request:'||p_project_id::text||':'||p_request_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
  SELECT * INTO prior FROM private.work_order_observation_drafts d WHERE d.project_id=p_project_id AND d.request_id=p_request_id;
  IF prior.action_id IS NOT NULL THEN
    IF prior.action_id IS DISTINCT FROM p_action_id OR prior.organization_id IS DISTINCT FROM p_organization_id
      OR prior.created_by IS DISTINCT FROM auth.uid() OR prior.title IS DISTINCT FROM normalized_title
      OR prior.description IS DISTINCT FROM normalized_description OR prior.request_sources IS DISTINCT FROM canonical
    THEN RAISE EXCEPTION 'Observation draft request changed' USING ERRCODE='PT409'; END IF;
    -- The committed request is authoritative on retry, even if sources have
    -- subsequently been edited/deleted. Recheck current manager authority first.
    RETURN QUERY SELECT value->'origin' FROM public.get_work_order_observation_draft(p_action_id,p_organization_id,p_project_id) result(value);
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.actions a WHERE a.id=p_action_id) THEN
    RAISE EXCEPTION 'Action identity is already used' USING ERRCODE='PT409'; END IF;

  -- Parent FOR UPDATE conflicts with the FK KEY SHARE acquired by a new media
  -- INSERT (or reparent). Existing media rows are locked as well. This serializes
  -- source rows plus attachment membership/content during hash and creation.
  PERFORM o.id FROM public.field_observations o WHERE o.project_id=p_project_id AND o.id=ANY(ids) ORDER BY o.id FOR UPDATE;
  GET DIAGNOSTICS locked_count=ROW_COUNT;
  IF locked_count<>cardinality(ids) THEN RAISE EXCEPTION 'Observation sources are unavailable' USING ERRCODE='42501'; END IF;
  PERFORM m.id FROM public.observation_media m WHERE m.observation_id=ANY(ids) ORDER BY m.id FOR UPDATE;
  FOR entry IN SELECT value FROM jsonb_array_elements(canonical) LOOP
    current_source:=private.read_work_order_observation_source((entry->>'observationId')::uuid,p_organization_id,p_project_id);
    IF current_source->>'source_hash' IS DISTINCT FROM entry->>'sourceHash' THEN
      RAISE EXCEPTION 'Observation source changed; reload before creating draft' USING ERRCODE='PT409'; END IF;
    snapshots:=snapshots||jsonb_build_array(current_source);
  END LOOP;
  INSERT INTO public.actions(id,project_id,title,description,status)
    VALUES(p_action_id,p_project_id,normalized_title,normalized_description,'Åben');
  PERFORM public.initialize_work_order(p_action_id,p_organization_id,p_project_id,0,p_request_id);
  PERFORM public.mutate_work_order_lifecycle(p_action_id,p_organization_id,p_project_id,0,
    jsonb_build_object('operation','transition','targetStatus','draft','planVersionId',NULL,
      'assignmentVersionId',NULL,'executionRevisionId',NULL,'reason','Oprettet som kladde fra valgte observationer.'),p_request_id);
  INSERT INTO private.work_order_observation_drafts(action_id,organization_id,project_id,request_id,title,description,request_sources,sources)
    VALUES(p_action_id,p_organization_id,p_project_id,p_request_id,normalized_title,normalized_description,canonical,snapshots);
  RETURN QUERY SELECT value->'origin' FROM public.get_work_order_observation_draft(p_action_id,p_organization_id,p_project_id) result(value);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Observation draft identity changed' USING ERRCODE='PT409';
END;
$$;

REVOKE ALL ON FUNCTION public.list_work_order_observation_sources(uuid,uuid,uuid,integer,text),
  public.create_work_order_observation_draft(uuid,uuid,uuid,text,text,jsonb,uuid),
  public.get_work_order_observation_draft(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_work_order_observation_sources(uuid,uuid,uuid,integer,text),
  public.create_work_order_observation_draft(uuid,uuid,uuid,text,text,jsonb,uuid),
  public.get_work_order_observation_draft(uuid,uuid,uuid) TO authenticated;
COMMENT ON TABLE private.work_order_observation_drafts IS
  'Manager-only immutable creation origin. Raw field_observations and observation_media metadata snapshots; no original bytes, file verification or cascades from mutable sources.';
