-- Data Foundation: connector activity log
-- Logs when environmental context is fetched for a project

create table if not exists connector_fetch_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  connector_id text not null,
  connector_name text not null,
  status text not null, -- 'success' | 'fallback' | 'error' | 'not_configured'
  summary text,
  fetched_at timestamptz default now(),
  metadata jsonb
);

create index if not exists idx_connector_fetch_logs_project on connector_fetch_logs(project_id, fetched_at desc);

alter table connector_fetch_logs enable row level security;
create policy "dev_select_all_connector_logs" on connector_fetch_logs for select using (true);
