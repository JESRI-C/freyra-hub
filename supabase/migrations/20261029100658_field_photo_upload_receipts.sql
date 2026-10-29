-- One immutable intent per capture. A received object, processing job and media
-- row are committed together; a separate server receipt certifies bytes only.
CREATE TABLE public.field_photo_uploads (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 storage_path text NOT NULL UNIQUE, payload jsonb NOT NULL,
 received_at timestamptz, object_id uuid, object_version text, object_updated_at timestamptz,
 CHECK ((received_at IS NULL AND object_id IS NULL AND object_updated_at IS NULL)
     OR (received_at IS NOT NULL AND object_id IS NOT NULL AND object_updated_at IS NOT NULL))
);
CREATE TABLE public.field_photo_processing_jobs (
 upload_id uuid PRIMARY KEY REFERENCES public.field_photo_uploads(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 lease_id uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 last_error text CHECK(last_error IN ('download_failed','verification_failed')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.field_photo_receipts (
 upload_id uuid PRIMARY KEY REFERENCES public.field_photo_uploads(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 object_id uuid NOT NULL, object_version text, object_updated_at timestamptz NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), size_bytes bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('verified','hash_mismatch')),
 verified_by uuid NOT NULL, verified_at timestamptz NOT NULL DEFAULT now(),
 validator_version text NOT NULL DEFAULT 'stream-sha256/v1' CHECK(validator_version='stream-sha256/v1')
);
CREATE INDEX field_photo_uploads_project ON public.field_photo_uploads(project_id,created_at DESC,id);
CREATE INDEX field_photo_jobs_pending ON public.field_photo_processing_jobs(project_id,updated_at,upload_id);
ALTER TABLE public.field_photo_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_photo_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_photo_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_photo_uploads,public.field_photo_processing_jobs,public.field_photo_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.field_photo_uploads,public.field_photo_processing_jobs,public.field_photo_receipts TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.field_photo_uploads,public.field_photo_processing_jobs TO service_role;
GRANT SELECT,INSERT ON public.field_photo_receipts TO service_role;
CREATE POLICY field_upload_read ON public.field_photo_uploads FOR SELECT TO authenticated USING(private.can_read_project(project_id));
CREATE POLICY field_job_read ON public.field_photo_processing_jobs FOR SELECT TO authenticated USING(private.can_read_project(project_id));
CREATE POLICY field_receipt_read ON public.field_photo_receipts FOR SELECT TO authenticated USING(private.can_read_project(project_id));

-- Service calls supply a server-authenticated actor. Lock memberships so a
-- concurrent revocation cannot slip between final checks and the commit.
CREATE FUNCTION private.lock_field_photo_actor(p_project_id uuid,p_actor_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.projects WHERE id=p_project_id FOR SHARE;
 PERFORM 1 FROM public.organization_memberships WHERE organization_id=org AND user_id=p_actor_id FOR SHARE;
 PERFORM 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=p_actor_id FOR SHARE;
 IF p_actor_id IS NULL OR org IS NULL OR NOT (
 EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=org AND user_id=p_actor_id AND role IN ('owner','admin'))
 OR (EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=org AND user_id=p_actor_id)
 AND EXISTS(SELECT 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=p_actor_id AND role IN ('admin','project_manager','editor','field'))))
 THEN RAISE EXCEPTION 'Field upload access denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.lock_field_photo_actor(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.lock_field_photo_actor(uuid,uuid) TO service_role;

CREATE FUNCTION private.begin_field_photo_upload(p_project_id uuid,p_upload_id uuid,p_payload jsonb)
RETURNS SETOF public.field_photo_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.field_photo_uploads; capture jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_field_photo_actor(p_project_id,auth.uid());
 capture:=p_payload->'capture';
 IF p_upload_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>65536
 OR (p_payload-ARRAY['title','description','category','tags','originalName','sha256','sizeBytes','mimeType','capture','capturedAt'])<>'{}'::jsonb
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
REVOKE ALL ON FUNCTION private.begin_field_photo_upload(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.begin_field_photo_upload(uuid,uuid,jsonb) TO authenticated;
CREATE FUNCTION public.begin_field_photo_upload(p_project_id uuid,p_upload_id uuid,p_payload jsonb)
RETURNS SETOF public.field_photo_uploads LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM private.begin_field_photo_upload(p_project_id,p_upload_id,p_payload)
$$;
REVOKE ALL ON FUNCTION public.begin_field_photo_upload(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_field_photo_upload(uuid,uuid,jsonb) TO authenticated;

-- The intent reserves its exact path. Users may create it once; replacement,
-- rename and deletion are blocked even before the database finalization.
CREATE FUNCTION private.field_photo_intent_path(p_bucket text,p_path text,p_insert boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE intent public.field_photo_uploads;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_bucket<>'project-media' THEN RETURN NOT p_insert; END IF;
 SELECT * INTO intent FROM public.field_photo_uploads WHERE storage_path=p_path;
 IF NOT p_insert THEN RETURN intent.id IS NULL; END IF;
 RETURN intent.id IS NOT NULL AND intent.created_by=auth.uid() AND intent.received_at IS NULL AND private.can_contribute_project(intent.project_id);
END $$;
REVOKE ALL ON FUNCTION private.field_photo_intent_path(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.field_photo_intent_path(text,text,boolean) TO authenticated;
CREATE POLICY field_intent_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(private.field_photo_intent_path(bucket_id,name,true));
CREATE POLICY field_intent_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(private.field_photo_intent_path(bucket_id,name,false)) WITH CHECK(private.field_photo_intent_path(bucket_id,name,false));
CREATE POLICY field_intent_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(private.field_photo_intent_path(bucket_id,name,false));
-- Existing broad project INSERT policies must not let another editor occupy a
-- reserved path. Outside this namespace they retain their original behaviour.
CREATE POLICY field_intent_insert_scope ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(bucket_id<>'project-media' OR split_part(name,'/',2)<>'field-uploads' OR private.field_photo_intent_path(bucket_id,name,true));

CREATE FUNCTION private.finalize_field_photo_upload(p_project_id uuid,p_upload_id uuid)
RETURNS SETOF public.field_photo_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent public.field_photo_uploads; obj storage.objects; p jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION private.finalize_field_photo_upload(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.finalize_field_photo_upload(uuid,uuid) TO authenticated;
CREATE FUNCTION public.finalize_field_photo_upload(p_project_id uuid,p_upload_id uuid)
RETURNS SETOF public.field_photo_uploads LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.finalize_field_photo_upload(p_project_id,p_upload_id) $$;
REVOKE ALL ON FUNCTION public.finalize_field_photo_upload(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_field_photo_upload(uuid,uuid) TO authenticated;

CREATE FUNCTION private.lock_field_photo_object(p_upload_id uuid) RETURNS public.field_photo_uploads
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intent public.field_photo_uploads; obj storage.objects;
BEGIN
 SELECT * INTO intent FROM public.field_photo_uploads WHERE id=p_upload_id FOR SHARE;
 IF intent.received_at IS NULL THEN RAISE EXCEPTION 'Field photo has not been received' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT obj FROM storage.objects o WHERE bucket_id='project-media' AND name=intent.storage_path
 AND to_jsonb(o)->>'archived_at' IS NULL AND NOT coalesce((to_jsonb(o)->>'is_delete_marker')::boolean,false) FOR SHARE;
 IF obj.id IS DISTINCT FROM intent.object_id OR (to_jsonb(obj)->>'version') IS DISTINCT FROM intent.object_version
 OR obj.updated_at IS DISTINCT FROM intent.object_updated_at OR obj.owner_id IS DISTINCT FROM intent.created_by::text
 OR (obj.metadata->>'size')::bigint IS DISTINCT FROM (intent.payload->>'sizeBytes')::bigint
 OR lower(obj.metadata->>'mimetype') IS DISTINCT FROM lower(intent.payload->>'mimeType')
 THEN RAISE EXCEPTION 'Field photo object changed' USING ERRCODE='23514'; END IF;
 RETURN intent;
END $$;
REVOKE ALL ON FUNCTION private.lock_field_photo_object(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.lock_field_photo_object(uuid) TO service_role;

CREATE FUNCTION public.prepare_field_photo_verification(p_project_id uuid,p_upload_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intent public.field_photo_uploads; job public.field_photo_processing_jobs; receipt public.field_photo_receipts;
BEGIN
 PERFORM private.lock_field_photo_actor(p_project_id,p_actor_id);
 intent:=private.lock_field_photo_object(p_upload_id);
 IF intent.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Wrong project' USING ERRCODE='42501'; END IF;
 SELECT * INTO job FROM public.field_photo_processing_jobs WHERE upload_id=p_upload_id FOR UPDATE;
 IF job.upload_id IS NULL THEN RAISE EXCEPTION 'Missing processing job' USING ERRCODE='23514'; END IF;
 SELECT * INTO receipt FROM public.field_photo_receipts WHERE upload_id=p_upload_id;
 IF receipt.upload_id IS NOT NULL THEN RETURN jsonb_build_object('upload',to_jsonb(intent),'receipt',to_jsonb(receipt),'leaseId',NULL); END IF;
 IF job.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Verification already running' USING ERRCODE='55P03'; END IF;
 UPDATE public.field_photo_processing_jobs SET lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1,last_error=NULL,updated_at=now() WHERE upload_id=p_upload_id RETURNING * INTO job;
 RETURN jsonb_build_object('upload',to_jsonb(intent),'receipt',NULL,'leaseId',job.lease_id);
END $$;
CREATE FUNCTION public.complete_field_photo_verification(p_project_id uuid,p_upload_id uuid,p_actor_id uuid,p_lease_id uuid,p_sha256 text,p_size_bytes bigint)
RETURNS SETOF public.field_photo_receipts LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE intent public.field_photo_uploads; job public.field_photo_processing_jobs; receipt public.field_photo_receipts;
BEGIN
 PERFORM private.lock_field_photo_actor(p_project_id,p_actor_id);
 intent:=private.lock_field_photo_object(p_upload_id);
 IF intent.project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'Wrong project' USING ERRCODE='42501'; END IF;
 SELECT * INTO job FROM public.field_photo_processing_jobs WHERE upload_id=p_upload_id FOR UPDATE;
 SELECT * INTO receipt FROM public.field_photo_receipts WHERE upload_id=p_upload_id;
 IF receipt.upload_id IS NOT NULL THEN
 IF receipt.sha256 IS DISTINCT FROM p_sha256 OR receipt.size_bytes IS DISTINCT FROM p_size_bytes THEN RAISE EXCEPTION 'Receipt conflict' USING ERRCODE='23514'; END IF;
 RETURN NEXT receipt; RETURN; END IF;
 IF p_lease_id IS NULL OR job.lease_id IS DISTINCT FROM p_lease_id OR job.lease_until<clock_timestamp() THEN RAISE EXCEPTION 'Verification lease expired' USING ERRCODE='40001'; END IF;
 IF p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR p_size_bytes IS DISTINCT FROM (intent.payload->>'sizeBytes')::bigint THEN RAISE EXCEPTION 'Invalid byte verification' USING ERRCODE='22023'; END IF;
 INSERT INTO public.field_photo_receipts(upload_id,project_id,object_id,object_version,object_updated_at,sha256,size_bytes,status,verified_by)
 VALUES(p_upload_id,p_project_id,intent.object_id,intent.object_version,intent.object_updated_at,p_sha256,p_size_bytes,
 CASE WHEN p_sha256=intent.payload->>'sha256' THEN 'verified' ELSE 'hash_mismatch' END,p_actor_id) RETURNING * INTO receipt;
 UPDATE public.field_photo_processing_jobs SET lease_id=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE upload_id=p_upload_id;
 RETURN NEXT receipt;
END $$;
CREATE FUNCTION public.release_field_photo_verification(p_upload_id uuid,p_lease_id uuid,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_error NOT IN ('download_failed','verification_failed') OR p_error IS NULL THEN RAISE EXCEPTION 'Invalid processing error' USING ERRCODE='22023'; END IF;
 UPDATE public.field_photo_processing_jobs SET lease_id=NULL,lease_until=NULL,last_error=p_error,updated_at=now() WHERE upload_id=p_upload_id AND lease_id=p_lease_id AND NOT EXISTS(SELECT 1 FROM public.field_photo_receipts WHERE upload_id=p_upload_id);
END $$;
REVOKE ALL ON FUNCTION public.prepare_field_photo_verification(uuid,uuid,uuid),public.complete_field_photo_verification(uuid,uuid,uuid,uuid,text,bigint),public.release_field_photo_verification(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_field_photo_verification(uuid,uuid,uuid),public.complete_field_photo_verification(uuid,uuid,uuid,uuid,text,bigint),public.release_field_photo_verification(uuid,uuid,text) TO service_role;

CREATE FUNCTION private.immutable_field_photo_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Field photo receipt is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER field_photo_receipt_immutable BEFORE UPDATE OR DELETE ON public.field_photo_receipts FOR EACH ROW EXECUTE FUNCTION private.immutable_field_photo_receipt();
REVOKE ALL ON FUNCTION private.immutable_field_photo_receipt() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.guard_field_photo_intent() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.received_at IS NOT NULL OR (to_jsonb(NEW)-ARRAY['received_at','object_id','object_version','object_updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['received_at','object_id','object_version','object_updated_at'])
 THEN RAISE EXCEPTION 'Field photo intent is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER field_photo_intent_immutable BEFORE UPDATE OR DELETE ON public.field_photo_uploads FOR EACH ROW EXECUTE FUNCTION private.guard_field_photo_intent();
REVOKE ALL ON FUNCTION private.guard_field_photo_intent() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.guard_field_photo_report_ready() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.metadata ? 'field_upload_id' AND NEW.is_report_ready AND NOT EXISTS(SELECT 1 FROM public.field_photo_receipts WHERE upload_id=NEW.id AND project_id=NEW.project_id AND status='verified')
 THEN RAISE EXCEPTION 'Field photo byte verification is required before report readiness' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_field_photo_report_ready() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER field_photo_report_ready BEFORE INSERT OR UPDATE ON public.project_media FOR EACH ROW EXECUTE FUNCTION private.guard_field_photo_report_ready();
