# Supabase RLS Plan — GoFreyra

## Strategy

All tables use Row Level Security (RLS). Access is gated on `organization_memberships`. A helper function returns the current user's org IDs to avoid repeating joins.

## Helper function

```sql
create or replace function current_user_org_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select organization_id
  from public.organization_memberships
  where user_id = auth.uid()
$$;
```

## Per-table policies

### `organizations`

```sql
alter table public.organizations enable row level security;

create policy "members can read their org"
  on public.organizations for select
  using (id in (select current_user_org_ids()));

create policy "owners can update their org"
  on public.organizations for update
  using (id in (
    select organization_id from public.organization_memberships
    where user_id = auth.uid() and role = 'owner'
  ));
```

### `projects`

```sql
alter table public.projects enable row level security;

create policy "org members can read projects"
  on public.projects for select
  using (organization_id in (select current_user_org_ids()));

create policy "editors+ can insert projects"
  on public.projects for insert
  with check (organization_id in (
    select organization_id from public.organization_memberships
    where user_id = auth.uid() and role in ('owner','admin','editor')
  ));

create policy "editors+ can update projects"
  on public.projects for update
  using (organization_id in (
    select organization_id from public.organization_memberships
    where user_id = auth.uid() and role in ('owner','admin','editor')
  ));
```

### `sites`, `data_sources`, `sensors`, `observations`

Same pattern as `projects` — join via `project_id → projects.organization_id`:

```sql
-- Example for sites
alter table public.sites enable row level security;

create policy "org members can read sites"
  on public.sites for select
  using (
    project_id in (
      select id from public.projects
      where organization_id in (select current_user_org_ids())
    )
  );

create policy "editors+ can manage sites"
  on public.sites for all
  using (
    project_id in (
      select p.id from public.projects p
      join public.organization_memberships m on m.organization_id = p.organization_id
      where m.user_id = auth.uid() and m.role in ('owner','admin','editor')
    )
  );
```

Apply the same pattern to: `data_sources`, `sensors`, `observations`, `indicators`, `reports`, `evidence_files`, `audit_events`, `actions`, `impact_units`.

### `audit_events` — immutable

Audit events should never be deleted or updated (tamper-evident chain):

```sql
alter table public.audit_events enable row level security;

create policy "org members can read audit events"
  on public.audit_events for select
  using (
    project_id in (
      select id from public.projects
      where organization_id in (select current_user_org_ids())
    )
  );

create policy "editors+ can insert audit events"
  on public.audit_events for insert
  with check (
    project_id in (
      select p.id from public.projects p
      join public.organization_memberships m on m.organization_id = p.organization_id
      where m.user_id = auth.uid() and m.role in ('owner','admin','editor')
    )
  );

-- No UPDATE or DELETE policy → implicit deny
```

### `profiles`

```sql
alter table public.profiles enable row level security;

create policy "users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid());
```

### `organization_memberships`

```sql
alter table public.organization_memberships enable row level security;

create policy "members can read memberships in their org"
  on public.organization_memberships for select
  using (organization_id in (select current_user_org_ids()));

create policy "admins+ can manage memberships"
  on public.organization_memberships for all
  using (
    organization_id in (
      select organization_id from public.organization_memberships
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );
```

## Summary

| Table | Read | Insert | Update | Delete |
|---|---|---|---|---|
| organizations | member | — | owner | — |
| projects | member | editor+ | editor+ | admin+ |
| sites | member | editor+ | editor+ | admin+ |
| data_sources | member | editor+ | editor+ | admin+ |
| sensors | member | editor+ | editor+ | admin+ |
| observations | member | editor+ | — | — |
| indicators | member | editor+ | editor+ | — |
| reports | member | editor+ | editor+ | — |
| evidence_files | member | editor+ | — | — |
| audit_events | member | editor+ | — (immutable) | — (immutable) |
| actions | member | editor+ | editor+ | admin+ |
| impact_units | member | admin+ | admin+ | — |
