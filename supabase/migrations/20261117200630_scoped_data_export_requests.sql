-- Export requests are read operations with a narrow, server-authored audit event.
-- Keep the general audit table's existing write policies unchanged.
CREATE FUNCTION private.record_project_data_export_request(
  p_project_id uuid, p_format text, p_filename text,
  p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid := auth.uid(); event_id uuid;
BEGIN
  IF actor_id IS NULL OR NOT coalesce(private.can_read_project(p_project_id),false) THEN
    RAISE EXCEPTION 'Project export access denied' USING ERRCODE='42501';
  END IF;
  IF p_format IS NULL OR p_format NOT IN ('geojson','csv','xlsx')
     OR p_filename IS NULL OR length(btrim(p_filename)) NOT BETWEEN 1 AND 200
     OR p_filename ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid export request' USING ERRCODE='22023';
  END IF;
  IF p_entity_type IS NULL THEN
    IF p_entity_id IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected export reference' USING ERRCODE='22023';
    END IF;
  ELSIF p_entity_type='work_orders' THEN
    IF p_entity_id IS NOT NULL OR p_format NOT IN ('csv','xlsx') THEN
      RAISE EXCEPTION 'Invalid work order export' USING ERRCODE='22023';
    END IF;
  ELSIF p_entity_type='watercourse_version' THEN
    IF p_format<>'geojson' OR p_entity_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.watercourse_versions v
      WHERE v.id=p_entity_id AND v.project_id=p_project_id
    ) THEN
      RAISE EXCEPTION 'Export reference unavailable' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported export reference' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.audit_events(
    project_id,event_type,title,actor,source,entity_type,entity_id,after_data
  ) VALUES (
    p_project_id,'data_export',upper(p_format)||'-udtræk anmodet: '||btrim(p_filename),
    actor_id::text,'api',coalesce(p_entity_type,'project'),
    CASE WHEN p_entity_type IS NULL THEN p_project_id ELSE p_entity_id END,
    jsonb_build_object('actor_id',actor_id,'format',p_format,'filename',btrim(p_filename),'request_only',true)
  ) RETURNING id INTO event_id;
  RETURN event_id;
END $$;
REVOKE ALL ON FUNCTION private.record_project_data_export_request(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.record_project_data_export_request(uuid,text,text,text,uuid) TO authenticated;

CREATE FUNCTION public.record_project_data_export_request(
  p_project_id uuid, p_format text, p_filename text,
  p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.record_project_data_export_request(p_project_id,p_format,p_filename,p_entity_type,p_entity_id);
$$;
REVOKE ALL ON FUNCTION public.record_project_data_export_request(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_project_data_export_request(uuid,text,text,text,uuid) TO authenticated;
