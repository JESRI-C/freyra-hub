-- Run after each ledger's normal permission and version validation.
CREATE FUNCTION private.reject_cancelled_work_order_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
  IF (
    SELECT v.status FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=NEW.action_id AND v.project_id=NEW.project_id
      AND v.organization_id=NEW.organization_id
    ORDER BY v.version DESC LIMIT 1
  )='cancelled' THEN
    RAISE EXCEPTION 'A cancelled work order cannot record time or materials' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reject_cancelled_work_order_usage() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_reject_cancelled_work_order_time BEFORE INSERT ON public.work_order_time_versions
  FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_work_order_usage();
CREATE TRIGGER zz_reject_cancelled_work_order_material BEFORE INSERT ON public.work_order_material_versions
  FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_work_order_usage();
