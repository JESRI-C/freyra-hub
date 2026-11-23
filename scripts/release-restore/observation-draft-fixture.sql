-- Only included inside test-release-restore.sh's guarded disposable CI transaction.
-- No original bytes, grants, trigger bypass, or dependency on concurrency fixtures.
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
  ('ea000000-0000-4000-8000-000000000009','disposable-restore-external@example.test','{}','{}');
INSERT INTO public.organization_memberships(user_id,organization_id,role) VALUES
  ('ea000000-0000-4000-8000-000000000009','eb000000-0000-4000-8000-000000000001','viewer');
INSERT INTO public.project_members(project_id,user_id,role) VALUES
  ('ec000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000009','external');

SET LOCAL ROLE authenticated;
INSERT INTO public.field_observations(
  id,project_id,observation_type,observed_at,observer_id,count_value,notes,visibility,status,metadata
) VALUES (
  'ed090000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001',
  'manual','2026-11-04T09:10:11Z','ea000000-0000-4000-8000-000000000001',0,
  'DISPOSABLE P9 RESTORE SOURCE','hidden','draft','{"restoreFixture":true,"time_precision":"unknown"}'
);
INSERT INTO public.observation_media(id,observation_id,media_type,storage_path,exif_data,uploaded_by)
VALUES (
  'ed090000-0000-4000-8000-000000000002','ed090000-0000-4000-8000-000000000001',
  'photo','disposable-restore/p9/original-reference.jpg','{"restoreFixture":true}',
  'ea000000-0000-4000-8000-000000000001'
);
DO $$
DECLARE source jsonb; receipt jsonb;
BEGIN
  SELECT value->'items'->0 INTO STRICT source
  FROM public.list_work_order_observation_sources(
    'eb000000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001',
    NULL,1,'DISPOSABLE P9 RESTORE SOURCE'
  ) result(value);
  IF source->>'observation_id' IS DISTINCT FROM 'ed090000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'P9 restore fixture source selection mismatch';
  END IF;
  SELECT value INTO STRICT receipt FROM public.create_work_order_observation_draft(
    'ed090000-0000-4000-8000-000000000003','eb000000-0000-4000-8000-000000000001',
    'ec000000-0000-4000-8000-000000000001','DISPOSABLE P9 RESTORE DRAFT',
    'Synthetic preserved observation basis; no original bytes or execution evidence.',
    jsonb_build_array(jsonb_build_object('observationId',source->>'observation_id','sourceHash',source->>'source_hash')),
    'ed090000-0000-4000-8000-000000000004'
  ) result(value);
  IF receipt->'sources' IS DISTINCT FROM jsonb_build_array(source) THEN
    RAISE EXCEPTION 'P9 restore fixture did not preserve selected source';
  END IF;
END;
$$;
-- Use the ordinary source DELETE policy. Its media cascade must not erase origin.
DELETE FROM public.field_observations WHERE id='ed090000-0000-4000-8000-000000000001';
RESET ROLE;
