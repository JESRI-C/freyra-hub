-- D01: related work-order identity and explicit, versioned task capabilities.
-- Existing actions, projects, auth, audit and file policies remain authoritative.
-- This migration does not grant external users project-wide or Storage access.
CREATE UNIQUE INDEX IF NOT EXISTS actions_id_project_work_order_scope ON public.actions(id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_id_org_work_order_scope ON public.projects(id, organization_id);

CREATE TABLE public.work_orders (
  action_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  request_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(action_id, organization_id, project_id),
  UNIQUE(project_id, request_id),
  FOREIGN KEY(action_id, project_id) REFERENCES public.actions(id, project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(project_id, organization_id) REFERENCES public.projects(id, organization_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_orders_project ON public.work_orders(project_id, action_id);

CREATE TABLE public.work_order_access_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK(version > 0),
  active boolean NOT NULL,
  can_execute boolean NOT NULL,
  can_review boolean NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
  request_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(active OR (NOT can_execute AND NOT can_review)),
  UNIQUE(action_id, user_id, version),
  UNIQUE(project_id, request_id),
  FOREIGN KEY(action_id, organization_id, project_id) REFERENCES public.work_orders(action_id, organization_id, project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_order_access_current ON public.work_order_access_versions(action_id, user_id, version DESC);
CREATE INDEX work_order_access_actor ON public.work_order_access_versions(user_id, action_id, version DESC);

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_access_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_orders, public.work_order_access_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.work_orders, public.work_order_access_versions TO authenticated;
GRANT SELECT ON public.work_orders, public.work_order_access_versions TO service_role;

-- Definer helpers are limited to membership/RLS recursion. Identity is always auth.uid().
CREATE FUNCTION private.is_work_order_member(p_project_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL
   AND (p_user_id=auth.uid() OR private.can_manage_project(p_project_id))
   AND EXISTS (
     SELECT 1 FROM public.projects p
     JOIN public.organization_memberships om ON om.organization_id=p.organization_id AND om.user_id=p_user_id
     WHERE p.id=p_project_id AND (om.role IN ('owner','admin') OR EXISTS (
       SELECT 1 FROM public.project_members pm WHERE pm.project_id=p.id AND pm.user_id=p_user_id
       AND pm.role IN ('admin','project_manager','editor','field','viewer','external')
     ))
   )
$$;
CREATE FUNCTION private.can_read_work_order(p_action_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND (
     private.can_read_project(w.project_id) OR (
       private.is_work_order_member(w.project_id,auth.uid()) AND coalesce((
         SELECT a.active FROM public.work_order_access_versions a
         WHERE a.action_id=w.action_id AND a.user_id=auth.uid() ORDER BY a.version DESC LIMIT 1
       ),false)
     )
   )
 )
$$;
CREATE FUNCTION private.can_execute_work_order(p_action_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND (
     private.can_write_project(w.project_id) OR (
       private.is_work_order_member(w.project_id,auth.uid()) AND coalesce((
         SELECT a.active AND a.can_execute FROM public.work_order_access_versions a
         WHERE a.action_id=w.action_id AND a.user_id=auth.uid() ORDER BY a.version DESC LIMIT 1
       ),false)
     )
   )
 )
$$;
CREATE FUNCTION private.can_review_work_order(p_action_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id
   AND private.is_work_order_member(w.project_id,auth.uid()) AND coalesce((
     SELECT a.active AND a.can_review FROM public.work_order_access_versions a
     WHERE a.action_id=w.action_id AND a.user_id=auth.uid() ORDER BY a.version DESC LIMIT 1
   ),false)
 )
$$;
REVOKE ALL ON FUNCTION private.is_work_order_member(uuid,uuid), private.can_read_work_order(uuid), private.can_execute_work_order(uuid), private.can_review_work_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_work_order_member(uuid,uuid), private.can_read_work_order(uuid), private.can_execute_work_order(uuid), private.can_review_work_order(uuid) TO authenticated;

CREATE POLICY work_orders_read ON public.work_orders FOR SELECT TO authenticated USING(private.can_read_work_order(action_id));
CREATE POLICY work_orders_insert ON public.work_orders FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND private.can_write_project(project_id));
CREATE POLICY work_order_access_read ON public.work_order_access_versions FOR SELECT TO authenticated
 USING(private.can_manage_project(project_id) OR (user_id=auth.uid() AND private.is_work_order_member(project_id,auth.uid())));
CREATE POLICY work_order_access_insert ON public.work_order_access_versions FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND private.can_manage_project(project_id));

CREATE FUNCTION private.guard_work_order_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Work-order identity and history cannot be replaced or deleted' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_write_project(NEW.project_id) THEN
   RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.actions a WHERE a.id=NEW.action_id AND a.action_type='workflow_followup') THEN
   RAISE EXCEPTION 'A follow-up suggestion is not a work order' USING ERRCODE='22023';
 END IF;
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END
$$;
CREATE TRIGGER work_orders_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_identity();

CREATE FUNCTION private.guard_work_order_access()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.work_order_access_versions; eligible boolean;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Task capabilities are immutable revisions' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_manage_project(NEW.project_id) THEN
   RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-access:'||NEW.action_id::text||':'||NEW.user_id::text,0));
 SELECT * INTO previous FROM public.work_order_access_versions a WHERE a.action_id=NEW.action_id AND a.user_id=NEW.user_id ORDER BY a.version DESC LIMIT 1;
 IF NEW.version IS DISTINCT FROM coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'Task access changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF (NEW.active OR previous.id IS NULL) AND NOT private.is_work_order_member(NEW.project_id,NEW.user_id) THEN
   RAISE EXCEPTION 'Recipient is not an active member of this project and organization' USING ERRCODE='22023';
 END IF;
 IF NEW.active AND NEW.can_execute THEN
   SELECT EXISTS(SELECT 1 FROM public.projects p JOIN public.organization_memberships om ON om.organization_id=p.organization_id AND om.user_id=NEW.user_id
     WHERE p.id=NEW.project_id AND (om.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM public.project_members pm WHERE pm.project_id=p.id AND pm.user_id=NEW.user_id AND pm.role IN ('admin','project_manager','editor','field','external')))) INTO eligible;
   IF NOT eligible THEN RAISE EXCEPTION 'Read-only project membership cannot receive execution capability' USING ERRCODE='22023'; END IF;
 END IF;
 NEW.reason:=btrim(NEW.reason);
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END
$$;
CREATE TRIGGER work_order_access_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_access_versions FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_access();

-- Atomic internal audit only. No network, email, SMS or provider consumers are introduced.
CREATE FUNCTION private.audit_work_order_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor is unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
 VALUES(NEW.project_id,CASE WHEN TG_TABLE_NAME='work_orders' THEN 'work_order.created' ELSE 'work_order.access_changed' END,
 'work_order',NEW.action_id,'Arbejdsopgavens adgang er versionsgemt',auth.uid()::text,'database_trigger',
 jsonb_build_object('schema','freyra.work-order-event/v1','actionId',NEW.action_id,'organizationId',NEW.organization_id,'projectId',NEW.project_id,
 'requestId',NEW.request_id,'accessVersion',to_jsonb(NEW)->'version','recipientId',to_jsonb(NEW)->'user_id',
 'active',to_jsonb(NEW)->'active','canExecute',to_jsonb(NEW)->'can_execute','canReview',to_jsonb(NEW)->'can_review'));
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.audit_work_order_access() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER work_orders_audit AFTER INSERT ON public.work_orders FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_access();
CREATE TRIGGER work_order_access_audit AFTER INSERT ON public.work_order_access_versions FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_access();
REVOKE ALL ON FUNCTION private.guard_work_order_identity(), private.guard_work_order_access() FROM PUBLIC, anon;

CREATE FUNCTION public.initialize_work_order(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_request_id uuid)
RETURNS SETOF public.work_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.work_orders;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_write_project(p_project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action_id IS NULL OR p_organization_id IS NULL OR p_project_id IS NULL OR p_request_id IS NULL OR p_expected_version IS DISTINCT FROM 0 THEN
   RAISE EXCEPTION 'Invalid work-order creation request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 SELECT * INTO saved FROM public.work_orders w WHERE w.project_id=p_project_id AND w.request_id=p_request_id;
 IF saved.action_id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Mutation key was already used with a different request' USING ERRCODE='22023';
   END IF;
   RETURN NEXT saved; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id) THEN RAISE EXCEPTION 'Work order already exists' USING ERRCODE='40001'; END IF;
 INSERT INTO public.work_orders(action_id,organization_id,project_id,request_id) VALUES(p_action_id,p_organization_id,p_project_id,p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;

CREATE FUNCTION public.save_work_order_access(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_user_id uuid,p_expected_version integer,p_active boolean,p_can_execute boolean,p_can_review boolean,p_reason text,p_request_id uuid)
RETURNS SETOF public.work_order_access_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.work_order_access_versions; latest integer;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_manage_project(p_project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action_id IS NULL OR p_organization_id IS NULL OR p_project_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL
   OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_active IS NULL OR p_can_execute IS NULL OR p_can_review IS NULL
   OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid task access request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.project_id=p_project_id AND w.organization_id=p_organization_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-access:'||p_action_id::text||':'||p_user_id::text,0));
 SELECT * INTO saved FROM public.work_order_access_versions a WHERE a.project_id=p_project_id AND a.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.user_id IS DISTINCT FROM p_user_id
     OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.active IS DISTINCT FROM p_active OR saved.can_execute IS DISTINCT FROM p_can_execute
     OR saved.can_review IS DISTINCT FROM p_can_review OR saved.reason IS DISTINCT FROM btrim(p_reason) OR saved.created_by IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Mutation key was already used with a different request' USING ERRCODE='22023';
   END IF;
   RETURN NEXT saved; RETURN;
 END IF;
 SELECT max(a.version) INTO latest FROM public.work_order_access_versions a WHERE a.action_id=p_action_id AND a.user_id=p_user_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Task access changed; reload before saving' USING ERRCODE='40001'; END IF;
 INSERT INTO public.work_order_access_versions(action_id,organization_id,project_id,user_id,version,active,can_execute,can_review,reason,request_id)
 VALUES(p_action_id,p_organization_id,p_project_id,p_user_id,p_expected_version+1,p_active,p_can_execute,p_can_review,btrim(p_reason),p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;

CREATE FUNCTION public.get_work_order_access(p_action_id uuid,p_project_id uuid)
RETURNS TABLE(action_id uuid,organization_id uuid,project_id uuid,user_id uuid,can_plan boolean,can_manage_access boolean,can_execute boolean,can_review boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE item public.work_orders;
BEGIN
 SELECT * INTO item FROM public.work_orders w WHERE w.action_id=p_action_id AND w.project_id=p_project_id;
 IF auth.uid() IS NULL OR item.action_id IS NULL OR NOT private.can_read_work_order(p_action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT item.action_id,item.organization_id,item.project_id,auth.uid(),private.can_write_project(item.project_id),private.can_manage_project(item.project_id),private.can_execute_work_order(item.action_id),private.can_review_work_order(item.action_id);
END
$$;
REVOKE ALL ON FUNCTION public.initialize_work_order(uuid,uuid,uuid,integer,uuid), public.save_work_order_access(uuid,uuid,uuid,uuid,integer,boolean,boolean,boolean,text,uuid), public.get_work_order_access(uuid,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.initialize_work_order(uuid,uuid,uuid,integer,uuid), public.save_work_order_access(uuid,uuid,uuid,uuid,integer,boolean,boolean,boolean,text,uuid), public.get_work_order_access(uuid,uuid) TO authenticated;
