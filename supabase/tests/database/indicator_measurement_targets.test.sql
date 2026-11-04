BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

INSERT INTO public.organizations (id, name, type, country)
VALUES ('a6090000-0000-4000-8000-000000000001', 'Synthetic indicator targets', 'test', 'Denmark');
INSERT INTO public.projects (id, organization_id, name)
VALUES ('a6090000-0000-4000-8000-000000000002', 'a6090000-0000-4000-8000-000000000001', 'Synthetic target project');
INSERT INTO public.indicators (id, project_id, key, label, unit)
VALUES ('a6090000-0000-4000-8000-000000000003', 'a6090000-0000-4000-8000-000000000002', 'synthetic_target', 'Synthetic indicator', 'stk.');

SELECT lives_ok(
  $$ UPDATE public.indicators SET target_value = 0, target_direction = 'at_most', target_unit = 'stk.'
     WHERE id = 'a6090000-0000-4000-8000-000000000003' $$,
  'a zero goal can be saved on an existing indicator'
);
SELECT throws_ok(
  $$ UPDATE public.indicators SET target_direction = NULL WHERE id = 'a6090000-0000-4000-8000-000000000003' $$,
  '23514', NULL, 'a partially configured target is rejected'
);
SELECT throws_ok(
  $$ UPDATE public.indicators SET target_value = 'NaN'::numeric WHERE id = 'a6090000-0000-4000-8000-000000000003' $$,
  '23514', NULL, 'a non-finite target is rejected'
);
SELECT lives_ok(
  $$ UPDATE public.indicators SET target_value = NULL, target_direction = NULL, target_unit = NULL
     WHERE id = 'a6090000-0000-4000-8000-000000000003' $$,
  'the target can be removed without changing the indicator'
);

SELECT * FROM finish();
ROLLBACK;
