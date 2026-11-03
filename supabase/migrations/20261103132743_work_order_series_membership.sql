-- Record membership separately so immutable plan versions remain untouched.
CREATE TABLE public.work_order_series_members (
  plan_version_id uuid PRIMARY KEY REFERENCES public.work_order_plan_versions(id) ON DELETE RESTRICT,
  series_id uuid NOT NULL,
  position integer NOT NULL,
  member_count integer NOT NULL CHECK (member_count BETWEEN 2 AND 12),
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'fortnightly', 'monthly')),
  CHECK (position BETWEEN 1 AND member_count),
  UNIQUE(series_id,position)
);
ALTER TABLE public.work_order_series_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.work_order_series_members FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT, INSERT ON TABLE public.work_order_series_members TO authenticated;
CREATE POLICY series_members_read ON public.work_order_series_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_order_plan_versions p WHERE p.id=plan_version_id
  ));
CREATE POLICY series_members_insert ON public.work_order_series_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.work_order_plan_versions p
    CROSS JOIN LATERAL (SELECT md5('work-order-series:'||series_id::text||':'||(position-1)::text) AS hash) member
    WHERE p.id=plan_version_id AND p.version=1 AND p.source_plan_version_id IS NOT NULL
      AND p.created_by=auth.uid() AND private.can_write_project(p.project_id)
      AND p.action_id=p.request_id
      AND p.action_id=overlay(overlay(member.hash placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid
      AND p.correction_reason=format('%s serie fra planversion %s, %s opgaver',
        CASE cadence WHEN 'daily' THEN 'Daglig' WHEN 'weekly' THEN 'Ugentlig'
          WHEN 'fortnightly' THEN 'Hver anden uge, gentaget' WHEN 'monthly' THEN 'Månedlig' END,
        p.source_plan_version, member_count)
  ));

CREATE OR REPLACE FUNCTION public.create_work_order_series(
  p_organization_id uuid, p_project_id uuid, p_source_plan_version_id uuid,
  p_first_date date, p_count integer, p_request_id uuid, p_expected_actor_id uuid, p_interval text
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  source public.work_order_plan_versions;
  occurrence_id uuid;
  saved_plan_id uuid;
  id_hash text;
  occurrence_ids uuid[] := ARRAY[]::uuid[];
  start_date date;
  end_date date;
  duration_days integer;
  occurrence_plan jsonb;
  reason text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_expected_actor_id
     OR NOT coalesce(private.can_write_project(p_project_id), false) THEN
    RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_count IS NULL OR p_count NOT BETWEEN 2 AND 12
     OR p_first_date IS NULL OR p_first_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
     OR p_interval IS NULL OR p_interval NOT IN ('daily', 'weekly', 'fortnightly', 'monthly') THEN
    RAISE EXCEPTION 'Invalid series' USING ERRCODE='22023';
  END IF;

  SELECT * INTO source FROM public.work_order_plan_versions
  WHERE id=p_source_plan_version_id AND organization_id=p_organization_id AND project_id=p_project_id;
  IF source.id IS NULL OR source.plan->>'plannedStart' IS NULL THEN
    RAISE EXCEPTION 'A dated source plan is required' USING ERRCODE='22023';
  END IF;
  duration_days := (source.plan->>'plannedEnd')::date - (source.plan->>'plannedStart')::date;
  IF p_first_date <= coalesce((source.plan->>'plannedEnd')::date, (source.plan->>'plannedStart')::date)
     THEN
    RAISE EXCEPTION 'Series dates are outside the allowed range' USING ERRCODE='22023';
  END IF;
  reason := format('%s serie fra planversion %s, %s opgaver',
    CASE p_interval WHEN 'daily' THEN 'Daglig' WHEN 'weekly' THEN 'Ugentlig'
      WHEN 'fortnightly' THEN 'Hver anden uge, gentaget' WHEN 'monthly' THEN 'Månedlig' END,
    source.version, p_count);

  PERFORM pg_advisory_xact_lock(hashtextextended('work-order-series:'||p_request_id::text,0));
  FOR slot IN 0..p_count-1 LOOP
    id_hash := md5('work-order-series:'||p_request_id::text||':'||slot::text);
    occurrence_id := overlay(overlay(id_hash placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid;
    start_date := CASE p_interval
      WHEN 'monthly' THEN (p_first_date + make_interval(months => slot))::date
      ELSE p_first_date + slot * CASE p_interval
        WHEN 'daily' THEN 1 WHEN 'weekly' THEN 7 WHEN 'fortnightly' THEN 14 END
    END;
    end_date := start_date + duration_days;
    IF coalesce(end_date,start_date) > DATE '9999-12-31' THEN
      RAISE EXCEPTION 'Series dates are outside the allowed range' USING ERRCODE='22023';
    END IF;
    occurrence_plan := source.plan || jsonb_build_object(
      'plannedStart', to_char(start_date,'YYYY-MM-DD'),
      'plannedEnd', to_char(end_date,'YYYY-MM-DD'),
      'responsibleId', NULL
    );

    INSERT INTO public.actions(id,project_id,title,description,status)
    VALUES(occurrence_id,p_project_id,source.plan->>'title',reason,'Åben')
    ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND AND NOT EXISTS (
      SELECT 1 FROM public.work_order_plan_versions v
      WHERE v.action_id=occurrence_id AND v.project_id=p_project_id AND v.version=1
        AND v.request_id=occurrence_id AND v.created_by=auth.uid()
    ) THEN
      RAISE EXCEPTION 'Series key already in use' USING ERRCODE='22023';
    END IF;
    SELECT id INTO STRICT saved_plan_id FROM public.save_work_order_plan(occurrence_id,p_organization_id,p_project_id,0,
      occurrence_plan,reason,occurrence_id,p_source_plan_version_id);
    INSERT INTO public.work_order_series_members(plan_version_id,series_id,position,member_count,cadence)
    VALUES(saved_plan_id,p_request_id,slot+1,p_count,p_interval)
    ON CONFLICT (plan_version_id) DO NOTHING;
    occurrence_ids := array_append(occurrence_ids, occurrence_id);
  END LOOP;
  RETURN occurrence_ids;
END;
$$;
