CREATE TABLE public.field_photo_background_jobs (
 upload_id uuid PRIMARY KEY REFERENCES public.field_photo_uploads(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 stage text NOT NULL DEFAULT 'verify' CHECK(stage IN ('verify','preview','done')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','retry_wait','ready','unsupported','failed','blocked')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 lease_id uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text CHECK(last_error IN ('processing_failed','unsupported_format','source_too_large','hash_mismatch','source_changed','access_revoked')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX field_photo_background_due ON public.field_photo_background_jobs(next_attempt_at,upload_id) WHERE state IN ('pending','running','retry_wait');
CREATE TABLE public.field_photo_previews (
 upload_id uuid PRIMARY KEY REFERENCES public.field_photo_uploads(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 recipe text NOT NULL CHECK(recipe='preview-jpeg1536-v1'), source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 2097152),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 1536), height integer NOT NULL CHECK(height BETWEEN 1 AND 1536),
 storage_path text NOT NULL UNIQUE, object_id uuid NOT NULL, object_version text, object_updated_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL
);
ALTER TABLE public.field_photo_background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_photo_previews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_photo_background_jobs,public.field_photo_previews FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.field_photo_background_jobs,public.field_photo_previews TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.field_photo_background_jobs TO service_role;
GRANT SELECT,INSERT ON public.field_photo_previews TO service_role;
CREATE POLICY field_background_read ON public.field_photo_background_jobs FOR SELECT TO authenticated USING(private.can_read_project(project_id));
CREATE POLICY field_preview_read ON public.field_photo_previews FOR SELECT TO authenticated USING(private.can_read_project(project_id));
CREATE TRIGGER field_preview_immutable BEFORE UPDATE OR DELETE ON public.field_photo_previews FOR EACH ROW EXECUTE FUNCTION private.immutable_field_photo_receipt();

CREATE FUNCTION private.enqueue_field_photo_background() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.field_photo_background_jobs(upload_id,project_id) VALUES(NEW.upload_id,NEW.project_id) ON CONFLICT(upload_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enqueue_field_photo_background() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enqueue_field_photo_background AFTER INSERT ON public.field_photo_processing_jobs FOR EACH ROW EXECUTE FUNCTION private.enqueue_field_photo_background();
INSERT INTO public.field_photo_background_jobs(upload_id,project_id) SELECT upload_id,project_id FROM public.field_photo_processing_jobs ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('field-photo-previews','field-photo-previews',false,2097152,ARRAY['image/jpeg']) ON CONFLICT(id) DO NOTHING;
-- Explicit restrictive boundaries also cover any legacy permissive policies.
CREATE POLICY field_preview_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'field-photo-previews');
CREATE POLICY field_preview_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'field-photo-previews') WITH CHECK(bucket_id<>'field-photo-previews');
CREATE POLICY field_preview_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'field-photo-previews');
CREATE POLICY field_preview_object_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='field-photo-previews' AND EXISTS(SELECT 1 FROM public.field_photo_previews p WHERE p.storage_path=name AND p.object_id=id
 AND p.object_version IS NOT DISTINCT FROM (to_jsonb(objects)->>'version') AND p.object_updated_at=updated_at AND private.can_read_project(p.project_id))
);

-- One job per claim. Bounded scans prevent bad jobs monopolising one tick.
-- All browser roles are excluded; scheduled work uses the original uploader
-- as its actor, and current membership is checked again before each commit.
CREATE FUNCTION public.claim_field_photo_background() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.field_photo_background_jobs; intent public.field_photo_uploads; receipt public.field_photo_receipts; scanned integer:=0;
BEGIN
 LOOP
 scanned:=scanned+1;
 EXIT WHEN scanned>16;
 -- A PL/pgSQL FOR cursor prefetches and can lock the whole candidate batch.
 -- SELECT INTO ... LIMIT 1 locks only the job this claimant will examine.
 SELECT * INTO job FROM public.field_photo_background_jobs
 WHERE state IN ('pending','retry_wait','running') AND next_attempt_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp())
 ORDER BY next_attempt_at,upload_id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF job.upload_id IS NULL THEN RETURN NULL; END IF;
 IF job.attempts>=5 THEN UPDATE public.field_photo_background_jobs SET state='failed',lease_id=NULL,lease_until=NULL,last_error='processing_failed',updated_at=clock_timestamp() WHERE upload_id=job.upload_id; CONTINUE; END IF;
 SELECT * INTO intent FROM public.field_photo_uploads WHERE id=job.upload_id;
 BEGIN
 PERFORM private.lock_field_photo_actor(intent.project_id,intent.created_by);
 PERFORM private.lock_field_photo_object(intent.id);
 EXCEPTION WHEN insufficient_privilege THEN
 UPDATE public.field_photo_background_jobs SET state='blocked',last_error='access_revoked',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE upload_id=job.upload_id; CONTINUE;
 WHEN check_violation OR no_data_found OR too_many_rows THEN
 UPDATE public.field_photo_background_jobs SET state='failed',last_error='source_changed',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE upload_id=job.upload_id; CONTINUE;
 END;
 SELECT * INTO receipt FROM public.field_photo_receipts WHERE upload_id=intent.id;
 IF receipt.status='hash_mismatch' THEN UPDATE public.field_photo_background_jobs SET state='failed',last_error='hash_mismatch',lease_id=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE upload_id=job.upload_id; CONTINUE; END IF;
 UPDATE public.field_photo_background_jobs SET state='running',stage=CASE WHEN receipt.upload_id IS NULL THEN 'verify' ELSE 'preview' END,
 attempts=CASE WHEN receipt.upload_id IS NOT NULL AND job.stage='verify' THEN 1 ELSE attempts+1 END,
 lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '180 seconds',last_error=NULL,updated_at=clock_timestamp() WHERE upload_id=job.upload_id RETURNING * INTO job;
 RETURN jsonb_build_object('upload',to_jsonb(intent),'job',to_jsonb(job),'receipt',CASE WHEN receipt.upload_id IS NULL THEN NULL ELSE to_jsonb(receipt) END);
 END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION public.advance_field_photo_background(p_upload_id uuid,p_lease_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.field_photo_background_jobs; intent public.field_photo_uploads; receipt public.field_photo_receipts;
BEGIN
 SELECT * INTO job FROM public.field_photo_background_jobs WHERE upload_id=p_upload_id FOR UPDATE;
 IF p_lease_id IS NULL OR job.lease_id IS DISTINCT FROM p_lease_id OR job.lease_until<clock_timestamp() THEN RAISE EXCEPTION 'Background lease expired' USING ERRCODE='40001'; END IF;
 intent:=private.lock_field_photo_object(p_upload_id); PERFORM private.lock_field_photo_actor(intent.project_id,intent.created_by);
 SELECT * INTO receipt FROM public.field_photo_receipts WHERE upload_id=p_upload_id;
 IF receipt.status IS DISTINCT FROM 'verified' THEN RAISE EXCEPTION 'Verified original required' USING ERRCODE='23514'; END IF;
 UPDATE public.field_photo_background_jobs SET stage='preview',state='pending',attempts=0,lease_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE upload_id=p_upload_id;
END $$;
CREATE FUNCTION public.fail_field_photo_background(p_upload_id uuid,p_lease_id uuid,p_error text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_error IS NULL OR p_error NOT IN ('processing_failed','unsupported_format','source_too_large','hash_mismatch','source_changed','access_revoked') THEN RAISE EXCEPTION 'Invalid background error' USING ERRCODE='22023'; END IF;
 UPDATE public.field_photo_background_jobs SET state=CASE WHEN p_error IN ('unsupported_format','source_too_large') THEN 'unsupported' WHEN p_error='access_revoked' THEN 'blocked' WHEN p_error IN ('hash_mismatch','source_changed') OR attempts>=5 THEN 'failed' ELSE 'retry_wait' END,
 next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,60*power(2,least(attempts,6))::integer)),lease_id=NULL,lease_until=NULL,last_error=p_error,updated_at=clock_timestamp()
 WHERE upload_id=p_upload_id AND lease_id=p_lease_id;
END $$;
CREATE FUNCTION public.prepare_field_photo_preview_commit(p_upload_id uuid,p_lease_id uuid,p_sha256 text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.field_photo_background_jobs; intent public.field_photo_uploads; obj storage.objects; path text;
BEGIN
 SELECT * INTO job FROM public.field_photo_background_jobs WHERE upload_id=p_upload_id FOR SHARE;
 IF p_lease_id IS NULL OR job.lease_id IS DISTINCT FROM p_lease_id OR job.stage<>'preview' OR job.lease_until<clock_timestamp() THEN RAISE EXCEPTION 'Background lease expired' USING ERRCODE='40001'; END IF;
 intent:=private.lock_field_photo_object(p_upload_id); PERFORM private.lock_field_photo_actor(intent.project_id,intent.created_by);
 IF p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid preview checksum' USING ERRCODE='22023'; END IF;
 path:=intent.project_id::text||'/field-previews/'||p_upload_id::text||'/preview-jpeg1536-v1/'||p_sha256||'.jpg';
 SELECT * INTO STRICT obj FROM storage.objects o WHERE bucket_id='field-photo-previews' AND name=path AND to_jsonb(o)->>'archived_at' IS NULL AND NOT coalesce((to_jsonb(o)->>'is_delete_marker')::boolean,false) FOR SHARE;
 RETURN jsonb_build_object('object_id',obj.id,'object_version',to_jsonb(obj)->>'version','object_updated_at',obj.updated_at,'storage_path',path);
END $$;
CREATE FUNCTION public.complete_field_photo_preview(p_upload_id uuid,p_lease_id uuid,p_sha256 text,p_size_bytes integer,p_width integer,p_height integer,p_object_id uuid,p_object_version text,p_object_updated_at timestamptz)
RETURNS SETOF public.field_photo_previews LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job public.field_photo_background_jobs; intent public.field_photo_uploads; receipt public.field_photo_receipts; preview public.field_photo_previews; obj storage.objects; path text;
BEGIN
 SELECT * INTO job FROM public.field_photo_background_jobs WHERE upload_id=p_upload_id FOR UPDATE;
 intent:=private.lock_field_photo_object(p_upload_id); PERFORM private.lock_field_photo_actor(intent.project_id,intent.created_by);
 SELECT * INTO receipt FROM public.field_photo_receipts WHERE upload_id=p_upload_id;
 IF receipt.status IS DISTINCT FROM 'verified' THEN RAISE EXCEPTION 'Verified original required' USING ERRCODE='23514'; END IF;
 SELECT * INTO preview FROM public.field_photo_previews WHERE upload_id=p_upload_id;
 IF preview.upload_id IS NOT NULL THEN
 IF preview.sha256 IS DISTINCT FROM p_sha256 OR preview.width IS DISTINCT FROM p_width OR preview.height IS DISTINCT FROM p_height OR preview.size_bytes IS DISTINCT FROM p_size_bytes THEN RAISE EXCEPTION 'Preview conflict' USING ERRCODE='23514'; END IF;
 RETURN NEXT preview; RETURN; END IF;
 IF p_lease_id IS NULL OR job.stage<>'preview' OR job.lease_id IS DISTINCT FROM p_lease_id OR job.lease_until<clock_timestamp() THEN RAISE EXCEPTION 'Background lease expired' USING ERRCODE='40001'; END IF;
 IF p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 2097152 OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 1536 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 1536 THEN RAISE EXCEPTION 'Invalid preview' USING ERRCODE='22023'; END IF;
 path:=intent.project_id::text||'/field-previews/'||p_upload_id::text||'/preview-jpeg1536-v1/'||p_sha256||'.jpg';
 SELECT * INTO STRICT obj FROM storage.objects o WHERE bucket_id='field-photo-previews' AND name=path AND to_jsonb(o)->>'archived_at' IS NULL AND NOT coalesce((to_jsonb(o)->>'is_delete_marker')::boolean,false) FOR SHARE;
 IF obj.id IS DISTINCT FROM p_object_id OR (to_jsonb(obj)->>'version') IS DISTINCT FROM p_object_version OR obj.updated_at IS DISTINCT FROM p_object_updated_at OR (obj.metadata->>'size')::bigint IS DISTINCT FROM p_size_bytes::bigint OR obj.metadata->>'mimetype' IS DISTINCT FROM 'image/jpeg' THEN RAISE EXCEPTION 'Preview storage mismatch' USING ERRCODE='23514'; END IF;
 INSERT INTO public.field_photo_previews(upload_id,project_id,recipe,source_sha256,sha256,size_bytes,width,height,storage_path,object_id,object_version,object_updated_at,created_by)
 VALUES(p_upload_id,intent.project_id,'preview-jpeg1536-v1',receipt.sha256,p_sha256,p_size_bytes,p_width,p_height,path,obj.id,to_jsonb(obj)->>'version',obj.updated_at,intent.created_by) RETURNING * INTO preview;
 UPDATE public.field_photo_background_jobs SET stage='done',state='ready',lease_id=NULL,lease_until=NULL,last_error=NULL,updated_at=clock_timestamp() WHERE upload_id=p_upload_id;
 RETURN NEXT preview;
END $$;
REVOKE ALL ON FUNCTION public.claim_field_photo_background(),public.advance_field_photo_background(uuid,uuid),public.fail_field_photo_background(uuid,uuid,text),public.prepare_field_photo_preview_commit(uuid,uuid,text),public.complete_field_photo_preview(uuid,uuid,text,integer,integer,integer,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_field_photo_background(),public.advance_field_photo_background(uuid,uuid),public.fail_field_photo_background(uuid,uuid,text),public.prepare_field_photo_preview_commit(uuid,uuid,text),public.complete_field_photo_preview(uuid,uuid,text,integer,integer,integer,uuid,text,timestamptz) TO service_role;
