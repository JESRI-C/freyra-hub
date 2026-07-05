
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Founder gets owner access to the existing GoFreyra Demo Org (which already
  -- holds Skallebæk + other seed projects). Fall back to creating one if missing.
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
  END IF;

  RETURN NEW;
END;
$$;
