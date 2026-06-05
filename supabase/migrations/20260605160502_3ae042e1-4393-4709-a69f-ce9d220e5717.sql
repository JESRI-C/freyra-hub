GRANT SELECT, INSERT, UPDATE, DELETE ON public.construction_projects TO authenticated;
GRANT ALL ON public.construction_projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;