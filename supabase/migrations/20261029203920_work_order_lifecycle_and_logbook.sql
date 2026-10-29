-- D02e: operation status is a versioned assertion about existing plan/assignment/execution.
-- It neither replaces actual execution nor grants submission, review or invoicing.
CREATE UNIQUE INDEX work_order_assignment_lifecycle_scope ON public.work_order_assignment_versions(id,action_id,organization_id,project_id);
CREATE UNIQUE INDEX work_order_execution_lifecycle_scope ON public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id);

CREATE TABLE public.work_order_lifecycle_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_id uuid NOT NULL, organization_id uuid NOT NULL, project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), operation text NOT NULL CHECK(operation IN('transition','confirm','block','unblock')),
 status text NOT NULL CHECK(status IN('draft','planned','assigned','started','performed','submitted','approved','returned','reopened','cancelled')),
 plan_version_id uuid,assignment_version_id uuid,execution_revision_id uuid,
 started_at timestamptz,started_source text,started_by_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 blocked boolean NOT NULL,block_reason text,block_owner_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,block_next_action text,block_due_date date,
 reason text NOT NULL CHECK(length(reason)<=2000),request_values jsonb NOT NULL,request_id uuid NOT NULL,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(action_id,version),UNIQUE(project_id,request_id),UNIQUE(id,action_id,organization_id,project_id),
 CHECK((started_at IS NULL AND started_source IS NULL AND started_by_id IS NULL) OR (started_at IS NOT NULL AND started_source IS NOT NULL AND length(btrim(started_source)) BETWEEN 1 AND 2000 AND started_by_id IS NOT NULL)),
 CHECK((NOT blocked AND block_reason IS NULL AND block_owner_id IS NULL AND block_next_action IS NULL AND block_due_date IS NULL) OR (blocked AND block_reason IS NOT NULL AND block_next_action IS NOT NULL AND length(btrim(block_reason)) BETWEEN 1 AND 2000 AND block_owner_id IS NOT NULL AND length(btrim(block_next_action)) BETWEEN 1 AND 2000)),
 FOREIGN KEY(action_id,organization_id,project_id) REFERENCES public.work_orders(action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(plan_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_plan_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(assignment_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_assignment_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(execution_revision_id,action_id,organization_id,project_id) REFERENCES public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_order_lifecycle_current ON public.work_order_lifecycle_versions(project_id,action_id,version DESC);
CREATE TABLE public.work_order_note_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),note_id uuid NOT NULL,action_id uuid NOT NULL,organization_id uuid NOT NULL,project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),kind text NOT NULL CHECK(kind IN('comment','deviation','handover')),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),correction_reason text NOT NULL CHECK(length(correction_reason)<=2000),
 plan_version_id uuid,assignment_version_id uuid,execution_revision_id uuid,lifecycle_version_id uuid,
 request_id uuid NOT NULL,created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(note_id,version),UNIQUE(project_id,request_id),
 FOREIGN KEY(action_id,organization_id,project_id) REFERENCES public.work_orders(action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(plan_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_plan_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(assignment_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_assignment_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(execution_revision_id,action_id,organization_id,project_id) REFERENCES public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 FOREIGN KEY(lifecycle_version_id,action_id,organization_id,project_id) REFERENCES public.work_order_lifecycle_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX work_order_note_timeline ON public.work_order_note_versions(project_id,action_id,created_at DESC,id DESC);
ALTER TABLE public.work_order_lifecycle_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_note_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_lifecycle_versions,public.work_order_note_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.work_order_lifecycle_versions,public.work_order_note_versions TO authenticated;
GRANT SELECT ON public.work_order_lifecycle_versions,public.work_order_note_versions TO service_role;
CREATE POLICY work_order_lifecycle_read ON public.work_order_lifecycle_versions FOR SELECT TO authenticated USING(private.can_read_work_order(action_id));
CREATE POLICY work_order_notes_read ON public.work_order_note_versions FOR SELECT TO authenticated USING(private.can_read_work_order(action_id));
CREATE POLICY work_order_lifecycle_insert ON public.work_order_lifecycle_versions FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND (private.can_manage_project(project_id) OR private.can_execute_work_order(action_id) OR private.can_review_work_order(action_id)));
CREATE POLICY work_order_notes_insert ON public.work_order_note_versions FOR INSERT TO authenticated WITH CHECK(created_by=auth.uid() AND (private.can_manage_project(project_id) OR private.can_execute_work_order(action_id) OR private.can_review_work_order(action_id)));

-- Fixed task references only: assess current membership without opening a project roster to externals.
CREATE FUNCTION private.work_order_lifecycle_basis(p_action_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w public.work_orders;p public.work_order_plan_versions;a public.work_order_assignment_versions;e public.work_order_execution_bindings;g public.work_order_group_versions;plan_gaps text[]:=ARRAY[]::text[];execution_gaps text[]:=ARRAY[]::text[];valid_assignment boolean:=false;responsible uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_work_order(p_action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO w FROM public.work_orders WHERE action_id=p_action_id;
 SELECT * INTO p FROM public.work_order_plan_versions WHERE action_id=w.action_id ORDER BY version DESC LIMIT 1;
 SELECT * INTO a FROM public.work_order_assignment_versions WHERE action_id=w.action_id ORDER BY version DESC LIMIT 1;
 SELECT * INTO e FROM public.work_order_execution_bindings WHERE action_id=w.action_id ORDER BY version DESC LIMIT 1;
 IF p.id IS NULL THEN plan_gaps:=ARRAY['plan_missing'];
 ELSE
   responsible:=(p.plan->>'responsibleId')::uuid;
   IF responsible IS NULL THEN plan_gaps:=array_append(plan_gaps,'responsible_unknown');
   ELSIF NOT EXISTS(SELECT 1 FROM public.organization_memberships om WHERE om.organization_id=w.organization_id AND om.user_id=responsible AND (om.role IN('owner','admin') OR EXISTS(SELECT 1 FROM public.project_members pm WHERE pm.project_id=w.project_id AND pm.user_id=responsible))) THEN plan_gaps:=array_append(plan_gaps,'responsible_unavailable');END IF;
   IF p.plan->>'profile' IS NULL THEN plan_gaps:=array_append(plan_gaps,'profile_unknown');END IF;
   IF length(btrim(coalesce(p.plan->>'instructions','')))=0 THEN plan_gaps:=array_append(plan_gaps,'instructions_missing');END IF;
 END IF;
 IF a.source_group_id IS NOT NULL THEN SELECT * INTO g FROM public.work_order_group_versions WHERE group_id=a.source_group_id ORDER BY version DESC LIMIT 1;END IF;
 IF a.id IS NOT NULL AND a.mode<>'unassigned' THEN
   valid_assignment:=EXISTS(SELECT 1 FROM unnest(a.candidate_user_ids)u(user_id) JOIN public.organization_memberships om ON om.organization_id=w.organization_id AND om.user_id=u.user_id LEFT JOIN public.project_members pm ON pm.project_id=w.project_id AND pm.user_id=u.user_id WHERE (om.role IN('owner','admin') OR pm.role IN('admin','project_manager','editor','field','external')) AND (a.source_group_id IS NULL OR (g.active AND u.user_id=ANY(g.member_ids))) AND (a.claimed_by IS NULL OR u.user_id=a.claimed_by));
 END IF;
 IF e.workspace_entry_id IS NULL THEN execution_gaps:=ARRAY['execution_missing'];
 ELSE
   IF 'execution_not_performed'=ANY(e.documentation_gaps) THEN execution_gaps:=array_append(execution_gaps,'execution_not_performed');END IF;
   IF e.actual_start IS NULL THEN execution_gaps:=array_append(execution_gaps,'actual_date_unknown');END IF;
   IF e.actual_method IS NULL THEN execution_gaps:=array_append(execution_gaps,'actual_method_unknown');END IF;
   IF e.coverage='unknown' THEN execution_gaps:=array_append(execution_gaps,'actual_coverage_unknown');END IF;
   IF e.plan_version_id IS DISTINCT FROM p.id OR e.assignment_version_id IS DISTINCT FROM a.id THEN execution_gaps:=array_append(execution_gaps,'execution_context_changed');END IF;
 END IF;
 RETURN jsonb_build_object('planVersionId',p.id,'planVersion',p.version,'assignmentVersionId',a.id,'assignmentVersion',a.version,'executionRevisionId',e.workspace_entry_id,'executionVersion',e.version,'planGaps',plan_gaps,'assignmentValid',valid_assignment,'executionGaps',execution_gaps,'documentationGaps',coalesce(e.documentation_gaps,ARRAY[]::text[]),'unknownPlannedDate',p.id IS NOT NULL AND p.plan->>'plannedStart' IS NULL,'actualDate',e.actual_start,'actualMethod',e.actual_method,'actualCoverage',e.coverage);
END
$$;
REVOKE ALL ON FUNCTION private.work_order_lifecycle_basis(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.work_order_lifecycle_basis(uuid) TO authenticated;

CREATE FUNCTION private.normalize_work_order_lifecycle_request(p_values jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;op text;target text;start_time timestamptz;due date;result jsonb;
BEGIN
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_values)key WHERE key NOT IN('operation','targetStatus','planVersionId','assignmentVersionId','executionRevisionId','reason','startedAt','startedSource','blockOwnerId','blockReason','blockNextAction','blockDueDate')) THEN RAISE EXCEPTION 'Invalid lifecycle request fields' USING ERRCODE='22023';END IF;
 FOR k IN SELECT jsonb_object_keys(p_values) LOOP
   IF jsonb_typeof(p_values->k) NOT IN('string','null') THEN RAISE EXCEPTION 'Invalid lifecycle field type' USING ERRCODE='22023';END IF;
 END LOOP;
 op:=p_values->>'operation';target:=p_values->>'targetStatus';
 IF op IS NULL OR op NOT IN('transition','confirm','block','unblock') OR (op IN('transition','confirm') AND (target IS NULL OR target NOT IN('draft','planned','assigned','started','performed','cancelled'))) OR (op IN('block','unblock') AND target IS NOT NULL) OR (op='confirm' AND target='cancelled') THEN RAISE EXCEPTION 'Invalid lifecycle operation; submission and review require their own verified snapshot' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['planVersionId','assignmentVersionId','executionRevisionId','blockOwnerId'] LOOP
   IF p_values->>k IS NOT NULL AND p_values->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid lifecycle reference' USING ERRCODE='22023';END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['reason','startedSource','blockReason','blockNextAction'] LOOP
   IF length(coalesce(p_values->>k,''))>2000 THEN RAISE EXCEPTION 'Lifecycle text exceeds its limit' USING ERRCODE='22023';END IF;
 END LOOP;
 IF op='transition' AND target='started' THEN
   IF p_values->>'startedAt' IS NULL OR p_values->>'startedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' OR length(btrim(coalesce(p_values->>'startedSource','')))=0 THEN RAISE EXCEPTION 'Actual start requires a timestamp with offset and its source' USING ERRCODE='22023';END IF;
   BEGIN start_time:=(p_values->>'startedAt')::timestamptz;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid actual start' USING ERRCODE='22023';END;
 ELSIF p_values->>'startedAt' IS NOT NULL OR p_values->>'startedSource' IS NOT NULL THEN RAISE EXCEPTION 'Actual start is recorded only by its explicit transition' USING ERRCODE='22023';END IF;
 IF op='block' THEN
   IF p_values->>'blockOwnerId' IS NULL OR length(btrim(coalesce(p_values->>'blockReason','')))=0 OR length(btrim(coalesce(p_values->>'blockNextAction','')))=0 THEN RAISE EXCEPTION 'A block requires reason, owner and next action' USING ERRCODE='22023';END IF;
   IF p_values->>'blockDueDate' IS NOT NULL THEN
     IF p_values->>'blockDueDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid block due date' USING ERRCODE='22023';END IF;
     BEGIN due:=(p_values->>'blockDueDate')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid block due date' USING ERRCODE='22023';END;
   END IF;
 ELSIF p_values->>'blockOwnerId' IS NOT NULL OR p_values->>'blockReason' IS NOT NULL OR p_values->>'blockNextAction' IS NOT NULL OR p_values->>'blockDueDate' IS NOT NULL THEN RAISE EXCEPTION 'Block details belong to a block operation' USING ERRCODE='22023';END IF;
 IF (op IN('confirm','unblock') OR target='cancelled') AND length(btrim(coalesce(p_values->>'reason','')))=0 THEN RAISE EXCEPTION 'Explain the lifecycle correction' USING ERRCODE='22023';END IF;
 result:=jsonb_build_object('operation',op,'targetStatus',target,'planVersionId',(p_values->>'planVersionId')::uuid,'assignmentVersionId',(p_values->>'assignmentVersionId')::uuid,'executionRevisionId',(p_values->>'executionRevisionId')::uuid,'reason',btrim(coalesce(p_values->>'reason','')),'startedAt',CASE WHEN start_time IS NULL THEN NULL ELSE to_char(start_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,'startedSource',nullif(btrim(p_values->>'startedSource'),''),'blockOwnerId',(p_values->>'blockOwnerId')::uuid,'blockReason',nullif(btrim(p_values->>'blockReason'),''),'blockNextAction',nullif(btrim(p_values->>'blockNextAction'),''),'blockDueDate',due);
 RETURN result;
END
$$;
REVOKE ALL ON FUNCTION private.normalize_work_order_lifecycle_request(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.normalize_work_order_lifecycle_request(jsonb) TO authenticated;

CREATE FUNCTION private.guard_work_order_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.work_order_lifecycle_versions;b jsonb;r jsonb;manager boolean;executor boolean;reviewer boolean;target text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Lifecycle history is immutable' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_read_work_order(NEW.action_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 SELECT * INTO previous FROM public.work_order_lifecycle_versions WHERE action_id=NEW.action_id ORDER BY version DESC LIMIT 1;
 IF NEW.version IS DISTINCT FROM coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'Lifecycle changed; reopen before saving' USING ERRCODE='PT409';END IF;
 b:=private.work_order_lifecycle_basis(NEW.action_id);r:=private.normalize_work_order_lifecycle_request(NEW.request_values);
 IF (r->>'planVersionId') IS DISTINCT FROM (b->>'planVersionId') OR (r->>'assignmentVersionId') IS DISTINCT FROM (b->>'assignmentVersionId') OR (r->>'executionRevisionId') IS DISTINCT FROM (b->>'executionRevisionId') THEN RAISE EXCEPTION 'Work-order basis changed; reopen before saving status' USING ERRCODE='PT409';END IF;
 manager:=private.can_manage_project(NEW.project_id);executor:=private.can_execute_work_order(NEW.action_id);reviewer:=private.can_review_work_order(NEW.action_id);
 NEW.operation:=r->>'operation';NEW.request_values:=r;NEW.reason:=r->>'reason';
 NEW.plan_version_id:=(r->>'planVersionId')::uuid;NEW.assignment_version_id:=(r->>'assignmentVersionId')::uuid;NEW.execution_revision_id:=(r->>'executionRevisionId')::uuid;
 NEW.started_at:=previous.started_at;NEW.started_source:=previous.started_source;NEW.started_by_id:=previous.started_by_id;
 NEW.blocked:=coalesce(previous.blocked,false);NEW.block_reason:=previous.block_reason;NEW.block_owner_id:=previous.block_owner_id;NEW.block_next_action:=previous.block_next_action;NEW.block_due_date:=previous.block_due_date;
 IF NEW.operation IN('block','unblock') THEN
   IF NOT(manager OR executor OR reviewer) OR previous.id IS NULL THEN RAISE EXCEPTION 'Lifecycle is unavailable' USING ERRCODE='42501';END IF;
   IF previous.status IN('approved','cancelled') THEN RAISE EXCEPTION 'A closed task cannot change its active block' USING ERRCODE='22023';END IF;
   NEW.status:=previous.status;
   IF NEW.operation='block' THEN
     IF previous.blocked THEN RAISE EXCEPTION 'Resolve the current block before creating another' USING ERRCODE='22023';END IF;
     IF NOT private.is_work_order_member(NEW.project_id,(r->>'blockOwnerId')::uuid) THEN RAISE EXCEPTION 'Block owner is unavailable' USING ERRCODE='42501';END IF;
     NEW.blocked:=true;NEW.block_reason:=r->>'blockReason';NEW.block_owner_id:=(r->>'blockOwnerId')::uuid;NEW.block_next_action:=r->>'blockNextAction';NEW.block_due_date:=(r->>'blockDueDate')::date;
   ELSE
     IF NOT previous.blocked THEN RAISE EXCEPTION 'Task has no active block' USING ERRCODE='22023';END IF;
     NEW.blocked:=false;NEW.block_reason:=NULL;NEW.block_owner_id:=NULL;NEW.block_next_action:=NULL;NEW.block_due_date:=NULL;
   END IF;
 ELSE
   target:=r->>'targetStatus';NEW.status:=target;
   IF NEW.operation='confirm' THEN
     IF previous.id IS NULL OR target IS DISTINCT FROM previous.status THEN RAISE EXCEPTION 'Confirmation must preserve the operation status' USING ERRCODE='22023';END IF;
   ELSIF NOT ((previous.id IS NULL AND target='draft') OR (previous.status='draft' AND target='planned') OR (previous.status='planned' AND target='assigned') OR (previous.status='assigned' AND target='started') OR (previous.status='started' AND target='performed') OR (previous.status IN('draft','planned','assigned','started') AND target='cancelled')) THEN
     RAISE EXCEPTION 'Invalid lifecycle transition; submission and review have separate requirements' USING ERRCODE='22023';
   END IF;
   IF target IN('draft','planned','assigned','cancelled') AND NOT manager THEN RAISE EXCEPTION 'Lifecycle planning requires the project manager' USING ERRCODE='42501';END IF;
   IF target IN('started','performed') AND NOT executor THEN RAISE EXCEPTION 'Execution capability is unavailable' USING ERRCODE='42501';END IF;
   IF target IN('planned','assigned','started','performed') AND jsonb_array_length(b->'planGaps')>0 THEN RAISE EXCEPTION 'Plan is missing a responsible person, profile or instructions' USING ERRCODE='22023';END IF;
   IF target IN('assigned','started','performed') AND NOT (b->>'assignmentValid')::boolean THEN RAISE EXCEPTION 'A valid current assignment is required' USING ERRCODE='22023';END IF;
   IF target='started' AND NEW.operation='transition' THEN
     IF NOT coalesce((SELECT a.can_execute FROM private.work_order_assignment_access(NEW.action_id)a),false) THEN RAISE EXCEPTION 'The assigned executor must confirm their own start' USING ERRCODE='42501';END IF;
     NEW.started_at:=(r->>'startedAt')::timestamptz;NEW.started_source:=r->>'startedSource';NEW.started_by_id:=auth.uid();
     IF NEW.started_at>clock_timestamp() THEN RAISE EXCEPTION 'Actual start cannot be in the future' USING ERRCODE='22023';END IF;
   END IF;
   IF target='performed' AND jsonb_array_length(b->'executionGaps')>0 THEN RAISE EXCEPTION 'Performed status requires the current actual date, method and coverage; attachment gaps may remain' USING ERRCODE='22023';END IF;
   IF target='cancelled' THEN NEW.blocked:=false;NEW.block_reason:=NULL;NEW.block_owner_id:=NULL;NEW.block_next_action:=NULL;NEW.block_due_date:=NULL;END IF;
 END IF;
 NEW.created_at:=clock_timestamp();RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_lifecycle() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_lifecycle_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_lifecycle_versions FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_lifecycle();

CREATE FUNCTION private.guard_work_order_note() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.work_order_note_versions;manager boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Manual note history is immutable' USING ERRCODE='42501';END IF;
 manager:=private.can_manage_project(NEW.project_id);
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_read_work_order(NEW.action_id) OR NOT(manager OR private.can_execute_work_order(NEW.action_id) OR private.can_review_work_order(NEW.action_id)) THEN RAISE EXCEPTION 'Work-order notes are unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-note:'||NEW.note_id::text,0));
 SELECT * INTO previous FROM public.work_order_note_versions WHERE note_id=NEW.note_id ORDER BY version DESC LIMIT 1;
 IF NEW.version IS DISTINCT FROM coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'Note changed; reopen before saving' USING ERRCODE='PT409';END IF;
 IF previous.id IS NOT NULL THEN
   IF previous.action_id IS DISTINCT FROM NEW.action_id OR previous.organization_id IS DISTINCT FROM NEW.organization_id OR previous.project_id IS DISTINCT FROM NEW.project_id OR previous.plan_version_id IS DISTINCT FROM NEW.plan_version_id OR previous.assignment_version_id IS DISTINCT FROM NEW.assignment_version_id OR previous.execution_revision_id IS DISTINCT FROM NEW.execution_revision_id OR previous.lifecycle_version_id IS DISTINCT FROM NEW.lifecycle_version_id THEN RAISE EXCEPTION 'Note scope and original context are immutable' USING ERRCODE='23503';END IF;
   IF previous.created_by IS DISTINCT FROM auth.uid() AND NOT manager THEN RAISE EXCEPTION 'Only the author or manager may correct a note' USING ERRCODE='42501';END IF;
   IF length(btrim(NEW.correction_reason))=0 THEN RAISE EXCEPTION 'Explain the note correction' USING ERRCODE='22023';END IF;
 END IF;
 NEW.body:=btrim(NEW.body);NEW.correction_reason:=btrim(NEW.correction_reason);NEW.created_at:=clock_timestamp();RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_note() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_note_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_note_versions FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_note();

CREATE FUNCTION private.audit_work_order_lifecycle_note() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event text;detail jsonb;heading text;
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor is unavailable' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='work_order_lifecycle_versions' THEN
   event:='work_order.lifecycle_changed';heading:='Opgavens status er versionsgemt';detail:=jsonb_build_object('lifecycleVersionId',NEW.id,'version',NEW.version,'operation',NEW.operation,'status',NEW.status,'blocked',NEW.blocked);
 ELSE
   event:='work_order.note_saved';heading:='En manuel note er versionsgemt';detail:=jsonb_build_object('noteVersionId',NEW.id,'noteId',NEW.note_id,'version',NEW.version,'kind',NEW.kind);
 END IF;
 INSERT INTO public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data) VALUES(NEW.project_id,event,'work_order',NEW.action_id,heading,auth.uid()::text,'database_trigger',jsonb_build_object('schema','freyra.work-order-event/v1','requestId',NEW.request_id)||detail);
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.audit_work_order_lifecycle_note() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_lifecycle_audit AFTER INSERT ON public.work_order_lifecycle_versions FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_lifecycle_note();
CREATE TRIGGER work_order_note_audit AFTER INSERT ON public.work_order_note_versions FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_lifecycle_note();

-- Domain triggers supply these events; user-entered notes cannot impersonate them.
-- Trusted dump restoration has no auth.uid(); canonical version joins below remain authoritative.
CREATE FUNCTION private.guard_work_order_audit_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.event_type LIKE 'work_order.%' AND auth.uid() IS NOT NULL AND (pg_trigger_depth()<2 OR NEW.actor IS DISTINCT FROM auth.uid()::text OR NEW.source IS DISTINCT FROM 'database_trigger') THEN RAISE EXCEPTION 'Work-order system events require a domain mutation' USING ERRCODE='42501';END IF;
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.guard_work_order_audit_origin() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_audit_origin BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_audit_origin();

CREATE FUNCTION public.get_work_order_lifecycle_context(p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS TABLE(action_id uuid,organization_id uuid,project_id uuid,user_id uuid,state jsonb,basis jsonb,context_changed boolean,can_manage boolean,can_start boolean,can_perform boolean,can_note boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.work_order_lifecycle_versions;b jsonb;manager boolean;executor boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.work_order_lifecycle_versions v WHERE v.action_id=p_action_id ORDER BY v.version DESC LIMIT 1;
 b:=private.work_order_lifecycle_basis(p_action_id);manager:=private.can_manage_project(p_project_id);executor:=private.can_execute_work_order(p_action_id);
 RETURN QUERY SELECT p_action_id,p_organization_id,p_project_id,auth.uid(),CASE WHEN s.id IS NULL THEN NULL::jsonb ELSE to_jsonb(s) END,b,s.id IS NOT NULL AND (s.plan_version_id::text IS DISTINCT FROM b->>'planVersionId' OR s.assignment_version_id::text IS DISTINCT FROM b->>'assignmentVersionId' OR s.execution_revision_id::text IS DISTINCT FROM b->>'executionRevisionId'),manager,executor AND coalesce((SELECT a.can_execute FROM private.work_order_assignment_access(p_action_id)a),false),executor,manager OR executor OR private.can_review_work_order(p_action_id);
END
$$;
CREATE FUNCTION public.mutate_work_order_lifecycle(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_expected_version integer,p_values jsonb,p_request_id uuid)
RETURNS SETOF public.work_order_lifecycle_versions
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_lifecycle_versions;r jsonb;latest integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) OR NOT(private.can_manage_project(p_project_id) OR private.can_execute_work_order(p_action_id) OR private.can_review_work_order(p_action_id)) THEN RAISE EXCEPTION 'Lifecycle is unavailable' USING ERRCODE='42501';END IF;
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid lifecycle mutation' USING ERRCODE='22023';END IF;
 r:=private.normalize_work_order_lifecycle_request(p_values);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 SELECT * INTO saved FROM public.work_order_lifecycle_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.request_values IS DISTINCT FROM r THEN RAISE EXCEPTION 'Mutation key has different lifecycle content' USING ERRCODE='22023';END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT max(v.version) INTO latest FROM public.work_order_lifecycle_versions v WHERE v.action_id=p_action_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Lifecycle changed; reopen before saving' USING ERRCODE='PT409';END IF;
 INSERT INTO public.work_order_lifecycle_versions(action_id,organization_id,project_id,version,request_values,request_id)
 VALUES(p_action_id,p_organization_id,p_project_id,p_expected_version+1,r,p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
CREATE FUNCTION public.save_work_order_note(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_note_id uuid,p_expected_version integer,p_kind text,p_body text,p_correction_reason text,p_plan_version_id uuid,p_assignment_version_id uuid,p_execution_revision_id uuid,p_lifecycle_version_id uuid,p_request_id uuid)
RETURNS SETOF public.work_order_note_versions
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_note_versions;latest integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) OR NOT(private.can_manage_project(p_project_id) OR private.can_execute_work_order(p_action_id) OR private.can_review_work_order(p_action_id)) THEN RAISE EXCEPTION 'Work-order notes are unavailable' USING ERRCODE='42501';END IF;
 IF p_note_id IS NULL OR p_request_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_kind IS NULL OR p_kind NOT IN('comment','deviation','handover') OR p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 4000 OR p_correction_reason IS NULL OR length(p_correction_reason)>2000 THEN RAISE EXCEPTION 'Invalid manual note' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-note:'||p_note_id::text,0));
 SELECT * INTO saved FROM public.work_order_note_versions v WHERE v.project_id=p_project_id AND v.request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.note_id IS DISTINCT FROM p_note_id OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.kind IS DISTINCT FROM p_kind OR saved.body IS DISTINCT FROM btrim(p_body) OR saved.correction_reason IS DISTINCT FROM btrim(p_correction_reason) OR saved.plan_version_id IS DISTINCT FROM p_plan_version_id OR saved.assignment_version_id IS DISTINCT FROM p_assignment_version_id OR saved.execution_revision_id IS DISTINCT FROM p_execution_revision_id OR saved.lifecycle_version_id IS DISTINCT FROM p_lifecycle_version_id THEN RAISE EXCEPTION 'Mutation key has different note content' USING ERRCODE='22023';END IF;
   RETURN NEXT saved;RETURN;
 END IF;
 SELECT max(v.version) INTO latest FROM public.work_order_note_versions v WHERE v.note_id=p_note_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Note changed; reopen before saving' USING ERRCODE='PT409';END IF;
 INSERT INTO public.work_order_note_versions(note_id,action_id,organization_id,project_id,version,kind,body,correction_reason,plan_version_id,assignment_version_id,execution_revision_id,lifecycle_version_id,request_id)
 VALUES(p_note_id,p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_kind,btrim(p_body),btrim(p_correction_reason),p_plan_version_id,p_assignment_version_id,p_execution_revision_id,p_lifecycle_version_id,p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END
$$;
CREATE FUNCTION public.get_work_order_note_history(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_note_id uuid,p_before_version integer,p_page_size integer)
RETURNS SETOF public.work_order_note_versions LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id AND private.can_read_work_order(w.action_id)) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';END IF;
 IF p_note_id IS NULL OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN RAISE EXCEPTION 'Invalid note history page' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT v.* FROM public.work_order_note_versions v WHERE v.note_id=p_note_id AND v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND (p_before_version IS NULL OR v.version<p_before_version) ORDER BY v.version DESC LIMIT p_page_size+1;
END
$$;

-- A narrow audit projection uses canonical immutable rows, never client-supplied audit titles.
-- Duplicated/forged audit rows cannot create extra timeline events. Missing audit is explicit.
CREATE FUNCTION private.read_work_order_log(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_as_of timestamptz,p_before_at timestamptz,p_before_key text,p_page_size integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE as_of_time timestamptz:=coalesce(p_as_of,statement_timestamp());result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_work_order(p_action_id) OR NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=p_action_id AND w.organization_id=p_organization_id AND w.project_id=p_project_id) THEN RAISE EXCEPTION 'Work order log is unavailable' USING ERRCODE='42501';END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR as_of_time>statement_timestamp() OR (p_before_at IS NULL)<>(p_before_key IS NULL) OR (p_before_at IS NOT NULL AND (p_as_of IS NULL OR p_before_at>as_of_time OR p_before_key !~ '^(root|plan|access|assignment|execution|status|note|group):[0-9a-f-]{36}$')) THEN RAISE EXCEPTION 'Invalid log cursor' USING ERRCODE='22023';END IF;
 WITH canonical AS(
   SELECT 'root:'||v.action_id event_key,v.created_at,v.created_by,'created'::text kind,'work_order.created'::text event_type,v.action_id source_id,NULL::integer source_version,'system'::text origin,v.request_id,v.action_id audit_entity_id,'{}'::jsonb detail FROM public.work_orders v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'plan:'||v.id,v.created_at,v.created_by,'plan','work_order.plan_saved',v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('title',v.plan->>'title','reason',v.correction_reason) FROM public.work_order_plan_versions v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'access:'||v.id,v.created_at,v.created_by,'access','work_order.access_changed',v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('recipientId',v.user_id,'active',v.active,'canExecute',v.can_execute,'canReview',v.can_review) FROM public.work_order_access_versions v WHERE v.action_id=p_action_id AND (private.can_manage_project(p_project_id) OR v.user_id=auth.uid())
   UNION ALL SELECT 'assignment:'||v.id,v.created_at,v.created_by,'assignment',CASE WHEN v.change_kind='claimed' THEN 'work_order.pool_claimed' ELSE 'work_order.assignment_configured' END,v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('mode',v.mode,'claimedBy',v.claimed_by,'reason',v.reason) FROM public.work_order_assignment_versions v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'execution:'||v.workspace_entry_id,v.created_at,v.created_by,'execution','work_order.execution_saved',v.workspace_entry_id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('actualDate',v.actual_start,'method',v.actual_method,'coverage',v.coverage,'documentationGaps',v.documentation_gaps) FROM public.work_order_execution_bindings v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'status:'||v.id,v.created_at,v.created_by,'status','work_order.lifecycle_changed',v.id,v.version,'system',v.request_id,v.action_id,jsonb_build_object('status',v.status,'operation',v.operation,'reason',v.reason,'blocked',v.blocked,'blockReason',v.block_reason,'blockOwnerId',v.block_owner_id,'blockNextAction',v.block_next_action,'blockDueDate',v.block_due_date,'startedAt',v.started_at,'startedSource',v.started_source,'startedBy',v.started_by_id) FROM public.work_order_lifecycle_versions v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'note:'||v.id,v.created_at,v.created_by,'note','work_order.note_saved',v.id,v.version,'manual',v.request_id,v.action_id,jsonb_build_object('noteId',v.note_id,'kind',v.kind,'body',v.body,'reason',v.correction_reason,'planVersionId',v.plan_version_id,'assignmentVersionId',v.assignment_version_id,'executionRevisionId',v.execution_revision_id,'lifecycleVersionId',v.lifecycle_version_id) FROM public.work_order_note_versions v WHERE v.action_id=p_action_id
   UNION ALL SELECT 'group:'||v.id,v.created_at,v.created_by,'group','work_order.group_saved',v.id,v.version,'system',v.request_id,v.group_id,jsonb_build_object('name',v.name,'active',v.active,'reason',v.correction_reason) FROM public.work_order_group_versions v WHERE v.project_id=p_project_id AND v.organization_id=p_organization_id AND EXISTS(SELECT 1 FROM public.work_order_assignment_versions a WHERE a.action_id=p_action_id AND a.source_group_id=v.group_id AND a.created_at<=as_of_time)
 ),page AS(
   SELECT c.*,EXISTS(SELECT 1 FROM public.audit_events a WHERE a.project_id=p_project_id AND a.entity_id=c.audit_entity_id AND a.event_type=c.event_type AND a.source='database_trigger' AND a.actor=c.created_by::text AND a.after_data->>'requestId'=c.request_id::text) audited FROM canonical c
   WHERE c.created_at<=as_of_time AND (p_before_at IS NULL OR (c.created_at,c.event_key)<(p_before_at,p_before_key)) ORDER BY c.created_at DESC,c.event_key DESC LIMIT p_page_size+1
 ),items AS(SELECT * FROM page ORDER BY created_at DESC,event_key DESC LIMIT p_page_size),last_item AS(SELECT * FROM items ORDER BY created_at,event_key LIMIT 1)
 SELECT jsonb_build_object('action_id',p_action_id,'organization_id',p_organization_id,'project_id',p_project_id,'user_id',auth.uid(),'as_of',as_of_time,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('key',event_key,'created_at',created_at,'created_by',created_by,'kind',kind,'event_type',event_type,'source_id',source_id,'source_version',source_version,'origin',origin,'audit_recorded',audited,'detail',detail) ORDER BY created_at DESC,event_key DESC) FROM items),'[]'::jsonb),'next',CASE WHEN (SELECT count(*) FROM page)>p_page_size THEN (SELECT jsonb_build_object('beforeAt',created_at,'beforeKey',event_key,'asOf',as_of_time) FROM last_item) ELSE NULL END) INTO result;
 RETURN result;
END
$$;
REVOKE ALL ON FUNCTION private.read_work_order_log(uuid,uuid,uuid,timestamptz,timestamptz,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.read_work_order_log(uuid,uuid,uuid,timestamptz,timestamptz,text,integer) TO authenticated;
CREATE FUNCTION public.get_work_order_log(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_as_of timestamptz,p_before_at timestamptz,p_before_key text,p_page_size integer)
RETURNS TABLE(log jsonb) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.read_work_order_log(p_action_id,p_organization_id,p_project_id,p_as_of,p_before_at,p_before_key,p_page_size)
$$;
REVOKE ALL ON FUNCTION public.get_work_order_lifecycle_context(uuid,uuid,uuid),public.mutate_work_order_lifecycle(uuid,uuid,uuid,integer,jsonb,uuid),public.save_work_order_note(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,uuid,uuid,uuid,uuid),public.get_work_order_note_history(uuid,uuid,uuid,uuid,integer,integer),public.get_work_order_log(uuid,uuid,uuid,timestamptz,timestamptz,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_lifecycle_context(uuid,uuid,uuid),public.mutate_work_order_lifecycle(uuid,uuid,uuid,integer,jsonb,uuid),public.save_work_order_note(uuid,uuid,uuid,uuid,integer,text,text,text,uuid,uuid,uuid,uuid,uuid),public.get_work_order_note_history(uuid,uuid,uuid,uuid,integer,integer),public.get_work_order_log(uuid,uuid,uuid,timestamptz,timestamptz,text,integer) TO authenticated;
