CREATE FUNCTION public.create_work_order_weekly_series(
  p_organization_id uuid, p_project_id uuid, p_source_plan_version_id uuid,
  p_first_date date, p_count integer, p_request_id uuid, p_expected_actor_id uuid
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  source public.work_order_plan_versions;
  occurrence_id uuid;
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
     OR p_first_date IS NULL OR p_first_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-10-01' THEN
    RAISE EXCEPTION 'Invalid series' USING ERRCODE='22023';
  END IF;

  SELECT * INTO source FROM public.work_order_plan_versions
  WHERE id=p_source_plan_version_id AND organization_id=p_organization_id AND project_id=p_project_id;
  IF source.id IS NULL OR source.plan->>'plannedStart' IS NULL THEN
    RAISE EXCEPTION 'A dated source plan is required' USING ERRCODE='22023';
  END IF;
  duration_days := (source.plan->>'plannedEnd')::date - (source.plan->>'plannedStart')::date;
  IF p_first_date <= coalesce((source.plan->>'plannedEnd')::date, (source.plan->>'plannedStart')::date)
     OR (duration_days IS NOT NULL AND p_first_date + 7*(p_count-1) + duration_days > DATE '9999-12-31') THEN
    RAISE EXCEPTION 'Series dates are outside the allowed range' USING ERRCODE='22023';
  END IF;
  reason := format('Ugentlig serie fra planversion %s, %s opgaver', source.version, p_count);

  PERFORM pg_advisory_xact_lock(hashtextextended('work-order-series:'||p_request_id::text,0));
  FOR slot IN 0..p_count-1 LOOP
    occurrence_id := md5('work-order-series:'||p_request_id::text||':'||slot::text)::uuid;
    start_date := p_first_date + slot*7;
    end_date := start_date + duration_days;
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
    PERFORM public.save_work_order_plan(occurrence_id,p_organization_id,p_project_id,0,
      occurrence_plan,reason,occurrence_id,p_source_plan_version_id);
    occurrence_ids := array_append(occurrence_ids, occurrence_id);
  END LOOP;
  RETURN occurrence_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_work_order_weekly_series(uuid,uuid,uuid,date,integer,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_work_order_weekly_series(uuid,uuid,uuid,date,integer,uuid,uuid)
  TO authenticated;
