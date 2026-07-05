
-- Helper for admin-only writes on unscoped tables
-- (we use service_role clause directly)

-- =========================================================
-- Project-scoped tables: replace dev_read_all + auth_* with is_project_member
-- =========================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'actions','authority_submissions','calculated_metrics','data_sources',
    'environmental_risks','evidence_files','geo_observations','impact_units',
    'indicators','mitigation_measures','nature_contexts','observations',
    'project_areas','project_media','reports','runoff_profiles','sensors','sites'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS dev_read_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_read_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_write_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_update_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_delete_all ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "Project members can view %1$s" ON public.%1$I FOR SELECT TO authenticated USING (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "Project members can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "Project members can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid())) WITH CHECK (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "Project members can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))$f$, t);
  END LOOP;
END $$;

-- =========================================================
-- map_layers: global reference catalog. Authenticated read; writes service_role only.
-- =========================================================
DROP POLICY IF EXISTS dev_read_all ON public.map_layers;
DROP POLICY IF EXISTS auth_write_all ON public.map_layers;
DROP POLICY IF EXISTS auth_update_all ON public.map_layers;
DROP POLICY IF EXISTS auth_delete_all ON public.map_layers;
CREATE POLICY "Authenticated can view map_layers" ON public.map_layers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages map_layers" ON public.map_layers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =========================================================
-- geo_features: scoped via layer_id -> map_layers (global). Authenticated read; writes service_role.
-- =========================================================
DROP POLICY IF EXISTS dev_read_all ON public.geo_features;
DROP POLICY IF EXISTS auth_write_all ON public.geo_features;
DROP POLICY IF EXISTS auth_update_all ON public.geo_features;
DROP POLICY IF EXISTS auth_delete_all ON public.geo_features;
CREATE POLICY "Authenticated can view geo_features" ON public.geo_features
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages geo_features" ON public.geo_features
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =========================================================
-- organizations: members view; owners/admins update/delete; any authenticated can create
-- =========================================================
DROP POLICY IF EXISTS dev_read_all ON public.organizations;
DROP POLICY IF EXISTS auth_write_all ON public.organizations;
DROP POLICY IF EXISTS auth_update_all ON public.organizations;
DROP POLICY IF EXISTS auth_delete_all ON public.organizations;
CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Authenticated can create organizations" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owners/admins can update organizations" ON public.organizations
  FOR UPDATE TO authenticated
    USING (public.has_org_role(auth.uid(), id, ARRAY['owner','admin']))
    WITH CHECK (public.has_org_role(auth.uid(), id, ARRAY['owner','admin']));
CREATE POLICY "Owners can delete organizations" ON public.organizations
  FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), id, ARRAY['owner']));

-- =========================================================
-- projects: members view; org members can create; project admins or org owners/admins can update/delete
-- =========================================================
DROP POLICY IF EXISTS dev_read_all ON public.projects;
DROP POLICY IF EXISTS auth_write_all ON public.projects;
DROP POLICY IF EXISTS auth_update_all ON public.projects;
DROP POLICY IF EXISTS auth_delete_all ON public.projects;
CREATE POLICY "Members can view projects" ON public.projects
  FOR SELECT TO authenticated USING (
    public.is_project_member(id, auth.uid())
    OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']))
  );
CREATE POLICY "Org members can create projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)
  );
CREATE POLICY "Project admins can update projects" ON public.projects
  FOR UPDATE TO authenticated
    USING (
      public.is_project_admin(id, auth.uid())
      OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']))
    )
    WITH CHECK (
      public.is_project_admin(id, auth.uid())
      OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']))
    );
CREATE POLICY "Project admins can delete projects" ON public.projects
  FOR DELETE TO authenticated USING (
    public.is_project_admin(id, auth.uid())
    OR (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner']))
  );

-- =========================================================
-- organization_memberships: prevent role escalation
--   - Only owners can INSERT/UPDATE rows where role='owner'
--   - Admins may INSERT/UPDATE non-owner rows
--   - Users cannot modify their own membership (no self-promotion)
--   - Only owners can DELETE memberships (already the case)
-- =========================================================
DROP POLICY IF EXISTS "Owners/admins can add memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "Owners/admins can update memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "Owners can delete memberships" ON public.organization_memberships;

CREATE POLICY "Owners can add owner memberships" ON public.organization_memberships
  FOR INSERT TO authenticated WITH CHECK (
    user_id <> auth.uid()
    AND (
      (role = 'owner' AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner']))
      OR (role <> 'owner' AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']))
    )
  );

CREATE POLICY "Owners/admins can update non-owner memberships" ON public.organization_memberships
  FOR UPDATE TO authenticated
    USING (
      user_id <> auth.uid()
      AND (
        (role = 'owner' AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner']))
        OR (role <> 'owner' AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']))
      )
    )
    WITH CHECK (
      user_id <> auth.uid()
      AND (
        (role = 'owner' AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner']))
        OR (role <> 'owner' AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']))
      )
    );

CREATE POLICY "Owners can delete memberships" ON public.organization_memberships
  FOR DELETE TO authenticated USING (
    user_id <> auth.uid()
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner'])
  );
