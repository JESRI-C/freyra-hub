-- Run after the existing execution guards have checked access and locked the action.
-- The execution RPC and its workspace entry are in the same transaction.
CREATE FUNCTION private.reject_cancelled_work_order_execution() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF (
    SELECT v.status FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=NEW.action_id AND v.project_id=NEW.project_id
      AND v.organization_id=NEW.organization_id
    ORDER BY v.version DESC LIMIT 1
  )='cancelled' THEN
    RAISE EXCEPTION 'A cancelled work order cannot record execution' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reject_cancelled_work_order_execution() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_reject_cancelled_work_order_execution BEFORE INSERT ON public.work_order_execution_bindings
  FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_work_order_execution();
