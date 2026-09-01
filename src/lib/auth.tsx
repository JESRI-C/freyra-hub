import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  clearQueryCacheForAuthTransition,
  clearQueryCacheForLogout,
  type AuthUserId,
} from "@/lib/auth-query-cache";
import { createDeferredLatestTask, shouldBootstrapAuthSession } from "@/lib/auth-session-bootstrap";
import { findAuthorizedProjectSelection } from "@/lib/auth-project-selection";

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
  refreshing: boolean;
  authError: string | null;
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
  refresh: (options?: AuthRefreshOptions) => Promise<AuthRefreshResult>;
};

type AuthRefreshOptions = { selectProjectId?: string };
type AuthRefreshResult = { projectSelected: boolean };

const AuthCtx = createContext<AuthState | null>(null);
const KEY = "freyra-auth-selection-v1";
type AuthBootstrapRequest = { session: Session | null; revision: number };

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

function statusLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").toLowerCase();
  if (s === "active" || s === "aktiv") return "Aktiv";
  if (s === "planning" || s === "planlægning") return "Planlægning";
  if (s === "completed" || s === "afsluttet") return "Afsluttet";
  return raw || "Aktiv";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const activeUserIdRef = useRef<AuthUserId>(undefined);
  const authRevisionRef = useRef(0);
  const refreshGenerationRef = useRef(0);

  // Restore selected org/project from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setOrgId(s.orgId ?? null);
        setProjectId(s.projectId ?? null);
      }
    } catch {
      // Ignore malformed legacy selections; memberships are loaded from Supabase below.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ orgId, projectId }));
  }, [orgId, projectId]);

  const resetTenantState = useCallback(() => {
    setUser(null);
    setOrganizations([]);
    setOrgId(null);
    setProjectId(null);
  }, []);

  const loadUserData = useCallback(
    async (
      currentSession: Session | null,
      isCurrent: () => boolean,
      options?: AuthRefreshOptions,
    ): Promise<AuthRefreshResult> => {
      if (!currentSession?.user) {
        if (!isCurrent() || activeUserIdRef.current !== null) {
          return { projectSelected: false };
        }
        setUser(null);
        setOrganizations([]);
        return { projectSelected: false };
      }

      const uid = currentSession.user.id;

      // Profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (profileError) throw profileError;

      // Memberships + organizations
      const { data: memberships, error: membershipsError } = await supabase
        .from("organization_memberships")
        .select("role, organization:organizations(id, name, type, country)")
        .eq("user_id", uid);
      if (membershipsError) throw membershipsError;

      const orgIds = (memberships ?? [])
        .map((m) => (m.organization as { id?: string } | null)?.id)
        .filter((x): x is string => !!x);

      // Projects for those orgs
      const projectsByOrg: Record<string, OrgProject[]> = {};
      if (orgIds.length > 0) {
        const { data: projects, error: projectsError } = await supabase
          .from("projects")
          .select("id, name, slug, status, location_name, municipality, organization_id")
          .in("organization_id", orgIds);
        if (projectsError) throw projectsError;
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
        organization: {
          id: string;
          name: string;
          type: string | null;
          country: string | null;
        } | null;
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

      // Discard results from an earlier account if auth changed while the
      // profile, memberships, or projects were loading.
      if (!isCurrent() || activeUserIdRef.current !== uid) {
        return { projectSelected: false };
      }

      setUser({
        id: uid,
        name: displayName,
        email: profile?.email || currentSession.user.email || "",
        role: primaryRole.charAt(0).toUpperCase() + primaryRole.slice(1),
        initials: initials(displayName),
        avatar_url: profile?.avatar_url ?? null,
      });
      setOrganizations(orgs);

      const requestedSelection = options?.selectProjectId
        ? findAuthorizedProjectSelection(orgs, options.selectProjectId)
        : null;

      if (requestedSelection) {
        setOrgId(requestedSelection.orgId);
        setProjectId(requestedSelection.projectId);
        return { projectSelected: true };
      }

      // Never retain another project's context when a requested project was not
      // present in the freshly RLS-filtered tenant data.
      if (options?.selectProjectId) setProjectId(null);

      // Auto-select first org if none set / stale
      setOrgId((prev) => {
        if (prev && orgs.some((o) => o.id === prev)) return prev;
        return orgs[0]?.id ?? null;
      });
      return { projectSelected: false };
    },
    [],
  );

  const applySession = useCallback(
    (nextSession: Session | null, isCurrent: () => boolean, options?: AuthRefreshOptions) => {
      if (!isCurrent()) return Promise.resolve({ projectSelected: false });
      const nextUserId = nextSession?.user?.id ?? null;
      const didChange = clearQueryCacheForAuthTransition(
        queryClient,
        activeUserIdRef.current,
        nextUserId,
      );

      activeUserIdRef.current = nextUserId;
      if (didChange) resetTenantState();
      setSession(nextSession);

      return loadUserData(nextSession, isCurrent, options);
    },
    [loadUserData, queryClient, resetTenantState],
  );

  useEffect(() => {
    let mounted = true;

    const bootstrap = createDeferredLatestTask<AuthBootstrapRequest>({
      run: async (request, isLatestScheduledTask) => {
        await applySession(
          request.session,
          () => isLatestScheduledTask() && authRevisionRef.current === request.revision,
        );
      },
      onPendingChange: (pending) => {
        if (!mounted) return;
        if (pending) setAuthError(null);
        setLoading(pending);
      },
      onError: (error) => {
        if (!mounted) return;
        activeUserIdRef.current = undefined;
        resetTenantState();
        setAuthError("Vi kunne ikke indlæse din konto og organisationer. Prøv igen.");
        console.error("Auth bootstrap failed", error);
      },
    });

    // Supabase auth callbacks must stay synchronous. Any async Supabase query
    // started inside this callback can deadlock the auth client, so defer the
    // profile and tenant bootstrap until after the callback returns.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      const nextUserId = s?.user?.id ?? null;

      // Token refresh and repeated same-user events only update the session;
      // tenant data already belongs to this identity and must not flash-load.
      if (!shouldBootstrapAuthSession(activeUserIdRef.current, nextUserId)) {
        setSession(s);
        return;
      }

      refreshGenerationRef.current += 1;
      setRefreshing(false);
      const revision = ++authRevisionRef.current;
      bootstrap.schedule({ session: s, revision });
    });

    return () => {
      mounted = false;
      bootstrap.cancel();
      activeUserIdRef.current = undefined;
      sub.subscription.unsubscribe();
    };
  }, [applySession, resetTenantState]);

  const currentOrg = organizations.find((o) => o.id === orgId) ?? null;
  const currentProject = currentOrg?.projects.find((p) => p.id === projectId) ?? null;

  return (
    <AuthCtx.Provider
      value={{
        loading,
        refreshing,
        authError,
        session,
        user,
        organizations,
        orgId,
        projectId,
        currentOrg,
        currentProject,
        logout: async () => {
          authRevisionRef.current += 1;
          refreshGenerationRef.current += 1;
          activeUserIdRef.current = null;
          setRefreshing(false);
          setAuthError(null);
          clearQueryCacheForLogout(queryClient);
          resetTenantState();
          setSession(null);

          const { error } = await supabase.auth.signOut();
          if (error) throw error;
        },
        selectOrg: (id) => {
          if (!organizations.some((organization) => organization.id === id)) return;
          setOrgId(id);
          setProjectId(null);
        },
        selectProject: (id) => {
          if (!currentOrg?.projects.some((project) => project.id === id)) return;
          setProjectId(id);
        },
        refresh: async (options) => {
          const authRevision = authRevisionRef.current;
          const refreshGeneration = ++refreshGenerationRef.current;
          const isCurrent = () =>
            authRevisionRef.current === authRevision &&
            refreshGenerationRef.current === refreshGeneration;

          setRefreshing(true);
          setAuthError(null);
          try {
            return await applySession(session, isCurrent, options);
          } catch (error) {
            if (!isCurrent()) return { projectSelected: false };
            activeUserIdRef.current = undefined;
            resetTenantState();
            setAuthError("Vi kunne ikke indlæse din konto og organisationer. Prøv igen.");
            throw error;
          } finally {
            if (isCurrent()) setRefreshing(false);
          }
        },
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
export function getCurrentProject(
  _orgId: string | null,
  _projectId: string | null,
): OrgProject | null {
  return null;
}
