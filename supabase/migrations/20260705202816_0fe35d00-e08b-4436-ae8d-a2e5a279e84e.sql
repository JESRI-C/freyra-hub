
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS linked_indicator_id uuid REFERENCES public.indicators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_impact text,
  ADD COLUMN IF NOT EXISTS actual_impact text,
  ADD COLUMN IF NOT EXISTS requires_evidence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.action_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  media_id uuid REFERENCES public.project_media(id) ON DELETE SET NULL,
  evidence_file_id uuid REFERENCES public.evidence_files(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_evidence_action_idx ON public.action_evidence (action_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_evidence TO authenticated;
GRANT SELECT ON public.action_evidence TO anon;
GRANT ALL ON public.action_evidence TO service_role;

ALTER TABLE public.action_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view action evidence"
  ON public.action_evidence FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert action evidence"
  ON public.action_evidence FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update action evidence"
  ON public.action_evidence FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete action evidence"
  ON public.action_evidence FOR DELETE TO authenticated USING (true);
