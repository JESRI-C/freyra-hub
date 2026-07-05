-- Fase B — field observations, media, integration runs, quality assessments
CREATE TABLE public.integration_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_runs TO authenticated;
GRANT ALL ON public.integration_runs TO service_role;
ALTER TABLE public.integration_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view integration runs" ON public.integration_runs FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members write integration runs" ON public.integration_runs FOR ALL TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_integration_runs_source_time ON public.integration_runs(data_source_id, started_at DESC);
CREATE INDEX idx_integration_runs_project_time ON public.integration_runs(project_id, started_at DESC);

CREATE TABLE public.field_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES public.monitoring_zones(id) ON DELETE SET NULL,
  observation_type TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  observer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  species_name TEXT,
  species_confidence NUMERIC(5,2),
  count_value INTEGER,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  notes TEXT,
  visibility TEXT NOT NULL DEFAULT 'precise',
  status TEXT NOT NULL DEFAULT 'draft',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_observations TO authenticated;
GRANT ALL ON public.field_observations TO service_role;
ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view observations" ON public.field_observations FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members insert observations" ON public.field_observations FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members update observations" ON public.field_observations FOR UPDATE TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members delete observations" ON public.field_observations FOR DELETE TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_field_observations_project_time ON public.field_observations(project_id, observed_at DESC);
CREATE INDEX idx_field_observations_zone ON public.field_observations(zone_id);
CREATE INDEX idx_field_observations_type ON public.field_observations(project_id, observation_type);
CREATE TRIGGER update_field_observations_updated_at BEFORE UPDATE ON public.field_observations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.observation_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  observation_id UUID NOT NULL REFERENCES public.field_observations(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  exif_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.observation_media TO authenticated;
GRANT ALL ON public.observation_media TO service_role;
ALTER TABLE public.observation_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view observation media" ON public.observation_media FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.field_observations o WHERE o.id = observation_media.observation_id AND public.is_project_member(o.project_id, auth.uid())));
CREATE POLICY "Members write observation media" ON public.observation_media FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.field_observations o WHERE o.id = observation_media.observation_id AND public.is_project_member(o.project_id, auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.field_observations o WHERE o.id = observation_media.observation_id AND public.is_project_member(o.project_id, auth.uid())));
CREATE INDEX idx_observation_media_obs ON public.observation_media(observation_id);

CREATE TABLE public.data_quality_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_id UUID,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completeness_score NUMERIC(5,2),
  timeliness_score NUMERIC(5,2),
  consistency_score NUMERIC(5,2),
  validation_score NUMERIC(5,2),
  spatial_score NUMERIC(5,2),
  temporal_score NUMERIC(5,2),
  overall_score NUMERIC(5,2),
  explanation TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_quality_assessments TO authenticated;
GRANT ALL ON public.data_quality_assessments TO service_role;
ALTER TABLE public.data_quality_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view quality assessments" ON public.data_quality_assessments FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members write quality assessments" ON public.data_quality_assessments FOR ALL TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_dqa_project_time ON public.data_quality_assessments(project_id, assessed_at DESC);
CREATE INDEX idx_dqa_scope ON public.data_quality_assessments(scope_type, scope_id);