-- metadata was added after the legacy column-level grants were frozen.
-- Permit provenance on a NEW legacy field-photo row; role RLS still governs insert.
-- No UPDATE grant and no access to canonical original identity/server fields.
GRANT INSERT (metadata) ON public.project_media TO authenticated;
