-- Extend the existing actor-scoped page without exposing predecessor identities.
CREATE OR REPLACE FUNCTION public.list_my_work_orders_with_readiness(p_after_action_id uuid,p_page_size integer)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT to_jsonb(task)||jsonb_build_object(
    'task_status',lifecycle.status,
    'cancelled',coalesce(lifecycle.status='cancelled',false),
    'waiting_for_prerequisites',
    CASE WHEN coalesce(lifecycle.status,'draft') IN ('draft','planned','assigned')
      THEN NOT (private.read_work_order_prerequisite(task.action_id)->>'ready')::boolean
      ELSE false END
  )
  FROM public.list_my_work_orders(p_after_action_id,p_page_size) task
  LEFT JOIN LATERAL (
    SELECT v.status FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=task.action_id ORDER BY v.version DESC LIMIT 1
  ) lifecycle ON true
  ORDER BY task.action_id;
$$;

-- Scan the existing authorized keyset in bounded batches until the requested
-- page contains enough matching tasks. Old clients retain the original endpoint.
CREATE FUNCTION public.list_my_work_orders_with_filter(
  p_after_action_id uuid,p_page_size integer,p_filter text
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE cursor_id uuid:=p_after_action_id; item jsonb; scanned integer; matched integer:=0;
BEGIN
  IF p_filter IS NULL OR p_filter NOT IN ('all','active','waiting','cancelled')
     OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Invalid work-order page' USING ERRCODE='22023';
  END IF;
  IF p_filter='all' THEN
    RETURN QUERY SELECT * FROM public.list_my_work_orders_with_readiness(cursor_id,p_page_size);
    RETURN;
  END IF;
  LOOP
    scanned:=0;
    FOR item IN SELECT value FROM public.list_my_work_orders_with_readiness(cursor_id,20) AS result(value)
      ORDER BY (value->>'action_id')::uuid
    LOOP
      cursor_id:=(item->>'action_id')::uuid;
      scanned:=scanned+1;
      IF CASE p_filter
        WHEN 'waiting' THEN (item->>'waiting_for_prerequisites')::boolean
        WHEN 'cancelled' THEN (item->>'cancelled')::boolean
        ELSE NOT (item->>'cancelled')::boolean AND NOT (item->>'waiting_for_prerequisites')::boolean
          AND coalesce(item->>'task_status','draft') NOT IN ('submitted','approved','performed')
      END THEN
        RETURN NEXT item;
        matched:=matched+1;
        IF matched>p_page_size THEN RETURN; END IF;
      END IF;
    END LOOP;
    IF scanned<21 THEN RETURN; END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_work_orders_with_filter(uuid,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_my_work_orders_with_filter(uuid,integer,text) TO authenticated;
