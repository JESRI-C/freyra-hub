
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  action_id uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  title text NOT NULL,
  document_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  version int NOT NULL DEFAULT 1,
  generated_from text,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view documents" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update documents" ON public.documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete documents" ON public.documents FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_documents_project ON public.documents(project_id);
CREATE INDEX idx_documents_site ON public.documents(site_id);
CREATE INDEX idx_documents_action ON public.documents(action_id);
