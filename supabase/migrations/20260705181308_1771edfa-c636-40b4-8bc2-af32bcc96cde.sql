
CREATE OR REPLACE FUNCTION public.add_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.organization_memberships (organization_id, user_id, role)
    VALUES (NEW.id, auth.uid(), 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created_add_owner ON public.organizations;
CREATE TRIGGER on_organization_created_add_owner
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_owner();
