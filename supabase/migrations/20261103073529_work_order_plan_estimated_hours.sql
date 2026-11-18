CREATE OR REPLACE FUNCTION private.validate_work_order_plan(p jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE keys text[]:=ARRAY['schema','title','description','instructions','profile','responsibleId','siteId','watercourseVersionId','locationNote','plannedStart','plannedEnd','priority','plannedMethod','watercourse'];
 field text; maximum integer; w jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& keys) OR p-keys-'estimatedHours'<>'{}'::jsonb OR p->>'schema' IS DISTINCT FROM 'freyra.work-order-plan/v1' THEN
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
