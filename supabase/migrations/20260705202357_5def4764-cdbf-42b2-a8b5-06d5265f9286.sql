
ALTER TABLE public.indicators
  ADD COLUMN IF NOT EXISTS threshold_warning numeric,
  ADD COLUMN IF NOT EXISTS threshold_critical numeric,
  ADD COLUMN IF NOT EXISTS threshold_direction text NOT NULL DEFAULT 'above',
  ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS public.indicator_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES public.indicators(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  value numeric NOT NULL,
  unit text,
  source text,
  confidence_score numeric,
  method text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS indicator_measurements_indicator_time_idx
  ON public.indicator_measurements (indicator_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS indicator_measurements_project_idx
  ON public.indicator_measurements (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicator_measurements TO authenticated;
GRANT SELECT ON public.indicator_measurements TO anon;
GRANT ALL ON public.indicator_measurements TO service_role;

ALTER TABLE public.indicator_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view indicator measurements"
  ON public.indicator_measurements FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert indicator measurements"
  ON public.indicator_measurements FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update indicator measurements"
  ON public.indicator_measurements FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete indicator measurements"
  ON public.indicator_measurements FOR DELETE
  TO authenticated
  USING (true);
