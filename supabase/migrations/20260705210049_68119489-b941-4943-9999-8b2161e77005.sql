-- ─── 1. monitoring_devices ──────────────────────────────────────────────────
CREATE TABLE public.monitoring_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  zone_id UUID,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  external_device_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_activated',
  connectivity_type TEXT,
  firmware_version TEXT,
  battery_level INTEGER,
  signal_strength INTEGER,
  expected_interval_minutes INTEGER,
  last_seen_at TIMESTAMPTZ,
  last_measurement_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  geometry JSONB,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_devices TO authenticated;
GRANT ALL ON public.monitoring_devices TO service_role;

ALTER TABLE public.monitoring_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view devices"
  ON public.monitoring_devices FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Members insert devices"
  ON public.monitoring_devices FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Members update devices"
  ON public.monitoring_devices FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Members delete devices"
  ON public.monitoring_devices FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE INDEX idx_monitoring_devices_project ON public.monitoring_devices(project_id);
CREATE INDEX idx_monitoring_devices_zone ON public.monitoring_devices(zone_id);
CREATE INDEX idx_monitoring_devices_status ON public.monitoring_devices(project_id, status);
CREATE INDEX idx_monitoring_devices_last_seen ON public.monitoring_devices(project_id, last_seen_at DESC);

CREATE TRIGGER update_monitoring_devices_updated_at
  BEFORE UPDATE ON public.monitoring_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─── 2. device_parameters ───────────────────────────────────────────────────
CREATE TABLE public.device_parameters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.monitoring_devices(id) ON DELETE CASCADE,
  parameter_key TEXT NOT NULL,
  parameter_name TEXT NOT NULL,
  unit TEXT,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  expected_interval_minutes INTEGER,
  validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, parameter_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_parameters TO authenticated;
GRANT ALL ON public.device_parameters TO service_role;

ALTER TABLE public.device_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view parameters"
  ON public.device_parameters FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_parameters.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE POLICY "Members write parameters"
  ON public.device_parameters FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_parameters.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_parameters.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE INDEX idx_device_parameters_device ON public.device_parameters(device_id);

CREATE TRIGGER update_device_parameters_updated_at
  BEFORE UPDATE ON public.device_parameters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─── 3. device_measurements ─────────────────────────────────────────────────
CREATE TABLE public.device_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.monitoring_devices(id) ON DELETE CASCADE,
  parameter_id UUID REFERENCES public.device_parameters(id) ON DELETE SET NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  value DOUBLE PRECISION NOT NULL,
  unit TEXT,
  quality_status TEXT NOT NULL DEFAULT 'unvalidated',
  quality_score NUMERIC(5,2),
  validation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_payload JSONB,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_measurements TO authenticated;
GRANT ALL ON public.device_measurements TO service_role;

ALTER TABLE public.device_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view measurements"
  ON public.device_measurements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_measurements.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE POLICY "Members insert measurements"
  ON public.device_measurements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_measurements.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE POLICY "Members update measurements"
  ON public.device_measurements FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_measurements.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE POLICY "Members delete measurements"
  ON public.device_measurements FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_measurements.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE INDEX idx_device_measurements_device_time ON public.device_measurements(device_id, measured_at DESC);
CREATE INDEX idx_device_measurements_parameter_time ON public.device_measurements(parameter_id, measured_at DESC);
CREATE INDEX idx_device_measurements_quality ON public.device_measurements(device_id, quality_status);


-- ─── 4. device_maintenance_logs ─────────────────────────────────────────────
CREATE TABLE public.device_maintenance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.monitoring_devices(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result TEXT,
  next_due_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_maintenance_logs TO authenticated;
GRANT ALL ON public.device_maintenance_logs TO service_role;

ALTER TABLE public.device_maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view maintenance"
  ON public.device_maintenance_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_maintenance_logs.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE POLICY "Members insert maintenance"
  ON public.device_maintenance_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_maintenance_logs.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE POLICY "Members update maintenance"
  ON public.device_maintenance_logs FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_maintenance_logs.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE POLICY "Members delete maintenance"
  ON public.device_maintenance_logs FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.monitoring_devices d
    WHERE d.id = device_maintenance_logs.device_id
      AND public.is_project_member(d.project_id, auth.uid())
  ));

CREATE INDEX idx_device_maintenance_device_time ON public.device_maintenance_logs(device_id, performed_at DESC);


-- ─── 5. monitoring_zones ────────────────────────────────────────────────────
CREATE TABLE public.monitoring_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  color TEXT,
  geometry JSONB,
  area_m2 DOUBLE PRECISION,
  area_hectares DOUBLE PRECISION,
  centroid_lat DOUBLE PRECISION,
  centroid_lng DOUBLE PRECISION,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_zones TO authenticated;
GRANT ALL ON public.monitoring_zones TO service_role;

ALTER TABLE public.monitoring_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view zones"
  ON public.monitoring_zones FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Members insert zones"
  ON public.monitoring_zones FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Members update zones"
  ON public.monitoring_zones FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Members delete zones"
  ON public.monitoring_zones FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE INDEX idx_monitoring_zones_project ON public.monitoring_zones(project_id);
CREATE INDEX idx_monitoring_zones_type ON public.monitoring_zones(project_id, zone_type);

CREATE TRIGGER update_monitoring_zones_updated_at
  BEFORE UPDATE ON public.monitoring_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.monitoring_devices
  ADD CONSTRAINT monitoring_devices_zone_fk
  FOREIGN KEY (zone_id) REFERENCES public.monitoring_zones(id) ON DELETE SET NULL;
