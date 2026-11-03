ALTER FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean)
  RENAME TO build_work_order_submission_core;
REVOKE ALL ON FUNCTION private.build_work_order_submission_core(uuid,uuid,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.build_work_order_submission(
  p_action_id uuid, p_organization_id uuid, p_project_id uuid, p_lock boolean
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  built jsonb;
  linked_indicator uuid;
  target jsonb;
  packet jsonb;
  gaps jsonb;
BEGIN
  -- The core verifies the actor and scope before we read the linked target.
  built := private.build_work_order_submission_core(p_action_id, p_organization_id, p_project_id, p_lock);

  IF p_lock THEN
    PERFORM 1 FROM public.actions
    WHERE id = p_action_id AND project_id = p_project_id FOR SHARE;
  END IF;
  SELECT linked_indicator_id INTO linked_indicator
  FROM public.actions WHERE id = p_action_id AND project_id = p_project_id;

  IF p_lock AND linked_indicator IS NOT NULL THEN
    PERFORM 1 FROM public.indicators
    WHERE id = linked_indicator AND project_id = p_project_id FOR SHARE;
  END IF;
  SELECT jsonb_build_object('indicatorId', id, 'label', label, 'value', target_value,
    'direction', target_direction, 'unit', target_unit)
  INTO target
  FROM public.indicators
  WHERE id = linked_indicator AND project_id = p_project_id AND target_value IS NOT NULL;

  IF target IS NULL THEN
    RETURN built;
  END IF;

  packet := (built->'snapshot') || jsonb_build_object('indicatorTarget', target);
  gaps := built->'gaps';
  IF octet_length(packet::text) > 1048576 AND NOT (gaps ? 'packet_too_large') THEN
    SELECT jsonb_agg(gap ORDER BY gap) INTO gaps
    FROM jsonb_array_elements_text(gaps || jsonb_build_array('packet_too_large')) AS entries(gap);
  END IF;
  RETURN jsonb_build_object('snapshot', packet, 'gaps', gaps,
    'basisHash', encode(sha256(convert_to(packet::text, 'UTF8')), 'hex'));
END $$;

REVOKE ALL ON FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean)
  TO authenticated;
