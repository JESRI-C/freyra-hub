-- Explicit versioned documentation requirements; legacy plans remain valid.
CREATE OR REPLACE FUNCTION private.validate_work_order_plan(p jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['schema','title','description','instructions','profile','responsibleId','siteId','watercourseVersionId','locationNote','plannedStart','plannedEnd','priority','plannedMethod','watercourse'];
 field text; maximum integer; w jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& keys) OR p-keys-'estimatedHours'-'visitStops'-'requiredJobCards'<>'{}'::jsonb OR p->>'schema' IS DISTINCT FROM 'freyra.work-order-plan/v1' THEN
   RAISE EXCEPTION 'Invalid work-order plan contract' USING ERRCODE='22023';
 END IF;
 IF p->'estimatedHours' IS NOT NULL AND p->'estimatedHours'<>'null'::jsonb THEN
   IF jsonb_typeof(p->'estimatedHours') IS DISTINCT FROM 'number' THEN
     RAISE EXCEPTION 'Invalid estimated work hours' USING ERRCODE='22023';
   END IF;
   IF (p->>'estimatedHours')::numeric NOT BETWEEN 0 AND 10000
      OR round((p->>'estimatedHours')::numeric,2)<>(p->>'estimatedHours')::numeric THEN
     RAISE EXCEPTION 'Invalid estimated work hours' USING ERRCODE='22023';
   END IF;
 END IF;
 IF p ? 'visitStops' THEN
   IF jsonb_typeof(p->'visitStops') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Invalid visit stops' USING ERRCODE='22023';
   END IF;
   IF jsonb_array_length(p->'visitStops')>20 OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(p->'visitStops') AS s(value)
     WHERE jsonb_typeof(s.value) IS DISTINCT FROM 'object'
       OR (s.value - ARRAY['siteId','name']) <> '{}'::jsonb
       OR jsonb_typeof(s.value->'siteId') IS DISTINCT FROM 'string'
       OR (s.value->>'siteId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(s.value->'name') IS DISTINCT FROM 'string'
       OR length(s.value->>'name') NOT BETWEEN 1 AND 500
       OR btrim(s.value->>'name') <> s.value->>'name'
       OR lower(s.value->>'siteId') = lower(p->>'siteId')
   ) OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(p->'visitStops') AS s(value)
     GROUP BY lower(s.value->>'siteId') HAVING count(*)>1
   ) THEN RAISE EXCEPTION 'Invalid visit stops' USING ERRCODE='22023'; END IF;
 END IF;

 IF p ? 'requiredJobCards' THEN
   IF jsonb_typeof(p->'requiredJobCards') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Invalid required job cards' USING ERRCODE='22023';
   END IF;
   IF jsonb_array_length(p->'requiredJobCards')>10 THEN
     RAISE EXCEPTION 'At most ten required job cards' USING ERRCODE='22023';
   END IF;
   FOR w IN SELECT value FROM jsonb_array_elements(p->'requiredJobCards') LOOP
     IF jsonb_typeof(w) IS DISTINCT FROM 'object'
       OR NOT(w ?& ARRAY['templateVersionId','templateId','version','definition'])
       OR w-ARRAY['templateVersionId','templateId','version','definition']<>'{}'::jsonb
       OR jsonb_typeof(w->'version') IS DISTINCT FROM 'number'
       OR (w->>'version') !~ '^[1-9][0-9]{0,9} * FROM (VALUES('title',160),('description',4000),('instructions',4000),('locationNote',2000)) limits(k,n) LOOP
   IF jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR length(p->>field)>maximum OR p->>field<>btrim(p->>field) THEN RAISE EXCEPTION 'Invalid plan text field' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF length(p->>'title')=0 OR (p->'profile'<>'null'::jsonb AND (jsonb_typeof(p->'profile') IS DISTINCT FROM 'string' OR p->>'profile' NOT IN ('general','watercourse','nature','construction','grazing')))
   OR (p->'priority'<>'null'::jsonb AND (jsonb_typeof(p->'priority') IS DISTINCT FROM 'string' OR p->>'priority' NOT IN ('high','medium','low')))
   OR (p->'plannedMethod'<>'null'::jsonb AND (jsonb_typeof(p->'plannedMethod') IS DISTINCT FROM 'string' OR length(p->>'plannedMethod') NOT BETWEEN 1 AND 2000 OR p->>'plannedMethod'<>btrim(p->>'plannedMethod')))
 THEN RAISE EXCEPTION 'Invalid plan title, profile or method' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['responsibleId','siteId','watercourseVersionId'] LOOP
   IF p->field<>'null'::jsonb AND (jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR (p->>field)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'Invalid plan relation' USING ERRCODE='22023'; END IF;
 END LOOP;
 -- Reuse the existing calendar validation rather than accepting PostgreSQL date coercion.
 PERFORM private.validate_field_job_values('{"schema":"freyra.field-job-template/v1","title":"Plan dates","domain":"general","fields":[{"key":"plan_start","label":"Start","type":"date","required":false},{"key":"plan_end","label":"End","type":"date","required":false}]}'::jsonb,
   jsonb_build_object('plan_start',p->'plannedStart','plan_end',p->'plannedEnd'));
 IF p->>'plannedEnd' IS NOT NULL AND (p->>'plannedStart' IS NULL OR p->>'plannedEnd'<p->>'plannedStart') THEN RAISE EXCEPTION 'Invalid planned date window' USING ERRCODE='22023'; END IF;
 IF p->>'profile'='watercourse' THEN
   w:=p->'watercourse';keys:=ARRAY['name','externalId','regulationReference','regulationVersion','stationFromM','stationToM','stationDirection','lengthM','bottomWidthM','measurementSource','term'];
   IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR NOT(w ?& keys) OR w-keys<>'{}'::jsonb OR jsonb_typeof(w->'stationDirection') IS DISTINCT FROM 'string' OR w->>'stationDirection' NOT IN ('upstream','downstream','unknown') THEN RAISE EXCEPTION 'Invalid watercourse profile' USING ERRCODE='22023'; END IF;
   FOR field,maximum IN SELECT * FROM (VALUES('name',200),('externalId',200),('regulationReference',1000),('regulationVersion',200),('measurementSource',2000),('term',2000)) limits(k,n) LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'string' OR length(w->>field) NOT BETWEEN 1 AND maximum OR w->>field<>btrim(w->>field)) THEN RAISE EXCEPTION 'Invalid watercourse text' USING ERRCODE='22023'; END IF;
   END LOOP;
   FOREACH field IN ARRAY ARRAY['stationFromM','stationToM','lengthM','bottomWidthM'] LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'number' OR (w->>field)::numeric<0 OR (w->>field)::numeric>1000000000) THEN RAISE EXCEPTION 'Invalid watercourse metres' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['stationFromM','stationToM','lengthM','bottomWidthM']) f(k) WHERE w->f.k<>'null'::jsonb) AND w->>'measurementSource' IS NULL THEN RAISE EXCEPTION 'Station and metre values require their source, including zero' USING ERRCODE='22023'; END IF;
   IF (w->>'stationToM')::numeric<(w->>'stationFromM')::numeric AND w->>'stationDirection'='unknown' THEN RAISE EXCEPTION 'Reversed stationing requires explicit direction' USING ERRCODE='22023'; END IF;
 ELSE
   IF p->'watercourse'<>'null'::jsonb OR p->'watercourseVersionId'<>'null'::jsonb THEN RAISE EXCEPTION 'Watercourse data requires the watercourse profile' USING ERRCODE='22023'; END IF;
 END IF;
END
$$;


       OR (w->>'version')::numeric>2147483647
     THEN RAISE EXCEPTION 'Invalid required job card reference' USING ERRCODE='22023'; END IF;
     FOREACH field IN ARRAY ARRAY['templateVersionId','templateId'] LOOP
       IF jsonb_typeof(w->field) IS DISTINCT FROM 'string'
         OR (w->>field) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} * FROM (VALUES('title',160),('description',4000),('instructions',4000),('locationNote',2000)) limits(k,n) LOOP
   IF jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR length(p->>field)>maximum OR p->>field<>btrim(p->>field) THEN RAISE EXCEPTION 'Invalid plan text field' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF length(p->>'title')=0 OR (p->'profile'<>'null'::jsonb AND (jsonb_typeof(p->'profile') IS DISTINCT FROM 'string' OR p->>'profile' NOT IN ('general','watercourse','nature','construction','grazing')))
   OR (p->'priority'<>'null'::jsonb AND (jsonb_typeof(p->'priority') IS DISTINCT FROM 'string' OR p->>'priority' NOT IN ('high','medium','low')))
   OR (p->'plannedMethod'<>'null'::jsonb AND (jsonb_typeof(p->'plannedMethod') IS DISTINCT FROM 'string' OR length(p->>'plannedMethod') NOT BETWEEN 1 AND 2000 OR p->>'plannedMethod'<>btrim(p->>'plannedMethod')))
 THEN RAISE EXCEPTION 'Invalid plan title, profile or method' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['responsibleId','siteId','watercourseVersionId'] LOOP
   IF p->field<>'null'::jsonb AND (jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR (p->>field)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'Invalid plan relation' USING ERRCODE='22023'; END IF;
 END LOOP;
 -- Reuse the existing calendar validation rather than accepting PostgreSQL date coercion.
 PERFORM private.validate_field_job_values('{"schema":"freyra.field-job-template/v1","title":"Plan dates","domain":"general","fields":[{"key":"plan_start","label":"Start","type":"date","required":false},{"key":"plan_end","label":"End","type":"date","required":false}]}'::jsonb,
   jsonb_build_object('plan_start',p->'plannedStart','plan_end',p->'plannedEnd'));
 IF p->>'plannedEnd' IS NOT NULL AND (p->>'plannedStart' IS NULL OR p->>'plannedEnd'<p->>'plannedStart') THEN RAISE EXCEPTION 'Invalid planned date window' USING ERRCODE='22023'; END IF;
 IF p->>'profile'='watercourse' THEN
   w:=p->'watercourse';keys:=ARRAY['name','externalId','regulationReference','regulationVersion','stationFromM','stationToM','stationDirection','lengthM','bottomWidthM','measurementSource','term'];
   IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR NOT(w ?& keys) OR w-keys<>'{}'::jsonb OR jsonb_typeof(w->'stationDirection') IS DISTINCT FROM 'string' OR w->>'stationDirection' NOT IN ('upstream','downstream','unknown') THEN RAISE EXCEPTION 'Invalid watercourse profile' USING ERRCODE='22023'; END IF;
   FOR field,maximum IN SELECT * FROM (VALUES('name',200),('externalId',200),('regulationReference',1000),('regulationVersion',200),('measurementSource',2000),('term',2000)) limits(k,n) LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'string' OR length(w->>field) NOT BETWEEN 1 AND maximum OR w->>field<>btrim(w->>field)) THEN RAISE EXCEPTION 'Invalid watercourse text' USING ERRCODE='22023'; END IF;
   END LOOP;
   FOREACH field IN ARRAY ARRAY['stationFromM','stationToM','lengthM','bottomWidthM'] LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'number' OR (w->>field)::numeric<0 OR (w->>field)::numeric>1000000000) THEN RAISE EXCEPTION 'Invalid watercourse metres' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['stationFromM','stationToM','lengthM','bottomWidthM']) f(k) WHERE w->f.k<>'null'::jsonb) AND w->>'measurementSource' IS NULL THEN RAISE EXCEPTION 'Station and metre values require their source, including zero' USING ERRCODE='22023'; END IF;
   IF (w->>'stationToM')::numeric<(w->>'stationFromM')::numeric AND w->>'stationDirection'='unknown' THEN RAISE EXCEPTION 'Reversed stationing requires explicit direction' USING ERRCODE='22023'; END IF;
 ELSE
   IF p->'watercourse'<>'null'::jsonb OR p->'watercourseVersionId'<>'null'::jsonb THEN RAISE EXCEPTION 'Watercourse data requires the watercourse profile' USING ERRCODE='22023'; END IF;
 END IF;
END
$$;


       THEN RAISE EXCEPTION 'Invalid required job card identity' USING ERRCODE='22023'; END IF;
     END LOOP;
     PERFORM private.validate_field_job_definition(w->'definition');
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'requiredJobCards') c(value)
     GROUP BY lower(c.value->>'templateId') HAVING count(*)>1)
   THEN RAISE EXCEPTION 'Choose one version per required job card' USING ERRCODE='22023'; END IF;
 END IF;
 FOR field,maximum IN SELECT * FROM (VALUES('title',160),('description',4000),('instructions',4000),('locationNote',2000)) limits(k,n) LOOP
   IF jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR length(p->>field)>maximum OR p->>field<>btrim(p->>field) THEN RAISE EXCEPTION 'Invalid plan text field' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF length(p->>'title')=0 OR (p->'profile'<>'null'::jsonb AND (jsonb_typeof(p->'profile') IS DISTINCT FROM 'string' OR p->>'profile' NOT IN ('general','watercourse','nature','construction','grazing')))
   OR (p->'priority'<>'null'::jsonb AND (jsonb_typeof(p->'priority') IS DISTINCT FROM 'string' OR p->>'priority' NOT IN ('high','medium','low')))
   OR (p->'plannedMethod'<>'null'::jsonb AND (jsonb_typeof(p->'plannedMethod') IS DISTINCT FROM 'string' OR length(p->>'plannedMethod') NOT BETWEEN 1 AND 2000 OR p->>'plannedMethod'<>btrim(p->>'plannedMethod')))
 THEN RAISE EXCEPTION 'Invalid plan title, profile or method' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['responsibleId','siteId','watercourseVersionId'] LOOP
   IF p->field<>'null'::jsonb AND (jsonb_typeof(p->field) IS DISTINCT FROM 'string' OR (p->>field)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN RAISE EXCEPTION 'Invalid plan relation' USING ERRCODE='22023'; END IF;
 END LOOP;
 -- Reuse the existing calendar validation rather than accepting PostgreSQL date coercion.
 PERFORM private.validate_field_job_values('{"schema":"freyra.field-job-template/v1","title":"Plan dates","domain":"general","fields":[{"key":"plan_start","label":"Start","type":"date","required":false},{"key":"plan_end","label":"End","type":"date","required":false}]}'::jsonb,
   jsonb_build_object('plan_start',p->'plannedStart','plan_end',p->'plannedEnd'));
 IF p->>'plannedEnd' IS NOT NULL AND (p->>'plannedStart' IS NULL OR p->>'plannedEnd'<p->>'plannedStart') THEN RAISE EXCEPTION 'Invalid planned date window' USING ERRCODE='22023'; END IF;
 IF p->>'profile'='watercourse' THEN
   w:=p->'watercourse';keys:=ARRAY['name','externalId','regulationReference','regulationVersion','stationFromM','stationToM','stationDirection','lengthM','bottomWidthM','measurementSource','term'];
   IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR NOT(w ?& keys) OR w-keys<>'{}'::jsonb OR jsonb_typeof(w->'stationDirection') IS DISTINCT FROM 'string' OR w->>'stationDirection' NOT IN ('upstream','downstream','unknown') THEN RAISE EXCEPTION 'Invalid watercourse profile' USING ERRCODE='22023'; END IF;
   FOR field,maximum IN SELECT * FROM (VALUES('name',200),('externalId',200),('regulationReference',1000),('regulationVersion',200),('measurementSource',2000),('term',2000)) limits(k,n) LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'string' OR length(w->>field) NOT BETWEEN 1 AND maximum OR w->>field<>btrim(w->>field)) THEN RAISE EXCEPTION 'Invalid watercourse text' USING ERRCODE='22023'; END IF;
   END LOOP;
   FOREACH field IN ARRAY ARRAY['stationFromM','stationToM','lengthM','bottomWidthM'] LOOP
     IF w->field<>'null'::jsonb AND (jsonb_typeof(w->field) IS DISTINCT FROM 'number' OR (w->>field)::numeric<0 OR (w->>field)::numeric>1000000000) THEN RAISE EXCEPTION 'Invalid watercourse metres' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['stationFromM','stationToM','lengthM','bottomWidthM']) f(k) WHERE w->f.k<>'null'::jsonb) AND w->>'measurementSource' IS NULL THEN RAISE EXCEPTION 'Station and metre values require their source, including zero' USING ERRCODE='22023'; END IF;
   IF (w->>'stationToM')::numeric<(w->>'stationFromM')::numeric AND w->>'stationDirection'='unknown' THEN RAISE EXCEPTION 'Reversed stationing requires explicit direction' USING ERRCODE='22023'; END IF;
 ELSE
   IF p->'watercourse'<>'null'::jsonb OR p->'watercourseVersionId'<>'null'::jsonb THEN RAISE EXCEPTION 'Watercourse data requires the watercourse profile' USING ERRCODE='22023'; END IF;
 END IF;
END
$$;


-- Each copied definition must be exactly the existing immutable project template.
CREATE FUNCTION private.check_work_order_required_job_cards() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM jsonb_array_elements(coalesce(NEW.plan->'requiredJobCards','[]'::jsonb)) card
   WHERE NOT EXISTS (
     SELECT 1 FROM public.field_job_template_versions t
     WHERE t.id=(card->>'templateVersionId')::uuid
       AND t.template_id=(card->>'templateId')::uuid AND t.version=(card->>'version')::integer
       AND t.project_id=NEW.project_id AND t.organization_id=NEW.organization_id
       AND t.definition=card->'definition'
   )
 ) THEN RAISE EXCEPTION 'Required job card is unavailable or does not match its version' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.check_work_order_required_job_cards() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER work_order_plan_required_cards BEFORE INSERT ON public.work_order_plan_versions
 FOR EACH ROW EXECUTE FUNCTION private.check_work_order_required_job_cards();

CREATE OR REPLACE FUNCTION private.validate_field_job_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.field_job_versions; bound public.field_job_template_versions; action_project uuid; project_organization uuid;
BEGIN
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_contribute_project(NEW.project_id) THEN
    RAISE EXCEPTION 'Job field contribution access required' USING ERRCODE = '42501';
  END IF;
  SELECT organization_id INTO project_organization FROM public.projects WHERE id = NEW.project_id;
  SELECT project_id INTO action_project FROM public.actions WHERE id = NEW.action_id;
  SELECT * INTO bound FROM public.field_job_template_versions WHERE id = NEW.template_version_id;
  IF project_organization IS DISTINCT FROM NEW.organization_id OR action_project IS DISTINCT FROM NEW.project_id
     OR bound.id IS NULL OR bound.project_id <> NEW.project_id OR bound.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Invalid job action, template or project scope' USING ERRCODE = '42501';
  END IF;
  -- Same task lock as plan changes, before checking the explicitly mandated template.
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:' || NEW.action_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('field-job-action:' || NEW.action_id::text, 0));
  SELECT * INTO previous FROM public.field_job_versions WHERE action_id = NEW.action_id ORDER BY version DESC LIMIT 1;
  IF NEW.version IS DISTINCT FROM coalesce(previous.version, 0) + 1 THEN
    RAISE EXCEPTION 'Job version conflict; reload' USING ERRCODE = '40001';
  END IF;
  IF previous.id IS NOT NULL AND (previous.project_id <> NEW.project_id OR previous.organization_id <> NEW.organization_id) THEN
    RAISE EXCEPTION 'Job project scope is immutable' USING ERRCODE = '23514';
  END IF;
  IF (previous.id IS NULL OR previous.template_version_id <> NEW.template_version_id) AND NOT private.can_write_project(NEW.project_id)
    AND NOT (private.can_execute_work_order(NEW.action_id) AND EXISTS (
      SELECT 1 FROM (
        SELECT p.plan FROM public.work_order_plan_versions p
        WHERE p.action_id=NEW.action_id AND p.project_id=NEW.project_id AND p.organization_id=NEW.organization_id
        ORDER BY p.version DESC LIMIT 1
      ) latest, jsonb_array_elements(coalesce(latest.plan->'requiredJobCards','[]'::jsonb)) card
      WHERE (card->>'templateVersionId')::uuid=NEW.template_version_id
    )) THEN
    RAISE EXCEPTION 'Only a project editor may bind a job template' USING ERRCODE = '42501';
  END IF;
  IF previous.id IS NOT NULL AND coalesce(length(btrim(NEW.correction_reason)), 0) = 0 THEN
    RAISE EXCEPTION 'A new job revision requires a correction reason' USING ERRCODE = '22023';
  END IF;
  PERFORM private.validate_field_job_values(bound.definition, NEW."values");
  NEW.created_at := now();
  RETURN NEW;
END $$;


-- Preserve the existing target snapshot and access/lock/receipt checks.
ALTER FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean)
 RENAME TO build_work_order_submission_with_target;
REVOKE ALL ON FUNCTION private.build_work_order_submission_with_target(uuid,uuid,uuid,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.build_work_order_submission(p_action_id uuid,p_organization_id uuid,p_project_id uuid,p_lock boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE built jsonb; packet jsonb; required jsonb; evidence jsonb:='[]'::jsonb;
 row jsonb; card jsonb; template_version uuid; gaps jsonb;
BEGIN
 -- The inner builder verifies actor, task and project before reading any sources.
 built:=private.build_work_order_submission_with_target(p_action_id,p_organization_id,p_project_id,p_lock);
 required:=coalesce(built->'snapshot'->'plan'->'plan'->'requiredJobCards','[]'::jsonb);
 -- Unconfigured tasks retain the exact previous contract, snapshot and hash.
 IF jsonb_array_length(required)=0 THEN RETURN built; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(built->'snapshot'->'evidence') LOOP
   SELECT v.template_version_id INTO template_version FROM public.field_job_versions v
   WHERE v.id=(row->>'observation_version_id')::uuid AND v.action_id=p_action_id
     AND v.project_id=p_project_id AND v.organization_id=p_organization_id;
   row:=jsonb_set(row,'{observation_snapshot,templateVersionId}',to_jsonb(template_version));
   evidence:=evidence||jsonb_build_array(row);
 END LOOP;
 gaps:=built->'gaps';
 FOR card IN SELECT value FROM jsonb_array_elements(required) LOOP
   IF NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(evidence) ev
     WHERE ev->'observation_snapshot'->>'templateVersionId'=card->>'templateVersionId'
       AND ev->'observation_snapshot'->'template'=card->'definition'
   ) THEN
     IF NOT(gaps ? 'required_job_card_missing') THEN gaps:=gaps||jsonb_build_array('required_job_card_missing'); END IF;
   END IF;
 END LOOP;
 packet:=(built->'snapshot')||jsonb_build_object('ruleSet','freyra.submission-requirements/v1','evidence',evidence);
 IF octet_length(packet::text)>1048576 AND NOT(gaps ? 'packet_too_large') THEN
   gaps:=gaps||jsonb_build_array('packet_too_large');
 END IF;
 RETURN jsonb_build_object('snapshot',packet,
   'basisHash',encode(sha256(convert_to(packet::text,'UTF8')),'hex'),
   'gaps',(SELECT coalesce(jsonb_agg(g ORDER BY g),'[]'::jsonb) FROM jsonb_array_elements_text(gaps) g));
END $$;
REVOKE ALL ON FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.build_work_order_submission(uuid,uuid,uuid,boolean) TO authenticated;

-- Acquire task then field-card lock in both RPC and direct-insert paths.
-- A stale field version is a domain conflict. PostgREST must not replay it as a serialization failure.
CREATE OR REPLACE FUNCTION public.save_field_job_version(
  p_organization_id uuid, p_project_id uuid, p_action_id uuid, p_template_version_id uuid,
  p_expected_version integer, p_values jsonb, p_status text, p_correction_reason text, p_request_id uuid
) RETURNS SETOF public.field_job_versions LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.field_job_versions; latest_version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_contribute_project(p_project_id)
     OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Job field contribution access required' USING ERRCODE = '42501';
  END IF;
  IF p_action_id IS NULL OR p_template_version_id IS NULL OR p_request_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483646 THEN
    RAISE EXCEPTION 'Invalid job request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:' || p_action_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('field-job-action:' || p_action_id::text, 0));
  SELECT * INTO saved FROM public.field_job_versions WHERE project_id = p_project_id AND request_id = p_request_id;
  IF saved.id IS NOT NULL THEN
    IF saved.action_id IS DISTINCT FROM p_action_id OR saved.organization_id IS DISTINCT FROM p_organization_id
       OR saved.created_by IS DISTINCT FROM auth.uid() OR saved.version IS DISTINCT FROM p_expected_version + 1
       OR saved.template_version_id IS DISTINCT FROM p_template_version_id OR saved."values" IS DISTINCT FROM p_values
       OR saved.status IS DISTINCT FROM p_status OR saved.correction_reason IS DISTINCT FROM coalesce(p_correction_reason, '') THEN
      RAISE EXCEPTION 'Job request id was reused with different content' USING ERRCODE = '22023';
    END IF;
    RETURN NEXT saved; RETURN;
  END IF;
  SELECT max(version) INTO latest_version FROM public.field_job_versions WHERE action_id = p_action_id;
  IF coalesce(latest_version, 0) <> p_expected_version THEN
    RAISE EXCEPTION 'Job version conflict; reload' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.field_job_versions(action_id, organization_id, project_id, version, template_version_id, "values", status, correction_reason, request_id)
    VALUES (p_action_id, p_organization_id, p_project_id, p_expected_version + 1, p_template_version_id, p_values, p_status, coalesce(p_correction_reason, ''), p_request_id)
    RETURNING * INTO saved;
  RETURN NEXT saved;
END $$;

-- Direct plan inserts take the same task lock before the plan-version lock.
CREATE OR REPLACE FUNCTION private.guard_work_order_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE latest integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Work-order plans are immutable revisions' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT private.can_write_project(NEW.project_id) THEN RAISE EXCEPTION 'Work order is unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
 PERFORM private.validate_work_order_plan(NEW.plan);
 PERFORM pg_advisory_xact_lock(hashtextextended('work-order-plan:'||NEW.action_id::text,0));
 SELECT max(v.version) INTO latest FROM public.work_order_plan_versions v WHERE v.action_id=NEW.action_id;
 IF NEW.version IS DISTINCT FROM coalesce(latest,0)+1 THEN RAISE EXCEPTION 'Work-order plan changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF NEW.version>1 AND length(btrim(NEW.correction_reason))=0 THEN RAISE EXCEPTION 'Plan correction reason is required' USING ERRCODE='22023'; END IF;
 NEW.responsible_id:=(NEW.plan->>'responsibleId')::uuid;NEW.site_id:=(NEW.plan->>'siteId')::uuid;NEW.centerline_version_id:=(NEW.plan->>'watercourseVersionId')::uuid;
 NEW.planned_start:=(NEW.plan->>'plannedStart')::date;NEW.planned_end:=(NEW.plan->>'plannedEnd')::date;
 IF NEW.responsible_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.organization_memberships om WHERE om.organization_id=NEW.organization_id AND om.user_id=NEW.responsible_id
   AND (om.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM public.project_members pm WHERE pm.project_id=NEW.project_id AND pm.user_id=NEW.responsible_id))
 ) THEN RAISE EXCEPTION 'Responsible person is not a current project member' USING ERRCODE='22023'; END IF;
 NEW.created_at:=clock_timestamp();NEW.correction_reason:=btrim(NEW.correction_reason);RETURN NEW;
END
$$;
