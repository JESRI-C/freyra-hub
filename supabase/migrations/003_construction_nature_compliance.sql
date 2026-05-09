-- Construction Nature Compliance Module — Migration 003
-- Tables for construction projects near nature and water
-- Run via: supabase db push  (or paste into Supabase SQL editor)

-- ─── Construction Projects Extension ─────────────────────────────────────────

create table if not exists construction_projects (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid references projects(id) on delete cascade,
  developer_name        text,
  contractor_name       text,
  consultant_name       text,
  construction_type     text,
  construction_phase    text,
  parcel_reference      text,
  building_area_m2      numeric,
  paved_area_m2         numeric,
  expected_start_date   date,
  expected_end_date     date,
  authority_contact     text,
  created_at            timestamptz default now()
);

create index if not exists construction_projects_project_id_idx on construction_projects(project_id);

-- ─── Nature Contexts ──────────────────────────────────────────────────────────

create table if not exists nature_contexts (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid references projects(id) on delete cascade,
  adjacent_nature_type        text,
  watercourse_present         boolean,
  watercourse_name            text,
  distance_to_watercourse_m   numeric,
  protected_nature_present    boolean,
  protected_nature_type       text,
  natura2000_nearby           boolean,
  distance_to_natura2000_m    numeric,
  buffer_zone_m               numeric,
  terrain_slope_description   text,
  sensitive_receptors         text,
  created_at                  timestamptz default now()
);

create index if not exists nature_contexts_project_id_idx on nature_contexts(project_id);

-- ─── Runoff Profiles ──────────────────────────────────────────────────────────

create table if not exists runoff_profiles (
  id                           uuid primary key default gen_random_uuid(),
  project_id                   uuid references projects(id) on delete cascade,
  runoff_destination           text,
  drainage_principle           text,
  retention_solution           text,
  treatment_solution           text,
  oil_separator_present        boolean,
  sediment_control_present     boolean,
  discharge_point_description  text,
  estimated_runoff_volume_m3   numeric,
  design_rain_event            text,
  maintenance_responsibility   text,
  created_at                   timestamptz default now()
);

create index if not exists runoff_profiles_project_id_idx on runoff_profiles(project_id);

-- ─── Environmental Risks ──────────────────────────────────────────────────────

create table if not exists environmental_risks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects(id) on delete cascade,
  risk_type          text,
  title              text not null,
  description        text,
  severity           text,
  likelihood         text,
  status             text,
  mitigation_summary text,
  responsible_party  text,
  created_at         timestamptz default now()
);

create index if not exists environmental_risks_project_id_idx on environmental_risks(project_id);
create index if not exists environmental_risks_severity_idx   on environmental_risks(severity);
create index if not exists environmental_risks_status_idx     on environmental_risks(status);

-- ─── Mitigation Measures ──────────────────────────────────────────────────────

create table if not exists mitigation_measures (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references projects(id) on delete cascade,
  risk_id             uuid references environmental_risks(id) on delete set null,
  title               text not null,
  description         text,
  measure_type        text,
  status              text,
  due_date            date,
  responsible_party   text,
  verification_method text,
  created_at          timestamptz default now()
);

create index if not exists mitigation_measures_project_id_idx on mitigation_measures(project_id);
create index if not exists mitigation_measures_risk_id_idx    on mitigation_measures(risk_id);
create index if not exists mitigation_measures_status_idx     on mitigation_measures(status);

-- ─── Authority Submissions ────────────────────────────────────────────────────

create table if not exists authority_submissions (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects(id) on delete cascade,
  title              text not null,
  authority_name     text,
  submission_type    text,
  status             text,
  submitted_at       timestamptz,
  response_due_date  date,
  summary            text,
  created_at         timestamptz default now()
);

create index if not exists authority_submissions_project_id_idx on authority_submissions(project_id);
create index if not exists authority_submissions_status_idx     on authority_submissions(status);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table construction_projects  enable row level security;
alter table nature_contexts        enable row level security;
alter table runoff_profiles        enable row level security;
alter table environmental_risks    enable row level security;
alter table mitigation_measures    enable row level security;
alter table authority_submissions  enable row level security;

-- Temporary open policy for development (replace with proper auth policies)
create policy "dev_select_all" on construction_projects  for select using (true);
create policy "dev_select_all" on nature_contexts        for select using (true);
create policy "dev_select_all" on runoff_profiles        for select using (true);
create policy "dev_select_all" on environmental_risks    for select using (true);
create policy "dev_select_all" on mitigation_measures    for select using (true);
create policy "dev_select_all" on authority_submissions  for select using (true);
