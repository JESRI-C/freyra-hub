-- Enforce geospatial and file-provenance invariants for drone/project media.
-- Constraints are introduced NOT VALID first so existing installations fail
-- at the explicit validation step instead of silently accepting bad history.

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_coordinate_pair_check'
  ) then
    alter table public.project_media
      add constraint project_media_coordinate_pair_check
      check ((lat is null) = (lng is null)) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_latitude_check'
  ) then
    alter table public.project_media
      add constraint project_media_latitude_check
      check (lat is null or lat between -90 and 90) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_longitude_check'
  ) then
    alter table public.project_media
      add constraint project_media_longitude_check
      check (lng is null or lng between -180 and 180) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_accuracy_check'
  ) then
    alter table public.project_media
      add constraint project_media_accuracy_check
      check (accuracy_m is null or accuracy_m >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_file_size_check'
  ) then
    alter table public.project_media
      add constraint project_media_file_size_check
      check (file_size_bytes is null or file_size_bytes >= 0) not valid;
  end if;
end
$$;

alter table public.project_media
  validate constraint project_media_category_check,
  validate constraint project_media_source_check,
  validate constraint project_media_status_check,
  validate constraint project_media_coordinate_pair_check,
  validate constraint project_media_latitude_check,
  validate constraint project_media_longitude_check,
  validate constraint project_media_accuracy_check,
  validate constraint project_media_file_size_check;
