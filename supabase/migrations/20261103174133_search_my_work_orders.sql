-- Search only rows returned by the existing actor-scoped status filter.
CREATE FUNCTION public.search_my_work_orders(
  p_after_action_id uuid, p_page_size integer, p_filter text, p_search text
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
  cursor_id uuid := p_after_action_id;
  term text := lower(btrim(p_search));
  item jsonb;
  scanned integer;
  matched integer := 0;
BEGIN
  IF term IS NULL OR char_length(term) NOT BETWEEN 1 AND 120
     OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Invalid work-order search' USING ERRCODE='22023';
  END IF;

  LOOP
    scanned := 0;
    FOR item IN
      SELECT value FROM public.list_my_work_orders_with_filter(cursor_id, 20, p_filter) AS result(value)
      ORDER BY (value->>'action_id')::uuid
    LOOP
      cursor_id := (item->>'action_id')::uuid;
      scanned := scanned + 1;
      IF strpos(lower(item->'plan'->>'title'), term) > 0 THEN
        RETURN NEXT item;
        matched := matched + 1;
        IF matched > p_page_size THEN RETURN; END IF;
      END IF;
    END LOOP;
    IF scanned < 21 THEN RETURN; END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.search_my_work_orders(uuid,integer,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.search_my_work_orders(uuid,integer,text,text) TO authenticated;
