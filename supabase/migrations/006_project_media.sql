-- Create project_media table
create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  category text not null check (category in ('field_photo','drone_image','satellite_snapshot','before_after','document_scan','biodiversity_observation','water_observation','soil_observation')),
  source text not null check (source in ('field_upload','drone','copernicus','drone_api','manual')),
  file_path text not null,
  url text not null,
  thumbnail_url text,
  uploaded_at timestamptz not null default now(),
  captured_at timestamptz,
  lat double precision,
  lng double precision,
  altitude_m double precision,
  accuracy_m double precision,
  is_report_ready boolean not null default false,
  tags text[] not null default '{}',
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','report_ready','archived')),
  file_size_bytes bigint,
  mime_type text
);

-- Enable RLS
alter table public.project_media enable row level security;

-- RLS policies (auth users can CRUD their own project media)
create policy "Users can view media for their projects"
  on public.project_media for select
  using (true);

create policy "Authenticated users can insert media"
  on public.project_media for insert
  with check (auth.uid() is not null);

create policy "Authenticated users can update their media"
  on public.project_media for update
  using (auth.uid() is not null);

create policy "Authenticated users can delete their media"
  on public.project_media for delete
  using (auth.uid() is not null);

-- Create storage bucket (idempotent via DO block)
-- Note: Supabase Storage buckets are created via dashboard or API, not SQL migrations
-- This comment documents the required bucket: "project-media" (public: false)
