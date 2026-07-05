
ALTER TABLE public.monitoring_alerts
  ADD COLUMN IF NOT EXISTS alert_rule_id uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution_data jsonb;

CREATE TABLE IF NOT EXISTS public.uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.monitoring_zones(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL,
  upload_type text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'draft',
  detected_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO authenticated;
GRANT ALL ON public.uploads TO service_role;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uploads_select" ON public.uploads FOR SELECT TO authenticated
  USING ((project_id IS NULL AND uploaded_by = auth.uid()) OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "uploads_insert" ON public.uploads FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND (project_id IS NULL OR public.is_project_member(project_id, auth.uid())));
CREATE POLICY "uploads_update" ON public.uploads FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_project_member(project_id, auth.uid()));
CREATE POLICY "uploads_delete" ON public.uploads FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_project_member(project_id, auth.uid()));
CREATE TRIGGER trg_uploads_updated_at BEFORE UPDATE ON public.uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS uploads_project_created_idx ON public.uploads(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_status_idx ON public.uploads(status);

CREATE TABLE IF NOT EXISTS public.upload_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  records_total integer DEFAULT 0,
  records_imported integer DEFAULT 0,
  records_failed integer DEFAULT 0,
  error_report_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_import_jobs TO authenticated;
GRANT ALL ON public.upload_import_jobs TO service_role;
ALTER TABLE public.upload_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "upload_jobs_all" ON public.upload_import_jobs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.uploads u WHERE u.id = upload_id AND (u.uploaded_by = auth.uid() OR public.is_project_member(u.project_id, auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.uploads u WHERE u.id = upload_id AND (u.uploaded_by = auth.uid() OR public.is_project_member(u.project_id, auth.uid()))));
CREATE INDEX IF NOT EXISTS upload_jobs_upload_idx ON public.upload_import_jobs(upload_id);

CREATE TABLE IF NOT EXISTS public.data_quality_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  data_source_id uuid REFERENCES public.data_sources(id) ON DELETE CASCADE,
  parameter_key text,
  name text NOT NULL,
  rule_type text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_quality_rules TO authenticated;
GRANT ALL ON public.data_quality_rules TO service_role;
ALTER TABLE public.data_quality_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dq_rules_all" ON public.data_quality_rules FOR ALL TO authenticated
  USING (project_id IS NULL OR public.is_project_member(project_id, auth.uid()))
  WITH CHECK (project_id IS NULL OR public.is_project_member(project_id, auth.uid()));
CREATE TRIGGER trg_dq_rules_updated_at BEFORE UPDATE ON public.data_quality_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.monitoring_zones(id) ON DELETE SET NULL,
  data_source_id uuid REFERENCES public.data_sources(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.monitoring_devices(id) ON DELETE SET NULL,
  measurement_id uuid,
  upload_id uuid REFERENCES public.uploads(id) ON DELETE SET NULL,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  description text,
  original_data jsonb,
  corrected_data jsonb,
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_quality_issues TO authenticated;
GRANT ALL ON public.data_quality_issues TO service_role;
ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dq_issues_all" ON public.data_quality_issues FOR ALL TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE TRIGGER trg_dq_issues_updated_at BEFORE UPDATE ON public.data_quality_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS dq_issues_project_status_idx ON public.data_quality_issues(project_id, status);

CREATE TABLE IF NOT EXISTS public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'medium',
  notification_channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  assignment_rule jsonb,
  action_template_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_rules_all" ON public.alert_rules FOR ALL TO authenticated
  USING (project_id IS NULL OR public.is_project_member(project_id, auth.uid()))
  WITH CHECK (project_id IS NULL OR public.is_project_member(project_id, auth.uid()));
CREATE TRIGGER trg_alert_rules_updated_at BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.alert_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.monitoring_alerts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_comments TO authenticated;
GRANT ALL ON public.alert_comments TO service_role;
ALTER TABLE public.alert_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_comments_select" ON public.alert_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.monitoring_alerts a WHERE a.id = alert_id AND public.is_project_member(a.project_id, auth.uid())));
CREATE POLICY "alert_comments_insert" ON public.alert_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.monitoring_alerts a WHERE a.id = alert_id AND public.is_project_member(a.project_id, auth.uid())));
CREATE POLICY "alert_comments_update" ON public.alert_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "alert_comments_delete" ON public.alert_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());
CREATE INDEX IF NOT EXISTS alert_comments_alert_idx ON public.alert_comments(alert_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.data_source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  source_field text NOT NULL,
  target_field text NOT NULL,
  target_unit text,
  transformation jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_source_mappings TO authenticated;
GRANT ALL ON public.data_source_mappings TO service_role;
ALTER TABLE public.data_source_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ds_mappings_all" ON public.data_source_mappings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.data_sources d WHERE d.id = data_source_id AND public.is_project_member(d.project_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.data_sources d WHERE d.id = data_source_id AND public.is_project_member(d.project_id, auth.uid())));
CREATE TRIGGER trg_ds_mappings_updated_at BEFORE UPDATE ON public.data_source_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS ds_mappings_source_idx ON public.data_source_mappings(data_source_id);
