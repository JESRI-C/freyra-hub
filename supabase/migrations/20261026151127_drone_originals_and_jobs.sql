-- New originals only; no existing files, URLs or customer records are rewritten.
ALTER TABLE public.project_media
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS flight_id uuid REFERENCES public.drone_flights(id),
  ADD COLUMN IF NOT EXISTS upload_scope text NOT NULL DEFAULT 'field',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS project_media_checksum_scope ON public.project_media(project_id, upload_scope, sha256) WHERE sha256 IS NOT NULL;

-- Existing permissive legacy policies must not permit cross-organisation reads/writes.
REVOKE ALL ON public.project_media FROM anon;
DROP POLICY IF EXISTS "Media project boundary" ON public.project_media;
CREATE POLICY "Media project boundary" ON public.project_media AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_memberships m ON m.organization_id = p.organization_id WHERE p.id = project_media.project_id::uuid AND m.user_id = auth.uid()) OR public.is_project_member(project_id::uuid, auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_memberships m ON m.organization_id = p.organization_id WHERE p.id = project_media.project_id::uuid AND m.user_id = auth.uid()) OR public.is_project_member(project_id::uuid, auth.uid()));

DROP POLICY IF EXISTS "Keep original records" ON public.project_media;
CREATE POLICY "Keep original records" ON public.project_media AS RESTRICTIVE FOR DELETE TO authenticated USING (sha256 IS NULL);

DROP POLICY IF EXISTS "Organisation flight access" ON public.drone_flights;
CREATE POLICY "Organisation flight access" ON public.drone_flights FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_memberships m ON m.organization_id = p.organization_id WHERE p.id = drone_flights.project_id AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_memberships m ON m.organization_id = p.organization_id WHERE p.id = drone_flights.project_id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_original_flight() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.flight_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.drone_flights f WHERE f.id = NEW.flight_id AND f.project_id = NEW.project_id::uuid) THEN
    RAISE EXCEPTION 'Flight does not belong to authorized project';
  END IF;
  IF NEW.sha256 IS NOT NULL AND (NEW.storage_bucket IS DISTINCT FROM 'project-originals' OR NEW.file_path IS DISTINCT FROM NEW.project_id::text || '/' || NEW.upload_scope || '/' || NEW.sha256 OR NEW.upload_scope IS DISTINCT FROM coalesce(NEW.flight_id::text, 'field')) THEN
    RAISE EXCEPTION 'Invalid immutable original path';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sha256 IS NOT NULL AND (NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.flight_id IS DISTINCT FROM OLD.flight_id OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket) THEN
    RAISE EXCEPTION 'Original identity is immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_original_flight ON public.project_media;
CREATE TRIGGER validate_original_flight BEFORE INSERT OR UPDATE ON public.project_media FOR EACH ROW EXECUTE FUNCTION public.validate_original_flight();

INSERT INTO storage.buckets(id, name, public, file_size_limit) VALUES ('project-originals', 'project-originals', false, 209715200) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Private original read" ON storage.objects;
CREATE POLICY "Private original read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'project-originals' AND EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_memberships m ON m.organization_id = p.organization_id WHERE p.id::text = (storage.foldername(storage.objects.name))[1] AND m.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Private original insert" ON storage.objects;
CREATE POLICY "Private original insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'project-originals' AND EXISTS (SELECT 1 FROM public.projects p JOIN public.organization_memberships m ON m.organization_id = p.organization_id WHERE p.id::text = (storage.foldername(storage.objects.name))[1] AND m.user_id = auth.uid())
);
-- No UPDATE/DELETE policy for originals. Retries never overwrite source bytes.

CREATE TABLE IF NOT EXISTS public.drone_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  flight_id uuid NOT NULL REFERENCES public.drone_flights(id),
  input_version text NOT NULL CHECK(input_version ~ '^[a-f0-9]{64}$'),
  input_manifest jsonb NOT NULL,
  status text NOT NULL DEFAULT 'blocked' CHECK(status IN ('blocked','queued','running','failed','completed')),
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  provider_job_id text,
  error text,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flight_id, input_version)
);
ALTER TABLE public.drone_processing_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.drone_processing_jobs TO authenticated;
GRANT ALL ON public.drone_processing_jobs TO service_role;
DROP POLICY IF EXISTS "Project job read" ON public.drone_processing_jobs;
CREATE POLICY "Project job read" ON public.drone_processing_jobs FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.drone_flights f WHERE f.id = flight_id AND f.project_id = drone_processing_jobs.project_id)
);
DROP POLICY IF EXISTS "Project job request" ON public.drone_processing_jobs;
CREATE POLICY "Project job request" ON public.drone_processing_jobs FOR INSERT TO authenticated WITH CHECK (
  status = 'blocked' AND progress = 0 AND provider_job_id IS NULL AND outputs = '[]'::jsonb AND
  EXISTS(SELECT 1 FROM public.drone_flights f WHERE f.id = flight_id AND f.project_id = drone_processing_jobs.project_id)
);
-- Only a separately configured authorized server worker can update job status/output.
