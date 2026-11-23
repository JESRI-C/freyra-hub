CREATE FUNCTION public.cancel_work_order_series(
  p_organization_id uuid, p_project_id uuid, p_series_id uuid,
  p_expected_plans jsonb, p_reason text, p_request_id uuid, p_expected_actor_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  member record;
  latest public.work_order_lifecycle_versions;
  saved public.work_order_lifecycle_versions;
  basis jsonb;
  draft_hash text;
  operation_id uuid;
  id_hash text;
  expected_count integer;
  member_count integer;
  declared_count integer;
  action_status text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_expected_actor_id
     OR NOT coalesce(private.can_manage_project(p_project_id),false)
     OR NOT coalesce(private.can_write_project(p_project_id),false) THEN
    RAISE EXCEPTION 'Work order series is unavailable' USING ERRCODE='42501';
  END IF;
  IF p_series_id IS NULL OR p_request_id IS NULL
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
    id_hash := md5('cancel-work-order-series:'||p_request_id::text||':'||member.action_id::text);
    operation_id := overlay(overlay(id_hash placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid;
    SELECT * INTO saved FROM public.work_order_lifecycle_versions v
    WHERE v.project_id=p_project_id AND v.request_id=operation_id;
    IF saved.id IS NOT NULL THEN
      IF saved.action_id<>member.action_id OR saved.created_by<>auth.uid() OR saved.status<>'cancelled'
        OR saved.plan_version_id IS DISTINCT FROM (p_expected_plans->>member.action_id::text)::uuid
        OR saved.reason IS DISTINCT FROM btrim(p_reason) THEN
        RAISE EXCEPTION 'Mutation key has different cancellation content' USING ERRCODE='22023';
      END IF;
      CONTINUE;
    END IF;

    basis := private.work_order_lifecycle_basis(member.action_id);
    IF basis->>'planVersionId' IS NULL OR basis->>'planVersionId' IS DISTINCT FROM p_expected_plans->>member.action_id::text THEN
      RAISE EXCEPTION 'Series plan changed' USING ERRCODE='PT409';
    END IF;
    SELECT * INTO latest FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=member.action_id ORDER BY v.version DESC LIMIT 1;
    IF latest.status='cancelled' THEN CONTINUE; END IF;
    SELECT a.status INTO action_status FROM public.actions a
    WHERE a.id=member.action_id AND a.project_id=p_project_id FOR NO KEY UPDATE;
    IF action_status IN ('I gang','Lukket') OR coalesce(latest.status,'draft') NOT IN ('draft','planned','assigned')
      OR basis->>'executionRevisionId' IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.work_order_equipment_bookings b
                 WHERE b.action_id=member.action_id AND b.cancelled_at IS NULL) THEN
      RAISE EXCEPTION 'Series includes a started, closed or booked work order' USING ERRCODE='PT409';
    END IF;

    basis := jsonb_build_object('operation','transition','planVersionId',basis->'planVersionId',
      'assignmentVersionId',basis->'assignmentVersionId','executionRevisionId',basis->'executionRevisionId');
    IF latest.id IS NULL THEN
      draft_hash := md5('cancel-work-order-series-draft:'||p_request_id::text||':'||member.action_id::text);
      SELECT * INTO STRICT latest FROM public.mutate_work_order_lifecycle(member.action_id,p_organization_id,p_project_id,0,
        basis||jsonb_build_object('targetStatus','draft','reason',''),overlay(overlay(draft_hash placing '8' from 13 for 1) placing '8' from 17 for 1)::uuid);
    END IF;
    PERFORM public.mutate_work_order_lifecycle(member.action_id,p_organization_id,p_project_id,latest.version,
      basis||jsonb_build_object('targetStatus','cancelled','reason',btrim(p_reason)),operation_id);
  END LOOP;
  RETURN member_count;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_work_order_series(uuid,uuid,uuid,jsonb,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_work_order_series(uuid,uuid,uuid,jsonb,text,uuid,uuid)
  TO authenticated;

-- A reservation queued behind a cancellation must recheck the current status.
CREATE OR REPLACE FUNCTION private.lock_work_order_equipment_action() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
  IF (SELECT v.status FROM public.work_order_lifecycle_versions v
      WHERE v.action_id=NEW.action_id ORDER BY v.version DESC LIMIT 1)='cancelled' THEN
    RAISE EXCEPTION 'A cancelled work order cannot reserve equipment' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$$;
