export interface ProjectSelectionOrganization {
  id: string;
  projects: Array<{ id: string }>;
}

export interface AuthorizedProjectSelection {
  orgId: string;
  projectId: string;
}

export function findAuthorizedProjectSelection(
  organizations: ProjectSelectionOrganization[],
  projectId: string,
): AuthorizedProjectSelection | null {
  const organization = organizations.find((candidate) =>
    candidate.projects.some((project) => project.id === projectId),
  );

  return organization ? { orgId: organization.id, projectId } : null;
}
