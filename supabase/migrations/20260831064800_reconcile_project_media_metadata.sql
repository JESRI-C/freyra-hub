-- Reconcile legacy project_media installations created before drone metadata
-- and geolocation provenance were added to the canonical table definition.
-- Existing rows keep their values; NOT VALID checks protect new writes without
-- making this forward migration assert unaudited historical data.

alter table public.project_media
  add column if not exists thumbnail_url text,
  add column if not exists captured_at timestamptz,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists altitude_m double precision,
  add column if not exists accuracy_m double precision,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_category_check'
  ) then
    alter table public.project_media
      add constraint project_media_category_check
      check (category in (
        'field_photo', 'drone_image', 'satellite_snapshot', 'before_after',
        'document_scan', 'biodiversity_observation', 'water_observation',
        'soil_observation'
      )) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_source_check'
  ) then
    alter table public.project_media
      add constraint project_media_source_check
      check (source in ('field_upload', 'drone', 'copernicus', 'drone_api', 'manual'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.project_media'::regclass
      and conname = 'project_media_status_check'
  ) then
    alter table public.project_media
      add constraint project_media_status_check
      check (status in ('uploaded', 'processing', 'ready', 'report_ready', 'archived'))
      not valid;
  end if;
end
$$;

alter table public.project_media enable row level security;

create index if not exists project_media_project_uploaded_idx
  on public.project_media (project_id, uploaded_at desc);
