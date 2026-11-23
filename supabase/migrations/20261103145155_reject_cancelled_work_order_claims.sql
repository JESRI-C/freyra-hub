-- The existing assignment guard already holds the same action lock as cancellation.
-- Receipts returned by the claim RPC do not insert a new assignment revision.
CREATE FUNCTION private.reject_cancelled_work_order_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.change_kind='claimed' AND (
    SELECT v.status FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=NEW.action_id AND v.project_id=NEW.project_id
      AND v.organization_id=NEW.organization_id
    ORDER BY v.version DESC LIMIT 1
  )='cancelled' THEN
    RAISE EXCEPTION 'A cancelled work order cannot be claimed' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reject_cancelled_work_order_claim() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_reject_cancelled_work_order_claim BEFORE INSERT ON public.work_order_assignment_versions
  FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_work_order_claim();
