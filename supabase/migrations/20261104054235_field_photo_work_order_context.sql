-- Capture provenance on the canonical immutable original, independent of any later
-- observation/evidence association. No old intent, file or evidence is rewritten.
ALTER TABLE public.field_photo_uploads
  ADD COLUMN captured_action_id uuid,
  ADD COLUMN captured_organization_id uuid,
  ADD COLUMN captured_plan_version_id uuid,
  ADD CONSTRAINT field_photo_capture_scope CHECK (
    (captured_action_id IS NULL AND captured_organization_id IS NULL AND captured_plan_version_id IS NULL)
    OR (captured_action_id IS NOT NULL AND captured_organization_id IS NOT NULL)),
  ADD CONSTRAINT field_photo_capture_work_order FOREIGN KEY(captured_action_id,captured_organization_id,project_id)
    REFERENCES public.work_orders(action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE UNIQUE INDEX work_order_plan_photo_scope ON public.work_order_plan_versions(id,action_id,organization_id,project_id);
ALTER TABLE public.field_photo_uploads ADD CONSTRAINT field_photo_capture_plan
  FOREIGN KEY(captured_plan_version_id,captured_action_id,captured_organization_id,project_id)
  REFERENCES public.work_order_plan_versions(id,action_id,organization_id,project_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX field_photo_capture_task ON public.field_photo_uploads(captured_action_id,project_id,id)
  WHERE captured_action_id IS NOT NULL;

-- Deliberately private: field staff need the exact task's lifecycle check without
-- gaining access to its private lifecycle table or any other task. Reuses the
-- common work-order/membership locks, with action before upload/object locks.
CREATE FUNCTION private.check_field_photo_work_order(p_project_id uuid,p_context jsonb,p_new boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid; org uuid; plan_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Field photo access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
 OR p_context->>'schema' IS DISTINCT FROM 'freyra.field-photo-work-order/v1'
 OR (p_context-ARRAY['schema','organizationId','actionId','planVersionId'])<>'{}'::jsonb
 OR jsonb_typeof(p_context->'actionId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_context->'organizationId') IS DISTINCT FROM 'string'
 OR NOT(p_context ? 'planVersionId')
 OR (jsonb_typeof(p_context->'planVersionId') IS DISTINCT FROM 'string' AND p_context->'planVersionId'<>'null'::jsonb)
 THEN RAISE EXCEPTION 'Invalid field photo work order' USING ERRCODE='22023'; END IF;
 BEGIN
  a:=(p_context->>'actionId')::uuid; org:=(p_context->>'organizationId')::uuid; plan_id:=(p_context->>'planVersionId')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid field photo scope' USING ERRCODE='22023'; END;
 PERFORM private.lock_work_order_evidence(a,p_project_id);
 IF NOT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.action_id=a AND w.organization_id=org AND w.project_id=p_project_id)
 THEN RAISE EXCEPTION 'Field photo work order unavailable' USING ERRCODE='42501'; END IF;
 IF plan_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.work_order_plan_versions v WHERE v.id=plan_id AND v.action_id=a AND v.organization_id=org AND v.project_id=p_project_id)
 THEN RAISE EXCEPTION 'Field photo plan does not match' USING ERRCODE='22023'; END IF;
 -- A photo records a fact under its captured instructions, even if the plan has
 -- since changed. A new intent after cancellation is refused; an exact previously
 -- accepted intent can resume, provided the actor still has current access.
 IF p_new AND (SELECT v.status FROM public.work_order_lifecycle_versions v WHERE v.action_id=a AND v.organization_id=org AND v.project_id=p_project_id ORDER BY v.version DESC LIMIT 1)='cancelled'
 THEN RAISE EXCEPTION 'A cancelled work order cannot capture a new photo' USING ERRCODE='PT410'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.check_field_photo_work_order(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.guard_field_photo_work_order() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;
BEGIN
 c:=NEW.payload->'workOrder';
 IF NEW.payload ? 'workOrder' THEN
  IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Field photo actor mismatch' USING ERRCODE='42501'; END IF;
  PERFORM private.check_field_photo_work_order(NEW.project_id,c,true);
  IF (NEW.captured_action_id IS NOT NULL AND NEW.captured_action_id IS DISTINCT FROM (c->>'actionId')::uuid)
  OR (NEW.captured_organization_id IS NOT NULL AND NEW.captured_organization_id IS DISTINCT FROM (c->>'organizationId')::uuid)
  OR (NEW.captured_plan_version_id IS NOT NULL AND NEW.captured_plan_version_id IS DISTINCT FROM (c->>'planVersionId')::uuid)
  THEN RAISE EXCEPTION 'Field photo capture scope mismatch' USING ERRCODE='23514'; END IF;
  NEW.captured_action_id:=(c->>'actionId')::uuid;
  NEW.captured_organization_id:=(c->>'organizationId')::uuid;
  NEW.captured_plan_version_id:=(c->>'planVersionId')::uuid;
 ELSIF NEW.captured_action_id IS NOT NULL OR NEW.captured_organization_id IS NOT NULL OR NEW.captured_plan_version_id IS NOT NULL THEN
  RAISE EXCEPTION 'Capture context required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_field_photo_work_order() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER field_photo_work_order_guard BEFORE INSERT ON public.field_photo_uploads
 FOR EACH ROW EXECUTE FUNCTION private.guard_field_photo_work_order();

CREATE OR REPLACE FUNCTION private.begin_field_photo_upload(p_project_id uuid,p_upload_id uuid,p_payload jsonb)
RETURNS SETOF public.field_photo_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.field_photo_uploads; capture jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_payload ? 'workOrder' THEN PERFORM private.check_field_photo_work_order(p_project_id,p_payload->'workOrder',false); END IF;
 PERFORM private.lock_field_photo_actor(p_project_id,auth.uid());
 capture:=p_payload->'capture';
 IF p_upload_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>65536
 OR (p_payload-ARRAY['title','description','category','tags','originalName','sha256','sizeBytes','mimeType','capture','capturedAt','workOrder'])<>'{}'::jsonb
 OR jsonb_typeof(p_payload->'title') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 160
 OR jsonb_typeof(p_payload->'originalName') IS DISTINCT FROM 'string' OR length(p_payload->>'originalName') NOT BETWEEN 1 AND 255
 OR (p_payload->>'sha256') IS NULL OR (p_payload->>'sha256')!~'^[a-f0-9]{64}$'
 OR jsonb_typeof(p_payload->'sizeBytes') IS DISTINCT FROM 'number' OR (p_payload->>'sizeBytes')!~'^[0-9]+$' OR (p_payload->>'sizeBytes')::bigint NOT BETWEEN 1 AND 52428800
 OR (p_payload->>'mimeType') IS NULL OR (p_payload->>'mimeType')!~'^image/[a-zA-Z0-9.+-]+$'
 OR (p_payload->>'category') IS NULL OR (p_payload->>'category') NOT IN ('field_photo','before_after','document_scan','biodiversity_observation','water_observation','soil_observation','satellite_snapshot')
 OR jsonb_typeof(p_payload->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'tags')>30
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'tags') t WHERE jsonb_typeof(t)<>'string' OR length(t#>>'{}')>80)
 OR (p_payload->'description' IS NOT NULL AND p_payload->'description'<>'null'::jsonb AND (jsonb_typeof(p_payload->'description')<>'string' OR length(p_payload->>'description')>4000))
 OR jsonb_typeof(capture) IS DISTINCT FROM 'object' OR (capture-ARRAY['schema','originalPosition','initialPosition','correctionReason'])<>'{}'::jsonb
 OR capture->>'schema' IS DISTINCT FROM 'freyra.field-photo/v1'
 OR NOT(capture ? 'originalPosition') OR NOT(capture ? 'initialPosition')
 OR (capture->'originalPosition'<>'null'::jsonb AND NOT private.field_photo_point_valid(capture->'originalPosition'))
 OR (capture->'initialPosition'<>'null'::jsonb AND NOT private.field_photo_point_valid(capture->'initialPosition'))
 OR jsonb_typeof(capture->'correctionReason') IS DISTINCT FROM 'string' OR length(capture->>'correctionReason')>2000
 OR (capture->'originalPosition' IS DISTINCT FROM capture->'initialPosition' AND length(btrim(capture->>'correctionReason'))=0)
 THEN RAISE EXCEPTION 'Invalid field photo intent' USING ERRCODE='22023'; END IF;
 IF p_payload->>'capturedAt' IS NOT NULL THEN PERFORM (p_payload->>'capturedAt')::timestamptz; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-upload:'||p_upload_id::text,0));
 SELECT * INTO saved FROM public.field_photo_uploads WHERE id=p_upload_id;
 IF saved.id IS NOT NULL THEN
 IF saved.project_id IS DISTINCT FROM p_project_id OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.payload IS DISTINCT FROM p_payload
 THEN RAISE EXCEPTION 'Field upload request mismatch' USING ERRCODE='22023'; END IF;
 ELSE
 INSERT INTO public.field_photo_uploads(id,project_id,created_by,storage_path,payload)
 VALUES(p_upload_id,p_project_id,auth.uid(),p_project_id::text||'/field-uploads/'||p_upload_id::text||'/original',p_payload) RETURNING * INTO saved;
 END IF;
 RETURN NEXT saved;
END $$;

CREATE OR REPLACE FUNCTION private.finalize_field_photo_upload(p_project_id uuid,p_upload_id uuid)
RETURNS SETOF public.field_photo_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent public.field_photo_uploads; obj storage.objects; p jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO intent FROM public.field_photo_uploads WHERE id=p_upload_id AND project_id=p_project_id;
 IF intent.payload ? 'workOrder' THEN PERFORM private.check_field_photo_work_order(p_project_id,intent.payload->'workOrder',false); END IF;
 PERFORM private.lock_field_photo_actor(p_project_id,auth.uid());
 SELECT * INTO intent FROM public.field_photo_uploads WHERE id=p_upload_id AND project_id=p_project_id FOR UPDATE;
 IF intent.id IS NULL OR intent.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Field upload access denied' USING ERRCODE='42501'; END IF;
 IF intent.received_at IS NOT NULL THEN RETURN NEXT intent; RETURN; END IF;
 p:=intent.payload;
 SELECT * INTO STRICT obj FROM storage.objects o WHERE bucket_id='project-media' AND name=intent.storage_path
 AND to_jsonb(o)->>'archived_at' IS NULL AND NOT coalesce((to_jsonb(o)->>'is_delete_marker')::boolean,false) FOR SHARE;
 IF obj.owner_id IS DISTINCT FROM intent.created_by::text OR obj.metadata->>'size' IS NULL OR obj.metadata->>'size'!~'^[0-9]+$'
 OR (obj.metadata->>'size')::bigint IS DISTINCT FROM (p->>'sizeBytes')::bigint
 OR lower(obj.metadata->>'mimetype') IS DISTINCT FROM lower(p->>'mimeType')
 THEN RAISE EXCEPTION 'Field photo storage binding mismatch' USING ERRCODE='23514'; END IF;
 INSERT INTO public.project_media(id,project_id,title,description,category,source,file_path,url,storage_bucket,mime_type,file_size_bytes,captured_at,metadata,tags,is_report_ready,status)
 VALUES(intent.id,intent.project_id,p->>'title',p->>'description',p->>'category','field_upload',intent.storage_path,'','project-media',p->>'mimeType',(p->>'sizeBytes')::bigint,(p->>'capturedAt')::timestamptz,
 jsonb_build_object('original_name',p->>'originalName','original_sha256',p->>'sha256','field_photo_capture',p->'capture','field_upload_id',intent.id),
 ARRAY(SELECT jsonb_array_elements_text(p->'tags')),false,'uploaded');
 UPDATE public.field_photo_uploads SET received_at=now(),object_id=obj.id,object_version=to_jsonb(obj)->>'version',object_updated_at=obj.updated_at WHERE id=intent.id RETURNING * INTO intent;
 INSERT INTO public.field_photo_processing_jobs(upload_id,project_id) VALUES(intent.id,intent.project_id);
 RETURN NEXT intent;
END $$;

CREATE OR REPLACE FUNCTION private.field_photo_intent_path(p_bucket text,p_path text,p_insert boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE intent public.field_photo_uploads;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_bucket<>'project-media' THEN RETURN NOT p_insert; END IF;
 SELECT * INTO intent FROM public.field_photo_uploads WHERE storage_path=p_path;
 IF NOT p_insert THEN RETURN intent.id IS NULL; END IF;
 IF intent.id IS NOT NULL AND intent.created_by=auth.uid() AND intent.payload ? 'workOrder' THEN
   PERFORM private.check_field_photo_work_order(intent.project_id,intent.payload->'workOrder',false);
 END IF;
 RETURN intent.id IS NOT NULL AND intent.created_by=auth.uid() AND intent.received_at IS NULL AND private.can_contribute_project(intent.project_id);
END $$;

-- Task-only readers can inspect verified captures without acquiring project-wide
-- media access. All exposed functions remain invoker wrappers of narrow checks.
CREATE FUNCTION private.field_photo_work_order_original(p_id uuid,p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.field_photo_uploads; r public.field_photo_receipts; obj storage.objects; original jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_work_order(p_action_id) THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM public.field_photo_uploads WHERE id=p_id AND captured_action_id=p_action_id AND captured_organization_id=p_organization_id AND project_id=p_project_id;
 IF u.id IS NULL OR u.received_at IS NULL THEN RAISE EXCEPTION 'Task photo unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.field_photo_receipts WHERE upload_id=u.id AND project_id=p_project_id;
 SELECT * INTO obj FROM storage.objects WHERE id=r.object_id AND bucket_id='project-media' AND name=u.storage_path;
 IF r.upload_id IS NULL OR r.status<>'verified' OR obj.id IS NULL
 OR r.object_id IS DISTINCT FROM u.object_id OR r.object_version IS DISTINCT FROM u.object_version
 OR r.object_updated_at IS DISTINCT FROM u.object_updated_at OR r.sha256 IS DISTINCT FROM u.payload->>'sha256'
 OR r.size_bytes IS DISTINCT FROM (u.payload->>'sizeBytes')::bigint
 OR obj.updated_at IS DISTINCT FROM r.object_updated_at OR (to_jsonb(obj)->>'version') IS DISTINCT FROM r.object_version
 OR to_jsonb(obj)->>'archived_at' IS NOT NULL OR coalesce((to_jsonb(obj)->>'is_delete_marker')::boolean,false)
 THEN RAISE EXCEPTION 'Task original unavailable' USING ERRCODE='42501'; END IF;
 original:=jsonb_build_object('schema','freyra.task-original-pin/v1','uploadId',u.id,'sha256',r.sha256,'sizeBytes',r.size_bytes,'objectId',r.object_id,'objectVersion',r.object_version,'objectUpdatedAt',r.object_updated_at,'storagePath',u.storage_path,'capturedAt',u.payload->'capturedAt','capture',u.payload->'capture','workOrder',u.payload->'workOrder');
 RETURN jsonb_build_object('id',u.id,'actionId',u.captured_action_id,'organizationId',u.captured_organization_id,'projectId',u.project_id,'actorId',auth.uid(),'original',original);
END $$;
REVOKE ALL ON FUNCTION private.field_photo_work_order_original(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.field_photo_work_order_original(uuid,uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.get_work_order_captured_photo_original(p_id uuid,p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.field_photo_work_order_original(p_id,p_action_id,p_organization_id,p_project_id) $$;
REVOKE ALL ON FUNCTION public.get_work_order_captured_photo_original(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_captured_photo_original(uuid,uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION private.list_work_order_captured_photos(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_after_id uuid,p_page_size integer)
RETURNS TABLE(id uuid,label text,version integer,sha256 text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_work_order(p_action_id)
 OR NOT EXISTS(SELECT 1 FROM public.work_orders WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT u.id,u.payload->>'title',NULL::integer,r.sha256
 FROM public.field_photo_uploads u JOIN public.field_photo_receipts r ON r.upload_id=u.id AND r.project_id=u.project_id
 WHERE u.project_id=p_project_id AND u.captured_action_id=p_action_id AND u.captured_organization_id=p_organization_id
 AND u.received_at IS NOT NULL AND r.status='verified'
 AND r.object_id=u.object_id AND r.object_version IS NOT DISTINCT FROM u.object_version AND r.object_updated_at=u.object_updated_at
 AND r.sha256=u.payload->>'sha256' AND r.size_bytes=(u.payload->>'sizeBytes')::bigint
 AND (p_after_id IS NULL OR u.id>p_after_id) ORDER BY u.id LIMIT p_page_size+1;
END $$;
REVOKE ALL ON FUNCTION private.list_work_order_captured_photos(uuid,uuid,uuid,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.list_work_order_captured_photos(uuid,uuid,uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_work_order_evidence_sources(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_kind text,p_after_id uuid,p_page_size integer)
RETURNS TABLE(id uuid,label text,version integer,sha256 text) LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_kind='task_photo' THEN
  RETURN QUERY SELECT * FROM private.list_work_order_captured_photos(p_action_id,p_organization_id,p_project_id,p_after_id,p_page_size);
  RETURN;
 END IF;
 IF auth.uid() IS NULL OR NOT private.can_contribute_project(p_project_id) OR NOT private.can_execute_work_order(p_action_id) OR NOT EXISTS(SELECT 1 FROM public.work_orders WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 OR p_kind IS NULL OR p_kind NOT IN('observation','photo') THEN RAISE EXCEPTION 'Invalid source query' USING ERRCODE='22023'; END IF;
 IF p_kind='observation' THEN
 RETURN QUERY SELECT v.id,t.definition->>'title',v.version,NULL::text FROM public.field_job_versions v JOIN public.field_job_template_versions t ON t.id=v.template_version_id WHERE v.action_id=p_action_id AND v.organization_id=p_organization_id AND v.project_id=p_project_id AND v.status<>'draft' AND (p_after_id IS NULL OR v.id>p_after_id) ORDER BY v.id LIMIT p_page_size+1;
 ELSE
 RETURN QUERY SELECT r.upload_id,u.payload->>'title',NULL::integer,r.sha256 FROM public.field_photo_receipts r JOIN public.field_photo_uploads u ON u.id=r.upload_id AND u.project_id=r.project_id WHERE r.project_id=p_project_id AND r.status='verified' AND (p_after_id IS NULL OR r.upload_id>p_after_id) ORDER BY r.upload_id LIMIT p_page_size+1;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION private.guard_work_order_evidence() RETURNS trigger
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
   IF upload.payload ? 'workOrder' THEN NEW.original_snapshot:=NEW.original_snapshot||jsonb_build_object('workOrder',upload.payload->'workOrder'); END IF;
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

CREATE FUNCTION private.work_order_photo_capture_access(p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_read_work_order(p_action_id)
 OR NOT EXISTS(SELECT 1 FROM public.work_orders WHERE action_id=p_action_id AND organization_id=p_organization_id AND project_id=p_project_id)
 THEN RAISE EXCEPTION 'Work order unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('actionId',p_action_id,'organizationId',p_organization_id,'projectId',p_project_id,'actorId',auth.uid(),'canCapture',
 coalesce(private.can_contribute_project(p_project_id) AND private.can_execute_work_order(p_action_id)
 AND coalesce((SELECT status FROM public.work_order_lifecycle_versions WHERE action_id=p_action_id ORDER BY version DESC LIMIT 1),'draft')<>'cancelled',false));
END $$;
REVOKE ALL ON FUNCTION private.work_order_photo_capture_access(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.work_order_photo_capture_access(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.get_work_order_photo_capture_access(p_action_id uuid,p_organization_id uuid,p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.work_order_photo_capture_access(p_action_id,p_organization_id,p_project_id) $$;
REVOKE ALL ON FUNCTION public.get_work_order_photo_capture_access(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_work_order_photo_capture_access(uuid,uuid,uuid) TO authenticated;
