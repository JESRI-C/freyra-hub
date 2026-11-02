-- S02/D03: reuse immutable job-card observations and verified field originals.
-- No original is moved/copied and no existing project/Storage policy is widened.
CREATE UNIQUE INDEX field_job_evidence_scope ON public.field_job_versions(id,action_id,organization_id,project_id);
CREATE UNIQUE INDEX field_receipt_evidence_scope ON public.field_photo_receipts(upload_id,project_id);
CREATE UNIQUE INDEX execution_evidence_scope ON public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id);
CREATE TABLE public.work_order_evidence_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evidence_id uuid NOT NULL,
 action_id uuid NOT NULL, organization_id uuid NOT NULL, project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), observation_version_id uuid NOT NULL,
 upload_id uuid NOT NULL, execution_revision_id uuid,
 state text NOT NULL CHECK(state IN('attached','withdrawn')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 observation_snapshot jsonb NOT NULL, original_snapshot jsonb NOT NULL,
 request_id uuid NOT NULL, created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(evidence_id,version), UNIQUE(project_id,request_id),
 FOREIGN KEY(action_id,organization_id,project_id) REFERENCES public.work_orders(action_id,organization_id,project_id) ON DELETE RESTRICT,
 FOREIGN KEY(observation_version_id,action_id,organization_id,project_id) REFERENCES public.field_job_versions(id,action_id,organization_id,project_id) ON DELETE RESTRICT,
 FOREIGN KEY(upload_id,project_id) REFERENCES public.field_photo_receipts(upload_id,project_id) ON DELETE RESTRICT,
 FOREIGN KEY(execution_revision_id,action_id,organization_id,project_id) REFERENCES public.work_order_execution_bindings(workspace_entry_id,action_id,organization_id,project_id) ON DELETE RESTRICT
);
CREATE INDEX work_order_evidence_history ON public.work_order_evidence_versions(project_id,action_id,id);
CREATE INDEX work_order_evidence_observation ON public.work_order_evidence_versions(observation_version_id);
CREATE INDEX work_order_evidence_upload ON public.work_order_evidence_versions(upload_id);
CREATE INDEX work_order_evidence_execution ON public.work_order_evidence_versions(execution_revision_id);
ALTER TABLE public.work_order_evidence_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_evidence_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.work_order_evidence_versions TO authenticated;
GRANT SELECT ON public.work_order_evidence_versions TO service_role;
CREATE POLICY work_order_evidence_read ON public.work_order_evidence_versions FOR SELECT TO authenticated
 USING(private.can_read_work_order(action_id));
CREATE POLICY work_order_evidence_insert ON public.work_order_evidence_versions FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND private.can_contribute_project(project_id) AND private.can_execute_work_order(action_id));

-- Narrow lock helper: membership writes and task revocations serialize with attachment.
CREATE FUNCTION private.lock_work_order_evidence(p_action_id uuid,p_project_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||p_action_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-access:'||p_action_id::text||':'||auth.uid()::text,0));
 SELECT organization_id INTO org FROM public.work_orders WHERE action_id=p_action_id AND project_id=p_project_id;
 IF org IS NULL OR NOT private.can_contribute_project(p_project_id) OR NOT private.can_execute_work_order(p_action_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organization_memberships WHERE organization_id=org AND user_id=auth.uid() FOR SHARE;
 PERFORM 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=auth.uid() FOR SHARE;
 IF NOT private.can_contribute_project(p_project_id) OR NOT private.can_execute_work_order(p_action_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.lock_work_order_evidence(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.lock_work_order_evidence(uuid,uuid) TO authenticated;

CREATE FUNCTION private.guard_work_order_evidence() RETURNS trigger
-- The trigger alone can lock the exact Storage row, without granting UPDATE to its caller.
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.work_order_evidence_versions; observation public.field_job_versions;
 template public.field_job_template_versions; receipt public.field_photo_receipts; upload public.field_photo_uploads; obj storage.objects;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Evidence history is immutable' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor unavailable' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_work_order_evidence(NEW.action_id,NEW.project_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-evidence:'||NEW.evidence_id::text,0));
 SELECT * INTO previous FROM public.work_order_evidence_versions WHERE evidence_id=NEW.evidence_id ORDER BY version DESC LIMIT 1;
 IF NEW.version IS DISTINCT FROM coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'Evidence changed' USING ERRCODE='PT409'; END IF;
 IF previous.id IS NOT NULL AND (NEW.action_id IS DISTINCT FROM previous.action_id OR NEW.project_id IS DISTINCT FROM previous.project_id OR NEW.organization_id IS DISTINCT FROM previous.organization_id)
 THEN RAISE EXCEPTION 'Evidence scope is immutable' USING ERRCODE='23503'; END IF;
 NEW.reason:=btrim(NEW.reason); NEW.created_at:=clock_timestamp();
 IF NEW.state='withdrawn' THEN
   IF previous.id IS NULL OR previous.state='withdrawn' OR NEW.observation_version_id IS DISTINCT FROM previous.observation_version_id OR NEW.upload_id IS DISTINCT FROM previous.upload_id OR NEW.execution_revision_id IS DISTINCT FROM previous.execution_revision_id
   THEN RAISE EXCEPTION 'Invalid evidence withdrawal' USING ERRCODE='22023'; END IF;
   NEW.observation_snapshot:=previous.observation_snapshot; NEW.original_snapshot:=previous.original_snapshot;
   RETURN NEW;
 END IF;
 SELECT * INTO observation FROM public.field_job_versions WHERE id=NEW.observation_version_id AND action_id=NEW.action_id AND organization_id=NEW.organization_id AND project_id=NEW.project_id;
 IF observation.id IS NULL OR observation.status='draft' THEN RAISE EXCEPTION 'A recorded task observation is required' USING ERRCODE='22023'; END IF;
 SELECT * INTO template FROM public.field_job_template_versions WHERE id=observation.template_version_id;
 SELECT * INTO receipt FROM public.field_photo_receipts WHERE upload_id=NEW.upload_id AND project_id=NEW.project_id AND status='verified';
 SELECT * INTO upload FROM public.field_photo_uploads WHERE id=NEW.upload_id AND project_id=NEW.project_id;
 SELECT * INTO obj FROM storage.objects WHERE id=receipt.object_id AND bucket_id='project-media' AND name=upload.storage_path FOR SHARE;
 IF receipt.upload_id IS NULL OR upload.received_at IS NULL OR obj.id IS NULL
 OR receipt.object_id IS DISTINCT FROM upload.object_id OR receipt.object_version IS DISTINCT FROM upload.object_version
 OR receipt.object_updated_at IS DISTINCT FROM upload.object_updated_at OR receipt.sha256 IS DISTINCT FROM upload.payload->>'sha256'
 OR receipt.size_bytes IS DISTINCT FROM (upload.payload->>'sizeBytes')::bigint
 OR obj.updated_at IS DISTINCT FROM receipt.object_updated_at OR (to_jsonb(obj)->>'version') IS DISTINCT FROM receipt.object_version
 OR to_jsonb(obj)->>'archived_at' IS NOT NULL OR coalesce((to_jsonb(obj)->>'is_delete_marker')::boolean,false)
 THEN RAISE EXCEPTION 'Verified original is unavailable or changed' USING ERRCODE='22023'; END IF;
 NEW.observation_snapshot:=jsonb_build_object('schema','freyra.task-observation-pin/v1','id',observation.id,'version',observation.version,'template',template.definition,'values',observation.values,'status',observation.status,'recordedAt',observation.created_at,'recordedBy',observation.created_by);
 NEW.original_snapshot:=jsonb_build_object('schema','freyra.task-original-pin/v1','uploadId',upload.id,'sha256',receipt.sha256,'sizeBytes',receipt.size_bytes,'objectId',receipt.object_id,'objectVersion',receipt.object_version,'objectUpdatedAt',receipt.object_updated_at,'storagePath',upload.storage_path,'capturedAt',upload.payload->'capturedAt','capture',upload.payload->'capture');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_work_order_evidence() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.work_order_evidence_versions FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_evidence();
CREATE FUNCTION private.audit_work_order_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_events(project_id,event_type,entity_type,entity_id,title,actor,source,after_data)
 VALUES(NEW.project_id,'work_order.evidence_saved','work_order',NEW.action_id,'Opgavens dokumentation er versionsgemt',auth.uid()::text,'database_trigger',jsonb_build_object('schema','freyra.work-order-event/v1','requestId',NEW.request_id,'evidenceVersionId',NEW.id,'version',NEW.version,'state',NEW.state));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.audit_work_order_evidence() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_evidence_audit AFTER INSERT ON public.work_order_evidence_versions FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_evidence();

CREATE FUNCTION public.save_work_order_evidence(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_evidence_id uuid,p_expected_version integer,p_observation_version_id uuid,p_upload_id uuid,p_execution_revision_id uuid,p_state text,p_reason text,p_request_id uuid)
RETURNS SETOF public.work_order_evidence_versions LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.work_order_evidence_versions;
BEGIN
 PERFORM private.lock_work_order_evidence(p_action_id,p_project_id);
 IF p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>=2147483647 OR p_evidence_id IS NULL OR p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000
 THEN RAISE EXCEPTION 'Invalid evidence input' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-evidence:'||p_evidence_id::text,0));
 SELECT * INTO saved FROM public.work_order_evidence_versions WHERE project_id=p_project_id AND request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
   IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.evidence_id IS DISTINCT FROM p_evidence_id OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.created_by IS DISTINCT FROM auth.uid()
   OR saved.observation_version_id IS DISTINCT FROM p_observation_version_id OR saved.upload_id IS DISTINCT FROM p_upload_id OR saved.execution_revision_id IS DISTINCT FROM p_execution_revision_id OR saved.state IS DISTINCT FROM p_state OR saved.reason IS DISTINCT FROM btrim(p_reason)
   THEN RAISE EXCEPTION 'Request identity mismatch' USING ERRCODE='22023'; END IF;
   RETURN NEXT saved; RETURN;
 END IF;
 INSERT INTO public.work_order_evidence_versions(evidence_id,action_id,organization_id,project_id,version,observation_version_id,upload_id,execution_revision_id,state,reason,observation_snapshot,original_snapshot,request_id)
 VALUES(p_evidence_id,p_action_id,p_organization_id,p_project_id,p_expected_version+1,p_observation_version_id,p_upload_id,p_execution_revision_id,p_state,btrim(p_reason),'{}','{}',p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END $$;
REVOKE ALL ON FUNCTION public.save_work_order_evidence(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_work_order_evidence(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text,uuid) TO authenticated;

CREATE FUNCTION public.list_work_order_evidence(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_after_id uuid,p_page_size integer)
RETURNS SETOF public.work_order_evidence_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.work_orders WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id) OR NOT private.can_read_work_order(p_action_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT * FROM public.work_order_evidence_versions WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id AND (p_after_id IS NULL OR id>p_after_id) ORDER BY id LIMIT p_page_size+1;
END $$;
REVOKE ALL ON FUNCTION public.list_work_order_evidence(uuid,uuid,uuid,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_work_order_evidence(uuid,uuid,uuid,uuid,integer) TO authenticated;

CREATE FUNCTION public.list_work_order_evidence_sources(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_kind text,p_after_id uuid,p_page_size integer)
RETURNS TABLE(id uuid,label text,version integer,sha256 text) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_contribute_project(p_project_id) OR NOT private.can_execute_work_order(p_action_id) OR NOT EXISTS(SELECT 1 FROM public.work_orders WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR p_kind IS NULL OR p_kind NOT IN('observation','photo') THEN RAISE EXCEPTION 'Invalid source query' USING ERRCODE='22023'; END IF;
 IF p_kind='observation' THEN
 RETURN QUERY SELECT v.id,t.definition->>'title',v.version,NULL::text FROM public.field_job_versions v JOIN public.field_job_template_versions t ON t.id=v.template_version_id WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND v.status<>'draft' AND (p_after_id IS NULL OR v.id>p_after_id) ORDER BY v.id LIMIT p_page_size+1;
 ELSE
 RETURN QUERY SELECT r.upload_id,u.payload->>'title',NULL::integer,r.sha256 FROM public.field_photo_receipts r JOIN public.field_photo_uploads u ON u.id=r.upload_id AND u.project_id=r.project_id WHERE r.project_id=p_project_id AND r.status='verified' AND (p_after_id IS NULL OR r.upload_id>p_after_id) ORDER BY r.upload_id LIMIT p_page_size+1;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.list_work_order_evidence_sources(uuid,uuid,uuid,text,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_work_order_evidence_sources(uuid,uuid,uuid,text,uuid,integer) TO authenticated;

-- Exact-reference read only. The signer receives no arbitrary caller-supplied path.
CREATE FUNCTION private.work_order_evidence_original(p_id uuid,p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.work_order_evidence_versions; obj storage.objects;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_work_order(p_action_id) THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.work_order_evidence_versions WHERE id=p_id AND action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id;
 IF e.id IS NULL OR e.state<>'attached' OR (SELECT state FROM public.work_order_evidence_versions WHERE evidence_id=e.evidence_id ORDER BY version DESC LIMIT 1)='withdrawn'
 THEN RAISE EXCEPTION 'Evidence unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO obj FROM storage.objects WHERE id=(e.original_snapshot->>'objectId')::uuid AND bucket_id='project-media' AND name=e.original_snapshot->>'storagePath';
 IF obj.id IS NULL OR obj.updated_at IS DISTINCT FROM (e.original_snapshot->>'objectUpdatedAt')::timestamptz
 OR (to_jsonb(obj)->>'version') IS DISTINCT FROM e.original_snapshot->>'objectVersion'
 OR to_jsonb(obj)->>'archived_at' IS NOT NULL OR coalesce((to_jsonb(obj)->>'is_delete_marker')::boolean,false)
 THEN RAISE EXCEPTION 'Original unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',e.id,'actionId',e.action_id,'organizationId',e.organization_id,'projectId',e.project_id,'actorId',auth.uid(),'original',e.original_snapshot);
END $$;
REVOKE ALL ON FUNCTION private.work_order_evidence_original(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.work_order_evidence_original(uuid,uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.get_work_order_evidence_original(p_id uuid,p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.work_order_evidence_original(p_id,p_action_id,p_organization_id,p_project_id) $$;
REVOKE ALL ON FUNCTION public.get_work_order_evidence_original(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_evidence_original(uuid,uuid,uuid,uuid) TO authenticated;
