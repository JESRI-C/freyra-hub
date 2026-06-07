
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_policies WHERE policyname='dev_all' AND schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS dev_all ON %I.%I', r.schemaname, r.tablename);
  END LOOP;
END $$;
