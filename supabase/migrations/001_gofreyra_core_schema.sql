-- GoFreyra Core Schema — Migration 001
-- Run via: supabase db push  (or paste into Supabase SQL editor)

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Organizations ────────────────────────────────────────────────────────────
create table if not exists organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  type        text,
  country     text default 'Denmark',
  created_at  timestamptz default now()
);

-- ─── Projects ─────────────────────────────────────────────────────────────────
create table if not exists projects (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  name            text not null,
  slug            text unique,
  project_type    text,
  location_name   text,
  municipality    text,
  country         text default 'Denmark',
  status          text,
  start_date      date,
  end_date        date,
  description     text,
  created_at      timestamptz default now()
);

-- ─── Sites ────────────────────────────────────────────────────────────────────
create table if not exists sites (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid references projects(id) on delete cascade,
  name             text not null,
  site_type        text,
  area_ha          numeric,
  geometry_geojson jsonb,
  baseline_status  text,
  created_at       timestamptz default now()
);

-- ─── Data Sources ─────────────────────────────────────────────────────────────
create table if not exists data_sources (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid references projects(id) on delete cascade,
  name         text not null,
  source_type  text,
  provider     text,
  status       text,
  last_sync_at timestamptz,
  created_at   timestamptz default now()
);

-- ─── Sensors ──────────────────────────────────────────────────────────────────
create table if not exists sensors (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid references projects(id) on delete cascade,
  site_id      uuid references sites(id) on delete set null,
  name         text not null,
  sensor_type  text,
  status       text,
  lat          numeric,
  lng          numeric,
  last_seen_at timestamptz,
  created_at   timestamptz default now()
);

-- ─── Observations ─────────────────────────────────────────────────────────────
create table if not exists observations (
  id               uuid primary key default uuid_generate_v4(),
  project_id       uuid references projects(id) on delete cascade,
  site_id          uuid references sites(id) on delete set null,
  source_id        uuid references data_sources(id) on delete set null,
  observation_type text,
  indicator_key    text,
  value            numeric,
  unit             text,
  confidence       numeric,
  observed_at      timestamptz,
  metadata         jsonb,
  created_at       timestamptz default now()
);

create index if not exists observations_project_id_idx   on observations(project_id);
create index if not exists observations_observed_at_idx  on observations(observed_at desc);
create index if not exists observations_indicator_key_idx on observations(indicator_key);

-- ─── Indicators ───────────────────────────────────────────────────────────────
create table if not exists indicators (
  id         uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  key        text not null,
  label      text not null,
  category   text,
  value      numeric,
  unit       text,
  trend      text,
  status     text,
  updated_at timestamptz default now()
);

create index if not exists indicators_project_id_idx on indicators(project_id);
create unique index if not exists indicators_project_key_idx on indicators(project_id, key);

-- ─── Reports ──────────────────────────────────────────────────────────────────
create table if not exists reports (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid references projects(id) on delete cascade,
  title        text not null,
  report_type  text,
  status       text,
  period_start date,
  period_end   date,
  summary      text,
  created_at   timestamptz default now()
);

-- ─── Evidence Files ───────────────────────────────────────────────────────────
create table if not exists evidence_files (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid references projects(id) on delete cascade,
  report_id     uuid references reports(id) on delete set null,
  title         text not null,
  file_type     text,
  file_url      text,
  evidence_type text,
  created_at    timestamptz default now()
);

-- ─── Audit Events ─────────────────────────────────────────────────────────────
create table if not exists audit_events (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid references projects(id) on delete cascade,
  event_type  text,
  title       text not null,
  description text,
  actor       text,
  source      text,
  hash        text,
  created_at  timestamptz default now()
);

create index if not exists audit_events_project_id_idx on audit_events(project_id);
create index if not exists audit_events_created_at_idx on audit_events(created_at desc);

-- ─── Actions ──────────────────────────────────────────────────────────────────
create table if not exists actions (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid references projects(id) on delete cascade,
  title       text not null,
  description text,
  priority    text,
  status      text,
  due_date    date,
  owner       text,
  created_at  timestamptz default now()
);

-- ─── Impact Units ─────────────────────────────────────────────────────────────
create table if not exists impact_units (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid references projects(id) on delete cascade,
  unit_type           text,
  quantity            numeric,
  status              text,
  verification_status text,
  issued_at           timestamptz,
  metadata            jsonb,
  created_at          timestamptz default now()
);

-- ─── Row Level Security (enable, policies TBD after auth setup) ───────────────
alter table organizations  enable row level security;
alter table projects       enable row level security;
alter table sites          enable row level security;
alter table data_sources   enable row level security;
alter table sensors        enable row level security;
alter table observations   enable row level security;
alter table indicators     enable row level security;
alter table reports        enable row level security;
alter table evidence_files enable row level security;
alter table audit_events   enable row level security;
alter table actions        enable row level security;
alter table impact_units   enable row level security;

-- Temporary open policy for development (replace with proper auth policies)
create policy "dev_select_all" on organizations  for select using (true);
create policy "dev_select_all" on projects       for select using (true);
create policy "dev_select_all" on sites          for select using (true);
create policy "dev_select_all" on data_sources   for select using (true);
create policy "dev_select_all" on sensors        for select using (true);
create policy "dev_select_all" on observations   for select using (true);
create policy "dev_select_all" on indicators     for select using (true);
create policy "dev_select_all" on reports        for select using (true);
create policy "dev_select_all" on evidence_files for select using (true);
create policy "dev_select_all" on audit_events   for select using (true);
create policy "dev_select_all" on actions        for select using (true);
create policy "dev_select_all" on impact_units   for select using (true);
