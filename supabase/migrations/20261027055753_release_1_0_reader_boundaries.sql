-- Release 1.0: existing role helpers are authoritative. Membership never grants write access.
-- Restrictive policies also constrain older permissive policies already on staging.
-- No engine, customer rows, grants to anon, or original bytes are changed.

ALTER TABLE public.report_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.report_documents;
CREATE POLICY release_read_scope ON public.report_documents AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project(project_id));
DROP POLICY IF EXISTS release_insert_role ON public.report_documents;
CREATE POLICY release_insert_role ON public.report_documents AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_update_role ON public.report_documents;
CREATE POLICY release_update_role ON public.report_documents AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write_project(project_id)) WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_delete_role ON public.report_documents;
CREATE POLICY release_delete_role ON public.report_documents AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write_project(project_id));
REVOKE ALL ON public.report_documents FROM anon;

ALTER TABLE public.report_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.report_revisions;
CREATE POLICY release_read_scope ON public.report_revisions AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project((select d.project_id from public.report_documents d where d.id = report_id)));
DROP POLICY IF EXISTS release_insert_role ON public.report_revisions;
CREATE POLICY release_insert_role ON public.report_revisions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_write_project((select d.project_id from public.report_documents d where d.id = report_id)));
DROP POLICY IF EXISTS release_update_role ON public.report_revisions;
CREATE POLICY release_update_role ON public.report_revisions AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write_project((select d.project_id from public.report_documents d where d.id = report_id))) WITH CHECK (private.can_write_project((select d.project_id from public.report_documents d where d.id = report_id)));
DROP POLICY IF EXISTS release_delete_role ON public.report_revisions;
CREATE POLICY release_delete_role ON public.report_revisions AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write_project((select d.project_id from public.report_documents d where d.id = report_id)));
REVOKE ALL ON public.report_revisions FROM anon;

ALTER TABLE public.watercourse_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.watercourse_versions;
CREATE POLICY release_read_scope ON public.watercourse_versions AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project(project_id));
DROP POLICY IF EXISTS release_insert_role ON public.watercourse_versions;
CREATE POLICY release_insert_role ON public.watercourse_versions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_update_role ON public.watercourse_versions;
CREATE POLICY release_update_role ON public.watercourse_versions AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write_project(project_id)) WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_delete_role ON public.watercourse_versions;
CREATE POLICY release_delete_role ON public.watercourse_versions AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write_project(project_id));
REVOKE ALL ON public.watercourse_versions FROM anon;

ALTER TABLE public.watercourse_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.watercourse_observations;
CREATE POLICY release_read_scope ON public.watercourse_observations AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project(project_id));
DROP POLICY IF EXISTS release_insert_role ON public.watercourse_observations;
CREATE POLICY release_insert_role ON public.watercourse_observations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_update_role ON public.watercourse_observations;
CREATE POLICY release_update_role ON public.watercourse_observations AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write_project(project_id)) WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_delete_role ON public.watercourse_observations;
CREATE POLICY release_delete_role ON public.watercourse_observations AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write_project(project_id));
REVOKE ALL ON public.watercourse_observations FROM anon;

ALTER TABLE public.watercourse_observation_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.watercourse_observation_reviews;
CREATE POLICY release_read_scope ON public.watercourse_observation_reviews AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project((select o.project_id from public.watercourse_observations o where o.id = observation_id)));
DROP POLICY IF EXISTS release_insert_role ON public.watercourse_observation_reviews;
CREATE POLICY release_insert_role ON public.watercourse_observation_reviews AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_write_project((select o.project_id from public.watercourse_observations o where o.id = observation_id)));
DROP POLICY IF EXISTS release_update_role ON public.watercourse_observation_reviews;
CREATE POLICY release_update_role ON public.watercourse_observation_reviews AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write_project((select o.project_id from public.watercourse_observations o where o.id = observation_id))) WITH CHECK (private.can_write_project((select o.project_id from public.watercourse_observations o where o.id = observation_id)));
DROP POLICY IF EXISTS release_delete_role ON public.watercourse_observation_reviews;
CREATE POLICY release_delete_role ON public.watercourse_observation_reviews AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write_project((select o.project_id from public.watercourse_observations o where o.id = observation_id)));
REVOKE ALL ON public.watercourse_observation_reviews FROM anon;

ALTER TABLE public.project_workspace_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.project_workspace_entries;
CREATE POLICY release_read_scope ON public.project_workspace_entries AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project(project_id));
DROP POLICY IF EXISTS release_insert_role ON public.project_workspace_entries;
CREATE POLICY release_insert_role ON public.project_workspace_entries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_update_role ON public.project_workspace_entries;
CREATE POLICY release_update_role ON public.project_workspace_entries AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write_project(project_id)) WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_delete_role ON public.project_workspace_entries;
CREATE POLICY release_delete_role ON public.project_workspace_entries AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write_project(project_id));
REVOKE ALL ON public.project_workspace_entries FROM anon;

ALTER TABLE public.drone_processing_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.drone_processing_jobs;
CREATE POLICY release_read_scope ON public.drone_processing_jobs AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project(project_id));
DROP POLICY IF EXISTS release_insert_role ON public.drone_processing_jobs;
CREATE POLICY release_insert_role ON public.drone_processing_jobs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_update_role ON public.drone_processing_jobs;
CREATE POLICY release_update_role ON public.drone_processing_jobs AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_write_project(project_id)) WITH CHECK (private.can_write_project(project_id));
DROP POLICY IF EXISTS release_delete_role ON public.drone_processing_jobs;
CREATE POLICY release_delete_role ON public.drone_processing_jobs AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_write_project(project_id));
REVOKE ALL ON public.drone_processing_jobs FROM anon;

ALTER TABLE public.drone_flights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.drone_flights;
CREATE POLICY release_read_scope ON public.drone_flights AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project(project_id));
DROP POLICY IF EXISTS release_insert_role ON public.drone_flights;
CREATE POLICY release_insert_role ON public.drone_flights AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_contribute_project(project_id));
DROP POLICY IF EXISTS release_update_role ON public.drone_flights;
CREATE POLICY release_update_role ON public.drone_flights AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_contribute_project(project_id)) WITH CHECK (private.can_contribute_project(project_id));
DROP POLICY IF EXISTS release_delete_role ON public.drone_flights;
CREATE POLICY release_delete_role ON public.drone_flights AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_contribute_project(project_id));
REVOKE ALL ON public.drone_flights FROM anon;

ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS release_read_scope ON public.project_media;
CREATE POLICY release_read_scope ON public.project_media AS RESTRICTIVE FOR SELECT TO authenticated USING (private.can_read_project(project_id::uuid));
DROP POLICY IF EXISTS release_insert_role ON public.project_media;
CREATE POLICY release_insert_role ON public.project_media AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.can_contribute_project(project_id::uuid));
DROP POLICY IF EXISTS release_update_role ON public.project_media;
CREATE POLICY release_update_role ON public.project_media AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.can_contribute_project(project_id::uuid)) WITH CHECK (private.can_contribute_project(project_id::uuid));
DROP POLICY IF EXISTS release_delete_role ON public.project_media;
CREATE POLICY release_delete_role ON public.project_media AS RESTRICTIVE FOR DELETE TO authenticated USING (private.can_contribute_project(project_id::uuid));
REVOKE ALL ON public.project_media FROM anon;

-- Safe parser for the immutable three-part original path. Cast only validated UUIDs.
CREATE OR REPLACE FUNCTION private.originals_project_id(_name text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN _name ~ '^[a-f0-9-]{36}/(field|[a-f0-9-]{36})/[a-f0-9]{64}$'
 AND split_part(_name,'/',1) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 THEN split_part(_name,'/',1)::uuid ELSE NULL END
$$;
REVOKE ALL ON FUNCTION private.originals_project_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.originals_project_id(text) TO authenticated,service_role;
DROP POLICY IF EXISTS "Private original read" ON storage.objects;
CREATE POLICY "Private original read" ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='project-originals' AND private.can_read_project(private.originals_project_id(name)));
DROP POLICY IF EXISTS "Private original insert" ON storage.objects;
CREATE POLICY "Private original insert" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='project-originals' AND private.can_contribute_project(private.originals_project_id(name)));
-- This bucket is append-only, even if unrelated bucket policies broaden later.
DROP POLICY IF EXISTS release_original_insert_guard ON storage.objects;
CREATE POLICY release_original_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'project-originals' OR private.can_contribute_project(private.originals_project_id(name)));
DROP POLICY IF EXISTS release_original_read_guard ON storage.objects;
CREATE POLICY release_original_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'project-originals' OR private.can_read_project(private.originals_project_id(name)));
DROP POLICY IF EXISTS release_original_no_update ON storage.objects;
CREATE POLICY release_original_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'project-originals') WITH CHECK(bucket_id<>'project-originals');
DROP POLICY IF EXISTS release_original_no_delete ON storage.objects;
CREATE POLICY release_original_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'project-originals');
-- A pre-existing bucket may have been configured public: enforce private rather than DO NOTHING.
UPDATE storage.buckets SET public=false WHERE id='project-originals';
