import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatar_url?: string | null;
};

export type OrgProject = {
  id: string;
  name: string;
  location: string;
  status: string;
  slug?: string | null;
};

export type Organization = {
  id: string;
  name: string;
  description: string;
  projects: OrgProject[];
  role?: string;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: AppUser | null;
  organizations: Organization[];
  orgId: string | null;
  projectId: string | null;
  currentOrg: Organization | null;
  currentProject: OrgProject | null;
  logout: () => Promise<void>;
  selectOrg: (id: string) => void;
  selectProject: (id: string) => void;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);
const KEY = "freyra-auth-selection-v1";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "??";
}

function statusLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").toLowerCase();
  if (s === "active" || s === "aktiv") return "Aktiv";
  if (s === "planning" || s === "planlægning") return "Planlægning";
  if (s === "completed" || s === "afsluttet") return "Afsluttet";
  return raw || "Aktiv";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Restore selected org/project from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setOrgId(s.orgId ?? null);
        setProjectId(s.projectId ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ orgId, projectId }));
  }, [orgId, projectId]);

  const loadUserData = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setUser(null);
      setOrganizations([]);
      return;
    }

    const uid = currentSession.user.id;

    // Profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .eq("id", uid)
      .maybeSingle();

    // Memberships + organizations
    const { data: memberships } = await supabase
      .from("organization_memberships")
      .select("role, organization:organizations(id, name, type, country)")
      .eq("user_id", uid);

    const orgIds = (memberships ?? [])
      .map((m) => (m.organization as { id?: string } | null)?.id)
      .filter((x): x is string => !!x);

    // Projects for those orgs
    const projectsByOrg: Record<string, OrgProject[]> = {};
    if (orgIds.length > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, slug, status, location_name, municipality, organization_id")
        .in("organization_id", orgIds);
      for (const p of (projects ?? []) as Array<{
        id: string;
        name: string;
        slug: string | null;
        status: string | null;
        location_name: string | null;
        municipality: string | null;
        organization_id: string | null;
      }>) {
        if (!p.organization_id) continue;
        (projectsByOrg[p.organization_id] ??= []).push({
          id: p.id,
          name: p.name,
          slug: p.slug,
          location: p.location_name || p.municipality || "—",
          status: statusLabel(p.status),
        });
      }
    }

    const orgs: Organization[] = [];
    for (const m of (memberships ?? []) as Array<{
      role: string;
      organization: { id: string; name: string; type: string | null; country: string | null } | null;
    }>) {
      const o = m.organization;
      if (!o) continue;
      orgs.push({
        id: o.id,
        name: o.name,
        description: [o.type, o.country].filter(Boolean).join(" · "),
        projects: projectsByOrg[o.id] ?? [],
        role: m.role,
      });
    }

    const displayName =
      profile?.full_name ||
      (currentSession.user.user_metadata?.full_name as string | undefined) ||
      (currentSession.user.email?.split("@")[0] ?? "Bruger");

    const primaryRole = orgs[0]?.role ?? "Member";

    setUser({
      id: uid,
      name: displayName,
      email: profile?.email || currentSession.user.email || "",
      role: primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1),
      initials: initials(displayName),
      avatar_url: profile?.avatar_url ?? null,
    });
    setOrganizations(orgs);

    // Auto-select first org if none set / stale
    setOrgId((prev) => {
      if (prev && orgs.some((o) => o.id === prev)) return prev;
      return orgs[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    // Subscribe first, then hydrate
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      void loadUserData(s);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void loadUserData(data.session).finally(() => mounted && setLoading(false));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const currentOrg = organizations.find((o) => o.id === orgId) ?? null;
  const currentProject = currentOrg?.projects.find((p) => p.id === projectId) ?? null;

  return (
    <AuthCtx.Provider
      value={{
        loading,
        session,
        user,
        organizations,
        orgId,
        projectId,
        currentOrg,
        currentProject,
        logout: async () => {
          await supabase.auth.signOut();
          setOrgId(null);
          setProjectId(null);
        },
        selectOrg: (id) => {
          setOrgId(id);
          setProjectId(null);
        },
        selectProject: (id) => setProjectId(id),
        refresh: () => loadUserData(session),
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Backwards-compat helpers — read from currently mounted context via useAuth in components.
// These pure-function versions are kept as no-ops for legacy call sites and always return null.
// Prefer `useAuth().currentOrg` / `useAuth().currentProject`.
export function getCurrentOrg(_orgId: string | null): Organization | null {
  return null;
}
export function getCurrentProject(_orgId: string | null, _projectId: string | null): OrgProject | null {
  return null;
}
