export type SelectionOrg = { id: string; projects: { id: string; slug?: string | null }[] };

/** Resolve only explicit, authorized selections. URL ids never fall back. */
export function resolveProjectSelection(
  organizations: SelectionOrg[],
  orgId: string | null,
  projectId: string | null,
  requestedId?: string,
  routeSlug?: string,
) {
  if (requestedId === "") return { orgId, projectId: null, invalid: true };
  if (routeSlug) {
    const matches = organizations.flatMap((org) =>
      org.projects
        .filter((p) => p.id === routeSlug || p.slug === routeSlug)
        .map((p) => ({ orgId: org.id, projectId: p.id, invalid: false })),
    );
    return matches.length === 1 ? matches[0] : { orgId, projectId: null, invalid: true };
  }
  const org = organizations.find((o) => o.id === orgId);
  const id = requestedId === undefined ? projectId : requestedId;
  const project = org?.projects.find((p) => p.id === id);
  return {
    orgId: org?.id ?? null,
    projectId: project?.id ?? null,
    invalid: Boolean(id && !project),
  };
}
