-- Project contributors can save field cards even when lifecycle details are private.
-- Read only the matching task's current cancellation state after normal validation.
CREATE FUNCTION private.reject_cancelled_field_job_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
     OR NOT coalesce(private.can_contribute_project(NEW.project_id),false) THEN
    RAISE EXCEPTION 'Job field contribution access required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('work-order:'||NEW.action_id::text,0));
  IF (
    SELECT v.status FROM public.work_order_lifecycle_versions v
    WHERE v.action_id=NEW.action_id AND v.project_id=NEW.project_id
      AND v.organization_id=NEW.organization_id
    ORDER BY v.version DESC LIMIT 1
  )='cancelled' THEN
    RAISE EXCEPTION 'A cancelled work order cannot record field data' USING ERRCODE='PT410';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reject_cancelled_field_job_registration() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_reject_cancelled_field_job_registration BEFORE INSERT ON public.field_job_versions
  FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_field_job_registration();
