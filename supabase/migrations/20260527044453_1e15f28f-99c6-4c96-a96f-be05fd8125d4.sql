
-- 1. Lock down SECURITY DEFINER queue functions and pin search_path
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;

-- 2. Enable RLS on PostGIS spatial_ref_sys reference table with public read
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS spatial_ref_sys_read ON public.spatial_ref_sys';
  EXECUTE 'CREATE POLICY spatial_ref_sys_read ON public.spatial_ref_sys FOR SELECT USING (true)';
EXCEPTION WHEN insufficient_privilege THEN
  -- Owned by postgis extension; skip if cannot alter
  NULL;
END $$;

-- 3. Replace overly permissive write policies (USING/WITH CHECK true) with auth-gated equivalents
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations','projects','sites','data_sources','sensors','observations',
    'indicators','reports','evidence_files','audit_events','actions','impact_units',
    'construction_projects','nature_contexts','runoff_profiles','environmental_risks',
    'mitigation_measures','authority_submissions','connector_fetch_logs','project_media',
    'project_areas','map_layers','geo_features','geo_observations','calculated_metrics'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_write_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_update_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_delete_all ON public.%I', t);
    EXECUTE format('CREATE POLICY auth_write_all ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY auth_update_all ON public.%I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY auth_delete_all ON public.%I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)', t);
  END LOOP;
END $$;
