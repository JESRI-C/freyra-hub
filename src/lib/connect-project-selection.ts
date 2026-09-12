export type ProjectSelection = {
  id: string;
};

export function findConnectProjectById<T extends ProjectSelection>(
  projects: readonly T[],
  projectId: unknown,
): T | null {
  if (typeof projectId !== "string" || projectId.length === 0) return null;
  return projects.find((project) => project.id === projectId) ?? null;
}

/**
 * Resolve a project exclusively from the projects already authorised for the
 * active organisation. URL and persisted identifiers are preferences, never
 * authorities.
 */
export function resolveConnectProject<T extends ProjectSelection>(
  projects: readonly T[],
  requestedProjectId: unknown,
  currentProjectId: string | null | undefined,
): T | null {
  // An explicit URL selection is a scoped instruction. If it is not present
  // in the active organisation, fail closed instead of silently attaching an
  // upload or measurement to another persisted/default project.
  if (typeof requestedProjectId === "string" && requestedProjectId.length > 0) {
    return findConnectProjectById(projects, requestedProjectId);
  }

  return findConnectProjectById(projects, currentProjectId) ?? projects[0] ?? null;
}
