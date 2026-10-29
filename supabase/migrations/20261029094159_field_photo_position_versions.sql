-- Field-photo coordinates are declarations, not independently verified GPS.
CREATE TABLE public.field_photo_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0), radius_m integer NOT NULL CHECK(radius_m BETWEEN 0 AND 10000),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000), request_id uuid NOT NULL,
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,version), UNIQUE(project_id,request_id)
);
CREATE TABLE public.field_photo_position_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), media_id uuid NOT NULL REFERENCES public.project_media(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT, organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0), lat double precision NOT NULL CHECK(lat BETWEEN -90 AND 90), lng double precision NOT NULL CHECK(lng BETWEEN -180 AND 180),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000), request_id uuid NOT NULL,
 policy_version integer NOT NULL, radius_m integer NOT NULL, distance_m double precision,
 status text NOT NULL CHECK(status IN ('within_limit','needs_review','manual_unverified')),
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(media_id,version), UNIQUE(project_id,request_id)
);
CREATE INDEX field_photo_position_project ON public.field_photo_position_versions(project_id,media_id,version DESC);
ALTER TABLE public.field_photo_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_photo_position_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_photo_policy_versions,public.field_photo_position_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.field_photo_policy_versions,public.field_photo_position_versions TO authenticated;
GRANT SELECT ON public.field_photo_policy_versions,public.field_photo_position_versions TO service_role;
CREATE POLICY field_photo_policy_read ON public.field_photo_policy_versions FOR SELECT TO authenticated USING(private.can_read_project(project_id));
CREATE POLICY field_photo_policy_write ON public.field_photo_policy_versions FOR INSERT TO authenticated WITH CHECK(private.can_write_project(project_id) AND created_by=auth.uid());
CREATE POLICY field_photo_position_read ON public.field_photo_position_versions FOR SELECT TO authenticated USING(private.can_read_project(project_id));
CREATE POLICY field_photo_position_write ON public.field_photo_position_versions FOR INSERT TO authenticated WITH CHECK(private.can_contribute_project(project_id) AND created_by=auth.uid());

CREATE FUNCTION private.field_photo_point_valid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (jsonb_typeof(p)='object' AND (p-ARRAY['lat','lng'])='{}'::jsonb
 AND jsonb_typeof(p->'lat')='number' AND jsonb_typeof(p->'lng')='number'
 AND (p->>'lat')::numeric BETWEEN -90 AND 90 AND (p->>'lng')::numeric BETWEEN -180 AND 180) IS TRUE
$$;
CREATE FUNCTION private.field_photo_distance(a jsonb,b jsonb) RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT 12742017.6 * asin(sqrt(least(1.0,greatest(0.0,
 power(sin(radians(((b->>'lat')::double precision-(a->>'lat')::double precision)/2)),2)
 +cos(radians((a->>'lat')::double precision))*cos(radians((b->>'lat')::double precision))
 *power(sin(radians(((b->>'lng')::double precision-(a->>'lng')::double precision)/2)),2)))))
$$;
REVOKE ALL ON FUNCTION private.field_photo_point_valid(jsonb),private.field_photo_distance(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.field_photo_point_valid(jsonb),private.field_photo_distance(jsonb,jsonb) TO authenticated,service_role;

CREATE FUNCTION private.validate_field_photo_policy() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE latest integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Photo policy history is immutable' USING ERRCODE='23514'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_write_project(NEW.project_id)
 OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND organization_id=NEW.organization_id) THEN
 RAISE EXCEPTION 'Photo policy access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-policy:'||NEW.project_id::text,0));
 SELECT max(version) INTO latest FROM public.field_photo_policy_versions WHERE project_id=NEW.project_id;
 IF NEW.version<>coalesce(latest,0)+1 THEN RAISE EXCEPTION 'Photo policy conflict' USING ERRCODE='40001'; END IF;
 NEW.created_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER field_photo_policy_validate BEFORE INSERT OR UPDATE OR DELETE ON public.field_photo_policy_versions FOR EACH ROW EXECUTE FUNCTION private.validate_field_photo_policy();

CREATE FUNCTION private.validate_field_photo_position() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE photo public.project_media; policy public.field_photo_policy_versions; latest integer; original jsonb; point jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Photo position history is immutable' USING ERRCODE='23514'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_contribute_project(NEW.project_id) THEN
 RAISE EXCEPTION 'Photo position access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO photo FROM public.project_media WHERE id=NEW.media_id AND project_id=NEW.project_id;
 IF photo.id IS NULL OR photo.metadata #>> '{field_photo_capture,schema}' IS DISTINCT FROM 'freyra.field-photo/v1'
 OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND organization_id=NEW.organization_id) THEN
 RAISE EXCEPTION 'Photo original is not available in project' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-policy:'||NEW.project_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-position:'||NEW.media_id::text,0));
 SELECT max(version) INTO latest FROM public.field_photo_position_versions WHERE media_id=NEW.media_id;
 IF NEW.version<>coalesce(latest,0)+1 THEN RAISE EXCEPTION 'Photo position conflict' USING ERRCODE='40001'; END IF;
 SELECT * INTO policy FROM public.field_photo_policy_versions WHERE project_id=NEW.project_id ORDER BY version DESC LIMIT 1;
 NEW.policy_version:=coalesce(policy.version,0); NEW.radius_m:=coalesce(policy.radius_m,50);
 original:=photo.metadata #> '{field_photo_capture,originalPosition}'; point:=jsonb_build_object('lat',NEW.lat,'lng',NEW.lng);
 IF NOT private.field_photo_point_valid(point) THEN RAISE EXCEPTION 'Invalid photo point' USING ERRCODE='22023'; END IF;
 IF original IS NULL OR original='null'::jsonb THEN NEW.distance_m:=NULL; NEW.status:='manual_unverified';
 ELSE NEW.distance_m:=private.field_photo_distance(original,point); NEW.status:=CASE WHEN NEW.distance_m>NEW.radius_m THEN 'needs_review' ELSE 'within_limit' END; END IF;
 NEW.created_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER field_photo_position_validate BEFORE INSERT OR UPDATE OR DELETE ON public.field_photo_position_versions FOR EACH ROW EXECUTE FUNCTION private.validate_field_photo_position();
REVOKE ALL ON FUNCTION private.validate_field_photo_policy(),private.validate_field_photo_position() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_field_photo_policy(p_project_id uuid,p_organization_id uuid,p_radius_m integer,p_reason text,p_expected_version integer,p_request_id uuid)
RETURNS SETOF public.field_photo_policy_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.field_photo_policy_versions; latest integer;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_write_project(p_project_id) OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND organization_id=p_organization_id) THEN RAISE EXCEPTION 'Photo policy access denied' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid photo request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-policy:'||p_project_id::text,0));
 SELECT * INTO saved FROM public.field_photo_policy_versions WHERE project_id=p_project_id AND request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
 IF saved.created_by IS DISTINCT FROM auth.uid() OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.radius_m IS DISTINCT FROM p_radius_m OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Photo policy request mismatch' USING ERRCODE='22023'; END IF;
 RETURN NEXT saved; RETURN; END IF;
 SELECT max(version) INTO latest FROM public.field_photo_policy_versions WHERE project_id=p_project_id;
 IF coalesce(latest,0)<>p_expected_version THEN RAISE EXCEPTION 'Photo policy conflict' USING ERRCODE='40001'; END IF;
 INSERT INTO public.field_photo_policy_versions(project_id,organization_id,version,radius_m,reason,request_id) VALUES(p_project_id,p_organization_id,p_expected_version+1,p_radius_m,p_reason,p_request_id) RETURNING * INTO saved;
 RETURN NEXT saved;
END $$;
CREATE FUNCTION public.save_field_photo_position(p_project_id uuid,p_organization_id uuid,p_media_id uuid,p_lat double precision,p_lng double precision,p_reason text,p_expected_version integer,p_expected_policy_version integer,p_request_id uuid)
RETURNS SETOF public.field_photo_position_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.field_photo_position_versions; latest integer; policy integer;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_contribute_project(p_project_id) OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND organization_id=p_organization_id) THEN RAISE EXCEPTION 'Photo position access denied' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 OR p_expected_policy_version IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid photo request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-policy:'||p_project_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-position:'||p_media_id::text,0));
 SELECT * INTO saved FROM public.field_photo_position_versions WHERE project_id=p_project_id AND request_id=p_request_id;
 IF saved.id IS NOT NULL THEN
 IF saved.created_by IS DISTINCT FROM auth.uid() OR saved.organization_id IS DISTINCT FROM p_organization_id OR saved.media_id IS DISTINCT FROM p_media_id OR saved.version IS DISTINCT FROM p_expected_version+1 OR saved.policy_version IS DISTINCT FROM p_expected_policy_version OR saved.lat IS DISTINCT FROM p_lat OR saved.lng IS DISTINCT FROM p_lng OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Photo position request mismatch' USING ERRCODE='22023'; END IF;
 RETURN NEXT saved; RETURN; END IF;
 SELECT max(version) INTO policy FROM public.field_photo_policy_versions WHERE project_id=p_project_id;
 SELECT max(version) INTO latest FROM public.field_photo_position_versions WHERE media_id=p_media_id;
 IF coalesce(latest,0)<>p_expected_version OR coalesce(policy,0)<>p_expected_policy_version THEN RAISE EXCEPTION 'Photo position or policy conflict' USING ERRCODE='40001'; END IF;
 INSERT INTO public.field_photo_position_versions(media_id,project_id,organization_id,version,lat,lng,reason,request_id,policy_version,radius_m,status) VALUES(p_media_id,p_project_id,p_organization_id,p_expected_version+1,p_lat,p_lng,p_reason,p_request_id,0,50,'manual_unverified') RETURNING * INTO saved;
 RETURN NEXT saved;
END $$;
REVOKE ALL ON FUNCTION public.save_field_photo_policy(uuid,uuid,integer,text,integer,uuid),public.save_field_photo_position(uuid,uuid,uuid,double precision,double precision,text,integer,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_field_photo_policy(uuid,uuid,integer,text,integer,uuid),public.save_field_photo_position(uuid,uuid,uuid,double precision,double precision,text,integer,integer,uuid) TO authenticated;

-- Narrow trigger owns only capture normalisation, checks actor/scope explicitly.
CREATE FUNCTION private.capture_field_photo() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE capture jsonb; original jsonb; initial jsonb; object_row storage.objects;
BEGIN
 IF TG_OP<>'INSERT' THEN
 IF OLD.metadata #>> '{field_photo_capture,schema}'='freyra.field-photo/v1' THEN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Field photo original cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['title','description','tags','status','is_report_ready','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['title','description','tags','status','is_report_ready','updated_at']) THEN RAISE EXCEPTION 'Field photo original is immutable; use position history' USING ERRCODE='23514'; END IF;
 ELSIF TG_OP='UPDATE' AND NEW.metadata ? 'field_photo_capture' THEN RAISE EXCEPTION 'Historical capture provenance cannot be invented' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 capture:=NEW.metadata->'field_photo_capture';
 IF capture IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT private.can_contribute_project(NEW.project_id) THEN RAISE EXCEPTION 'Field photo access denied' USING ERRCODE='42501'; END IF;
 IF NEW.storage_bucket<>'project-media' OR NEW.source<>'field_upload' OR NEW.mime_type NOT LIKE 'image/%'
 OR capture->>'schema' IS DISTINCT FROM 'freyra.field-photo/v1' OR NEW.metadata->>'original_sha256' !~ '^[a-f0-9]{64}$' OR NEW.metadata->>'original_sha256' IS NULL
 OR NOT(capture ? 'originalPosition') OR NOT(capture ? 'initialPosition') THEN RAISE EXCEPTION 'Invalid field photo capture' USING ERRCODE='22023'; END IF;
 original:=capture->'originalPosition';initial:=capture->'initialPosition';
 IF (original<>'null'::jsonb AND NOT private.field_photo_point_valid(original)) OR (initial<>'null'::jsonb AND NOT private.field_photo_point_valid(initial)) THEN RAISE EXCEPTION 'Invalid original or observation point' USING ERRCODE='22023'; END IF;
 IF initial IS DISTINCT FROM original AND (jsonb_typeof(capture->'correctionReason') IS DISTINCT FROM 'string' OR length(btrim(capture->>'correctionReason')) NOT BETWEEN 1 AND 2000) THEN RAISE EXCEPTION 'A position correction needs a reason' USING ERRCODE='22023'; END IF;
 SELECT * INTO object_row FROM storage.objects WHERE bucket_id='project-media' AND name=NEW.file_path FOR SHARE;
 IF object_row.id IS NULL OR (object_row.metadata->>'size')::bigint IS DISTINCT FROM NEW.file_size_bytes THEN RAISE EXCEPTION 'Field original storage object missing or size mismatch' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('field-photo-policy:'||NEW.project_id::text,0));
 NEW.lat:=(original->>'lat')::double precision;NEW.lng:=(original->>'lng')::double precision;
 NEW.metadata:=jsonb_set(NEW.metadata,'{field_photo_capture}',capture||jsonb_build_object('receivedAt',now(),'actorId',auth.uid(),'storageObjectId',object_row.id,'hashStatus','uploader_declared'));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.capture_field_photo() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER field_photo_capture BEFORE INSERT OR UPDATE OR DELETE ON public.project_media FOR EACH ROW EXECUTE FUNCTION private.capture_field_photo();

CREATE FUNCTION private.initial_field_photo_position() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE capture jsonb; original jsonb; initial jsonb; org uuid;
BEGIN
 capture:=NEW.metadata->'field_photo_capture';
 IF capture->>'schema' IS DISTINCT FROM 'freyra.field-photo/v1' THEN RETURN NEW; END IF;
 original:=capture->'originalPosition';initial:=capture->'initialPosition';
 IF initial='null'::jsonb OR initial IS NOT DISTINCT FROM original THEN RETURN NEW; END IF;
 SELECT organization_id INTO org FROM public.projects WHERE id=NEW.project_id;
 INSERT INTO public.field_photo_position_versions(media_id,project_id,organization_id,version,lat,lng,reason,request_id,policy_version,radius_m,status) VALUES(NEW.id,NEW.project_id,org,1,(initial->>'lat')::double precision,(initial->>'lng')::double precision,capture->>'correctionReason',NEW.id,0,50,'manual_unverified');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.initial_field_photo_position() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER field_photo_initial_position AFTER INSERT ON public.project_media FOR EACH ROW EXECUTE FUNCTION private.initial_field_photo_position();

-- Storage policies protect both the recorded object ID and its original path.
CREATE FUNCTION private.is_field_photo_storage_reference(bucket text,path text,object_id uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM storage.objects WHERE id=object_id FOR UPDATE;
 RETURN EXISTS(SELECT 1 FROM public.project_media m WHERE m.metadata #>> '{field_photo_capture,schema}'='freyra.field-photo/v1' AND (m.metadata #>> '{field_photo_capture,storageObjectId}'=object_id::text OR (bucket='project-media' AND m.file_path=path)));
END $$;
REVOKE ALL ON FUNCTION private.is_field_photo_storage_reference(text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_field_photo_storage_reference(text,text,uuid) TO authenticated,service_role;
CREATE POLICY field_photo_original_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT private.is_field_photo_storage_reference(bucket_id,name,id)) WITH CHECK(NOT private.is_field_photo_storage_reference(bucket_id,name,id));
CREATE POLICY field_photo_original_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(NOT private.is_field_photo_storage_reference(bucket_id,name,id));
CREATE POLICY field_photo_original_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(NOT private.is_field_photo_storage_reference(bucket_id,name,id));
