
-- Helper: check membership via a lavbund project id (text) → linked_project_id
CREATE OR REPLACE FUNCTION public.is_lavbund_projekt_member(_projekt_id text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lavbund_projekter lp
    JOIN public.project_members pm
      ON pm.project_id = lp.linked_project_id
    WHERE lp.id = _projekt_id
      AND pm.user_id = _user_id
      AND lp.linked_project_id IS NOT NULL
  )
$$;

-- =========================================================================
-- action_evidence: scope via actions.project_id
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can view action evidence" ON public.action_evidence;
DROP POLICY IF EXISTS "Authenticated can insert action evidence" ON public.action_evidence;
DROP POLICY IF EXISTS "Authenticated can update action evidence" ON public.action_evidence;
DROP POLICY IF EXISTS "Authenticated can delete action evidence" ON public.action_evidence;

CREATE POLICY "Project members can view action evidence"
  ON public.action_evidence FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.actions a
    WHERE a.id = action_evidence.action_id
      AND public.is_project_member(a.project_id, auth.uid())
  ));

CREATE POLICY "Project members can insert action evidence"
  ON public.action_evidence FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.actions a
    WHERE a.id = action_evidence.action_id
      AND public.is_project_member(a.project_id, auth.uid())
  ));

CREATE POLICY "Project members can update action evidence"
  ON public.action_evidence FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.actions a
    WHERE a.id = action_evidence.action_id
      AND public.is_project_member(a.project_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.actions a
    WHERE a.id = action_evidence.action_id
      AND public.is_project_member(a.project_id, auth.uid())
  ));

CREATE POLICY "Project members can delete action evidence"
  ON public.action_evidence FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.actions a
    WHERE a.id = action_evidence.action_id
      AND public.is_project_member(a.project_id, auth.uid())
  ));

-- =========================================================================
-- Generic project_id-scoped tables
-- =========================================================================
-- audit_events
DROP POLICY IF EXISTS auth_read_all ON public.audit_events;
DROP POLICY IF EXISTS auth_write_all ON public.audit_events;
DROP POLICY IF EXISTS auth_update_all ON public.audit_events;
DROP POLICY IF EXISTS auth_delete_all ON public.audit_events;

CREATE POLICY "Project members can view audit events"
  ON public.audit_events FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can insert audit events"
  ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()));
-- audit events immutable: no update/delete policies

-- connector_fetch_logs
DROP POLICY IF EXISTS auth_read_all ON public.connector_fetch_logs;
DROP POLICY IF EXISTS auth_write_all ON public.connector_fetch_logs;
DROP POLICY IF EXISTS auth_update_all ON public.connector_fetch_logs;
DROP POLICY IF EXISTS auth_delete_all ON public.connector_fetch_logs;

CREATE POLICY "Project members can view connector logs"
  ON public.connector_fetch_logs FOR SELECT TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can insert connector logs"
  ON public.connector_fetch_logs FOR INSERT TO authenticated
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can update connector logs"
  ON public.connector_fetch_logs FOR UPDATE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
  WITH CHECK (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can delete connector logs"
  ON public.connector_fetch_logs FOR DELETE TO authenticated
  USING (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()));

-- construction_projects
DROP POLICY IF EXISTS auth_read_all ON public.construction_projects;
DROP POLICY IF EXISTS auth_write_all ON public.construction_projects;
DROP POLICY IF EXISTS auth_update_all ON public.construction_projects;
DROP POLICY IF EXISTS auth_delete_all ON public.construction_projects;

CREATE POLICY "Project members can view construction projects"
  ON public.construction_projects FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can insert construction projects"
  ON public.construction_projects FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can update construction projects"
  ON public.construction_projects FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can delete construction projects"
  ON public.construction_projects FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- documents
DROP POLICY IF EXISTS "Authenticated can view documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated can update documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated can delete documents" ON public.documents;

CREATE POLICY "Project members can view documents"
  ON public.documents FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can insert documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can update documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can delete documents"
  ON public.documents FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- indicator_measurements
DROP POLICY IF EXISTS "Anyone can view indicator measurements" ON public.indicator_measurements;
DROP POLICY IF EXISTS "Authenticated can insert indicator measurements" ON public.indicator_measurements;
DROP POLICY IF EXISTS "Authenticated can update indicator measurements" ON public.indicator_measurements;
DROP POLICY IF EXISTS "Authenticated can delete indicator measurements" ON public.indicator_measurements;

CREATE POLICY "Project members can view indicator measurements"
  ON public.indicator_measurements FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can insert indicator measurements"
  ON public.indicator_measurements FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can update indicator measurements"
  ON public.indicator_measurements FOR UPDATE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()))
  WITH CHECK (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Project members can delete indicator measurements"
  ON public.indicator_measurements FOR DELETE TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

-- =========================================================================
-- lavbund_* tables: scope via lavbund_projekter.linked_project_id
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated full access" ON public.lavbund_projekter;
CREATE POLICY "Project members can view lavbund projekter"
  ON public.lavbund_projekter FOR SELECT TO authenticated
  USING (linked_project_id IS NOT NULL AND public.is_project_member(linked_project_id, auth.uid()));
CREATE POLICY "Project members can insert lavbund projekter"
  ON public.lavbund_projekter FOR INSERT TO authenticated
  WITH CHECK (linked_project_id IS NOT NULL AND public.is_project_member(linked_project_id, auth.uid()));
CREATE POLICY "Project members can update lavbund projekter"
  ON public.lavbund_projekter FOR UPDATE TO authenticated
  USING (linked_project_id IS NOT NULL AND public.is_project_member(linked_project_id, auth.uid()))
  WITH CHECK (linked_project_id IS NOT NULL AND public.is_project_member(linked_project_id, auth.uid()));
CREATE POLICY "Project members can delete lavbund projekter"
  ON public.lavbund_projekter FOR DELETE TO authenticated
  USING (linked_project_id IS NOT NULL AND public.is_project_member(linked_project_id, auth.uid()));

-- Child tables scoped via projekt_id
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lavbund_maalepunkter','lavbund_readings','lavbund_transekter',
    'lavbund_groefter','lavbund_ledger','lavbund_snapshots'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY "Project members can view %1$s"
        ON public.%1$I FOR SELECT TO authenticated
        USING (public.is_lavbund_projekt_member(projekt_id, auth.uid()))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Project members can insert %1$s"
        ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (public.is_lavbund_projekt_member(projekt_id, auth.uid()))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Project members can update %1$s"
        ON public.%1$I FOR UPDATE TO authenticated
        USING (public.is_lavbund_projekt_member(projekt_id, auth.uid()))
        WITH CHECK (public.is_lavbund_projekt_member(projekt_id, auth.uid()))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Project members can delete %1$s"
        ON public.%1$I FOR DELETE TO authenticated
        USING (public.is_lavbund_projekt_member(projekt_id, auth.uid()))
    $f$, t);
  END LOOP;
END $$;
