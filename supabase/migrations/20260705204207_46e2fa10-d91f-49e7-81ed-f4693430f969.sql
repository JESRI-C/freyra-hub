
DO $$ BEGIN
  CREATE TYPE public.project_role AS ENUM ('admin','project_manager','editor','field','viewer','external');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.project_role NOT NULL,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_project_role(_project_id uuid, _user_id uuid, _role public.project_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_project_admin(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
      AND role IN ('admin','project_manager')
  )
$$;

CREATE POLICY "Members can view project_members of their projects"
  ON public.project_members FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project admins can insert project_members"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.is_project_admin(project_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Project admins can update project_members"
  ON public.project_members FOR UPDATE TO authenticated
  USING (public.is_project_admin(project_id, auth.uid()))
  WITH CHECK (public.is_project_admin(project_id, auth.uid()));

CREATE POLICY "Project admins can delete project_members"
  ON public.project_members FOR DELETE TO authenticated
  USING (public.is_project_admin(project_id, auth.uid()));

CREATE TRIGGER update_project_members_updated_at
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
