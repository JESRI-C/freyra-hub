export type ProjectRole = "admin" | "project_manager" | "editor" | "field" | "viewer" | "external";

export interface ProjectCentroid {
  lat: number;
  lng: number;
}

export interface ProjectNatureAccess {
  canPersist: boolean;
  centroid: ProjectCentroid | null;
  role: ProjectRole | "organization_owner" | "organization_admin";
}

interface QueryError {
  message?: string;
}

interface QueryResult {
  data: Record<string, unknown> | null;
  error: QueryError | null;
}

interface AuthorizationQuery {
  select(columns: string): AuthorizationQuery;
  eq(column: string, value: unknown): AuthorizationQuery;
  maybeSingle(): Promise<QueryResult>;
}

/**
 * Minimal shape needed from the authenticated, per-request Supabase client.
 * It deliberately excludes every write method and cannot be satisfied by a
 * caller-provided identity: userId always comes from verified JWT claims.
 */
export interface ProjectAuthorizationClient {
  from(table: string): AuthorizationQuery;
}

const PROJECT_ROLES = new Set<ProjectRole>([
  "admin",
  "project_manager",
  "editor",
  "field",
  "viewer",
  "external",
]);

const PROJECT_WRITE_ROLES = new Set<ProjectRole>(["admin", "project_manager", "editor"]);
const ORGANIZATION_WRITE_ROLES = new Set(["owner", "admin"]);

export class ProjectAccessDeniedError extends Error {
  readonly statusCode = 403;

  constructor() {
    super("Forbidden: Project access denied");
    this.name = "ProjectAccessDeniedError";
  }
}

function deny(): never {
  throw new ProjectAccessDeniedError();
}

function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === "string" && PROJECT_ROLES.has(value as ProjectRole);
}

function readCentroid(project: Record<string, unknown>): ProjectCentroid | null {
  const lat = Number(project["geometry_centroid_lat"]);
  const lng = Number(project["geometry_centroid_lng"]);

  // The connector is Denmark-specific. Never let an invalid or client-spoofed
  // position seed the shared service-role cache.
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 54 ||
    lat > 58 ||
    lng < 7 ||
    lng > 16
  ) {
    return null;
  }

  return { lat, lng };
}

/**
 * Resolves access through the authenticated Supabase client before any
 * service-role client is loaded. Direct project members may read; editor+
 * may persist. Organization owners/admins retain their existing project-wide
 * administration access. Every failure is intentionally indistinguishable.
 */
async function resolveProjectNatureAccess(
  client: ProjectAuthorizationClient,
  userId: string,
  projectId: string,
): Promise<ProjectNatureAccess> {
  if (!userId || !projectId) deny();

  const projectResult = await client
    .from("projects")
    .select("id, organization_id, geometry_centroid_lat, geometry_centroid_lng")
    .eq("id", projectId)
    .maybeSingle();

  if (projectResult.error || !projectResult.data) deny();

  const memberResult = await client
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberResult.error) deny();

  const memberRole = memberResult.data?.["role"];
  if (isProjectRole(memberRole)) {
    return {
      canPersist: PROJECT_WRITE_ROLES.has(memberRole),
      centroid: readCentroid(projectResult.data),
      role: memberRole,
    };
  }

  const organizationId = projectResult.data["organization_id"];
  if (typeof organizationId !== "string" || !organizationId) deny();

  const organizationResult = await client
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (organizationResult.error) deny();

  const organizationRole = organizationResult.data?.["role"];
  if (typeof organizationRole !== "string" || !ORGANIZATION_WRITE_ROLES.has(organizationRole))
    deny();

  return {
    canPersist: true,
    centroid: readCentroid(projectResult.data),
    role: organizationRole === "owner" ? "organization_owner" : "organization_admin",
  };
}

export async function requireProjectNatureAccess(
  client: ProjectAuthorizationClient,
  userId: string,
  projectId: string,
): Promise<ProjectNatureAccess> {
  try {
    return await resolveProjectNatureAccess(client, userId, projectId);
  } catch (error) {
    if (error instanceof ProjectAccessDeniedError) throw error;
    deny();
  }
}
