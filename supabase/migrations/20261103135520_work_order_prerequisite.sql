CREATE TABLE public.work_order_prerequisite_versions (
  action_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  prerequisite_action_id uuid REFERENCES public.actions(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid NOT NULL,
  PRIMARY KEY(action_id,version),
  UNIQUE(project_id,request_id),
  FOREIGN KEY(action_id,organization_id,project_id)
    REFERENCES public.work_orders(action_id,organization_id,project_id) ON DELETE RESTRICT,
  CHECK(action_id<>prerequisite_action_id)
);
ALTER TABLE public.work_order_prerequisite_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.work_order_prerequisite_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON TABLE public.work_order_prerequisite_versions TO authenticated;
CREATE POLICY prerequisite_read ON public.work_order_prerequisite_versions FOR SELECT TO authenticated
  USING(private.can_read_project(project_id));
CREATE POLICY prerequisite_write ON public.work_order_prerequisite_versions FOR INSERT TO authenticated
  WITH CHECK(created_by=auth.uid() AND private.can_manage_project(project_id));

CREATE FUNCTION private.guard_work_order_prerequisite() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
  IF NEW.prerequisite_action_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.actions a WHERE a.id=NEW.prerequisite_action_id AND a.project_id=NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Prerequisite must belong to the same project' USING ERRCODE='23503';
  END IF;
  IF EXISTS (
    WITH RECURSIVE chain(action_id) AS (
      SELECT NEW.prerequisite_action_id
      UNION
      SELECT next.prerequisite_action_id FROM chain
      CROSS JOIN LATERAL (
        SELECT v.prerequisite_action_id FROM public.work_order_prerequisite_versions v
        WHERE v.project_id=NEW.project_id AND v.action_id=chain.action_id ORDER BY v.version DESC LIMIT 1
      ) next
      WHERE next.prerequisite_action_id IS NOT NULL
    ) SELECT 1 FROM chain WHERE chain.action_id=NEW.action_id
  ) THEN
    RAISE EXCEPTION 'Prerequisites cannot form a cycle' USING ERRCODE='22023';
  END IF;
  NEW.created_at:=clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_prerequisite() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_work_order_prerequisite BEFORE INSERT ON public.work_order_prerequisite_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_prerequisite();

CREATE FUNCTION public.save_work_order_prerequisite(
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
      OR saved.prerequisite_action_id IS DISTINCT FROM p_prerequisite_action_id THEN
      RAISE EXCEPTION 'Mutation key has different prerequisite content' USING ERRCODE='22023';
    END IF;
    RETURN saved.version;
  END IF;
  INSERT INTO public.work_order_prerequisite_versions(
    action_id,organization_id,project_id,version,prerequisite_action_id,request_id
  ) VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_prerequisite_action_id,p_request_id)
  RETURNING * INTO saved;
  RETURN saved.version;
END;
$$;
REVOKE ALL ON FUNCTION public.save_work_order_prerequisite(uuid,uuid,uuid,integer,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_prerequisite(uuid,uuid,uuid,integer,uuid,uuid) TO authenticated;

-- External executors receive only readiness when the prerequisite task is private.
CREATE FUNCTION private.read_work_order_prerequisite(p_action_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE dependency public.work_order_prerequisite_versions; readiness boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.can_read_work_order(p_action_id),false) THEN
    RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO dependency FROM public.work_order_prerequisite_versions v
  WHERE v.action_id=p_action_id ORDER BY v.version DESC LIMIT 1;
  readiness:=dependency.prerequisite_action_id IS NULL OR coalesce((
    SELECT v.status IN ('performed','submitted','approved') FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=dependency.prerequisite_action_id ORDER BY v.version DESC LIMIT 1
  ),false);
  RETURN jsonb_build_object('version',coalesce(dependency.version,0),'ready',readiness,
    'prerequisiteActionId',CASE WHEN private.can_read_project(dependency.project_id)
       OR private.can_read_work_order(dependency.prerequisite_action_id) THEN dependency.prerequisite_action_id END);
END;
$$;
REVOKE ALL ON FUNCTION private.read_work_order_prerequisite(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_work_order_prerequisite(uuid) TO authenticated;
CREATE FUNCTION public.get_work_order_prerequisite(p_action_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.read_work_order_prerequisite(p_action_id);
$$;
REVOKE ALL ON FUNCTION public.get_work_order_prerequisite(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_prerequisite(uuid) TO authenticated;

-- This trigger runs after the normal lifecycle guard, which holds the action lock.
CREATE FUNCTION private.require_work_order_prerequisite() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.operation='transition' AND NEW.status='started' AND
     NOT (private.read_work_order_prerequisite(NEW.action_id)->>'ready')::boolean THEN
    RAISE EXCEPTION 'Finish the prerequisite work order before starting' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.require_work_order_prerequisite() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_require_work_order_prerequisite BEFORE INSERT ON public.work_order_lifecycle_versions
  FOR EACH ROW EXECUTE FUNCTION private.require_work_order_prerequisite();
