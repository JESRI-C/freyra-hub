-- Auto-org ved signup
--
-- Tidligere gav handle_new_user kun en organisation + owner-medlemskab til det
-- hardcodede founder-email (jesper_riel@hotmail.com). Alle andre brugere kunne
-- logge ind, men landede uden organisationer og blev afvist fra /app/*.
--
-- Denne migration:
--   1. Erstatter handle_new_user så ENHVER ny bruger får sin egen personlige
--      organisation som owner (founderen beholder adgang til delt demo-org).
--   2. Backfiller eksisterende brugere uden medlemskab med en personlig org.

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

  -- Founderen beholder owner-adgang til den delte demo-org (holder seed-projekter).
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

  -- Alle andre nye brugere får deres egen personlige organisation som owner, så
  -- de lander direkte i appen i stedet for en tom org-vælger.
  INSERT INTO public.organizations (name, type, country)
  VALUES (v_name || ' – organisation', 'personal', 'Denmark')
  RETURNING id INTO v_org_id;
  INSERT INTO public.organization_memberships (user_id, organization_id, role)
  VALUES (NEW.id, v_org_id, 'owner')
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Triggeren on_auth_user_created peger allerede på handle_new_user og opdateres
-- automatisk af CREATE OR REPLACE ovenfor — ingen genoprettelse nødvendig.

-- Backfill: eksisterende brugere uden nogen org-medlemskab får en personlig org.
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
