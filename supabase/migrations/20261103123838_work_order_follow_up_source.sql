-- Record the exact source of the first follow-up plan and retain it on corrections.
ALTER TABLE public.work_order_plan_versions
 ADD COLUMN source_plan_version_id uuid REFERENCES public.work_order_plan_versions(id) ON DELETE RESTRICT,
 ADD COLUMN source_action_id uuid,
 ADD COLUMN source_plan_version integer;
CREATE INDEX work_order_plans_source ON public.work_order_plan_versions(source_plan_version_id)
 WHERE source_plan_version_id IS NOT NULL;

CREATE FUNCTION private.bind_work_order_plan_source() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE source public.work_order_plan_versions;
BEGIN
 IF NEW.version>1 THEN
   IF NEW.source_plan_version_id IS NOT NULL THEN
     RAISE EXCEPTION 'A source is only accepted on the first plan' USING ERRCODE='22023';
   END IF;
   SELECT v.source_plan_version_id INTO NEW.source_plan_version_id
   FROM public.work_order_plan_versions v
   WHERE v.action_id=NEW.action_id AND v.project_id=NEW.project_id
     AND v.organization_id=NEW.organization_id AND v.version=NEW.version-1;
 END IF;
 NEW.source_action_id:=NULL;
 NEW.source_plan_version:=NULL;
 IF NEW.source_plan_version_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO source FROM public.work_order_plan_versions v
 WHERE v.id=NEW.source_plan_version_id AND v.project_id=NEW.project_id
   AND v.organization_id=NEW.organization_id AND v.action_id<>NEW.action_id;
 IF source.id IS NULL THEN
   RAISE EXCEPTION 'Source plan is unavailable' USING ERRCODE='23503';
 END IF;
 NEW.source_action_id:=source.action_id;
 NEW.source_plan_version:=source.version;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bind_work_order_plan_source() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_plan_source BEFORE INSERT ON public.work_order_plan_versions
 FOR EACH ROW EXECUTE FUNCTION private.bind_work_order_plan_source();

CREATE FUNCTION public.save_work_order_plan(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_plan jsonb,p_correction_reason text,p_request_id uuid,p_source_plan_version_id uuid)
RETURNS SETOF public.work_order_plan_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_plan_versions; latest integer;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_write_project(p_project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action_id IS NULL OR p_organization_id IS NULL OR p_project_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_correction_reason IS NULL OR length(p_correction_reason)>2000 THEN RAISE EXCEPTION 'Invalid work-order mutation' USING ERRCODE='22023'; END IF;
 IF p_source_plan_version_id IS NOT NULL AND p_expected_version<>0 THEN
   RAISE EXCEPTION 'A source is only accepted on the first plan' USING ERRCODE='22023';
 END IF;
 PERFORM private.validate_work_order_plan(p_plan);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id) THEN
   PERFORM public.initialize_work_order(p_action_id,p_organization_id,p_project_id,0,p_request_id);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-plan:'||p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_plan_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.plan IS DISTINCT FROM p_plan OR saved.correction_reason IS DISTINCT FROM btrim(p_correction_reason) OR (p_expected_version=0 AND saved.source_plan_version_id IS DISTINCT FROM p_source_plan_version_id) THEN RAISE EXCEPTION 'Mutation key already has different plan content' USING ERRCODE='22023'; END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT max(v.version) INTO latest FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Work-order plan changed; reload before saving' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.work_order_plan_versions(action_id,organization_id,project_id,version,plan,correction_reason,request_id,source_plan_version_id)
 VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_plan,btrim(p_correction_reason),p_request_id,p_source_plan_version_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;

REVOKE ALL ON FUNCTION public.save_work_order_plan(uuid,uuid,uuid,integer,jsonb,text,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_plan(uuid,uuid,uuid,integer,jsonb,text,uuid,uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.save_work_order_plan(
 p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,
 p_plan jsonb,p_correction_reason text,p_request_id uuid
) RETURNS SETOF public.work_order_plan_versions
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.save_work_order_plan(p_action_id,p_organization_id,p_project_id,
   p_expected_version,p_plan,p_correction_reason,p_request_id,NULL::uuid);
$$;
