import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type DemoUser = {
  id: string;
  name: string;
  role: string;
  email: string;
  initials: string;
};

export const DEMO_USERS: DemoUser[] = [
  { id: "jesper", name: "Jesper Riel", role: "Admin", email: "jesper@freyra.io", initials: "JR" },
  { id: "emma", name: "Emma Larsen", role: "Sustainability Lead", email: "emma@freyra.io", initials: "EL" },
  { id: "mikkel", name: "Mikkel Holm", role: "Data Manager", email: "mikkel@freyra.io", initials: "MH" },
];

export type Organization = {
  id: string;
  name: string;
  description: string;
  projects: { id: string; name: string; location: string; status: string }[];
};

export const ORGANIZATIONS: Organization[] = [
  {
    id: "freyra-demo",
    name: "Freyra Demo",
    description: "Demoorganisation til afprøvning af platformen",
    projects: [
      { id: "fd-overview", name: "Demo Oversigt", location: "Danmark", status: "Aktiv" },
      { id: "fd-pilot", name: "Pilot Område Nord", location: "Aalborg", status: "Aktiv" },
    ],
  },
  {
    id: "nordic-coastal",
    name: "Nordic Coastal Restoration",
    description: "Genopretning af kystnære økosystemer",
    projects: [
      { id: "nc-limfjord", name: "Limfjorden Tang", location: "Limfjorden", status: "Aktiv" },
      { id: "nc-kattegat", name: "Kattegat Stenrev", location: "Kattegat", status: "Planlægning" },
    ],
  },
  {
    id: "skallebaek",
    name: "Skallebæk Biodiversity Pilot",
    description: "Pilotprojekt for biodiversitet i ådal",
    projects: [
      { id: "sk-aadal", name: "Skallebæk Ådal", location: "Haderslev, Danmark", status: "Aktiv" },
    ],
  },
  {
    id: "urban-water",
    name: "Urban Water Quality Program",
    description: "Vandkvalitet i bynære områder",
    projects: [
      { id: "uw-cph", name: "København Havn", location: "København", status: "Aktiv" },
      { id: "uw-aarhus", name: "Aarhus Å", location: "Aarhus", status: "Aktiv" },
    ],
  },
  {
    id: "danish-wetland",
    name: "Danish Wetland Restoration",
    description: "Genetablering af vådområder i Jylland",
    projects: [
      { id: "dw-vejle", name: "Vejle Ådal Vådområde", location: "Vejle", status: "Aktiv" },
    ],
  },
  {
    id: "urban-bio-cph",
    name: "Urban Biodiversity Corridor Copenhagen",
    description: "Sammenhængende biodiversitetskorridor i København",
    projects: [
      { id: "ub-amager", name: "Amager Fælled Korridor", location: "København", status: "Under verifikation" },
    ],
  },
  {
    id: "mangrove-id",
    name: "Mangrove Restoration Indonesia",
    description: "Restaurering af mangroveskove i Sydøstasien",
    projects: [
      { id: "mg-sulawesi", name: "Sulawesi Mangrove", location: "Indonesien", status: "Aktiv" },
    ],
  },
];

type AuthState = {
  user: DemoUser | null;
  orgId: string | null;
  projectId: string | null;
  login: (user: DemoUser) => void;
  logout: () => void;
  selectOrg: (id: string) => void;
  selectProject: (id: string) => void;
};

const AuthCtx = createContext<AuthState | null>(null);
const KEY = "freyra-auth-v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setUser(s.user ?? null);
        setOrgId(s.orgId ?? null);
        setProjectId(s.projectId ?? null);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify({ user, orgId, projectId }));
  }, [user, orgId, projectId, hydrated]);

  return (
    <AuthCtx.Provider
      value={{
        user,
        orgId,
        projectId,
        login: (u) => setUser(u),
        logout: () => {
          setUser(null);
          setOrgId(null);
          setProjectId(null);
        },
        selectOrg: (id) => {
          setOrgId(id);
          setProjectId(null);
        },
        selectProject: (id) => setProjectId(id),
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

export function getCurrentOrg(orgId: string | null) {
  return ORGANIZATIONS.find((o) => o.id === orgId) ?? null;
}
export function getCurrentProject(orgId: string | null, projectId: string | null) {
  const org = getCurrentOrg(orgId);
  return org?.projects.find((p) => p.id === projectId) ?? null;
}
