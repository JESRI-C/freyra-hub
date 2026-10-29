-- D02d: groups are project-scoped operational rosters, not a new auth system.
CREATE TABLE public.work_order_group_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid NOT NULL,organization_id uuid NOT NULL,project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),active boolean NOT NULL,
 member_ids uuid[] NOT NULL CHECK(cardinality(member_ids)<=200),member_assessments jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(member_assessments)='array'),
 correction_reason text NOT NULL DEFAULT '' CHECK(length(correction_reason)<=2000),request_id uuid NOT NULL,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(group_id,version),UNIQUE(project_id,request_id),UNIQUE(id,group_id,organization_id,project_id),
 FOREIGN KEY(project_id,organization_id) REFERENCES public.projects(id,organization_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_order_groups_current ON public.work_order_group_versions(project_id,group_id,version DESC);
ALTER TABLE public.work_order_group_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_group_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.work_order_group_versions TO authenticated;
GRANT SELECT ON public.work_order_group_versions TO service_role;
CREATE POLICY work_order_groups_read ON public.work_order_group_versions FOR SELECT TO authenticated USING(private.can_read_project(project_id));
CREATE POLICY work_order_groups_insert ON public.work_order_group_versions FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND private.can_manage_project(project_id));

CREATE TABLE public.work_order_assignment_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),action_id uuid NOT NULL,organization_id uuid NOT NULL,project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),change_kind text NOT NULL CHECK(change_kind IN('configured','claimed')),
 mode text NOT NULL CHECK(mode IN('person','group','pool','unassigned')),plan_version_id uuid NOT NULL,
 source_group_version_id uuid,source_group_id uuid,candidate_user_ids uuid[] NOT NULL CHECK(cardinality(candidate_user_ids)<=200),
 candidate_memberships jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(candidate_memberships)='array'),
 claimed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,claimed_at timestamptz,claim_member_snapshot jsonb,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),request_id uuid NOT NULL,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(action_id,version),UNIQUE(project_id,request_id),UNIQUE(id,action_id,organization_id,project_id),
 CHECK((source_group_version_id IS NULL)=(source_group_id IS NULL)),
 CHECK((change_kind='claimed' AND mode='pool' AND claimed_by IS NOT NULL AND claimed_at IS NOT NULL AND claim_member_snapshot IS NOT NULL) OR (change_kind='configured' AND claimed_by IS NULL AND claimed_at IS NULL AND claim_member_snapshot IS NULL)),
 FOREIGN KEY(action_id,organization_id,project_id) REFERENCES public.work_orders(action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(plan_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_plan_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(source_group_version_id,source_group_id,organization_id,project_id) REFERENCES public.work_order_group_versions(id,group_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_order_assignments_current ON public.work_order_assignment_versions(project_id,action_id,version DESC);
CREATE INDEX work_order_assignments_claimant ON public.work_order_assignment_versions(claimed_by,action_id,version DESC) WHERE claimed_by IS NOT NULL;
ALTER TABLE public.work_order_assignment_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_assignment_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.work_order_assignment_versions TO authenticated;
GRANT SELECT ON public.work_order_assignment_versions TO service_role;

-- One current membership predicate is shared by grants, groups and pool claims.
-- A caller can inspect only themselves or members of a project they administer.
CREATE FUNCTION private.work_order_executor_membership(p_project_id uuid,p_user_id uuid)
RETURNS TABLE(organization_role text,project_role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT om.role::text,pm.role::text FROM public.projects p
 JOIN public.organization_memberships om ON om.organization_id=p.organization_id AND om.user_id=p_user_id
 LEFT JOIN public.project_members pm ON pm.project_id=p.id AND pm.user_id=p_user_id
 WHERE p.id=p_project_id AND auth.uid() IS NOT NULL AND (p_user_id=auth.uid() OR private.can_manage_project(p_project_id))
 AND (om.role IN('owner','admin') OR pm.role IN('admin','project_manager','editor','field','external'))
$$;
CREATE FUNCTION private.is_work_order_executor_member(p_project_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.work_order_executor_membership(p_project_id,p_user_id))
$$;
CREATE FUNCTION private.work_order_member_assessment(p_project_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('schema','freyra.work-order-membership/v1','userId',p_user_id,'organizationRole',organization_role,'projectRole',project_role,'assessedAt',clock_timestamp()) FROM private.work_order_executor_membership(p_project_id,p_user_id)
$$;
REVOKE ALL ON FUNCTION private.work_order_executor_membership(uuid,uuid),private.is_work_order_executor_member(uuid,uuid),private.work_order_member_assessment(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.work_order_executor_membership(uuid,uuid),private.is_work_order_executor_member(uuid,uuid),private.work_order_member_assessment(uuid,uuid) TO authenticated;

CREATE FUNCTION private.work_order_assignment_access(p_action_id uuid)
RETURNS TABLE(can_read boolean,can_execute boolean,can_see_state boolean,can_claim boolean,current_group_version_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.work_order_assignment_versions;g public.work_order_group_versions;
BEGIN
 can_read:=false;can_execute:=false;can_see_state:=false;can_claim:=false;current_group_version_id:=NULL;
 IF auth.uid() IS NULL THEN RETURN NEXT;RETURN;END IF;
 SELECT * INTO a FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id ORDER BY v.version DESC LIMIT 1;
 IF a.id IS NULL OR NOT(auth.uid()=ANY(a.candidate_user_ids)) OR NOT private.is_work_order_executor_member(a.project_id,auth.uid()) THEN RETURN NEXT;RETURN;END IF;
 IF a.source_group_id IS NOT NULL THEN
   SELECT * INTO g FROM public.work_order_group_versions v WHERE v.group_id=a.source_group_id AND v.organization_id=a.organization_id AND v.project_id=a.project_id ORDER BY v.version DESC LIMIT 1;
   IF g.id IS NULL OR NOT g.active OR NOT(auth.uid()=ANY(g.member_ids)) THEN RETURN NEXT;RETURN;END IF;
   current_group_version_id:=g.id;
 END IF;
 can_see_state:=true;
 can_read:=a.mode IN('person','group') OR (a.mode='pool' AND (a.claimed_by IS NULL OR a.claimed_by=auth.uid()));
 can_execute:=a.mode IN('person','group') OR (a.mode='pool' AND a.claimed_by=auth.uid());
 can_execute:=coalesce(can_execute,false);
 can_claim:=a.mode='pool' AND a.claimed_by IS NULL;
 RETURN NEXT;
END
$$;
REVOKE ALL ON FUNCTION private.work_order_assignment_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.work_order_assignment_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_read_work_order(p_action_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND (
   private.can_read_project(w.project_id) OR (private.is_work_order_member(w.project_id,auth.uid()) AND coalesce((SELECT a.active FROM public.work_order_access_versions a WHERE a.action_id=w.action_id AND a.user_id=auth.uid() ORDER BY a.version DESC LIMIT 1),false))
   OR coalesce((SELECT a.can_read FROM private.work_order_assignment_access(w.action_id)a),false)
 ))
$$;
CREATE OR REPLACE FUNCTION private.can_execute_work_order(p_action_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.work_orders w LEFT JOIN LATERAL(
   SELECT a.mode,a.claimed_by FROM public.work_order_assignment_versions a WHERE a.action_id=w.action_id ORDER BY a.version DESC LIMIT 1
 ) assignment ON true WHERE w.action_id=p_action_id AND CASE WHEN assignment.mode='pool' THEN
   assignment.claimed_by IS NOT NULL AND (private.can_write_project(w.project_id) OR coalesce((SELECT a.can_execute FROM private.work_order_assignment_access(w.action_id)a),false))
 ELSE private.can_write_project(w.project_id) OR (private.is_work_order_executor_member(w.project_id,auth.uid()) AND coalesce((SELECT a.active AND a.can_execute FROM public.work_order_access_versions a WHERE a.action_id=w.action_id AND a.user_id=auth.uid() ORDER BY a.version DESC LIMIT 1),false))
   OR coalesce((SELECT a.can_execute FROM private.work_order_assignment_access(w.action_id)a),false) END)
$$;
CREATE POLICY work_order_assignments_read ON public.work_order_assignment_versions FOR SELECT TO authenticated
 USING(private.can_read_project(project_id) OR private.can_read_work_order(action_id) OR coalesce((SELECT a.can_see_state FROM private.work_order_assignment_access(action_id)a),false));
CREATE POLICY work_order_assignments_insert ON public.work_order_assignment_versions FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND (private.can_manage_project(project_id) OR (change_kind='claimed' AND claimed_by=auth.uid())));

CREATE FUNCTION private.guard_work_order_group() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.work_order_group_versions;member uuid;assessment jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Work groups are immutable revisions' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_manage_project(NEW.project_id) THEN RAISE EXCEPTION 'Project is unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-group:'||NEW.group_id::text,0));
 SELECT * INTO previous FROM public.work_order_group_versions v WHERE v.group_id=NEW.group_id ORDER BY v.version DESC LIMIT 1;
 IF NEW.version IS DISTINCT FROM coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'Group changed; reload before saving' USING ERRCODE='PT409';END IF;
 IF previous.id IS NOT NULL AND (previous.organization_id IS DISTINCT FROM NEW.organization_id OR previous.project_id IS DISTINCT FROM NEW.project_id) THEN RAISE EXCEPTION 'Group scope is immutable' USING ERRCODE='23503';END IF;
 IF NEW.member_ids IS NULL OR cardinality(NEW.member_ids)>200 OR cardinality(NEW.member_ids)<>(SELECT count(DISTINCT m) FROM unnest(NEW.member_ids)m) THEN RAISE EXCEPTION 'Invalid group members' USING ERRCODE='22023';END IF;
 NEW.member_ids:=ARRAY(SELECT m FROM unnest(NEW.member_ids)m ORDER BY m);
 NEW.name:=btrim(NEW.name);NEW.correction_reason:=btrim(NEW.correction_reason);
 IF NEW.version>1 AND length(NEW.correction_reason)=0 THEN RAISE EXCEPTION 'Group correction reason is required' USING ERRCODE='22023';END IF;
 NEW.member_assessments:='[]'::jsonb;
 IF NEW.active THEN
   IF cardinality(NEW.member_ids)=0 THEN RAISE EXCEPTION 'An active group needs members' USING ERRCODE='22023';END IF;
   FOREACH member IN ARRAY NEW.member_ids LOOP
     assessment:=private.work_order_member_assessment(NEW.project_id,member);
     IF assessment IS NULL THEN RAISE EXCEPTION 'Group member is not an eligible project executor' USING ERRCODE='22023';END IF;
     NEW.member_assessments:=NEW.member_assessments||jsonb_build_array(assessment);
   END LOOP;
 ELSE
   IF previous.id IS NULL AND cardinality(NEW.member_ids)>0 THEN RAISE EXCEPTION 'New archived groups have no members' USING ERRCODE='22023';END IF;
   IF previous.id IS NOT NULL THEN
     IF NEW.member_ids IS DISTINCT FROM previous.member_ids THEN RAISE EXCEPTION 'Archive preserves the last member assessment' USING ERRCODE='22023';END IF;
     NEW.member_assessments:=previous.member_assessments;
   END IF;
 END IF;
 NEW.created_at:=clock_timestamp();RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_group() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_group_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_group_versions FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_group();

CREATE FUNCTION private.guard_work_order_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.work_order_assignment_versions;g public.work_order_group_versions;plan_id uuid;member uuid;assessment jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Assignments are immutable revisions' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 SELECT * INTO previous FROM public.work_order_assignment_versions v WHERE v.action_id=NEW.action_id ORDER BY v.version DESC LIMIT 1;
 IF NEW.version IS DISTINCT FROM coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'Assignment changed; reload before saving' USING ERRCODE='PT409';END IF;
 SELECT v.id INTO plan_id FROM public.work_order_plan_versions v WHERE v.action_id=NEW.action_id AND v.organization_id=NEW.organization_id AND v.project_id=NEW.project_id ORDER BY v.version DESC LIMIT 1;
 IF plan_id IS NULL THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 IF NEW.plan_version_id IS DISTINCT FROM plan_id THEN RAISE EXCEPTION 'Plan changed; reload before assigning' USING ERRCODE='PT409';END IF;
 IF NEW.change_kind='claimed' THEN
   IF previous.id IS NULL OR previous.mode<>'pool' OR previous.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Pool assignment changed or already claimed' USING ERRCODE='PT409';END IF;
   IF NEW.claimed_by IS DISTINCT FROM auth.uid() OR NOT coalesce((SELECT a.can_claim FROM private.work_order_assignment_access(NEW.action_id)a),false) THEN RAISE EXCEPTION 'Pool task is unavailable' USING ERRCODE='42501';END IF;
   IF NEW.mode IS DISTINCT FROM 'pool' OR NEW.source_group_version_id IS DISTINCT FROM previous.source_group_version_id OR NEW.source_group_id IS DISTINCT FROM previous.source_group_id OR NEW.candidate_user_ids IS DISTINCT FROM previous.candidate_user_ids THEN RAISE EXCEPTION 'Claim cannot change the candidate roster' USING ERRCODE='22023';END IF;
   NEW.candidate_memberships:=previous.candidate_memberships;
   NEW.claim_member_snapshot:=private.work_order_member_assessment(NEW.project_id,auth.uid());
   IF NEW.claim_member_snapshot IS NULL THEN RAISE EXCEPTION 'Pool task is unavailable' USING ERRCODE='42501';END IF;
   NEW.claim_member_snapshot:=NEW.claim_member_snapshot||jsonb_build_object('groupVersionId',(SELECT a.current_group_version_id FROM private.work_order_assignment_access(NEW.action_id)a));
   NEW.claimed_at:=clock_timestamp();NEW.reason:='Opgaven er overtaget fra puljen.';
 ELSE
   IF NEW.change_kind IS DISTINCT FROM 'configured' OR NOT private.can_manage_project(NEW.project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
   IF NEW.claimed_by IS NOT NULL OR NEW.claimed_at IS NOT NULL OR NEW.claim_member_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Configuration cannot impersonate a pool claim' USING ERRCODE='22023';END IF;
   IF NEW.candidate_user_ids IS NULL OR cardinality(NEW.candidate_user_ids)>200 OR cardinality(NEW.candidate_user_ids)<>(SELECT count(DISTINCT m) FROM unnest(NEW.candidate_user_ids)m) THEN RAISE EXCEPTION 'Invalid assignment candidates' USING ERRCODE='22023';END IF;
   NEW.candidate_user_ids:=ARRAY(SELECT m FROM unnest(NEW.candidate_user_ids)m ORDER BY m);
   IF NEW.mode='unassigned' THEN
     IF cardinality(NEW.candidate_user_ids)<>0 OR NEW.source_group_version_id IS NOT NULL THEN RAISE EXCEPTION 'Unassigned tasks have no candidate roster' USING ERRCODE='22023';END IF;
   ELSIF NEW.mode='person' THEN
     IF cardinality(NEW.candidate_user_ids)<>1 OR NEW.source_group_version_id IS NOT NULL THEN RAISE EXCEPTION 'Person assignment requires one person' USING ERRCODE='22023';END IF;
   ELSIF NEW.mode IN('group','pool') THEN
     IF cardinality(NEW.candidate_user_ids)=0 OR (NEW.mode='group' AND NEW.source_group_version_id IS NULL) THEN RAISE EXCEPTION 'Choose the group or pool candidates' USING ERRCODE='22023';END IF;
   ELSE RAISE EXCEPTION 'Invalid assignment mode' USING ERRCODE='22023';END IF;
   IF NEW.source_group_version_id IS NOT NULL THEN
     SELECT * INTO g FROM public.work_order_group_versions v WHERE v.id=NEW.source_group_version_id AND v.organization_id=NEW.organization_id AND v.project_id=NEW.project_id;
     IF g.id IS NULL OR NOT g.active THEN RAISE EXCEPTION 'Group is unavailable' USING ERRCODE='22023';END IF;
     IF g.version IS DISTINCT FROM (SELECT max(v.version) FROM public.work_order_group_versions v WHERE v.group_id=g.group_id) THEN RAISE EXCEPTION 'Group changed; reload before assigning' USING ERRCODE='PT409';END IF;
     IF NEW.candidate_user_ids IS DISTINCT FROM g.member_ids THEN RAISE EXCEPTION 'Candidate roster does not match the group version' USING ERRCODE='22023';END IF;
     NEW.source_group_id:=g.group_id;
   ELSE NEW.source_group_id:=NULL;END IF;
   NEW.candidate_memberships:='[]'::jsonb;
   FOREACH member IN ARRAY NEW.candidate_user_ids LOOP
     assessment:=private.work_order_member_assessment(NEW.project_id,member);
     IF assessment IS NULL THEN RAISE EXCEPTION 'Assignment candidate is not an eligible project executor' USING ERRCODE='22023';END IF;
     NEW.candidate_memberships:=NEW.candidate_memberships||jsonb_build_array(assessment);
   END LOOP;
   NEW.reason:=btrim(NEW.reason);
 END IF;
 NEW.created_at:=clock_timestamp();RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_assignment() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_assignment_versions FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_assignment();

CREATE FUNCTION private.audit_work_order_roster() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event text;entity uuid;detail jsonb;event_title text;entity_kind text;
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor is unavailable' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='work_order_group_versions' THEN
   event:='work_order.group_saved';entity:=NEW.group_id;detail:=jsonb_build_object('groupVersionId',NEW.id,'version',NEW.version,'active',NEW.active);event_title:='Arbejdsgruppen er versionsgemt';entity_kind:='work_order_group';
 ELSE
   event:=CASE WHEN NEW.change_kind='claimed' THEN 'work_order.pool_claimed' ELSE 'work_order.assignment_configured' END;entity:=NEW.action_id;
   detail:=jsonb_build_object('assignmentVersionId',NEW.id,'version',NEW.version,'mode',NEW.mode,'planVersionId',NEW.plan_version_id,'sourceGroupVersionId',NEW.source_group_version_id,'claimedBy',NEW.claimed_by);
   event_title:=CASE WHEN NEW.change_kind='claimed' THEN 'Puljeopgaven er overtaget' ELSE 'Opgavens tildeling er versionsgemt' END;
   entity_kind:='work_order';
 END IF;
 INSERT INTO public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
 VALUES(NEW.project_id,event,entity_kind,entity,event_title,auth.uid()::text,'database_trigger',jsonb_build_object('schema','freyra.work-order-event/v1','requestId',NEW.request_id)||detail);
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.audit_work_order_roster() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_group_audit AFTER INSERT ON public.work_order_group_versions FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_roster();
CREATE TRIGGER work_order_assignment_audit AFTER INSERT ON public.work_order_assignment_versions FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_roster();

CREATE FUNCTION public.save_work_order_group(p_group_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_name text,p_active boolean,p_member_ids uuid[],p_correction_reason text,p_request_id uuid)
RETURNS SETOF public.work_order_group_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_group_versions;latest integer;members uuid[];
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_manage_project(p_project_id) OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project_id AND p.organization_id=p_organization_id) THEN RAISE EXCEPTION 'Project is unavailable' USING ERRCODE='42501';END IF;
 IF p_group_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 160 OR p_active IS NULL OR p_member_ids IS NULL OR cardinality(p_member_ids)>200 OR p_correction_reason IS NULL OR length(p_correction_reason)>2000 THEN RAISE EXCEPTION 'Invalid group mutation' USING ERRCODE='22023';END IF;
 members:=ARRAY(SELECT m FROM unnest(p_member_ids)m ORDER BY m);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-group:'||p_group_id::text,0));
 SELECT * INTO saved FROM public.work_order_group_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.group_id IS DISTINCT FROM p_group_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.name IS DISTINCT FROM btrim(p_name) OR saved.active IS DISTINCT FROM p_active OR saved.member_ids IS DISTINCT FROM members OR saved.correction_reason IS DISTINCT FROM btrim(p_correction_reason) THEN RAISE EXCEPTION 'Mutation key has different group content' USING ERRCODE='22023';END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT max(v.version) INTO latest FROM public.work_order_group_versions v WHERE v.group_id=p_group_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Group changed; reload before saving' USING ERRCODE='PT409';END IF;
 INSERT INTO public.work_order_group_versions(group_id,organization_id,project_id,version,name,active,member_ids,correction_reason,request_id)
 VALUES(p_group_id,p_organization_id,p_project_id,p_expected_version+1,btrim(p_name),p_active,members,btrim(p_correction_reason),p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
CREATE FUNCTION public.list_work_order_groups(p_organization_id uuid,p_project_id uuid,p_after_group_id uuid,p_page_size integer)
RETURNS SETOF public.work_order_group_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_project(p_project_id) OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project_id AND p.organization_id=p_organization_id) THEN RAISE EXCEPTION 'Project is unavailable' USING ERRCODE='42501';END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid group page' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT latest.* FROM (SELECT DISTINCT ON(v.group_id)v.* FROM public.work_order_group_versions v WHERE v.project_id=p_project_id AND v.organization_id=p_organization_id AND (p_after_group_id IS NULL OR v.group_id>p_after_group_id) ORDER BY v.group_id,v.version DESC)latest ORDER BY latest.group_id LIMIT p_page_size+1;
END
$$;
CREATE FUNCTION public.get_work_order_group_history(p_group_id uuid,p_organization_id uuid,p_project_id uuid,p_before_version integer,p_page_size integer)
RETURNS SETOF public.work_order_group_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_project(p_project_id) OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project_id AND p.organization_id=p_organization_id) THEN RAISE EXCEPTION 'Project is unavailable' USING ERRCODE='42501';END IF;
 IF p_group_id IS NULL OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN RAISE EXCEPTION 'Invalid group history page' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT v.* FROM public.work_order_group_versions v WHERE v.group_id=p_group_id AND v.project_id=p_project_id AND v.organization_id=p_organization_id AND (p_before_version IS NULL OR v.version<p_before_version) ORDER BY v.version DESC LIMIT p_page_size+1;
END
$$;
CREATE FUNCTION public.list_work_order_people(p_organization_id uuid,p_project_id uuid,p_after_user_id uuid,p_page_size integer)
RETURNS TABLE(organization_id uuid,project_id uuid,user_id uuid,project_role text,organization_role text,can_execute boolean,display_name text,email text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_project(p_project_id) OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=p_project_id AND p.organization_id=p_organization_id) THEN RAISE EXCEPTION 'Project is unavailable' USING ERRCODE='42501';END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid people page' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT p_organization_id,p_project_id,om.user_id,pm.role::text,om.role::text,(om.role IN('owner','admin') OR pm.role IN('admin','project_manager','editor','field','external')),
   coalesce(nullif(to_jsonb(profile)->>'display_name',''),nullif(to_jsonb(profile)->>'full_name','')),to_jsonb(profile)->>'email'
 FROM public.organization_memberships om LEFT JOIN public.project_members pm ON pm.user_id=om.user_id AND pm.project_id=p_project_id LEFT JOIN public.profiles profile ON profile.id=om.user_id
 WHERE om.organization_id=p_organization_id AND (om.role IN('owner','admin') OR pm.user_id IS NOT NULL) AND (p_after_user_id IS NULL OR om.user_id>p_after_user_id)
 ORDER BY om.user_id LIMIT p_page_size+1;
END
$$;

CREATE FUNCTION public.configure_work_order_assignment(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_plan_version_id uuid,p_mode text,p_candidate_user_ids uuid[],p_source_group_version_id uuid,p_reason text,p_request_id uuid)
RETURNS SETOF public.work_order_assignment_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_assignment_versions;latest integer;candidates uuid[];
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_manage_project(p_project_id) OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_plan_version_id IS NULL OR p_mode IS NULL OR p_candidate_user_ids IS NULL OR cardinality(p_candidate_user_ids)>200 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid assignment mutation' USING ERRCODE='22023';END IF;
 candidates:=ARRAY(SELECT m FROM unnest(p_candidate_user_ids)m ORDER BY m);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_assignment_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.change_kind<>'configured' OR saved.plan_version_id IS DISTINCT FROM p_plan_version_id OR saved.mode IS DISTINCT FROM p_mode OR saved.candidate_user_ids IS DISTINCT FROM candidates OR saved.source_group_version_id IS DISTINCT FROM p_source_group_version_id OR saved.reason IS DISTINCT FROM btrim(p_reason) THEN RAISE EXCEPTION 'Mutation key has different assignment content' USING ERRCODE='22023';END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT max(v.version) INTO latest FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Assignment changed; reload before saving' USING ERRCODE='PT409';END IF;
 INSERT INTO public.work_order_assignment_versions(action_id,organization_id,project_id,version,change_kind,mode,plan_version_id,source_group_version_id,candidate_user_ids,reason,request_id)
 VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,'configured',p_mode,p_plan_version_id,p_source_group_version_id,candidates,btrim(p_reason),p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
CREATE FUNCTION public.claim_work_order_pool(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_plan_version_id uuid,p_request_id uuid)
RETURNS SETOF public.work_order_assignment_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_assignment public.work_order_assignment_versions;saved public.work_order_assignment_versions;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_work_order_executor_member(p_project_id,auth.uid()) THEN RAISE EXCEPTION 'Pool task is unavailable' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483646 OR p_plan_version_id IS NULL THEN RAISE EXCEPTION 'Invalid pool claim' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 SELECT * INTO current_assignment FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id ORDER BY v.version DESC LIMIT 1;
 IF current_assignment.id IS NULL OR NOT coalesce((SELECT a.can_see_state FROM private.work_order_assignment_access(p_action_id)a),false) THEN RAISE EXCEPTION 'Pool task is unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO saved FROM public.work_order_assignment_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.change_kind<>'claimed' OR saved.claimed_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.plan_version_id IS DISTINCT FROM p_plan_version_id THEN RAISE EXCEPTION 'Mutation key has different pool claim content' USING ERRCODE='22023';END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 IF current_assignment.version<>p_expected_version OR current_assignment.mode<>'pool' OR current_assignment.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Pool assignment changed or already claimed' USING ERRCODE='PT409';END IF;
 INSERT INTO public.work_order_assignment_versions(action_id,organization_id,project_id,version,change_kind,mode,plan_version_id,source_group_version_id,source_group_id,candidate_user_ids,candidate_memberships,claimed_by,claimed_at,claim_member_snapshot,reason,request_id)
 VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,'claimed','pool',p_plan_version_id,current_assignment.source_group_version_id,current_assignment.source_group_id,current_assignment.candidate_user_ids,current_assignment.candidate_memberships,auth.uid(),clock_timestamp(),'{}','Opgaven er overtaget fra puljen.',p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
CREATE FUNCTION public.get_work_order_assignment_history(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_before_version integer,p_page_size integer)
RETURNS SETOF public.work_order_assignment_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT(
   EXISTS(SELECT 1 FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id)
   OR EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id))
 ) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN RAISE EXCEPTION 'Invalid assignment history page' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT v.* FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND (p_before_version IS NULL OR v.version<p_before_version) ORDER BY v.version DESC LIMIT p_page_size+1;
END
$$;
CREATE FUNCTION public.list_my_work_orders(p_after_action_id uuid,p_page_size integer)
RETURNS TABLE(user_id uuid,action_id uuid,organization_id uuid,project_id uuid,plan_version_id uuid,plan_version integer,plan jsonb,assignment_id uuid,assignment_version integer,assignment_mode text,claimed_by uuid,can_claim boolean,can_execute boolean,can_review boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Work orders are unavailable' USING ERRCODE='42501';END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid work-order page' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT auth.uid(),w.action_id,w.organization_id,w.project_id,p.id,p.version,p.plan,a.id,coalesce(a.version,0),a.mode,a.claimed_by,coalesce(assignment_access.can_claim,false),private.can_execute_work_order(w.action_id),private.can_review_work_order(w.action_id)
 FROM public.work_orders w JOIN LATERAL(SELECT v.id,v.version,v.plan FROM public.work_order_plan_versions v WHERE v.action_id=w.action_id AND v.organization_id=w.organization_id AND v.project_id=w.project_id ORDER BY v.version DESC LIMIT 1)p ON true
 LEFT JOIN LATERAL(SELECT v.id,v.version,v.mode,v.claimed_by FROM public.work_order_assignment_versions v WHERE v.action_id=w.action_id ORDER BY v.version DESC LIMIT 1)a ON true
 LEFT JOIN LATERAL private.work_order_assignment_access(w.action_id) assignment_access ON true
 LEFT JOIN LATERAL(SELECT v.active FROM public.work_order_access_versions v WHERE v.action_id=w.action_id AND v.user_id=auth.uid() ORDER BY v.version DESC LIMIT 1)direct ON true
 WHERE (p_after_action_id IS NULL OR w.action_id>p_after_action_id) AND (coalesce(assignment_access.can_read,false) OR (coalesce(direct.active,false) AND private.is_work_order_member(w.project_id,auth.uid())))
 ORDER BY w.action_id LIMIT p_page_size+1;
END
$$;

REVOKE ALL ON FUNCTION public.save_work_order_group(uuid,uuid,uuid,integer,text,boolean,uuid[],text,uuid),public.list_work_order_groups(uuid,uuid,uuid,integer),public.get_work_order_group_history(uuid,uuid,uuid,integer,integer),public.list_work_order_people(uuid,uuid,uuid,integer),public.configure_work_order_assignment(uuid,uuid,uuid,integer,uuid,text,uuid[],uuid,text,uuid),public.claim_work_order_pool(uuid,uuid,uuid,integer,uuid,uuid),public.get_work_order_assignment_history(uuid,uuid,uuid,integer,integer),public.list_my_work_orders(uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_group(uuid,uuid,uuid,integer,text,boolean,uuid[],text,uuid),public.list_work_order_groups(uuid,uuid,uuid,integer),public.get_work_order_group_history(uuid,uuid,uuid,integer,integer),public.list_work_order_people(uuid,uuid,uuid,integer),public.configure_work_order_assignment(uuid,uuid,uuid,integer,uuid,text,uuid[],uuid,text,uuid),public.claim_work_order_pool(uuid,uuid,uuid,integer,uuid,uuid),public.get_work_order_assignment_history(uuid,uuid,uuid,integer,integer),public.list_my_work_orders(uuid,integer) TO authenticated;

-- Existing execution notes keep their identity. New revisions pin the assignment too.
ALTER TABLE public.work_order_execution_bindings ADD COLUMN assignment_version_id uuid;
ALTER TABLE public.work_order_execution_bindings ADD CONSTRAINT work_order_execution_assignment_scope FOREIGN KEY(assignment_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_assignment_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE FUNCTION private.guard_work_order_execution_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.work_order_assignment_versions;execution jsonb;
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_write_project(NEW.project_id) OR NOT private.can_execute_work_order(NEW.action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 SELECT * INTO a FROM public.work_order_assignment_versions v WHERE v.action_id=NEW.action_id AND v.organization_id=NEW.organization_id AND v.project_id=NEW.project_id ORDER BY v.version DESC LIMIT 1;
 IF NEW.assignment_version_id IS DISTINCT FROM a.id THEN RAISE EXCEPTION 'Assignment changed; reopen before saving execution' USING ERRCODE='PT409';END IF;
 SELECT (w.payload->>'decision')::jsonb INTO execution FROM public.project_workspace_entries w WHERE w.id=NEW.workspace_entry_id AND w.entry_id=NEW.action_id AND w.organization_id=NEW.organization_id AND w.project_id=NEW.project_id;
 IF execution->>'stage'='performed' AND a.mode='pool' AND a.claimed_by IS NULL THEN RAISE EXCEPTION 'Claim the pool task before recording execution' USING ERRCODE='22023';END IF;
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_execution_assignment() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_execution_assignment_guard BEFORE INSERT ON public.work_order_execution_bindings FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_execution_assignment();

-- Two optional context parameters retain legacy calls when no assignment exists.
DROP FUNCTION public.save_work_order_execution(uuid,uuid,uuid,uuid,integer,integer,jsonb,uuid,text,uuid);
CREATE FUNCTION public.save_work_order_execution(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_plan_version_id uuid,p_expected_plan_version integer,p_expected_version integer,p_execution jsonb,p_performed_by_id uuid,p_deviation_reason text,p_request_id uuid,p_expected_assignment_version_id uuid DEFAULT NULL,p_expected_assignment_version integer DEFAULT 0)
RETURNS SETOF public.work_order_execution_bindings LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_execution_bindings;e public.project_workspace_entries;plan public.work_order_plan_versions;current_version integer;current_assignment public.work_order_assignment_versions;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_write_project(p_project_id) OR NOT private.can_execute_work_order(p_action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action_id IS NULL OR p_organization_id IS NULL OR p_project_id IS NULL OR p_plan_version_id IS NULL OR p_expected_plan_version IS NULL OR p_expected_plan_version<1 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL OR p_deviation_reason IS NULL OR length(p_deviation_reason)>2000 OR p_expected_assignment_version IS NULL OR p_expected_assignment_version<0 OR ((p_expected_assignment_version=0) IS DISTINCT FROM (p_expected_assignment_version_id IS NULL)) OR jsonb_typeof(p_execution) IS DISTINCT FROM 'object' OR p_execution->>'actionId' IS DISTINCT FROM p_action_id::text OR p_execution->>'schema' IS DISTINCT FROM 'freyra.action-execution/v1' THEN RAISE EXCEPTION 'Invalid execution mutation' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_execution_bindings b WHERE b.project_id=p_project_id AND b.request_id=p_request_id;
 IF saved.workspace_entry_id IS NOT NULL THEN
   SELECT * INTO e FROM public.project_workspace_entries WHERE id=saved.workspace_entry_id;
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.plan_version_id IS DISTINCT FROM p_plan_version_id OR saved.plan_version IS DISTINCT FROM p_expected_plan_version OR saved.performed_by_id IS DISTINCT FROM p_performed_by_id OR saved.assignment_version_id IS DISTINCT FROM p_expected_assignment_version_id OR coalesce((SELECT v.version FROM public.work_order_assignment_versions v WHERE v.id=saved.assignment_version_id),0) IS DISTINCT FROM p_expected_assignment_version OR saved.deviation_reason IS DISTINCT FROM btrim(p_deviation_reason) OR (e.payload->>'decision')::jsonb IS DISTINCT FROM p_execution THEN RAISE EXCEPTION 'Mutation key already has different execution content' USING ERRCODE='22023'; END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT * INTO plan FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id ORDER BY v.version DESC LIMIT 1;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'Work-order plan is unavailable' USING ERRCODE='42501'; END IF;
 IF plan.id IS DISTINCT FROM p_plan_version_id OR plan.version IS DISTINCT FROM p_expected_plan_version THEN RAISE EXCEPTION 'Plan changed; reopen before saving execution' USING ERRCODE='PT409'; END IF;
 SELECT * INTO current_assignment FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id ORDER BY v.version DESC LIMIT 1;
 IF current_assignment.id IS DISTINCT FROM p_expected_assignment_version_id OR coalesce(current_assignment.version,0)<>p_expected_assignment_version THEN RAISE EXCEPTION 'Assignment changed; reopen before saving execution' USING ERRCODE='PT409';END IF;
 SELECT max(w.version) INTO current_version FROM public.project_workspace_entries w WHERE w.entry_id=p_action_id;
 IF coalesce(current_version,0)<>p_expected_version THEN RAISE EXCEPTION 'Execution changed; reopen before saving' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.project_workspace_entries(entry_id,organization_id,project_id,kind,version,title,payload)
 VALUES(p_action_id,p_organization_id,p_project_id,'decision_note',p_expected_version+1,CASE WHEN p_execution->>'workType'='weed_cutting' THEN 'Grødeskæring · udførelsesregistrering' ELSE 'Indsats · udførelsesregistrering' END,
 jsonb_build_object('basis',coalesce(nullif(p_execution->>'sourceReference',''),'Planlagt arbejde; faktisk udførelse ikke dokumenteret.'),'source','action-execution:'||p_action_id::text,'decision',p_execution::text,'alternatives','','uncertainty',p_execution->>'coverageDescription','owner',coalesce(p_execution->>'performedBy',''))) RETURNING * INTO e;
 INSERT INTO public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id,version,plan_version_id,plan_version,performed_by_id,deviation_reason,documentation_gaps,coverage,request_id,assignment_version_id)
 VALUES(e.id,p_action_id,p_organization_id,p_project_id,e.version,plan.id,plan.version,p_performed_by_id,btrim(p_deviation_reason),ARRAY[]::text[],p_execution->>'coverage',p_request_id,current_assignment.id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
REVOKE ALL ON FUNCTION public.save_work_order_execution(uuid,uuid,uuid,uuid,integer,integer,jsonb,uuid,text,uuid,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_execution(uuid,uuid,uuid,uuid,integer,integer,jsonb,uuid,text,uuid,uuid,integer) TO authenticated;
