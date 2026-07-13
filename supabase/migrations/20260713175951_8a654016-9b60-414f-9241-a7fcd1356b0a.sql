-- === 20260713120000_auto_org_on_signup.sql ===
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, v_name, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email = 'jesper_riel@hotmail.com' THEN
    SELECT id INTO v_org_id FROM public.organizations
      WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
         OR name = 'GoFreyra Demo Org'
      ORDER BY (id = '00000000-0000-0000-0000-000000000001'::uuid) DESC
      LIMIT 1;
    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (id, name, type, country)
      VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'GoFreyra Demo Org', 'pilot', 'Denmark')
      RETURNING id INTO v_org_id;
    END IF;
    INSERT INTO public.organization_memberships (user_id, organization_id, role)
    VALUES (NEW.id, v_org_id, 'owner')
    ON CONFLICT (user_id, organization_id) DO NOTHING;
    RETURN NEW;
  END IF;

  INSERT INTO public.organizations (name, type, country)
  VALUES (v_name || ' – organisation', 'personal', 'Denmark')
  RETURNING id INTO v_org_id;
  INSERT INTO public.organization_memberships (user_id, organization_id, role)
  VALUES (NEW.id, v_org_id, 'owner')
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r RECORD;
  v_org_id UUID;
  v_name TEXT;
BEGIN
  FOR r IN
    SELECT u.id AS user_id, u.email AS email, p.full_name AS full_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.email <> 'jesper_riel@hotmail.com'
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_memberships m WHERE m.user_id = u.id
      )
  LOOP
    v_name := COALESCE(r.full_name, split_part(r.email, '@', 1));
    INSERT INTO public.organizations (name, type, country)
    VALUES (v_name || ' – organisation', 'personal', 'Denmark')
    RETURNING id INTO v_org_id;
    INSERT INTO public.organization_memberships (user_id, organization_id, role)
    VALUES (r.user_id, v_org_id, 'owner')
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END LOOP;
END $$;

-- === 20260713121000_geo_features_upsert_index.sql ===
CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_features_layer_external
  ON public.geo_features (layer_id, external_id);

-- === 20260713123000_lavbund_tables.sql ===
CREATE TABLE IF NOT EXISTS public.lavbund_projekter (
  id                 text PRIMARY KEY,
  navn               text NOT NULL,
  status             text,
  linked_project_id  uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  payload            jsonb NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lavbund_maalepunkter (
  id         text PRIMARY KEY,
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_maalepunkter_projekt ON public.lavbund_maalepunkter(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_readings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projekt_id    text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  maalepunkt_id text NOT NULL,
  tidspunkt     timestamptz,
  payload       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_readings_projekt ON public.lavbund_readings(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_transekter (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  nr         integer,
  fase       text,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_transekter_projekt ON public.lavbund_transekter(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_groefter (
  id         text PRIMARY KEY,
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lavbund_groefter_projekt ON public.lavbund_groefter(projekt_id);

CREATE TABLE IF NOT EXISTS public.lavbund_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projekt_id text NOT NULL REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projekt_id, seq)
);

CREATE TABLE IF NOT EXISTS public.lavbund_snapshots (
  projekt_id text PRIMARY KEY REFERENCES public.lavbund_projekter(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lavbund_projekter','lavbund_maalepunkter','lavbund_readings',
    'lavbund_transekter','lavbund_groefter','lavbund_ledger','lavbund_snapshots'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;