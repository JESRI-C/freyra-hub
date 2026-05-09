# Supabase Auth Plan — GoFreyra

## Overview

GoFreyra will use Supabase Auth with Magic Link (passwordless email) for the pilot. This gives zero-friction onboarding for environmental project managers without passwords to manage.

## Auth flow

1. User enters email on `/login`
2. Supabase sends a Magic Link email
3. User clicks link → redirected back with session token
4. Session stored in Supabase client (automatic, uses localStorage)
5. `onAuthStateChange` sets auth context in React

## Tables

### `profiles`

Extends `auth.users` with display name and organisation membership.

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);
```

### `organization_memberships`

Links users to organisations with a role.

```sql
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz default now(),
  unique (user_id, organization_id)
);
```

## Roles

| Role     | Description                                           |
| -------- | ----------------------------------------------------- |
| `owner`  | Full control: manage members, delete org              |
| `admin`  | Create/edit all resources, manage members             |
| `editor` | Create/edit projects, upload evidence, submit reports |
| `viewer` | Read-only access to all project data                  |

## Implementation steps

1. Enable Email provider in Supabase Auth settings
2. Configure SMTP for Magic Link emails
3. Create `profiles` and `organization_memberships` tables (migration `002_auth_profiles.sql`)
4. Replace `src/lib/auth.tsx` demo context with real `supabase.auth.getSession()`
5. Add `onAuthStateChange` listener to update React context
6. Guard routes in `_app.tsx` — redirect to `/login` if no session
7. Seed org memberships for demo user in `supabase/seed.sql`

## Code sketch

```typescript
// src/lib/auth.tsx
import { supabase } from "./supabase/client";

export function useAuth() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase?.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  return session;
}
```
