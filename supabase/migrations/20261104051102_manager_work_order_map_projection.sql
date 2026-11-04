-- P7: same authorized filtered jobs in list/board/map, exact stored positions,
-- global totals and a changed-selection guard. The original 10-argument RPC is
-- retained for old clients. This is not a persisted report snapshot or MAP-02's
-- indexed viewport/100,000-record acceptance.
CREATE FUNCTION private.manager_work_order_geometry(p_geometry jsonb,p_type text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE point jsonb; points jsonb:='[]'::jsonb;
BEGIN
  IF p_type NOT IN ('Point','LineString') OR p_geometry->>'type' IS DISTINCT FROM p_type
    OR jsonb_typeof(p_geometry->'coordinates') IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  IF p_type='Point' THEN points:=jsonb_build_array(p_geometry->'coordinates');
  ELSE
    points:=p_geometry->'coordinates';
    IF jsonb_array_length(points)<2 THEN RETURN NULL; END IF;
  END IF;
  FOR point IN SELECT value FROM jsonb_array_elements(points) LOOP
    IF jsonb_typeof(point) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
    IF jsonb_array_length(point)<2 OR jsonb_typeof(point->0) IS DISTINCT FROM 'number'
      OR jsonb_typeof(point->1) IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
    IF abs((point->>0)::numeric)>180 OR abs((point->>1)::numeric)>90 THEN RETURN NULL; END IF;
  END LOOP;
  IF p_type='LineString' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(points) p(value)
    WHERE (p.value->>0)::numeric IS DISTINCT FROM (points->0->>0)::numeric
       OR (p.value->>1)::numeric IS DISTINCT FROM (points->0->>1)::numeric
  ) THEN RETURN NULL; END IF;
  -- Map only the actual stored 2D coordinates, never a calculated centroid.
  IF p_type='Point' THEN
    RETURN jsonb_build_object('type','Point','coordinates',jsonb_build_array(points->0->0,points->0->1));
  END IF;
  RETURN jsonb_build_object('type','LineString','coordinates',(
    SELECT jsonb_agg(jsonb_build_array(p.value->0,p.value->1) ORDER BY p.position)
    FROM jsonb_array_elements(points) WITH ORDINALITY p(value,position)
  ));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.manager_work_order_geometry(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.manager_work_order_geometry(jsonb,text) TO authenticated;

CREATE FUNCTION public.list_manager_work_orders(
  p_organization_id uuid,
  p_project_id uuid,
  p_status text,
  p_assignment text,
  p_assignee_id uuid,
  p_search text,
  p_due_from date,
  p_due_through date,
  p_after_action_id uuid,
  p_page_size integer,
  p_selection_token text
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE receipt jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.organization_id=p_organization_id
      AND private.can_manage_project(p.id)
  ) OR (p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id=p_project_id
      AND p.organization_id=p_organization_id AND private.can_manage_project(p.id)
  )) THEN
    RAISE EXCEPTION 'Manager work orders are unavailable' USING ERRCODE='42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN (
    'all','untracked','waiting','draft','planned','assigned','started','performed',
    'submitted','approved','returned','reopened','cancelled'
  ) OR p_assignment IS NULL OR p_assignment NOT IN ('all','unassigned','person','group','pool')
    OR p_search IS NULL OR length(btrim(p_search))>200
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50
    OR (p_due_from IS NOT NULL AND p_due_through IS NOT NULL AND p_due_from>p_due_through)
    OR (p_selection_token IS NOT NULL AND p_selection_token !~ '^[0-9a-f]{64}$')
    OR (p_after_action_id IS NOT NULL AND p_selection_token IS NULL)
  THEN
    RAISE EXCEPTION 'Invalid manager work-order page' USING ERRCODE='22023';
  END IF;

  WITH managed_projects AS MATERIALIZED (
    SELECT p.id,p.name FROM public.projects p
    WHERE p.organization_id=p_organization_id AND private.can_manage_project(p.id)
  ), tasks AS MATERIALIZED (
    SELECT a.id AS action_id,p_organization_id AS organization_id,
      p.id AS project_id,p.name AS project_name,
      coalesce(plan.plan->>'title',a.title) AS title,
      a.status::text AS legacy_status,lifecycle.status AS task_status,
      coalesce(lifecycle.blocked,false) AS blocked,
      CASE WHEN w.action_id IS NOT NULL
        AND coalesce(lifecycle.status,'draft') IN ('draft','planned','assigned')
        THEN NOT (private.read_work_order_prerequisite(a.id)->>'ready')::boolean
        ELSE false END AS waiting_for_prerequisites,
      w.action_id IS NOT NULL AS initialized,
      plan.id AS plan_version_id,plan.planned_start,plan.planned_end,
      a.due_date::date AS due_date,
      CASE WHEN plan.id IS NULL THEN a.site_id ELSE plan.site_id END AS site_id,site.name AS site_name,
      plan.plan->>'locationNote' AS location_note,
      plan.responsible_id AS plan_responsible_id,
      CASE WHEN plan.responsible_id IS NULL THEN NULL ELSE coalesce(
        nullif(to_jsonb(responsible)->>'display_name',''),
        nullif(to_jsonb(responsible)->>'full_name',''),plan.responsible_id::text
      ) END AS plan_responsible_name,
      assignment.id AS assignment_id,coalesce(assignment.mode,'unassigned') AS assignment_mode,
      coalesce(assignment.candidate_user_ids,ARRAY[]::uuid[]) AS candidate_user_ids,
      ARRAY(
        SELECT coalesce(nullif(to_jsonb(profile)->>'display_name',''),
          nullif(to_jsonb(profile)->>'full_name',''),member.id::text)
        FROM unnest(assignment.candidate_user_ids) WITH ORDINALITY member(id,position)
        LEFT JOIN public.profiles profile ON profile.id=member.id
        ORDER BY member.position
      ) AS candidate_names,
      assignment.claimed_by,
      CASE WHEN assignment.claimed_by IS NULL THEN NULL ELSE coalesce(
        nullif(to_jsonb(claimant)->>'display_name',''),
        nullif(to_jsonb(claimant)->>'full_name',''),assignment.claimed_by::text
      ) END AS claimed_by_name,
      coalesce(assignment.plan_version_id=plan.id,false) AS assignment_is_current,
      mapped.locations AS map_locations,
      CASE WHEN jsonb_array_length(mapped.locations)>0 THEN NULL
        WHEN mapped.source_count=0 THEN 'no_location'
        ELSE 'coordinates_missing_or_invalid' END AS map_unavailable_reason,
      mapped.source_count-jsonb_array_length(mapped.locations) AS map_unavailable_locations
    FROM public.actions a
    JOIN managed_projects p ON p.id=a.project_id
    LEFT JOIN public.work_orders w ON w.action_id=a.id
      AND w.project_id=p.id AND w.organization_id=p_organization_id
    LEFT JOIN LATERAL (
      SELECT v.id,v.plan,v.planned_start,v.planned_end,v.site_id,v.responsible_id,v.centerline_version_id
      FROM public.work_order_plan_versions v WHERE v.action_id=a.id
        AND v.project_id=p.id AND v.organization_id=p_organization_id
      ORDER BY v.version DESC LIMIT 1
    ) plan ON true
    LEFT JOIN LATERAL (
      SELECT v.id,v.mode,v.candidate_user_ids,v.claimed_by,v.plan_version_id
      FROM public.work_order_assignment_versions v WHERE v.action_id=a.id
        AND v.project_id=p.id AND v.organization_id=p_organization_id
      ORDER BY v.version DESC LIMIT 1
    ) assignment ON true
    LEFT JOIN LATERAL (
      SELECT v.status,v.blocked FROM public.work_order_lifecycle_versions v
      WHERE v.action_id=a.id AND v.project_id=p.id AND v.organization_id=p_organization_id
      ORDER BY v.version DESC LIMIT 1
    ) lifecycle ON true
    LEFT JOIN public.sites site ON site.id=CASE WHEN plan.id IS NULL THEN a.site_id ELSE plan.site_id END AND site.project_id=p.id
    LEFT JOIN LATERAL (
      WITH site_refs AS (
        SELECT CASE WHEN plan.id IS NULL THEN a.site_id ELSE plan.site_id END AS site_id,
          CASE WHEN plan.id IS NULL THEN 'action_site' ELSE 'plan_site' END AS source,0::bigint AS position
        WHERE CASE WHEN plan.id IS NULL THEN a.site_id ELSE plan.site_id END IS NOT NULL
        UNION ALL
        SELECT (stop.value->>'siteId')::uuid,'plan_visit_stop',stop.position
        FROM jsonb_array_elements(coalesce(plan.plan->'visitStops','[]'::jsonb)) WITH ORDINALITY stop(value,position)
      ), site_geometry AS (
        SELECT ref.*,s.name,coalesce(s.status='archived' OR s.archived_at IS NOT NULL,false) AS archived,
          private.manager_work_order_geometry(s.geometry_geojson,'Point') AS point,
          private.manager_work_order_geometry(jsonb_build_object('type','Point',
            'coordinates',jsonb_build_array(s.centroid_lng,s.centroid_lat)),'Point') AS centroid
        FROM site_refs ref LEFT JOIN public.sites s ON s.id=ref.site_id AND s.project_id=p.id
      ), locations AS (
        SELECT jsonb_build_object('id',g.source||':'||g.position||':'||g.site_id,'source',g.source,
          'source_id',g.site_id,'source_version_id',NULL,'name',coalesce(g.name,'Lokalitet'),'archived',g.archived,
          'coordinate_source',CASE WHEN g.point IS NOT NULL THEN 'site_point' ELSE 'site_stored_centroid' END,
          'sequence',g.position,'geometry',coalesce(g.point,g.centroid)) AS value,g.position
        FROM site_geometry g WHERE coalesce(g.point,g.centroid) IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object('id','plan_watercourse:'||wc.id,'source','plan_watercourse',
          'source_id',wc.id,'source_version_id',wc.id,'name',wc.source,'archived',false,
          'coordinate_source','pinned_centerline','sequence',NULL,
          'geometry',private.manager_work_order_geometry(wc.geometry,'LineString')),21::bigint
        FROM public.watercourse_versions wc WHERE wc.id=plan.centerline_version_id
          AND wc.project_id=p.id AND wc.organization_id=p_organization_id AND wc.crs='EPSG:4326'
          AND private.manager_work_order_geometry(wc.geometry,'LineString') IS NOT NULL
      )
      SELECT coalesce((SELECT jsonb_agg(l.value ORDER BY l.position) FROM locations l),'[]'::jsonb) AS locations,
        (SELECT count(*) FROM site_refs)+(CASE WHEN plan.centerline_version_id IS NULL THEN 0 ELSE 1 END) AS source_count
    ) mapped ON true
    LEFT JOIN public.profiles responsible ON responsible.id=plan.responsible_id
    LEFT JOIN public.profiles claimant ON claimant.id=assignment.claimed_by
    -- Workflow-followup rows are metadata suggestions, not ordinary jobs. This
    -- matches the existing field job list and does not initialize them as jobs.
    WHERE a.action_type IS DISTINCT FROM 'workflow_followup'
  ), filtered AS MATERIALIZED (
    SELECT t.* FROM tasks t
    WHERE (p_project_id IS NULL OR t.project_id=p_project_id)
      AND (p_status='all' OR (p_status='untracked' AND t.task_status IS NULL)
        OR (p_status='waiting' AND (t.blocked OR t.waiting_for_prerequisites))
        OR t.task_status=p_status)
      AND (p_assignment='all' OR t.assignment_mode=p_assignment)
      AND (p_assignee_id IS NULL OR CASE
        WHEN t.assignment_mode='pool' AND t.claimed_by IS NOT NULL THEN t.claimed_by=p_assignee_id
        ELSE p_assignee_id=ANY(t.candidate_user_ids) END)
      AND (btrim(p_search)='' OR position(lower(btrim(p_search)) IN
        lower(concat_ws(' ',t.title,t.project_name,t.site_name,t.location_note)))>0)
      AND (p_due_from IS NULL OR t.due_date>=p_due_from)
      AND (p_due_through IS NULL OR t.due_date<=p_due_through)
  ), matching AS (
    SELECT t.* FROM filtered t WHERE p_after_action_id IS NULL OR t.action_id>p_after_action_id
    ORDER BY t.action_id LIMIT p_page_size+1
  ), lane_counts AS (
    SELECT CASE WHEN t.task_status='cancelled' THEN 'cancelled'
      WHEN t.blocked OR t.waiting_for_prerequisites THEN 'waiting'
      WHEN t.task_status IS NULL THEN 'untracked'
      WHEN t.task_status IN ('returned','reopened') THEN 'correction'
      WHEN t.task_status IN ('started','performed','submitted','approved') THEN t.task_status
      ELSE 'open' END AS lane,count(*) AS jobs FROM filtered t GROUP BY 1
  ), people AS (
    -- Catalog is independent of current search, filters and cursor; only people
    -- referenced by the latest assignments in authorized projects are listed.
    SELECT DISTINCT member.id FROM tasks t
    CROSS JOIN LATERAL unnest(t.candidate_user_ids) member(id)
  )
  SELECT jsonb_build_object(
    'organization_id',p_organization_id,'user_id',auth.uid(),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.action_id) FROM matching t),'[]'::jsonb),
    'projects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) ORDER BY p.name,p.id)
      FROM managed_projects p),'[]'::jsonb),
    'assignees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',person.id,'name',coalesce(
      nullif(to_jsonb(profile)->>'display_name',''),nullif(to_jsonb(profile)->>'full_name',''),person.id::text
    )) ORDER BY person.id) FROM people person LEFT JOIN public.profiles profile ON profile.id=person.id),'[]'::jsonb),
    'totals',(SELECT jsonb_build_object('matchingJobs',count(*),
      'mappedJobs',count(*) FILTER(WHERE jsonb_array_length(t.map_locations)>0),
      'unmappedJobs',count(*) FILTER(WHERE jsonb_array_length(t.map_locations)=0),
      'positions',coalesce(sum(jsonb_array_length(t.map_locations)),0)) FROM filtered t),
    'statusTotals',coalesce((SELECT jsonb_agg(jsonb_build_object('status',s.status,'count',s.jobs) ORDER BY s.status)
      FROM (SELECT coalesce(t.task_status,'untracked') AS status,count(*) AS jobs FROM filtered t GROUP BY 1)s),'[]'::jsonb),
    'waitingJobs',(SELECT count(*) FROM filtered t WHERE t.blocked OR t.waiting_for_prerequisites),
    'laneTotals',(SELECT jsonb_object_agg(lane.id,coalesce(c.jobs,0))
      FROM unnest(ARRAY['open','started','performed','submitted','approved','waiting','correction','cancelled','untracked'])lane(id)
      LEFT JOIN lane_counts c ON c.lane=lane.id),
    'selectionToken',encode(sha256(convert_to(jsonb_build_object(
      'organization',p_organization_id,'actor',auth.uid(),
      'filters',jsonb_build_array(p_project_id,p_status,p_assignment,p_assignee_id,p_search,p_due_from,p_due_through),
      'projects',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM managed_projects p),'[]'::jsonb),
      'rows',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.action_id) FROM filtered t),'[]'::jsonb)
    )::text,'UTF8')),'hex')
  ) INTO receipt;
  IF p_selection_token IS NOT NULL AND p_selection_token IS DISTINCT FROM receipt->>'selectionToken' THEN
    RAISE EXCEPTION 'Manager selection changed; restart from first page' USING ERRCODE='PT409';
  END IF;
  RETURN NEXT receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer,text)
  TO authenticated;
COMMENT ON FUNCTION public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer,text) IS
  'Read-only manager selection, full filtered counts and stored scoped geometry. Token detects changed selection between pages; it is not a persisted report snapshot or a measured 100k viewport implementation.';
