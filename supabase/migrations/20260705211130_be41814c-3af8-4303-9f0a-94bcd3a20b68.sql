-- Fase C — integrations, drone, analyses, exports, alerts
CREATE TABLE public.integration_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  credential_ref TEXT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view integrations" ON public.integration_connections FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members insert integrations" ON public.integration_connections FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members update integrations" ON public.integration_connections FOR UPDATE TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members delete integrations" ON public.integration_connections FOR DELETE TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_integration_connections_project ON public.integration_connections(project_id);
CREATE TRIGGER update_integration_connections_updated_at BEFORE UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.drone_flights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES public.monitoring_zones(id) ON DELETE SET NULL,
  flown_at TIMESTAMPTZ NOT NULL,
  pilot_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  drone_model TEXT,
  purpose TEXT,
  altitude_m NUMERIC(6,2),
  duration_minutes INTEGER,
  area_hectares NUMERIC(10,2),
  weather_conditions TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  flight_path JSONB,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drone_flights TO authenticated;
GRANT ALL ON public.drone_flights TO service_role;
ALTER TABLE public.drone_flights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view drone flights" ON public.drone_flights FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members insert drone flights" ON public.drone_flights FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members update drone flights" ON public.drone_flights FOR UPDATE TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members delete drone flights" ON public.drone_flights FOR DELETE TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_drone_flights_project_time ON public.drone_flights(project_id, flown_at DESC);
CREATE TRIGGER update_drone_flights_updated_at BEFORE UPDATE ON public.drone_flights FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.drone_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flight_id UUID NOT NULL REFERENCES public.drone_flights(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  captured_at TIMESTAMPTZ,
  bbox JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drone_assets TO authenticated;
GRANT ALL ON public.drone_assets TO service_role;
ALTER TABLE public.drone_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view drone assets" ON public.drone_assets FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.drone_flights f WHERE f.id = drone_assets.flight_id AND public.is_project_member(f.project_id, auth.uid())));
CREATE POLICY "Members write drone assets" ON public.drone_assets FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.drone_flights f WHERE f.id = drone_assets.flight_id AND public.is_project_member(f.project_id, auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.drone_flights f WHERE f.id = drone_assets.flight_id AND public.is_project_member(f.project_id, auth.uid())));
CREATE INDEX idx_drone_assets_flight ON public.drone_assets(flight_id);

CREATE TABLE public.environmental_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES public.monitoring_zones(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  observed_at TIMESTAMPTZ,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'ready',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.environmental_analyses TO authenticated;
GRANT ALL ON public.environmental_analyses TO service_role;
ALTER TABLE public.environmental_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view analyses" ON public.environmental_analyses FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members insert analyses" ON public.environmental_analyses FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members update analyses" ON public.environmental_analyses FOR UPDATE TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members delete analyses" ON public.environmental_analyses FOR DELETE TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_env_analyses_project_time ON public.environmental_analyses(project_id, analyzed_at DESC);
CREATE INDEX idx_env_analyses_type ON public.environmental_analyses(project_id, analysis_type);
CREATE TRIGGER update_env_analyses_updated_at BEFORE UPDATE ON public.environmental_analyses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.data_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  row_count INTEGER,
  file_path TEXT,
  file_size_bytes BIGINT,
  error_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_exports TO authenticated;
GRANT ALL ON public.data_exports TO service_role;
ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view exports" ON public.data_exports FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members insert exports" ON public.data_exports FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members update exports" ON public.data_exports FOR UPDATE TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members delete exports" ON public.data_exports FOR DELETE TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_data_exports_project_time ON public.data_exports(project_id, requested_at DESC);

CREATE TABLE public.monitoring_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.monitoring_devices(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES public.monitoring_zones(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_alerts TO authenticated;
GRANT ALL ON public.monitoring_alerts TO service_role;
ALTER TABLE public.monitoring_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view alerts" ON public.monitoring_alerts FOR SELECT TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members insert alerts" ON public.monitoring_alerts FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members update alerts" ON public.monitoring_alerts FOR UPDATE TO authenticated USING (public.is_project_member(project_id, auth.uid())) WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members delete alerts" ON public.monitoring_alerts FOR DELETE TO authenticated USING (public.is_project_member(project_id, auth.uid()));
CREATE INDEX idx_alerts_project_time ON public.monitoring_alerts(project_id, triggered_at DESC);
CREATE INDEX idx_alerts_status ON public.monitoring_alerts(project_id, status);
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON public.monitoring_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();