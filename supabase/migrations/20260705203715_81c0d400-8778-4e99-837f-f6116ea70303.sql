
ALTER TABLE public.project_media
  ADD COLUMN IF NOT EXISTS action_id uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction numeric,
  ADD COLUMN IF NOT EXISTS before_media_id uuid REFERENCES public.project_media(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_media_action ON public.project_media(action_id);
CREATE INDEX IF NOT EXISTS idx_project_media_document ON public.project_media(document_id);
CREATE INDEX IF NOT EXISTS idx_project_media_before ON public.project_media(before_media_id);
