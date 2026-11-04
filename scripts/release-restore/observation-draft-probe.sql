-- Run in both the source and actually restored disposable local database.
-- No GRANT or privileged origin read may repair/mask a missing restored ACL.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL TIME ZONE 'Europe/Copenhagen';
SET LOCAL request.jwt.claim.sub='ea000000-0000-4000-8000-000000000001';
DO $$
DECLARE envelope jsonb; origin jsonb; source jsonb; expected_hash text;
BEGIN
  SELECT value INTO STRICT envelope FROM public.get_work_order_observation_draft(
    'ed090000-0000-4000-8000-000000000003','eb000000-0000-4000-8000-000000000001',
    'ec000000-0000-4000-8000-000000000001'
  ) result(value);
  origin:=envelope->'origin';
  IF envelope->>'action_id' IS DISTINCT FROM 'ed090000-0000-4000-8000-000000000003'
    OR envelope->>'organization_id' IS DISTINCT FROM 'eb000000-0000-4000-8000-000000000001'
    OR envelope->>'project_id' IS DISTINCT FROM 'ec000000-0000-4000-8000-000000000001'
    OR envelope->>'user_id' IS DISTINCT FROM 'ea000000-0000-4000-8000-000000000001'
    OR origin->>'action_id' IS DISTINCT FROM envelope->>'action_id'
    OR origin->>'organization_id' IS DISTINCT FROM envelope->>'organization_id'
    OR origin->>'project_id' IS DISTINCT FROM envelope->>'project_id'
    OR origin->>'user_id' IS DISTINCT FROM envelope->>'user_id'
    OR origin->>'created_by' IS DISTINCT FROM envelope->>'user_id'
    OR origin->>'request_id' IS DISTINCT FROM 'ed090000-0000-4000-8000-000000000004'
    OR origin->>'title' IS DISTINCT FROM 'DISPOSABLE P9 RESTORE DRAFT'
    OR origin->>'description' IS DISTINCT FROM 'Synthetic preserved observation basis; no original bytes or execution evidence.'
    OR origin->>'status' IS DISTINCT FROM 'draft'
    OR jsonb_array_length(origin->'sources') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'P9 restore manager origin identity/content mismatch';
  END IF;
  source:=origin->'sources'->0;
  expected_hash:=encode(sha256(convert_to(jsonb_build_object(
    'snapshot',source->'snapshot','media_refs',source->'media_refs'
  )::text,'UTF8')),'hex');
  IF source->>'observation_id' IS DISTINCT FROM 'ed090000-0000-4000-8000-000000000001'
    OR source->'snapshot'->>'id' IS DISTINCT FROM source->>'observation_id'
    OR source->'snapshot'->>'project_id' IS DISTINCT FROM envelope->>'project_id'
    OR source->'snapshot'->>'notes' IS DISTINCT FROM 'DISPOSABLE P9 RESTORE SOURCE'
    OR source->'snapshot'->'count_value' IS DISTINCT FROM '0'::jsonb
    OR source->'snapshot'->>'visibility' IS DISTINCT FROM 'hidden'
    OR jsonb_array_length(source->'media_refs') IS DISTINCT FROM 1
    OR source->'media_refs'->0->>'id' IS DISTINCT FROM 'ed090000-0000-4000-8000-000000000002'
    OR source->'media_refs'->0->>'observation_id' IS DISTINCT FROM source->>'observation_id'
    OR source->'media_refs'->0->>'storage_path' IS DISTINCT FROM 'disposable-restore/p9/original-reference.jpg'
    OR source->>'source_hash' IS DISTINCT FROM expected_hash THEN
    RAISE EXCEPTION 'P9 restore source snapshot/media/hash mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM public.field_observations WHERE id='ed090000-0000-4000-8000-000000000001')
    OR EXISTS(SELECT 1 FROM public.observation_media WHERE id='ed090000-0000-4000-8000-000000000002')
    OR (SELECT count(*) FROM private.work_order_observation_drafts
        WHERE action_id='ed090000-0000-4000-8000-000000000003')<>1
    OR (SELECT count(*) FROM public.work_order_lifecycle_versions
        WHERE action_id='ed090000-0000-4000-8000-000000000003' AND status='draft')<>1 THEN
    RAISE EXCEPTION 'P9 restore origin did not survive source deletion as one draft';
  END IF;
END;
$$;
SET LOCAL request.jwt.claim.sub='ea000000-0000-4000-8000-000000000009';
DO $$
BEGIN
  BEGIN
    PERFORM public.get_work_order_observation_draft(
      'ed090000-0000-4000-8000-000000000003','eb000000-0000-4000-8000-000000000001',
      'ec000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'P9 restore external origin read was unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Exactly SQLSTATE 42501; other errors still fail the probe.
  END;
  IF EXISTS(SELECT 1 FROM private.work_order_observation_drafts
    WHERE action_id='ed090000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'P9 restore external private origin RLS leaked a row';
  END IF;
END;
$$;
SET LOCAL request.jwt.claim.sub='ea000000-0000-4000-8000-000000000001';
SELECT jsonb_build_object(
  'schema','freyra.observation-draft-restore/v1',
  'managerOrigin',value,'snapshotHashValid',true,'externalSqlState','42501',
  'externalOriginRows',0,'sourceDeletionPreserved',true,'storageBytesIncluded',false
) FROM public.get_work_order_observation_draft(
  'ed090000-0000-4000-8000-000000000003','eb000000-0000-4000-8000-000000000001',
  'ec000000-0000-4000-8000-000000000001'
) result(value);
ROLLBACK;
