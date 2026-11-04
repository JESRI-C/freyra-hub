-- Use the same action lock as plan and lifecycle writes before reserving equipment.
CREATE FUNCTION private.lock_work_order_equipment_action() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.lock_work_order_equipment_action() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER lock_work_order_equipment_action
  BEFORE INSERT ON public.work_order_equipment_bookings
  FOR EACH ROW EXECUTE FUNCTION private.lock_work_order_equipment_action();

CREATE FUNCTION public.shift_work_order_series(
  p_organization_id uuid, p_project_id uuid, p_series_id uuid,
  p_expected_plans jsonb, p_days integer, p_reason text, p_request_id uuid, p_expected_actor_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  member record;
  current_plan public.work_order_plan_versions;
  operation_id uuid;
  id_hash text;
  shifted_start date;
  shifted_end date;
  expected_count integer;
  member_count integer;
  declared_count integer;
  lifecycle_status text;
  action_status text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_expected_actor_id
     OR NOT coalesce(private.can_manage_project(p_project_id),false)
     OR NOT coalesce(private.can_write_project(p_project_id),false) THEN
    RAISE EXCEPTION 'Work order series is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_series_id IS NULL OR p_request_id IS NULL OR p_days IS NULL OR p_days=0 OR p_days NOT BETWEEN -3660 AND 3660
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000
     OR jsonb_typeof(p_expected_plans) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid series change' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO expected_count FROM jsonb_object_keys(p_expected_plans);
  SELECT count(*),max(m.member_count) INTO member_count, declared_count
    FROM public.work_order_series_members m JOIN public.work_order_plan_versions p ON p.id=m.plan_version_id
    WHERE m.series_id=p_series_id AND p.organization_id=p_organization_id AND p.project_id=p_project_id;
  IF expected_count NOT BETWEEN 2 AND 12 OR member_count<>expected_count OR member_count<>declared_count THEN
    RAISE EXCEPTION 'Series membership changed' USING ERRCODE='PT409';
  END IF;
  FOR member IN
    SELECT p.action_id
    FROM public.work_order_series_members m JOIN public.work_order_plan_versions p ON p.id=m.plan_version_id
    WHERE m.series_id=p_series_id AND p.organization_id=p_organization_id AND p.project_id=p_project_id
    ORDER BY p.action_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||member.action_id::text,0));
    SELECT * INTO current_plan FROM public.work_order_plan_versions v
    WHERE v.id=(p_expected_plans->>member.action_id::text)::uuid AND v.action_id=member.action_id
      AND v.project_id=p_project_id AND v.organization_id=p_organization_id;
    IF current_plan.id IS NULL OR current_plan.planned_start IS NULL THEN
      RAISE EXCEPTION 'Series plan changed' USING ERRCODE='PT409';
    END IF;

    id_hash := md5('shift-work-order-series:'||p_request_id::text||':'||member.action_id::text);
    operation_id := overlay(overlay(id_hash placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.work_order_plan_versions v
      WHERE v.project_id=p_project_id AND v.request_id=operation_id) THEN
      SELECT a.status INTO action_status FROM public.actions a
      WHERE a.id=member.action_id AND a.project_id=p_project_id FOR NO KEY UPDATE;
      SELECT v.status INTO lifecycle_status FROM public.work_order_lifecycle_versions v
      WHERE v.action_id=member.action_id ORDER BY v.version DESC LIMIT 1;
      IF action_status IN ('I gang','Lukket') OR coalesce(lifecycle_status,'draft') NOT IN ('draft','planned','assigned')
        OR EXISTS (SELECT 1 FROM public.work_order_execution_bindings e WHERE e.action_id=member.action_id)
        OR EXISTS (SELECT 1 FROM public.work_order_equipment_bookings b
                    WHERE b.action_id=member.action_id AND b.cancelled_at IS NULL) THEN
        RAISE EXCEPTION 'Series includes a started, closed or booked work order' USING ERRCODE='PT409';
      END IF;
    END IF;

    shifted_start := current_plan.planned_start+p_days;
    shifted_end := current_plan.planned_end+p_days;
    IF shifted_start < DATE '0001-01-01' OR coalesce(shifted_end,shifted_start)>DATE '9999-12-31' THEN
      RAISE EXCEPTION 'Series dates are outside the allowed range' USING ERRCODE='22023';
    END IF;
    PERFORM public.save_work_order_plan(member.action_id,p_organization_id,p_project_id,current_plan.version,
      current_plan.plan||jsonb_build_object('plannedStart',to_char(shifted_start,'YYYY-MM-DD'),
        'plannedEnd',to_char(shifted_end,'YYYY-MM-DD')),
      format('Serie omplanlagt (%s dage): %s',p_days,btrim(p_reason)),operation_id);
  END LOOP;
  RETURN member_count;
END;
$$;
REVOKE ALL ON FUNCTION public.shift_work_order_series(uuid,uuid,uuid,jsonb,integer,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.shift_work_order_series(uuid,uuid,uuid,jsonb,integer,text,uuid,uuid)
  TO authenticated;
