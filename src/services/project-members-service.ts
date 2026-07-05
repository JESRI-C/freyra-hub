// Project members & roles service

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { logAuditEvent } from "@/services/audit-service";

export type ProjectRole =
  | "admin"
  | "project_manager"
  | "editor"
  | "field"
  | "viewer"
  | "external";

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  email?: string | null;
  display_name?: string | null;
}

export const ROLE_LABELS: Record<ProjectRole, string> = {
  admin: "Administrator",
  project_manager: "Projektleder",
  editor: "Redaktør",
  field: "Feltmedarbejder",
  viewer: "Læser",
  external: "Ekstern",
};

export const ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  admin: "Fuld kontrol — kan invitere og fjerne medlemmer",
  project_manager: "Kan administrere projekt, medlemmer og godkendelser",
  editor: "Kan oprette og redigere data, handlinger og rapporter",
  field: "Kan registrere observationer og uploade evidens i felten",
  viewer: "Læseadgang til hele projektet",
  external: "Begrænset adgang — kun til delte dokumenter",
};

export const ROLE_TONE: Record<ProjectRole, "danger" | "warning" | "info" | "success" | "default"> = {
  admin: "danger",
  project_manager: "warning",
  editor: "info",
  field: "success",
  viewer: "default",
  external: "default",
};

interface UntypedDb {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: unknown): {
        order?: (col: string, o: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        maybeSingle?: () => Promise<{ data: unknown; error: { message: string } | null }>;
      } & Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    insert(v: Record<string, unknown>): {
      select(): { single(): Promise<{ data: unknown; error: { message: string } | null }> };
    };
    update(v: Record<string, unknown>): {
      eq(col: string, val: unknown): Promise<{ error: { message: string } | null }>;
    };
    delete(): {
      eq(col: string, val: unknown): Promise<{ error: { message: string } | null }>;
    };
  };
}

function getDb(): UntypedDb | null {
  return isSupabaseConfigured ? (supabase as unknown as UntypedDb) : null;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const db = getDb();
  if (!db) return [];
  const res = await db.from("project_members").select("*").eq("project_id", projectId);
  const { data, error } = await res;
  if (error) throw new Error(error.message);
  const members = (data ?? []) as ProjectMember[];

  // Best-effort enrich with profile info
  try {
    const ids = members.map((m) => m.user_id);
    if (ids.length > 0 && supabase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, email, full_name, display_name")
        .in("id", ids);
      const map = new Map<string, { email?: string; full_name?: string; display_name?: string }>();
      for (const p of (profiles ?? []) as Array<{ id: string; email?: string; full_name?: string; display_name?: string }>) {
        map.set(p.id, p);
      }
      for (const m of members) {
        const p = map.get(m.user_id);
        m.email = p?.email ?? null;
        m.display_name = p?.display_name ?? p?.full_name ?? null;
      }
    }
  } catch {
    // ignore enrich failures
  }

  return members;
}

export async function addProjectMember(input: {
  project_id: string;
  user_id: string;
  role: ProjectRole;
}): Promise<ProjectMember> {
  const db = getDb();
  if (!db) throw new Error("Database ikke konfigureret");
  const { data, error } = await db.from("project_members").insert(input).select().single();
  if (error) throw new Error(error.message);
  await logAuditEvent({
    project_id: input.project_id,
    event_type: "member_added",
    entity_type: "project_member",
    entity_id: input.user_id,
    title: `Medlem tilføjet: ${ROLE_LABELS[input.role]}`,
    actor: "Bruger",
    source: "manual",
    after_data: { user_id: input.user_id, role: input.role },
  });
  return data as ProjectMember;
}

export async function updateProjectMemberRole(id: string, projectId: string, role: ProjectRole): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database ikke konfigureret");
  const { error } = await db.from("project_members").update({ role }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent({
    project_id: projectId,
    event_type: "member_role_changed",
    entity_type: "project_member",
    entity_id: id,
    title: `Rolle ændret → ${ROLE_LABELS[role]}`,
    actor: "Bruger",
    source: "manual",
    after_data: { role },
  });
}

export async function removeProjectMember(id: string, projectId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database ikke konfigureret");
  const { error } = await db.from("project_members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAuditEvent({
    project_id: projectId,
    event_type: "member_removed",
    entity_type: "project_member",
    entity_id: id,
    title: "Medlem fjernet",
    actor: "Bruger",
    source: "manual",
  });
}

// ─── Permission helpers ───────────────────────────────────────────────────────

const ROLE_RANK: Record<ProjectRole, number> = {
  admin: 100,
  project_manager: 80,
  editor: 60,
  field: 40,
  viewer: 20,
  external: 10,
};

export function roleAtLeast(userRole: ProjectRole | null | undefined, min: ProjectRole): boolean {
  if (!userRole) return false;
  return ROLE_RANK[userRole] >= ROLE_RANK[min];
}

export interface ProjectPermissions {
  role: ProjectRole | null;
  canEdit: boolean; // editor+
  canManage: boolean; // project_manager+
  canAdmin: boolean; // admin
  canRecordField: boolean; // field+
  canView: boolean; // any member (or none if not member)
}

export function permissionsFor(role: ProjectRole | null | undefined): ProjectPermissions {
  return {
    role: role ?? null,
    canEdit: roleAtLeast(role, "editor"),
    canManage: roleAtLeast(role, "project_manager"),
    canAdmin: role === "admin",
    canRecordField: roleAtLeast(role, "field"),
    canView: !!role,
  };
}

export async function getMyProjectRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const res = await db.from("project_members").select("role").eq("project_id", projectId);
    const { data, error } = await res;
    if (error) return null;
    const mine = (data as Array<{ user_id?: string; role?: ProjectRole }> | null)?.find(
      (m) => m.user_id === userId,
    );
    return mine?.role ?? null;
  } catch {
    return null;
  }
}
