ALTER TABLE public.work_order_prerequisite_versions ADD COLUMN prerequisite_action_ids uuid[];
CREATE INDEX work_order_prerequisite_array ON public.work_order_prerequisite_versions USING gin(prerequisite_action_ids);

CREATE OR REPLACE FUNCTION private.guard_work_order_prerequisite() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $
DECLARE selected_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_manage_project(NEW.project_id),false) THEN
    RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order-prerequisites:'||NEW.project_id::text,0));
  IF NEW.version<>(SELECT coalesce(max(v.version),0)+1 FROM public.work_order_prerequisite_versions v
                  WHERE v.action_id=NEW.action_id) THEN
    RAISE EXCEPTION 'Prerequisite changed' USING ERRCODE='PT409';
  END IF;
  IF (SELECT v.status FROM public.work_order_lifecycle_versions v WHERE v.action_id=NEW.action_id
      ORDER BY v.version DESC LIMIT 1) IN ('started','performed','submitted','approved','returned','reopened','cancelled')
     OR EXISTS (SELECT 1 FROM public.work_order_execution_bindings v WHERE v.action_id=NEW.action_id) THEN
    RAISE EXCEPTION 'Prerequisite can only be changed before work starts' USING ERRCODE='PT409';
  END IF;
  selected_ids := coalesce(NEW.prerequisite_action_ids,array_remove(ARRAY[NEW.prerequisite_action_id],NULL));
  IF coalesce(array_ndims(selected_ids),1)<>1 OR coalesce(array_lower(selected_ids,1),1)<>1 THEN
    RAISE EXCEPTION 'Invalid prerequisite array' USING ERRCODE='22023';
  END IF;
  IF cardinality(selected_ids)>12 OR array_position(selected_ids,NULL) IS NOT NULL
     OR cardinality(selected_ids)<>(SELECT count(DISTINCT id) FROM unnest(selected_ids) id)
     OR NEW.action_id=ANY(selected_ids)
     OR (NEW.prerequisite_action_ids IS NOT NULL AND NEW.prerequisite_action_id IS DISTINCT FROM selected_ids[1]) THEN
    RAISE EXCEPTION 'Invalid prerequisite list' USING ERRCODE='22023';
  END IF;
  PERFORM a.id FROM public.actions a WHERE a.id=ANY(selected_ids) AND a.project_id=NEW.project_id
  ORDER BY a.id FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM unnest(selected_ids) id
    WHERE NOT EXISTS (SELECT 1 FROM public.actions a WHERE a.id=id AND a.project_id=NEW.project_id)
  ) THEN
    RAISE EXCEPTION 'Prerequisite must belong to the same project' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    WITH RECURSIVE latest AS (
      SELECT DISTINCT ON (v.action_id) v.action_id,
        coalesce(v.prerequisite_action_ids,array_remove(ARRAY[v.prerequisite_action_id],NULL)) AS prerequisites
      FROM public.work_order_prerequisite_versions v WHERE v.project_id=NEW.project_id
      ORDER BY v.action_id,v.version DESC
    ), chain(action_id) AS (
      SELECT unnest(selected_ids)
      UNION
      SELECT unnest(latest.prerequisites) FROM chain JOIN latest USING(action_id)
    ) SELECT 1 FROM chain WHERE chain.action_id=NEW.action_id
  ) THEN
    RAISE EXCEPTION 'Prerequisites cannot form a cycle' USING ERRCODE='22023';
  END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.save_work_order_prerequisites(
  p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,
  p_prerequisite_action_ids uuid[],p_request_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_prerequisite_versions;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_manage_project(p_project_id),false) THEN
    RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL OR p_prerequisite_action_ids IS NULL THEN
    RAISE EXCEPTION 'Invalid prerequisite' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
  SELECT * INTO saved FROM public.work_order_prerequisite_versions v
  WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
  IF saved.version IS NOT NULL THEN
    IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id
      OR saved.version<>p_expected_version+1 OR saved.created_by<>auth.uid()
      OR coalesce(saved.prerequisite_action_ids,array_remove(ARRAY[saved.prerequisite_action_id],NULL)) IS DISTINCT FROM p_prerequisite_action_ids THEN
      RAISE EXCEPTION 'Mutation key has different prerequisite content' USING ERRCODE='22023';
    END IF;
    RETURN saved.version;
  END IF;
  INSERT INTO public.work_order_prerequisite_versions(
    action_id,organization_id,project_id,version,prerequisite_action_id,prerequisite_action_ids,request_id
  ) VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_prerequisite_action_ids[1],p_prerequisite_action_ids,p_request_id)
  RETURNING * INTO saved;
  RETURN saved.version;
END;
$$;
REVOKE ALL ON FUNCTION public.save_work_order_prerequisites(uuid,uuid,uuid,integer,uuid[],uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_prerequisites(uuid,uuid,uuid,integer,uuid[],uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_work_order_prerequisite(
  p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,
  p_prerequisite_action_id uuid,p_request_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_prerequisite_versions;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_manage_project(p_project_id),false) THEN
    RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid prerequisite' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
  SELECT * INTO saved FROM public.work_order_prerequisite_versions v
  WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
  IF saved.version IS NOT NULL THEN
    IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id
      OR saved.version<>p_expected_version+1 OR saved.created_by<>auth.uid()
      OR coalesce(cardinality(saved.prerequisite_action_ids),0)>1
      OR saved.prerequisite_action_id IS DISTINCT FROM p_prerequisite_action_id THEN
      RAISE EXCEPTION 'Mutation key has different prerequisite content' USING ERRCODE='22023';
    END IF;
    RETURN saved.version;
  END IF;
  IF coalesce((
    SELECT cardinality(v.prerequisite_action_ids) FROM public.work_order_prerequisite_versions v
    WHERE v.action_id=p_action_id ORDER BY v.version DESC LIMIT 1
  ),0)>1 THEN
    RAISE EXCEPTION 'This client cannot replace a multi-prerequisite task' USING ERRCODE='PT409';
  END IF;
  INSERT INTO public.work_order_prerequisite_versions(
    action_id,organization_id,project_id,version,prerequisite_action_id,request_id
  ) VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_prerequisite_action_id,p_request_id)
  RETURNING * INTO saved;
  RETURN saved.version;
END;
$$;
CREATE OR REPLACE FUNCTION private.read_work_order_prerequisite(p_action_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dependency public.work_order_prerequisite_versions; visible jsonb; waiting integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_read_work_order(p_action_id),false) THEN
    RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO dependency FROM public.work_order_prerequisite_versions v
  WHERE v.action_id=p_action_id ORDER BY v.version DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('actionId',edge.id,'ready',status.ready)
      ORDER BY edge.position) FILTER (WHERE private.can_read_project(dependency.project_id)
        OR private.can_read_work_order(edge.id)), '[]'::jsonb),
    count(*) FILTER (WHERE NOT status.ready)
  INTO visible,waiting
  FROM unnest(coalesce(dependency.prerequisite_action_ids,
         array_remove(ARRAY[dependency.prerequisite_action_id],NULL))) WITH ORDINALITY edge(id,position)
  CROSS JOIN LATERAL (SELECT coalesce((
    SELECT v.status IN ('performed','submitted','approved') FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=edge.id ORDER BY v.version DESC LIMIT 1
  ),false) AS ready) status;
  RETURN jsonb_build_object('version',coalesce(dependency.version,0),'ready',waiting=0,
    'prerequisiteActionId',visible->0->'actionId','prerequisites',visible);
END;
$$;

-- Preserve references in previous versions too, like the original single-column foreign key.
CREATE FUNCTION private.protect_work_order_prerequisite_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.work_order_prerequisite_versions v
    WHERE v.prerequisite_action_id=OLD.id OR v.prerequisite_action_ids @> ARRAY[OLD.id]) THEN
    RAISE EXCEPTION 'Work order is referenced as a prerequisite' USING ERRCODE='23503';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_work_order_prerequisite_references() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_work_order_prerequisite_references BEFORE DELETE OR UPDATE OF project_id ON public.actions
  FOR EACH ROW EXECUTE FUNCTION private.protect_work_order_prerequisite_references();
