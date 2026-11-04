-- A read-only manager projection. Existing actions remain the identity and no
-- work order, plan, assignment, membership or lifecycle is created by a read.
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
  p_page_size integer
) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
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
  THEN
    RAISE EXCEPTION 'Invalid manager work-order page' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
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
      coalesce(plan.site_id,a.site_id) AS site_id,site.name AS site_name,
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
      coalesce(assignment.plan_version_id=plan.id,false) AS assignment_is_current
    FROM public.actions a
    JOIN managed_projects p ON p.id=a.project_id
    LEFT JOIN public.work_orders w ON w.action_id=a.id
      AND w.project_id=p.id AND w.organization_id=p_organization_id
    LEFT JOIN LATERAL (
      SELECT v.id,v.plan,v.planned_start,v.planned_end,v.site_id,v.responsible_id
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
    LEFT JOIN public.sites site ON site.id=coalesce(plan.site_id,a.site_id) AND site.project_id=p.id
    LEFT JOIN public.profiles responsible ON responsible.id=plan.responsible_id
    LEFT JOIN public.profiles claimant ON claimant.id=assignment.claimed_by
    -- Workflow-followup rows are metadata suggestions, not ordinary jobs. This
    -- matches the existing field job list and does not initialize them as jobs.
    WHERE a.action_type IS DISTINCT FROM 'workflow_followup'
  ), matching AS (
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
      AND (p_after_action_id IS NULL OR t.action_id>p_after_action_id)
    ORDER BY t.action_id LIMIT p_page_size+1
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
    )) ORDER BY person.id) FROM people person LEFT JOIN public.profiles profile ON profile.id=person.id),'[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer)
  TO authenticated;
COMMENT ON FUNCTION public.list_manager_work_orders(uuid,uuid,text,text,uuid,text,date,date,uuid,integer) IS
  'Read-only project-manager projection using per-project management authority, exact tenant scope and UUID keyset pagination. No-plan and unassigned actions remain visible; lifecycle absence is explicit.';
