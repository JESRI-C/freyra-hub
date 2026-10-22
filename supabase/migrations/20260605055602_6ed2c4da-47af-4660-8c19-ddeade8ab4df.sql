
-- Restrict reads to authenticated users on tables flagged as exposing
-- internal/operational data.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_events','connector_fetch_logs','construction_projects']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS dev_read_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_read_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY auth_read_all ON public.%I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)',
      t
    );
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- Lock down internal pgmq helpers: revoke public execute and pin search_path.
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
