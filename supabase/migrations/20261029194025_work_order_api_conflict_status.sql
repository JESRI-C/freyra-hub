-- Expected-version conflicts are HTTP 409 domain outcomes, not database retry errors.
-- Native PostgreSQL 40001 errors still propagate and remain mapped by the service.
DO $$
DECLARE signature text;routine regprocedure;definition text;updated text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
   'private.guard_work_order_access()',
   'public.initialize_work_order(uuid,uuid,uuid,integer,uuid)',
   'public.save_work_order_access(uuid,uuid,uuid,uuid,integer,boolean,boolean,boolean,text,uuid)',
   'private.guard_work_order_plan()',
   'public.save_work_order_plan(uuid,uuid,uuid,integer,jsonb,text,uuid)',
   'private.guard_work_order_execution_binding()',
   'public.save_work_order_execution(uuid,uuid,uuid,uuid,integer,integer,jsonb,uuid,text,uuid)'
 ] LOOP
   routine:=to_regprocedure(signature);
   IF routine IS NULL THEN RAISE EXCEPTION 'Missing work-order conflict function';END IF;
   definition:=pg_get_functiondef(routine);
   updated:=replace(definition,'''40001''','''PT409''');
   IF updated=definition THEN RAISE EXCEPTION 'Expected work-order conflict marker is absent';END IF;
   EXECUTE updated;
 END LOOP;
END
$$;
