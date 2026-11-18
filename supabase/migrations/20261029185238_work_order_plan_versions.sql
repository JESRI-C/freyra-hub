-- D02a: immutable plans on the existing action/work-order identity.
-- Actual execution remains in the existing action-execution workspace history.
CREATE UNIQUE INDEX IF NOT EXISTS sites_id_project_work_order_scope ON public.sites(id,project_id);
CREATE UNIQUE INDEX IF NOT EXISTS watercourse_id_project_work_order_scope ON public.watercourse_versions(id,organization_id,project_id);
CREATE TABLE public.work_order_plan_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),action_id uuid NOT NULL,organization_id uuid NOT NULL,project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),plan jsonb NOT NULL,correction_reason text NOT NULL DEFAULT '' CHECK(length(correction_reason)<=2000),
 request_id uuid NOT NULL,created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 responsible_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,site_id uuid,centerline_version_id uuid,planned_start date,planned_end date,
 profile_key text GENERATED ALWAYS AS (plan->>'profile') STORED,
 length_m numeric GENERATED ALWAYS AS ((plan#>>'{watercourse,lengthM}')::numeric) STORED,
 bottom_width_m numeric GENERATED ALWAYS AS ((plan#>>'{watercourse,bottomWidthM}')::numeric) STORED,
 station_from_m numeric GENERATED ALWAYS AS ((plan#>>'{watercourse,stationFromM}')::numeric) STORED,
 station_to_m numeric GENERATED ALWAYS AS ((plan#>>'{watercourse,stationToM}')::numeric) STORED,
 UNIQUE(action_id,version),UNIQUE(project_id,request_id),
 FOREIGN KEY(action_id,organization_id,project_id) REFERENCES public.work_orders(action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(site_id,project_id) REFERENCES public.sites(id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(centerline_version_id,organization_id,project_id) REFERENCES public.watercourse_versions(id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_order_plans_current ON public.work_order_plan_versions(project_id,action_id,version DESC);
CREATE INDEX work_order_plans_length ON public.work_order_plan_versions(project_id,length_m) WHERE length_m IS NOT NULL;
ALTER TABLE public.work_order_plan_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_plan_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.work_order_plan_versions TO authenticated;
GRANT SELECT ON public.work_order_plan_versions TO service_role;
CREATE POLICY work_order_plans_read ON public.work_order_plan_versions FOR SELECT TO authenticated
 USING(private.can_read_project(project_id) OR private.can_read_work_order(action_id));
CREATE POLICY work_order_plans_insert ON public.work_order_plan_versions FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND private.can_write_project(project_id));

CREATE FUNCTION private.validate_work_order_plan(p jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['schema','title','description','instructions','profile','responsibleId','siteId','watercourseVersionId','locationNote','plannedStart','plannedEnd','priority','plannedMethod','watercourse'];
 field text; maximum integer; w jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& keys) OR p-keys<>'{}'::jsonb OR p->>'schema' IS DISTINCT FROM 'freyra.work-order-plan/v1' THEN
   RAISE EXCEPTION 'Invalid work-order plan contract' USING ERRCODE='22023';
 END IF;
 FOR field,maximum IN SELECT * FROM (VALUES('title',160),('description',4000),('instructions',4000),('locationNote',2000)) limits(k,n) LOOP
   IF jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR length(p->>field)>maximum OR p->>field<>btrim(p->>field) THEN RAISE EXCEPTION 'Invalid plan text field' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF length(p->>'title')=0 OR (p->'profile'<>'null'::jsonb AND (jsonb_typeof(p->'profile') IS DISTINCT FROM 'string' OR p->>'profile' NOT IN ('general','watercourse','nature','construction','grazing')))
   OR (p->'priority'<>'null'::jsonb AND (jsonb_typeof(p->'priority') IS DISTINCT FROM 'string' OR p->>'priority' NOT IN ('high','medium','low')))
   OR (p->'plannedMethod'<>'null'::jsonb AND (jsonb_typeof(p->'plannedMethod') IS DISTINCT FROM 'string' OR length(p->>'plannedMethod') NOT BETWEEN 1 AND 2000 OR p->>'plannedMethod'<>btrim(p->>'plannedMethod')))
 THEN RAISE EXCEPTION 'Invalid plan title, profile or method' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['responsibleId','siteId','watercourseVersionId'] LOOP
   IF p->field<>'null'::jsonb AND (jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR (p->>field)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'Invalid plan relation' USING ERRCODE='22023'; END IF;
 END LOOP;
 -- Reuse the existing calendar validation rather than accepting PostgreSQL date coercion.
 PERFORM private.validate_field_job_values('{"schema":"freyra.field-job-template/v1","title":"Plan dates","domain":"general","fields":[{"key":"plan_start","label":"Start","type":"date","required":false},{"key":"plan_end","label":"End","type":"date","required":false}]}'::jsonb,
   jsonb_build_object('plan_start',p->'plannedStart','plan_end',p->'plannedEnd'));
 IF p->>'plannedEnd' IS NOT NULL AND (p->>'plannedStart' IS NULL OR p->>'plannedEnd'<p->>'plannedStart') THEN RAISE EXCEPTION 'Invalid planned date window' USING ERRCODE='22023'; END IF;
 IF p->>'profile'='watercourse' THEN
   w:=p->'watercourse';keys:=ARRAY['name','externalId','regulationReference','regulationVersion','stationFromM','stationToM','stationDirection','lengthM','bottomWidthM','measurementSource','term'];
   IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR NOT(w ?& keys) OR w-keys<>'{}'::jsonb OR jsonb_typeof(w->'stationDirection') IS DISTINCT FROM 'string' OR w->>'stationDirection' NOT IN ('upstream','downstream','unknown') THEN RAISE EXCEPTION 'Invalid watercourse profile' USING ERRCODE='22023'; END IF;
   FOR field,maximum IN SELECT * FROM (VALUES('name',200),('externalId',200),('regulationReference',1000),('regulationVersion',200),('measurementSource',2000),('term',2000)) limits(k,n) LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'string' OR length(w->>field) NOT BETWEEN 1 AND maximum OR w->>field<>btrim(w->>field)) THEN RAISE EXCEPTION 'Invalid watercourse text' USING ERRCODE='22023'; END IF;
   END LOOP;
   FOREACH field IN ARRAY ARRAY['stationFromM','stationToM','lengthM','bottomWidthM'] LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'number' OR (w->>field)::numeric<0 OR (w->>field)::numeric>1000000000) THEN RAISE EXCEPTION 'Invalid watercourse metres' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['stationFromM','stationToM','lengthM','bottomWidthM']) f(k) WHERE w->f.k<>'null'::jsonb) AND w->>'measurementSource' IS NULL THEN RAISE EXCEPTION 'Station and metre values require their source, including zero' USING ERRCODE='22023'; END IF;
   IF (w->>'stationToM')::numeric<(w->>'stationFromM')::numeric AND w->>'stationDirection'='unknown' THEN RAISE EXCEPTION 'Reversed stationing requires explicit direction' USING ERRCODE='22023'; END IF;
 ELSE
   IF p->'watercourse'<>'null'::jsonb OR p->'watercourseVersionId'<>'null'::jsonb THEN RAISE EXCEPTION 'Watercourse data requires the watercourse profile' USING ERRCODE='22023'; END IF;
 END IF;
END
$$;
REVOKE ALL ON FUNCTION private.validate_work_order_plan(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.validate_work_order_plan(jsonb) TO authenticated;

CREATE FUNCTION private.guard_work_order_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE latest integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Work-order plans are immutable revisions' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_write_project(NEW.project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 PERFORM private.validate_work_order_plan(NEW.plan);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-plan:'||NEW.action_id::text,0));
 SELECT max(v.version) INTO latest FROM public.work_order_plan_versions v WHERE v.action_id=NEW.action_id;
 IF NEW.version IS DISTINCT FROM coalesce(latest,0)+1 THEN RAISE EXCEPTION 'Work-order plan changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF NEW.version>1 AND length(btrim(NEW.correction_reason))=0 THEN RAISE EXCEPTION 'Plan correction reason is required' USING ERRCODE='22023'; END IF;
 NEW.responsible_id:=(NEW.plan->>'responsibleId')::uuid;NEW.site_id:=(NEW.plan->>'siteId')::uuid;NEW.centerline_version_id:=(NEW.plan->>'watercourseVersionId')::uuid;
 NEW.planned_start:=(NEW.plan->>'plannedStart')::date;NEW.planned_end:=(NEW.plan->>'plannedEnd')::date;
 IF NEW.responsible_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.organization_memberships om WHERE om.organization_id=NEW.organization_id AND om.user_id=NEW.responsible_id
   AND (om.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM public.project_members pm WHERE pm.project_id=NEW.project_id AND pm.user_id=NEW.responsible_id))
 ) THEN RAISE EXCEPTION 'Responsible person is not a current project member' USING ERRCODE='22023'; END IF;
 NEW.created_at:=clock_timestamp();NEW.correction_reason:=btrim(NEW.correction_reason);RETURN NEW;
END
$$;
CREATE TRIGGER work_order_plan_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_plan_versions FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_plan();
REVOKE ALL ON FUNCTION private.guard_work_order_plan() FROM PUBLIC,anon;

CREATE FUNCTION private.audit_work_order_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor is unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
 VALUES(NEW.project_id,'work_order.plan_saved','work_order',NEW.action_id,'Arbejdsopgavens plan er versionsgemt',auth.uid()::text,'database_trigger',
 jsonb_build_object('schema','freyra.work-order-event/v1','actionId',NEW.action_id,'planVersionId',NEW.id,'version',NEW.version,'requestId',NEW.request_id));
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.audit_work_order_plan() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_plan_audit AFTER INSERT ON public.work_order_plan_versions FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_plan();

CREATE FUNCTION public.save_work_order_plan(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_plan jsonb,p_correction_reason text,p_request_id uuid)
RETURNS SETOF public.work_order_plan_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_plan_versions; latest integer;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_write_project(p_project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action_id IS NULL OR p_organization_id IS NULL OR p_project_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_correction_reason IS NULL OR length(p_correction_reason)>2000 THEN RAISE EXCEPTION 'Invalid work-order mutation' USING ERRCODE='22023'; END IF;
 PERFORM private.validate_work_order_plan(p_plan);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id) THEN
   PERFORM public.initialize_work_order(p_action_id,p_organization_id,p_project_id,0,p_request_id);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-plan:'||p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_plan_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.plan IS DISTINCT FROM p_plan OR saved.correction_reason IS DISTINCT FROM btrim(p_correction_reason) THEN RAISE EXCEPTION 'Mutation key already has different plan content' USING ERRCODE='22023'; END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT max(v.version) INTO latest FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Work-order plan changed; reload before saving' USING ERRCODE='40001'; END IF;
 INSERT INTO public.work_order_plan_versions(action_id,organization_id,project_id,version,plan,correction_reason,request_id)
 VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_plan,btrim(p_correction_reason),p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
CREATE FUNCTION public.get_work_order_plan_history(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_before_version integer,p_page_size integer)
RETURNS SETOF public.work_order_plan_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT(
   EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id))
   OR (private.can_write_project(p_project_id) AND EXISTS(SELECT 1 FROM public.actions a JOIN public.projects p ON p.id=a.project_id WHERE a.id=p_action_id AND p.id=p_project_id AND p.organization_id=p_organization_id))
 ) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN RAISE EXCEPTION 'Invalid history page' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT v.* FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND (p_before_version IS NULL OR v.version<p_before_version) ORDER BY v.version DESC LIMIT p_page_size+1;
END
$$;
REVOKE ALL ON FUNCTION public.save_work_order_plan(uuid,uuid,uuid,integer,jsonb,text,uuid),public.get_work_order_plan_history(uuid,uuid,uuid,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_plan(uuid,uuid,uuid,integer,jsonb,text,uuid),public.get_work_order_plan_history(uuid,uuid,uuid,integer,integer) TO authenticated;
