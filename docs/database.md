# GoFreyra Database

## Stack

- **Database**: Supabase (PostgreSQL)
- **Client**: `@supabase/supabase-js`
- **Types**: `src/lib/supabase/types.ts` — hand-maintained, mirrors the SQL schema
- **Fallback**: App boots and runs fully without a Supabase project (seed data from `src/data/platform-seed.ts`)

## Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New project.

### 2. Run the migration

In the Supabase SQL editor, paste and run:

```
supabase/migrations/001_gofreyra_core_schema.sql
```

Or if you have the Supabase CLI installed:

```bash
supabase db push
```

### 3. Seed demo data

```
supabase/seed.sql
```

Paste into the SQL editor, or run:

```bash
supabase db reset   # runs migrations + seed.sql automatically
```

### 4. Set environment variables

Create a `.env.local` file (git-ignored) in the repo root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in Supabase → Project Settings → API.

### 5. Restart the dev server

```bash
npm run dev
```

The app will now read from Supabase instead of the TypeScript seed data.

---

## Schema overview

| Table            | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `organizations`  | Tenant / organization owning projects                        |
| `projects`       | Nature/impact projects                                       |
| `sites`          | Geographic zones within a project                            |
| `data_sources`   | IoT sensors, APIs, CSV uploads, satellite feeds              |
| `sensors`        | Individual physical sensor devices                           |
| `observations`   | Raw time-series data points                                  |
| `indicators`     | Aggregated KPIs per project (biodiversity index, CO₂e, etc.) |
| `reports`        | Generated ESG/nature reports                                 |
| `evidence_files` | Files attached to reports                                    |
| `audit_events`   | Immutable audit trail                                        |
| `actions`        | Open tasks and recommended actions                           |
| `impact_units`   | Issued impact credits / nature units                         |

## Row Level Security

RLS is enabled on all tables. Migration 001 creates a temporary open `SELECT` policy for development. Before going to production:

1. Remove the `dev_select_all` policies.
2. Set up Supabase Auth (email/magic link or OAuth).
3. Add per-organization policies tied to `auth.uid()`.

See `docs/development-next-steps.md` for the auth roadmap.

## Data flow

```
Supabase (PostgreSQL)
  └── src/lib/supabase/queries.ts   ← raw Supabase calls, typed
        └── src/services/*-service.ts ← business logic + seed fallback
              └── TanStack Query (useSuspenseQuery)
                    └── React components
```

When `VITE_SUPABASE_URL` is absent, `isSupabaseConfigured = false` and every service returns data from `src/data/platform-seed.ts` instead.
