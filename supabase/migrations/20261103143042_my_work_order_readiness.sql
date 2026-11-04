-- Extend the existing actor-scoped page without exposing predecessor identities.
CREATE FUNCTION public.list_my_work_orders_with_readiness(p_after_action_id uuid,p_page_size integer)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT to_jsonb(task)||jsonb_build_object(
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
REVOKE ALL ON FUNCTION public.list_my_work_orders_with_readiness(uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_my_work_orders_with_readiness(uuid,integer) TO authenticated;
